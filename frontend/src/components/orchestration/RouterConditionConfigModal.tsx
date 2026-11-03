import { useEffect, useState } from 'react';
import { Plus, Trash2, Split, Save, X, RefreshCw } from 'lucide-react';
import type { OrchestrationNodeData, RouterConditionItem, RouterMatchMode, RouterOperator, RouterTriggerOn } from '../../types';
import { matchesCurrentValues } from '../../services/notificationPreview';

interface PreviewSource { id: string; name: string; rows: Record<string, string>[]; error?: string; loading?: boolean }
interface Props {
  data: OrchestrationNodeData;
  availableColumns: string[];
  idColumn?: string;
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
  { value: 'IS_NOT_EMPTY', label: 'Có dữ liệu', sentence: 'có dữ liệu' },
];
const triggers: { value: RouterTriggerOn; label: string; detail: string; sentence: string }[] = [
  { value: 'CHANGED', label: 'Thêm hoặc sửa dòng', detail: 'Mỗi khi dữ liệu có thay đổi', sentence: 'một dòng được thêm hoặc sửa' },
  { value: 'CREATED', label: 'Chỉ thêm dòng mới', detail: 'Dòng chưa có ở lần đồng bộ trước', sentence: 'một dòng mới được thêm' },
  { value: 'UPDATED', label: 'Chỉ sửa dòng đã có', detail: 'Có cột thay đổi ở dòng đã tồn tại', sentence: 'một dòng đã có được sửa' },
];
const field = 'w-full rounded-lg border border-gray-700 bg-[#0d1118] px-3 py-2 text-sm text-gray-100 focus:border-purple-400 focus:outline-none disabled:opacity-50';

export function RouterConditionConfigModal({
  data, availableColumns, idColumn = 'id', previewRows = [], previewSources = [], actionNames = [],
  reading = false, readErrors = [], onRetryRead, disabled, onClose, onSave,
}: Props) {
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
  const matching = rows.filter(row => matchesCurrentValues(conditions, mode, row));
  const sampleColumns = [...new Set([idColumn, ...conditions.map(item => item.columnName)])].filter(Boolean).slice(0, 4);
  const sentence = conditions.map(item => item.columnName + ' ' + (operators.find(operator => operator.value === item.operator)?.sentence || '')
    + (item.operator === 'IS_NOT_EMPTY' ? '' : ' “' + (item.value || '…') + '”')).join(mode === 'ALL' ? ' và ' : ' hoặc ');
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
      if (condition.operator !== 'IS_NOT_EMPTY' && condition.value === undefined) { setError('Nhập giá trị cần so sánh.'); return; }
    }
    setSaving(true); setError('');
    try {
      await onSave({ routerTriggerOn: trigger, routerMatchMode: mode,
        routerConditions: conditions.map(item => ({ ...item, columnName: item.columnName.trim(), value: item.operator === 'IS_NOT_EMPTY' ? '' : item.value ?? '' })) });
      onClose();
    } catch (error) {
      const detail = error as { response?: { data?: { message?: string } }; message?: string };
      setError(detail.response?.data?.message || detail.message || 'Chưa lưu được. Các điều kiện của bạn vẫn được giữ.');
    } finally { setSaving(false); }
  };

  return <div role="dialog" aria-modal="true" aria-labelledby="router-modal-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6" onClick={event => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-gray-700 bg-[#141922] text-gray-100">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-700 px-5 py-4 sm:px-6">
        <div className="flex gap-3"><Split size={22} className="mt-1 text-purple-300" /><div>
          <h2 id="router-modal-title" className="text-lg font-semibold">Rẽ Nhánh Điều Kiện</h2>
          <p className="mt-1 text-sm text-gray-400">Chọn những dòng được chuyển đến khối thông báo.</p>
        </div></div>
        <button type="button" aria-label="Đóng" disabled={saving} onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-white"><X size={20} /></button>
      </header>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
        {error && <p role="alert" className="rounded-lg border border-red-900 bg-red-950/30 p-3 text-sm text-red-200">{error}</p>}
        <section className="space-y-3">
          <h3 className="font-semibold">1. Kiểm tra khi nào?</h3>
          <div className="grid gap-2 sm:grid-cols-3">{triggers.map(item => <button type="button" key={item.value} disabled={locked} aria-pressed={trigger === item.value} onClick={() => setTrigger(item.value)}
            className={'rounded-xl border p-3 text-left ' + (trigger === item.value ? 'border-purple-500 bg-purple-950/30' : 'border-gray-700 bg-[#10151d] hover:border-gray-500')}>
            <span className="block text-sm font-medium">{item.label}</span><span className="mt-1 block text-xs text-gray-400">{item.detail}</span>
          </button>)}</div>
        </section>
        <section className="space-y-3 border-t border-gray-700 pt-5">
          <h3 className="font-semibold">2. Chỉ chuyển dòng thỏa điều kiện</h3>
          {conditions.length > 1 && <label className="block space-y-1 text-xs text-gray-400"><span>Cách kết hợp các điều kiện</span><select aria-label="Cách kết hợp các điều kiện" disabled={locked} className={field} value={mode} onChange={event => setMode(event.target.value as RouterMatchMode)}>
            <option value="ALL">Phải đúng tất cả điều kiện</option><option value="ANY">Chỉ cần đúng ít nhất một điều kiện</option>
          </select></label>}
          {conditions.map((item, index) => {
            const examples = [...new Set(rows.map(row => row[item.columnName]).filter(value => value !== undefined && value !== ''))].slice(0, 30);
            return <div key={index} className="rounded-xl border border-gray-700 bg-[#10151d] p-3">
              <div className="mb-2 flex items-center justify-between text-xs text-gray-400"><span>Điều kiện {index + 1}</span><button type="button" aria-label={'Xóa điều kiện ' + (index + 1)} disabled={locked || conditions.length === 1} onClick={() => setConditions(previous => previous.filter((_, position) => position !== index))} className="rounded p-1 hover:text-red-300 disabled:opacity-30"><Trash2 size={15} /></button></div>
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1.2fr]">
                <label className="block space-y-1 text-xs text-gray-400"><span>Cột</span><select aria-label={'Cột điều kiện ' + (index + 1)} disabled={locked} className={field} value={item.columnName} onChange={event => update(index, { columnName: event.target.value })}>
                  {!availableColumns.includes(item.columnName) && <option value={item.columnName}>{item.columnName || 'Chọn cột'}</option>}
                  {availableColumns.map(column => <option key={column} value={column}>{column}</option>)}
                </select></label>
                <label className="block space-y-1 text-xs text-gray-400"><span>Điều kiện</span><select aria-label={'Cách so sánh ' + (index + 1)} disabled={locked} className={field} value={item.operator} onChange={event => update(index, { operator: event.target.value as RouterOperator })}>
                  {operators.map(operator => <option key={operator.value} value={operator.value}>{operator.label}</option>)}
                </select></label>
                <label className="block space-y-1 text-xs text-gray-400"><span>Giá trị</span><input type="text" aria-label={'Giá trị điều kiện ' + (index + 1)} disabled={locked || item.operator === 'IS_NOT_EMPTY'} className={field} value={item.operator === 'IS_NOT_EMPTY' ? '' : item.value ?? ''}
                  placeholder={item.operator === 'IS_NOT_EMPTY' ? 'Không cần nhập' : examples[0] ? 'Ví dụ: ' + examples[0] : 'Nhập giá trị…'} list={'router-values-' + index} onChange={event => update(index, { value: event.target.value })} />
                  <datalist id={'router-values-' + index}>{examples.map(value => <option key={value} value={value} />)}</datalist>
                </label>
              </div>
            </div>;
          })}
          <button type="button" disabled={locked} className="flex items-center gap-2 rounded-lg border border-gray-600 px-3 py-2 text-sm hover:bg-gray-800" onClick={() => { setConditions(previous => [...previous, { columnName: availableColumns.find(column => column !== idColumn) || availableColumns[0] || '', operator: 'EQUALS', value: '' }]); setError(''); }}><Plus size={15} />Thêm điều kiện</button>
          <details className="text-xs text-gray-400"><summary className="cursor-pointer">Giải thích cách so sánh</summary><p className="mt-2">“Là”, “Không phải” và “Vừa đổi thành” phân biệt chữ hoa, chữ thường. “Có chứa” tìm từ khóa không phân biệt hoa thường. “Vừa đổi thành” chỉ áp dụng cho dòng đã có, khi giá trị cột thực sự thay đổi.</p></details>
        </section>
        <section className="space-y-2 rounded-xl border border-gray-700 bg-[#10151d] p-3">
          <h3 className="text-sm font-medium">Bộ lọc của bạn</h3>
          <p className="text-sm leading-relaxed text-gray-300">Khi {triggers.find(item => item.value === trigger)?.sentence}, nếu {sentence}, chuyển dòng tới {destinations}.</p>
          {!actionNames.length && <p className="text-xs text-gray-400">Nối đầu ra của khối này với Telegram để chọn nơi nhận.</p>}
        </section>
        <section className="space-y-3 border-t border-gray-700 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Thử điều kiện với dữ liệu mẫu</h3>{onRetryRead && <button type="button" disabled={reading} onClick={onRetryRead} className="text-xs text-purple-300">{reading ? 'Đang đọc…' : 'Đọc lại dữ liệu'}</button>}</div>
          {reading && <p role="status" className="flex items-center gap-2 text-xs text-gray-400"><RefreshCw size={14} className="animate-spin" />Đang đọc dữ liệu mẫu. Bạn vẫn có thể chỉnh hoặc đóng cửa sổ.</p>}
          {readErrors.map((message, index) => <p key={index} role="alert" className="text-xs text-amber-200">{message}</p>)}
          {previewSources.length > 0 && <label className="block space-y-1 text-xs text-gray-400"><span>Bảng tính dùng để thử</span><select aria-label="Bảng tính dùng để thử" className={field} value={source?.id || ''} onChange={event => setSourceId(event.target.value)}>{previewSources.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
          {source?.error ? <p className="text-sm text-amber-200">{source.error}</p> : rows.length > 0 ? <>
            <p role="status" className="text-sm text-gray-200">{source ? source.name + ': ' : ''}{matching.length}/{rows.length} dòng phù hợp với điều kiện.</p>
            {matching.length > 0 && <div className="overflow-x-auto rounded-lg border border-gray-700"><table className="w-full text-left text-xs"><thead><tr>{sampleColumns.map(column => <th key={column} className="border-b border-gray-700 p-2 font-medium text-gray-400">{column}</th>)}</tr></thead><tbody>{matching.slice(0, 5).map((row, index) => <tr key={index}>{sampleColumns.map(column => <td key={column} className="max-w-48 truncate border-b border-gray-800 p-2">{row[column] || '—'}</td>)}</tr>)}</tbody></table></div>}
          </> : !reading && <p className="text-sm text-gray-400">Chưa có dòng mẫu. Đọc dữ liệu từ bảng tính đã nối để thử điều kiện.</p>}
          <p className="text-xs text-gray-400">Mẫu minh họa bộ lọc trên một bảng tính. Khi đồng bộ, hệ thống kiểm tra các dòng mới hoặc vừa thay đổi sau khi hợp nhất dữ liệu.</p>
        </section>
      </div>
      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-gray-700 px-5 py-4 sm:px-6"><p className="text-xs text-gray-400">Chỉ áp dụng thay đổi sau khi lưu.</p><div className="ml-auto flex gap-2">
        <button type="button" disabled={saving} onClick={onClose} className="rounded-lg border border-gray-700 px-4 py-2 text-sm hover:bg-gray-800">Hủy</button>
        <button type="button" disabled={locked} onClick={() => void save()} className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium hover:bg-purple-500 disabled:opacity-50">{saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}{saving ? 'Đang lưu…' : 'Lưu bộ lọc'}</button>
      </div></footer>
    </div>
  </div>;
}
