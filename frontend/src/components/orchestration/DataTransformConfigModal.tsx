import { useEffect, useState } from 'react';
import { X, Wand2 } from 'lucide-react';
import type { ColumnTransformConfig, OrchestrationNodeData, SheetDataResponse } from '../../types';
import { transformRules, transformValue } from '../../services/dataTransform';

export function DataTransformConfigModal({ data, source, onRead, onClose, onSave, disabled }: {
  data: OrchestrationNodeData;
  source?: SheetDataResponse;
  onRead?: () => Promise<unknown>;
  onClose: () => void;
  onSave: (settings: { transforms: ColumnTransformConfig[]; writeBackCleanData: boolean }) => void;
  disabled: boolean;
}) {
  const [configs, setConfigs] = useState(data.transforms || []);
  const [writeBack, setWriteBack] = useState(!!data.writeBackCleanData);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const read = async () => {
    if (!onRead) return;
    setReading(true); setError('');
    try { await onRead(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không đọc được dữ liệu Sheet.'); }
    finally { setReading(false); }
  };
  useEffect(() => { if (!source && onRead) void read(); }, []);
  const columns = [...new Set([...(source?.headers || []), ...configs.map(c => c.columnName)])];
  const update = (column: string, patch: Partial<ColumnTransformConfig>) => setConfigs(current => {
    const config = current.find(c => c.columnName === column) || { columnName: column, rules: [] };
    return [...current.filter(c => c.columnName !== column), { ...config, ...patch }];
  });
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5" onClick={onClose}>
    <section role="dialog" aria-modal="true" aria-labelledby="transform-title" className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-purple-800 bg-[#141922] p-6 text-gray-100" onClick={event => event.stopPropagation()}>
      <div className="mb-4 flex items-center justify-between"><h2 id="transform-title" className="flex items-center gap-2 text-lg font-semibold"><Wand2 className="text-purple-400" />Chuẩn Hóa Dữ Liệu</h2><button aria-label="Đóng" onClick={onClose}><X /></button></div>
      <p className="mb-4 text-sm text-gray-400">Chọn quy tắc theo từng cột. Quy tắc chạy theo thứ tự bạn chọn; bỏ chọn rồi chọn lại để đổi thứ tự.</p>
      {onRead ? <button disabled={reading || disabled} className="mb-4 rounded border border-purple-700 px-3 py-2 text-sm disabled:opacity-50" onClick={read}>{reading ? 'Đang đọc…' : 'Đọc cột và dữ liệu mẫu từ Sheet'}</button> : <p className="mb-4 text-amber-300">Nối một Google Sheet vào cổng bên trái để lấy danh sách cột.</p>}
      {error && <p role="alert" className="mb-3 text-red-300">{error}</p>}
      {!columns.length && <p className="py-5 text-sm text-gray-400">Chưa có cột. Hãy đọc dữ liệu từ Sheet đã kết nối.</p>}
      <div className="space-y-3">{columns.map(column => {
        const config: ColumnTransformConfig = configs.find(c => c.columnName === column) || { columnName: column, rules: [] };
        return <div key={column} className="rounded-xl border border-gray-700 p-3">
          <h3 className="mb-2 font-semibold text-purple-200">{column}</h3>
          <div className="flex flex-wrap gap-4">{transformRules.map(([rule, label]) => <label key={rule} className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={disabled} checked={config.rules.includes(rule)} onChange={event => update(column, { rules: event.target.checked ? [...config.rules, rule] : config.rules.filter(r => r !== rule) })} />{label}</label>)}</div>
          {!!config.rules.length && <p className="mt-2 text-xs text-gray-400">{config.rules.join(' → ')}</p>}
          {config.rules.includes('DEFAULT_IF_EMPTY') && <input aria-label={`Giá trị mặc định cho ${column}`} disabled={disabled} className="mt-2 w-full rounded border border-gray-600 bg-gray-900 p-2 text-sm" placeholder="Giá trị mặc định" value={config.defaultValue || ''} onChange={event => update(column, { defaultValue: event.target.value })} />}
        </div>;
      })}</div>
      <label className="my-5 flex items-center gap-3 text-sm"><input type="checkbox" disabled={disabled} checked={writeBack} onChange={event => setWriteBack(event.target.checked)} />Ghi đè làm sạch lại Sheet gốc</label>
      <h3 className="mb-2 font-semibold">Xem trước kết quả</h3>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="text-gray-400"><th className="p-2">Dòng / Cột</th><th className="p-2">Trước</th><th className="p-2">Sau</th></tr></thead><tbody>{source?.rows.slice(0, 3).flatMap((row, index) => configs.filter(c => c.rules.length).map(config => <tr key={`${index}:${config.columnName}`} className="border-t border-gray-800"><td className="p-2">{index + 2} · {config.columnName}</td><td className="whitespace-pre-wrap p-2 font-mono">{JSON.stringify(row[config.columnName] ?? null)}</td><td className="whitespace-pre-wrap p-2 font-mono text-emerald-300">{JSON.stringify(transformValue(row[config.columnName], config))}</td></tr>))}</tbody></table></div>
      <div className="mt-5 flex justify-end gap-3"><button onClick={onClose} className="rounded px-4 py-2 text-sm text-gray-400">Đóng</button><button disabled={disabled} onClick={() => { onSave({ transforms: configs.filter(c => c.rules.length), writeBackCleanData: writeBack }); onClose(); }} className="rounded bg-purple-600 px-4 py-2 text-sm disabled:opacity-50">Lưu cấu hình</button></div>
    </section>
  </div>;
}
