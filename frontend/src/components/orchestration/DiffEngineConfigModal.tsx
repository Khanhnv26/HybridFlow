import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Eye, RefreshCw, Save, Sparkles, X } from 'lucide-react';
import type { OrchestrationNodeData, SheetDataResponse } from '../../types';

export interface ComparisonSource {
  id: string;
  name: string;
  sheetName: string;
  data?: SheetDataResponse;
}

interface Props {
  data: OrchestrationNodeData;
  sources: ComparisonSource[];
  availableColumns: string[];
  disabled: boolean;
  onClose: () => void;
  onSave: (settings: Partial<OrchestrationNodeData>) => Promise<void>;
  onReadSource: (id: string, types: Record<string, 'TEXT' | 'NUMBER'>, signal: AbortSignal) => Promise<SheetDataResponse>;
}

const field = 'w-full rounded-lg border border-gray-700 bg-[#0d1118] px-3 py-2 text-sm text-gray-100 focus:border-purple-400 focus:outline-none disabled:opacity-50';
const splitColumns = (value?: string) => [...new Set((value || '').split(',').map(column => column.trim()).filter(Boolean))];

export function DiffEngineConfigModal({ data, sources, availableColumns, disabled, onClose, onSave, onReadSource }: Props) {
  const initialKey = data.uniqueKey || 'id';
  const [key, setKey] = useState(initialKey);
  const [columns, setColumns] = useState(() => splitColumns(data.sharedColumns));
  const [allByDefault, setAllByDefault] = useState(sources.length === 1 && !data.sharedColumns?.trim());
  const [types, setTypes] = useState({ ...data.columnTypes });
  const [policy, setPolicy] = useState(data.conflictPolicy || 'ASK_TELEGRAM');
  const [customColumn, setCustomColumn] = useState('');
  const [extraColumns, setExtraColumns] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [reading, setReading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sourceId, setSourceId] = useState(sources[0]?.id || '');
  const [previews, setPreviews] = useState<Record<string, { data?: SheetDataResponse; error?: string }>>({});
  const request = useRef<AbortController>();
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; request.current?.abort(); };
  }, []);

  const known = [...new Set([...availableColumns, initialKey, key, ...columns, ...extraColumns])].filter(Boolean);
  const choices = known.filter(column => column !== key);
  const selected = allByDefault ? choices : columns.filter(column => column !== key);
  const savedColumns = allByDefault ? '' : selected.join(', ');
  const savedTypes = Object.fromEntries(Object.entries(types).filter(([column]) => column === key || selected.includes(column)));
  const changedScope = key !== initialKey || savedColumns !== splitColumns(data.sharedColumns).join(', ')
    || JSON.stringify(Object.entries(savedTypes).sort()) !== JSON.stringify(Object.entries(data.columnTypes || {}).sort());
  const locked = disabled || saving;
  const chooseKey = (column: string) => {
    setKey(column); setError('');
    if (types[column] === 'NUMBER') setTypes(previous => ({ ...previous, [column]: 'TEXT' }));
  };
  const source = sources.find(item => item.id === sourceId) || sources[0];
  const preview = source && (previews[source.id] || { data: source.data });
  const sampleColumns = [key, ...selected].filter((column, index, list) => list.indexOf(column) === index).slice(0, 4);

  const chooseColumn = (column: string, checked: boolean) => {
    setColumns(checked ? [...selected, column] : selected.filter(item => item !== column));
    setAllByDefault(false); setError('');
  };
  const close = () => { if (!saving) { request.current?.abort(); onClose(); } };
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !saving) { request.current?.abort(); onClose(); } };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [saving, onClose]);

  const readPreview = async () => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setPreviewOpen(true); setReading(true); setError('');
    const results = await Promise.all(sources.map(async item => {
      try { return [item.id, { data: await onReadSource(item.id, savedTypes, controller.signal) }] as const; }
      catch (error) {
        const detail = error as { response?: { data?: { message?: string } }; message?: string };
        return [item.id, { error: detail.response?.data?.message || detail.message || 'Không đọc được bảng tính. Hãy thử lại.' }] as const;
      }
    }));
    if (!controller.signal.aborted && alive.current) { setPreviews(Object.fromEntries(results)); setReading(false); }
  };
  const save = async () => {
    if (!key.trim()) { setError('Chọn cột nhận biết từng dòng, ví dụ id hoặc mã đơn.'); return; }
    if (!selected.length && !allByDefault) { setError('Chọn ít nhất một cột cần đồng bộ.'); return; }
    for (const item of sources) {
      const headers = previews[item.id]?.data?.headers || item.data?.headers;
      const missing = headers && [key, ...selected].filter(column => !headers.includes(column));
      if (missing?.length) { setError(`${item.name} chưa có cột: ${missing.join(', ')}. Kiểm tra tên cột hoặc đọc lại dữ liệu.`); return; }
    }
    setSaving(true); setError('');
    try {
      await onSave({ uniqueKey: key.trim(), sharedColumns: savedColumns, columnTypes: savedTypes, conflictPolicy: policy });
      if (alive.current) onClose();
    } catch (error) {
      const detail = error as { response?: { data?: { message?: string } }; message?: string };
      if (alive.current) setError(detail.response?.data?.message || detail.message || 'Chưa lưu được. Các lựa chọn của bạn vẫn được giữ.');
    } finally { if (alive.current) setSaving(false); }
  };

  return <div role="dialog" aria-modal="true" aria-labelledby="sync-settings-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6" onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <div className="flex  w-full hf-modal hf-modal--complex flex-col overflow-hidden rounded-2xl border border-gray-700 bg-[#141922] text-gray-100">
      <header className="hf-modal-header flex shrink-0 items-start justify-between gap-4 border-b border-gray-700 px-5 py-4 sm:px-4">
        <div className="flex gap-3"><Sparkles size={22} className="mt-1 text-purple-300" /><div>
          <h2 id="sync-settings-title" className="text-base font-semibold">Điều phối & Đồng bộ</h2>
          <p className="mt-1 text-sm text-gray-400">Giữ dữ liệu bạn chọn giống nhau giữa các bảng tính.</p>
          <p className="mt-2 text-xs text-gray-400">{sources.length} bảng tính đã nối{sources.length === 1 ? ' với kho lưu trữ' : ''}</p>
        </div></div>
        <button type="button" aria-label="Đóng" disabled={saving} onClick={close} className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-white"><X size={20} /></button>
      </header>
      <div className="hf-modal-body min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-4">
        {error && <p role="alert" className="rounded-lg border border-red-900 bg-red-950/30 p-3 text-sm text-red-200">{error}</p>}
        <section className="space-y-3">
          <h3 className="font-semibold">1. Nhận biết cùng một dòng bằng cột nào?</h3>
          <p className="text-sm text-gray-400">Ví dụ: mã đơn ORD-001 ở các bảng tính là cùng một đơn hàng. Mỗi dòng cần có mã riêng.</p>
          <label className="block space-y-1.5 text-sm"><span>Cột nhận biết từng dòng</span>
            <select aria-label="Cột nhận biết từng dòng" className={field} disabled={locked} value={key} onChange={event => chooseKey(event.target.value)}>
              {known.map(column => <option key={column} value={column}>{column}</option>)}
            </select>
          </label>
          <p className="text-xs text-gray-400">Mã dòng luôn giữ dạng văn bản, kể cả khi có số 0 ở đầu.</p>
        </section>
        <section className="space-y-3 border-t border-gray-700 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">2. Giữ những cột nào giống nhau?</h3>
            <button type="button" disabled={locked} className="text-xs text-purple-300" onClick={() => { setColumns(selected.length === choices.length ? [] : choices); setAllByDefault(false); }}>{selected.length === choices.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}</button>
          </div>
          <p className="text-sm text-gray-400">Chọn cột và cách lưu ngay tại đây. Giá tiền, số lượng dùng Số; mã và số điện thoại dùng Văn bản.</p>
          <div className="divide-y divide-gray-800 rounded-xl border border-gray-700 bg-[#10151d]">
            {choices.map(column => {
              const checked = selected.includes(column);
              const example = sources.map(item => item.data?.rows.find(row => row[column] !== undefined)?.[column]).find(value => value !== undefined && value !== '');
              return <div key={column} className="grid grid-cols-[minmax(0,1fr)_8rem] items-center gap-3 px-3 py-3">
                <label className="flex min-w-0 cursor-pointer items-start gap-3"><input type="checkbox" disabled={locked} checked={checked} onChange={event => chooseColumn(column, event.target.checked)} className="mt-1 accent-purple-500" aria-label={'Đồng bộ cột ' + column} />
                  <span className="min-w-0"><span className="block truncate text-sm font-medium">{column}</span>{example !== undefined && <span className="block truncate text-xs text-gray-500">Ví dụ: {example}</span>}</span>
                </label>
                <select aria-label={'Kiểu cột ' + column} className={field} disabled={locked || !checked} value={types[column] || 'TEXT'} onChange={event => setTypes(previous => ({ ...previous, [column]: event.target.value as 'TEXT' | 'NUMBER' }))}>
                  <option value="TEXT">Văn bản</option><option value="NUMBER">Số</option>
                </select>
              </div>;
            })}
          </div>
          <p className="text-xs text-gray-400">Đã chọn {selected.length} cột. Cột không chọn được giữ riêng ở mỗi bảng tính.</p>
          <details className="text-xs text-gray-400"><summary className="flex cursor-pointer items-center gap-1"><ChevronDown size={13} />Thiết lập thêm</summary>
            <div className="mt-3 space-y-3 rounded-lg border border-gray-800 p-3">
              <label className="block space-y-1"><span>Nhập tên cột nhận biết dòng</span><input aria-label="Nhập tên cột nhận biết dòng" className={field} disabled={locked} value={key} onChange={event => chooseKey(event.target.value)} /></label>
              <div className="flex gap-2"><input aria-label="Thêm tên cột" className={field} placeholder="Tên cột chưa hiện trong danh sách" disabled={locked} value={customColumn} onChange={event => setCustomColumn(event.target.value)} />
                <button type="button" disabled={locked || !customColumn.trim()} className="rounded-lg border border-gray-700 px-3 text-gray-200" onClick={() => { const name = customColumn.trim(); setExtraColumns(previous => [...previous, name]); if (name !== key && !selected.includes(name)) setColumns([...selected, name]); setAllByDefault(false); setCustomColumn(''); }}>Thêm</button>
              </div>
              <p>Với cột Số, dùng dấu chấm cho phần thập phân và bỏ dấu phân cách hàng nghìn.</p>
            </div>
          </details>
        </section>
        <section className="space-y-3 border-t border-gray-700 pt-4">
          <h3 className="font-semibold">3. Khi cùng một dòng được sửa khác nhau?</h3>
          <select aria-label="Cách xử lý khi dữ liệu khác nhau" className={field} disabled={locked} value={policy} onChange={event => setPolicy(event.target.value)}>
            <option value="ASK_TELEGRAM">Để tôi chọn giá trị cần giữ</option>
            <option value="SOURCE_WINS">Giữ dữ liệu ở {sources[0]?.name || 'bảng tính đầu tiên'}</option>
            <option value="DESTINATION_WINS">Giữ dữ liệu ở {sources.length > 1 ? sources[sources.length - 1].name : 'kho lưu trữ'}</option>
          </select>
          <p className="text-sm text-gray-400">{policy === 'ASK_TELEGRAM' ? 'Các cột còn lại vẫn đồng bộ. Những giá trị khác nhau được giữ lại để bạn chọn; Telegram sẽ báo nếu đã nối khối thông báo.' : 'Lựa chọn này áp dụng khi nhiều nơi cùng sửa một giá trị kể từ lần đồng bộ trước.'}</p>
        </section>
        <section className="space-y-3 border-t border-gray-700 pt-4">
          <button type="button" disabled={reading || !sources.length} onClick={() => void readPreview()} className="flex items-center gap-2 rounded-lg border border-gray-600 px-3 py-2 text-sm hover:bg-gray-800 disabled:opacity-50">{reading ? <RefreshCw size={16} className="animate-spin" /> : <Eye size={16} />}{reading ? 'Đang đọc bảng tính…' : 'Xem dữ liệu mẫu'}</button>
          <p className="text-xs text-gray-400">Đọc mẫu để kiểm tra cột và giá trị. Dữ liệu chỉ được đồng bộ khi bạn chạy luồng.</p>
          {previewOpen && source && <div className="space-y-3 rounded-xl border border-gray-700 bg-[#10151d] p-3">
            <label className="block space-y-1 text-xs text-gray-400"><span>Bảng tính xem mẫu</span><select aria-label="Bảng tính xem mẫu" className={field} value={source.id} onChange={event => setSourceId(event.target.value)}>{sources.map(item => <option key={item.id} value={item.id}>{item.name} · {item.sheetName}</option>)}</select></label>
            {preview?.error && <p role="alert" className="text-sm text-amber-200">{preview.error}</p>}
            {preview?.data && <><p className="text-xs text-gray-400">{source.name}: đã đọc {preview.data.rows.length} dòng · hiển thị tối đa 5 dòng</p><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr>{sampleColumns.map(column => <th className="border-b border-gray-700 p-2 font-medium text-gray-400" key={column}>{column}</th>)}</tr></thead><tbody>{preview.data.rows.slice(0, 5).map((row, index) => <tr key={index}>{sampleColumns.map(column => <td key={column} className="max-w-48 truncate border-b border-gray-800 p-2">{row[column] || '—'}</td>)}</tr>)}</tbody></table></div></>}
          </div>}
        </section>
        {changedScope && <p role="status" className="rounded-lg border border-amber-800/60 bg-amber-950/20 p-3 text-sm text-amber-200">Bạn đã đổi cột nhận biết, cột đồng bộ hoặc kiểu dữ liệu. Lần chạy tiếp theo sẽ yêu cầu xác nhận dữ liệu ban đầu; lịch chạy tiếp tục sau bước xác nhận này.</p>}
      </div>
      <footer className="hf-modal-footer flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-gray-700 px-5 py-4 sm:px-4"><p className="text-xs text-gray-400">Chỉ áp dụng thay đổi sau khi lưu.</p><div className="ml-auto flex gap-2">
        <button type="button" disabled={saving} onClick={close} className="rounded-lg border border-gray-700 px-4 py-2 text-sm hover:bg-gray-800">Hủy</button>
        <button type="button" disabled={locked || reading} onClick={() => void save()} className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium hover:bg-purple-500 disabled:opacity-50">{saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}{saving ? 'Đang lưu…' : 'Lưu cấu hình'}</button>
      </div></footer>
    </div>
  </div>;
}
