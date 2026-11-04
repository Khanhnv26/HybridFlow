import { useExitMotion } from '../../hooks/useExitMotion';
import { errorMessage } from '../../services/errors';
import { useEffect, useState } from 'react';
import { Plus, Trash2, Split, Save, X, RefreshCw } from 'lucide-react';
import type { OrchestrationNodeData, RouterConditionItem, RouterMatchMode, RouterOperator, RouterTriggerOn } from '../../types';
import { isEventOperator, isNumericOperator, isValidRuleNumber, matchesCurrentValues, requiresConditionValue } from '../../services/notificationPreview';

interface PreviewSource { id: string; name: string; rows: Record<string, string>[]; error?: string; loading?: boolean }
interface Props {
  data: OrchestrationNodeData;
  availableColumns: string[];
  idColumn?: string;
  columnTypes?: Record<string, 'TEXT' | 'NUMBER'>;
  previewRows?: Record<string, string>[];
  previewSources?: PreviewSource[];
  actionNames?: string[];
  reading?: boolean;
  readErrors?: string[];
  onRetryRead?: () => void;
  disabled: boolean;
  onClose: () => void;
  onSave: (settings: Partial<OrchestrationNodeData>) => Promise<void>;
}

const operators: { value: RouterOperator; label: string; sentence: string }[] = [
  { value: 'EQUALS', label: 'Là', sentence: 'là' },
  { value: 'NOT_EQUALS', label: 'Không phải', sentence: 'không phải' },
  { value: 'CONTAINS', label: 'Có chứa', sentence: 'có chứa' },
  { value: 'CHANGED_TO', label: 'Vừa đổi thành', sentence: 'vừa đổi thành' },
  { value: 'LESS_THAN', label: 'Nhỏ hơn (<)', sentence: 'nhỏ hơn' },
  { value: 'GREATER_THAN', label: 'Lớn hơn (>)', sentence: 'lớn hơn' },
  { value: 'LESS_OR_EQUAL', label: 'Nhỏ hơn hoặc bằng (≤)', sentence: 'nhỏ hơn hoặc bằng' },
  { value: 'GREATER_OR_EQUAL', label: 'Lớn hơn hoặc bằng (≥)', sentence: 'lớn hơn hoặc bằng' },
  { value: 'COLUMN_CHANGED', label: 'Cột này vừa thay đổi', sentence: 'vừa thay đổi' },
  { value: 'IS_EMPTY', label: 'Đang trống', sentence: 'đang trống' },
  { value: 'IS_NOT_EMPTY', label: 'Có dữ liệu', sentence: 'có dữ liệu' },
];
const triggers: { value: RouterTriggerOn; label: string; detail: string; sentence: string }[] = [
  { value: 'CHANGED', label: 'Thêm hoặc sửa dòng', detail: 'Mỗi khi dữ liệu có thay đổi', sentence: 'một dòng được thêm hoặc sửa' },
  { value: 'CREATED', label: 'Chỉ thêm dòng mới', detail: 'Dòng chưa có ở lần đồng bộ trước', sentence: 'một dòng mới được thêm' },
  { value: 'UPDATED', label: 'Chỉ sửa dòng đã có', detail: 'Có cột thay đổi ở dòng đã tồn tại', sentence: 'một dòng đã có được sửa' },
];
const field = 'w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-primary focus:border-purple-400 focus:outline-none disabled:opacity-50';

export function RouterConditionConfigModal({
  data, availableColumns, idColumn = 'id', columnTypes = {}, previewRows = [], previewSources = [], actionNames = [],
  reading = false, readErrors = [], onRetryRead, disabled, onClose, onSave,
}: Props) {
  const motionRef = useExitMotion(true);
  const [trigger, setTrigger] = useState<RouterTriggerOn>(data.routerTriggerOn || data.triggerOn || 'CHANGED');
  const [mode, setMode] = useState<RouterMatchMode>(data.routerMatchMode || data.matchMode || 'ALL');
  const [conditions, setConditions] = useState<RouterConditionItem[]>(() => {
    const saved = data.routerConditions || data.conditions || [];
    return saved.length ? saved.map(item => ({ ...item })) : [{ columnName: availableColumns.find(column => column !== idColumn) || availableColumns[0] || '', operator: 'EQUALS', value: '' }];
  });
  const [sourceId, setSourceId] = useState(previewSources[0]?.id || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const locked = disabled || saving;
  const source = previewSources.find(item => item.id === sourceId) || previewSources[0];
  const rows = source ? source.rows : previewRows;
  const needsEvent = conditions.some(item => isEventOperator(item.operator));
  const matching = rows.filter(row => matchesCurrentValues(conditions, mode, row));
  const sampleColumns = [...new Set([idColumn, ...conditions.map(item => item.columnName)])].filter(Boolean).slice(0, 4);
  const sentence = conditions.map(item => item.columnName + ' ' + (operators.find(operator => operator.value === item.operator)?.sentence || '')
    + (!requiresConditionValue(item.operator) ? '' : ' “' + (item.value || '…') + '”')).join(mode === 'ALL' ? ' và ' : ' hoặc ');
  const destinations = actionNames.length ? actionNames.join(', ') : 'các khối thông báo được nối';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [saving, onClose]);
  const update = (index: number, patch: Partial<RouterConditionItem>) => {
    setConditions(previous => previous.map((item, position) => position === index ? { ...item, ...patch } : item));
    setError('');
  };
  const save = async () => {
    if (!conditions.length) { setError('Thêm ít nhất một điều kiện để lọc dòng.'); return; }
    for (const condition of conditions) {
      if (!availableColumns.includes(condition.columnName)) { setError('Cột ' + (condition.columnName || 'đang chọn') + ' chưa có trong danh sách đồng bộ. Chọn lại cột hoặc đọc lại dữ liệu.'); return; }
      if (!operators.some(item => item.value === condition.operator)) { setError('Chọn cách so sánh cho từng điều kiện.'); return; }
      if (requiresConditionValue(condition.operator) && condition.value == null) { setError('Nhập giá trị cần so sánh.'); return; }
      if (isNumericOperator(condition.operator)) {
        if (columnTypes[condition.columnName] !== 'NUMBER') { setError('Chọn kiểu Số cho cột ' + condition.columnName + ' trong khối Điều phối & Đồng bộ.'); return; }
        if (!isValidRuleNumber(condition.value)) { setError('Nhập số hợp lệ, tối đa 15 chữ số có nghĩa và dùng dấu chấm thập phân.'); return; }
      }
    }
    setSaving(true); setError('');
    try {
      await onSave({ routerTriggerOn: trigger, routerMatchMode: mode,
        routerConditions: conditions.map(item => ({ ...item, columnName: item.columnName.trim(), value: !requiresConditionValue(item.operator) ? '' : item.value ?? '' })) });
      onClose();
    } catch (error) {
      setError(errorMessage(error, 'Chưa lưu được. Các điều kiện của bạn vẫn được giữ.'));
    } finally { setSaving(false); }
  };

  return <div role="dialog" aria-modal="true" aria-labelledby="router-modal-title" ref={motionRef} className="hf-motion-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6" onClick={event => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <div className="flex  w-full hf-modal hf-modal--complex flex-col overflow-hidden rounded-2xl border border-line bg-surface text-primary">
      <header className="hf-modal-header flex shrink-0 items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-4">
        <div className="flex gap-3"><Split size={22} className="mt-1 text-violet" /><div>
          <h2 id="router-modal-title" className="text-base font-semibold">Rẽ Nhánh Điều Kiện</h2>
          <p className="mt-1 text-sm text-secondary">Chọn những dòng được chuyển đến khối thông báo.</p>
        </div></div>
        <button type="button" aria-label="Đóng" disabled={saving} onClick={onClose} className="rounded-lg p-2 text-secondary hover:bg-elevated hover:text-primary"><X size={20} /></button>
      </header>
      <div className="hf-modal-body min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-4">
        {error && <p role="alert" className="rounded-lg border border-red-900 bg-danger-soft p-3 text-sm text-danger">{error}</p>}
        <section className="space-y-3">
          <h3 className="font-semibold">1. Kiểm tra khi nào?</h3>
          <div className="grid gap-2 sm:grid-cols-3">{triggers.map(item => <button type="button" key={item.value} disabled={locked} aria-pressed={trigger === item.value} onClick={() => setTrigger(item.value)}
            className={'rounded-xl border p-3 text-left ' + (trigger === item.value ? 'border-purple-500 bg-violet-soft' : 'border-line bg-surface hover:border-line')}>
            <span className="block text-sm font-medium">{item.label}</span><span className="mt-1 block text-xs text-secondary">{item.detail}</span>
          </button>)}</div>
        </section>
        <section className="space-y-3 border-t border-line pt-4">
          <h3 className="font-semibold">2. Chỉ chuyển dòng thỏa điều kiện</h3>
          {conditions.length > 1 && <label className="block space-y-1 text-xs text-secondary"><span>Cách kết hợp các điều kiện</span><select aria-label="Cách kết hợp các điều kiện" disabled={locked} className={field} value={mode} onChange={event => setMode(event.target.value as RouterMatchMode)}>
            <option value="ALL">Phải đúng tất cả điều kiện</option><option value="ANY">Chỉ cần đúng ít nhất một điều kiện</option>
          </select></label>}
          {conditions.map((item, index) => {
            const examples = [...new Set(rows.map(row => row[item.columnName]).filter(value => value !== undefined && value !== ''))].slice(0, 30);
            return <div key={index} className="rounded-xl border border-line bg-surface p-3">
              <div className="mb-2 flex items-center justify-between text-xs text-secondary"><span>Điều kiện {index + 1}</span><button type="button" aria-label={'Xóa điều kiện ' + (index + 1)} disabled={locked || conditions.length === 1} onClick={() => setConditions(previous => previous.filter((_, position) => position !== index))} className="rounded p-1 hover:text-danger disabled:opacity-30"><Trash2 size={15} /></button></div>
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1.2fr]">
                <label className="block space-y-1 text-xs text-secondary"><span>Cột</span><select aria-label={'Cột điều kiện ' + (index + 1)} disabled={locked} className={field} value={item.columnName} onChange={event => update(index, { columnName: event.target.value })}>
                  {!availableColumns.includes(item.columnName) && <option value={item.columnName}>{item.columnName || 'Chọn cột'}</option>}
                  {availableColumns.map(column => <option key={column} value={column}>{column}</option>)}
                </select></label>
                <label className="block space-y-1 text-xs text-secondary"><span>Điều kiện</span><select aria-label={'Cách so sánh ' + (index + 1)} disabled={locked} className={field} value={item.operator} onChange={event => update(index, { operator: event.target.value as RouterOperator })}>
                  {isNumericOperator(item.operator) && columnTypes[item.columnName] !== 'NUMBER' && <option value={item.operator}>Cần chọn kiểu Số cho cột</option>}
                  {operators.filter(operator => !isNumericOperator(operator.value) || columnTypes[item.columnName] === 'NUMBER').map(operator => <option key={operator.value} value={operator.value}>{operator.label}</option>)}
                </select></label>
                <label className="block space-y-1 text-xs text-secondary"><span>Giá trị</span><input type="text" aria-label={'Giá trị điều kiện ' + (index + 1)} disabled={locked || !requiresConditionValue(item.operator)} className={field} value={!requiresConditionValue(item.operator) ? '' : item.value ?? ''}
                  placeholder={!requiresConditionValue(item.operator) ? 'Không cần nhập' : examples[0] ? 'Ví dụ: ' + examples[0] : 'Nhập giá trị…'} list={'router-values-' + index} onChange={event => update(index, { value: event.target.value })} />
                  <datalist id={'router-values-' + index}>{examples.map(value => <option key={value} value={value} />)}</datalist>
                </label>
              </div>
            </div>;
          })}
          <button type="button" disabled={locked} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm hover:bg-elevated" onClick={() => { setConditions(previous => [...previous, { columnName: availableColumns.find(column => column !== idColumn) || availableColumns[0] || '', operator: 'EQUALS', value: '' }]); setError(''); }}><Plus size={15} />Thêm điều kiện</button>
          <details className="text-xs text-secondary"><summary className="cursor-pointer">Giải thích cách so sánh</summary><p className="mt-2">“Là”, “Không phải” và “Vừa đổi thành” phân biệt chữ hoa, chữ thường. “Có chứa” tìm từ khóa không phân biệt hoa thường. “Vừa đổi thành” và “Cột này vừa thay đổi” chỉ áp dụng cho dòng đã có, khi cột thực sự thay đổi. So sánh số yêu cầu cột kiểu Số; ô trống không được hiểu thành 0.</p></details>
        </section>
        <section className="space-y-2 rounded-xl border border-line bg-surface p-3">
          <h3 className="text-sm font-medium">Bộ lọc của bạn</h3>
          <p className="text-sm leading-relaxed text-secondary">Khi {triggers.find(item => item.value === trigger)?.sentence}, nếu {sentence}, chuyển dòng tới {destinations}.</p>
          {!actionNames.length && <p className="text-xs text-secondary">Nối đầu ra của khối này với Telegram để chọn nơi nhận.</p>}
        </section>
        <details className="space-y-3 border-t border-line pt-4">
          <summary className="cursor-pointer font-semibold">Thử điều kiện với dữ liệu hiện tại</summary>
          <div className="flex flex-wrap items-center justify-between gap-2">{onRetryRead && <button type="button" disabled={reading} onClick={onRetryRead} className="text-xs text-violet">{reading ? 'Đang đọc…' : 'Đọc lại dữ liệu'}</button>}</div>
          {reading && <p role="status" className="flex items-center gap-2 text-xs text-secondary"><RefreshCw size={14} className="animate-spin" />Đang đọc dữ liệu mẫu. Bạn vẫn có thể chỉnh hoặc đóng cửa sổ.</p>}
          {previewSources.length > 0 && <label className="block space-y-1 text-xs text-secondary"><span>Bảng tính dùng để thử</span><select aria-label="Bảng tính dùng để thử" className={field} value={source?.id || ''} onChange={event => setSourceId(event.target.value)}>{previewSources.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
          {needsEvent && <p role="status" className="text-sm text-warning">Điều kiện thay đổi cần dữ liệu trước và sau một lần đồng bộ. Chưa thể đếm dòng phù hợp từ dữ liệu hiện tại.</p>}
          {source?.error ? <p className="text-sm text-warning">{source.error}</p> : !needsEvent && rows.length > 0 ? <>
            <p role="status" className="text-sm text-primary">{source ? source.name + ': ' : ''}{matching.length}/{rows.length} dòng phù hợp với điều kiện.</p>
            {matching.length > 0 && <div className="overflow-x-auto rounded-lg border border-line"><table className="w-full text-left text-xs"><thead><tr>{sampleColumns.map(column => <th key={column} className="border-b border-line p-2 font-medium text-secondary">{column}</th>)}</tr></thead><tbody>{matching.slice(0, 5).map((row, index) => <tr key={index}>{sampleColumns.map(column => <td key={column} className="max-w-48 truncate border-b border-line p-2">{row[column] || '—'}</td>)}</tr>)}</tbody></table></div>}
          </> : !reading && !needsEvent && <p className="text-sm text-secondary">Chưa có dòng mẫu. Đọc dữ liệu từ bảng tính đã nối để thử điều kiện.</p>}
          <p className="text-xs text-secondary">Số dòng phù hợp chỉ phản ánh giá trị hiện tại, không phải số thông báo sẽ gửi. Thông báo chỉ được xếp hàng cho sự kiện mới hoặc cập nhật đã xác minh, không còn xung đột.</p>
        </details>
        {readErrors.map((message, index) => <p key={index} role="alert" className="text-xs text-warning">{message}</p>)}
      </div>
      <footer className="hf-modal-footer flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4 sm:px-4"><p className="text-xs text-secondary">Chỉ áp dụng thay đổi sau khi lưu.</p><div className="ml-auto flex gap-2">
        <button type="button" disabled={saving} onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm hover:bg-elevated">Hủy</button>
        <button type="button" disabled={locked} onClick={() => void save()} className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium hover:bg-purple-500 disabled:opacity-50">{saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}{saving ? 'Đang lưu…' : 'Lưu bộ lọc'}</button>
      </div></footer>
    </div>
  </div>;
}
