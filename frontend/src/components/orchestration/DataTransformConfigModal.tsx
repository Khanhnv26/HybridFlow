import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUp, Check, RefreshCw, Save, Wand2, X } from 'lucide-react';
import type { ColumnTransformConfig, OrchestrationNodeData, SheetDataResponse, TransformRule } from '../../types';
import { transformRules, transformValue } from '../../services/dataTransform';

interface Props {
  data: OrchestrationNodeData;
  source?: SheetDataResponse;
  sourceName?: string;
  connected: boolean;
  connectionVersion: number;
  onConnectGoogle: () => Promise<void>;
  onRead?: (signal: AbortSignal) => Promise<SheetDataResponse>;
  onClose: () => void;
  onSave: (settings: { transforms: ColumnTransformConfig[]; writeBackCleanData: boolean }) => Promise<void>;
  disabled: boolean;
}
function errorMessage(error: unknown) {
  const detail = error as { response?: { data?: { message?: string } }; message?: string };
  return detail.response?.data?.message || detail.message || 'Không hoàn tất thao tác. Vui lòng thử lại.';
}
const ruleLabel = (rule: TransformRule) => transformRules.find(([type]) => type === rule)?.[1] || rule;

export function DataTransformConfigModal({
  data, source, sourceName, connected, connectionVersion, onConnectGoogle, onRead, onClose, onSave, disabled,
}: Props) {
  const [configs, setConfigs] = useState(() => structuredClone(data.transforms || []));
  const [writeBack, setWriteBack] = useState(!!data.writeBackCleanData);
  const [preview, setPreview] = useState(source);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  const reader = useRef(onRead);
  reader.current = onRead;
  const busy = disabled || reading || saving || connecting;
  const hasSource = !!onRead;
  const active = configs.filter(config => config.rules.length);
  const missing = preview ? active.filter(config => !preview.headers.includes(config.columnName)) : [];
  const columns = [...new Set([...(preview?.headers || []), ...configs.map(config => config.columnName)])];

  const read = async () => {
    if (!reader.current) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setReading(true);
    setError('');
    setPreview(undefined);
    try {
      const result = await reader.current(controller.signal);
      if (!controller.signal.aborted) setPreview(result);
    } catch (reason) {
      if (!controller.signal.aborted) setError(errorMessage(reason));
    } finally {
      if (!controller.signal.aborted) setReading(false);
    }
  };
  useEffect(() => {
    if (hasSource && connected && !disabled && !source) void read();
    else setReading(false);
    return () => request.current?.abort();
  }, [hasSource, connected, connectionVersion, disabled]);

  useEffect(() => { setPreview(source); }, [source]);

  const update = (column: string, patch: Partial<ColumnTransformConfig>) => setConfigs(current => {
    const index = current.findIndex(config => config.columnName === column);
    const config = current[index] || { columnName: column, rules: [] };
    if (index < 0) return [...current, { ...config, ...patch }];
    return current.map((item, position) => position === index ? { ...item, ...patch } : item);
  });
  const moveRule = (config: ColumnTransformConfig, index: number, offset: number) => {
    const rules = [...config.rules];
    [rules[index], rules[index + offset]] = [rules[index + offset], rules[index]];
    update(config.columnName, { rules });
  };
  const save = async () => {
    if (busy || !hasSource || missing.length) return;
    setSaving(true); setError('');
    try {
      await onSave({ transforms: active, writeBackCleanData: writeBack });
      onClose();
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setSaving(false); }
  };
  const close = () => { if (!saving && !connecting) onClose(); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 md:p-6" onClick={close}>
      <section role="dialog" aria-modal="true" aria-labelledby="transform-title"
        className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-[#2d3748] bg-[#141922] text-gray-100 shadow-2xl"
        onClick={event => event.stopPropagation()}>
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[#2d3748] p-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="rounded-xl border border-purple-800/60 bg-purple-950/50 p-2.5 text-purple-300"><Wand2 size={20} /></span>
            <div className="min-w-0">
              <h2 id="transform-title" className="font-semibold">Chuẩn Hóa Dữ Liệu</h2>
              <p className="mt-1 truncate text-xs text-gray-400">{sourceName || 'Sheet → Chuẩn hóa → Điều phối & Đồng bộ'}</p>
            </div>
          </div>
          <button aria-label="Đóng" disabled={saving || connecting} onClick={close} className="rounded p-2 text-gray-400 hover:bg-gray-800 disabled:opacity-40"><X size={18} /></button>
        </header>
        <div className="min-h-0 overflow-y-auto">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#2d3748] bg-[#11151c] px-5 py-3">
            <p className="text-xs text-gray-400"><span className="font-medium text-purple-200">{active.length} cột được chuẩn hóa</span> · Quy tắc chạy từ trên xuống</p>
            <button disabled={busy || !hasSource || !connected} onClick={() => void read()}
              className="flex items-center gap-2 rounded-lg border border-gray-700 px-3 py-2 text-xs hover:bg-gray-800 disabled:opacity-40">
              <RefreshCw size={14} className={reading ? 'animate-spin' : ''} />{reading ? 'Đang đọc Sheet…' : 'Đọc lại dữ liệu mẫu'}
            </button>
          </div>
          <div className="px-5 pt-4" aria-live="polite">
            {!hasSource && <p className="rounded-lg border border-amber-800/50 bg-amber-950/30 p-3 text-xs text-amber-200">Nối đúng một Google Sheet vào cổng bên trái của khối Chuẩn hóa để cấu hình.</p>}
            {hasSource && !connected && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-800/50 bg-amber-950/30 p-3 text-xs text-amber-200">
              <span>Kết nối Google để đọc danh sách cột và xem trước dữ liệu thật.</span>
              <button disabled={busy} className="rounded bg-amber-700 px-3 py-2 text-white disabled:opacity-40" onClick={async () => {
                setConnecting(true); setError('');
                try { await onConnectGoogle(); } catch (reason) { setError(errorMessage(reason)); }
                finally { setConnecting(false); }
              }}>{connecting ? 'Đang mở…' : 'Kết nối Google'}</button>
            </div>}
            {error && <p role="alert" className="mt-3 rounded-lg border border-red-800/50 bg-red-950/30 p-3 text-xs text-red-200">{error}</p>}
            {missing.length > 0 && <p role="alert" className="mt-3 text-xs text-amber-300">Cột không còn trong Sheet: {missing.map(config => config.columnName).join(', ')}. Bỏ quy tắc của các cột này trước khi lưu.</p>}
          </div>
          <div className="grid gap-5 p-5 lg:grid-cols-[1.1fr_1fr]">
            <div className="space-y-3">
              <div><h3 className="text-sm font-semibold">Quy tắc theo cột</h3><p className="mt-1 text-xs leading-relaxed text-gray-400">Chọn cột cần làm sạch. Dùng mũi tên để đổi thứ tự áp dụng từng quy tắc.</p></div>
              {!columns.length && <p className="rounded-xl border border-dashed border-gray-700 p-8 text-center text-xs text-gray-500">{reading ? 'Đang lấy danh sách cột…' : 'Danh sách cột sẽ xuất hiện sau khi đọc Sheet.'}</p>}
              {columns.map(column => {
                const config: ColumnTransformConfig = configs.find(item => item.columnName === column) || { columnName: column, rules: [] };
                return <fieldset key={column} disabled={busy} className="rounded-xl border border-[#2d3748] bg-[#11151c] p-3.5">
                  <legend className="px-1 text-xs font-semibold text-purple-200">{column}</legend>
                  <div className="grid grid-cols-2 gap-2.5">{transformRules.map(([rule, label]) => <label key={rule} className="flex items-center gap-2 text-xs text-gray-300">
                    <input type="checkbox" className="accent-purple-500" checked={config.rules.includes(rule)} onChange={event => update(column, {
                      rules: event.target.checked ? [...config.rules, rule] : config.rules.filter(item => item !== rule),
                    })} />{label}
                  </label>)}</div>
                  {config.rules.length > 0 && <ol className="mt-3 space-y-1 border-t border-gray-800 pt-2">{config.rules.map((rule, index) => <li key={`${rule}:${index}`} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-gray-400">{index + 1}. {ruleLabel(rule)}</span>
                    <span className="flex gap-1">
                      <button type="button" aria-label={`Đưa ${ruleLabel(rule)} lên trong ${column}`} disabled={busy || index === 0} onClick={() => moveRule(config, index, -1)} className="rounded p-1 hover:bg-gray-800 disabled:opacity-25"><ArrowUp size={13} /></button>
                      <button type="button" aria-label={`Đưa ${ruleLabel(rule)} xuống trong ${column}`} disabled={busy || index === config.rules.length - 1} onClick={() => moveRule(config, index, 1)} className="rounded p-1 hover:bg-gray-800 disabled:opacity-25"><ArrowDown size={13} /></button>
                    </span>
                  </li>)}</ol>}
                  {config.rules.includes('DEFAULT_IF_EMPTY') && <label className="mt-3 block space-y-1.5 text-xs text-gray-400">
                    <span>Giá trị mặc định</span><input aria-label={`Giá trị mặc định cho ${column}`} className="w-full rounded-lg border border-gray-700 bg-[#0b0e14] p-2.5 text-gray-100" placeholder="Ví dụ: Chưa cập nhật" value={config.defaultValue || ''} onChange={event => update(column, { defaultValue: event.target.value })} />
                  </label>}
                </fieldset>;
              })}
            </div>
            <div className="space-y-4">
              <div className="overflow-hidden rounded-xl border border-[#2d3748] bg-[#11151c]">
                <div className="border-b border-[#2d3748] p-4"><h3 className="flex items-center gap-2 text-sm font-semibold">Xem trước <ArrowRight size={14} className="text-purple-300" /> Kết quả</h3><p className="mt-1 text-xs text-gray-400">Tối đa 3 dòng đầu từ Sheet gốc. Xem trước không ghi dữ liệu.</p></div>
                {!preview || !preview.rows.length || !active.length ? <p className="p-8 text-center text-xs leading-relaxed text-gray-500">
                  {reading ? 'Đang đọc dữ liệu mẫu…' : !preview ? 'Đọc Sheet để xem dữ liệu trước và sau chuẩn hóa.' : !preview.rows.length ? 'Sheet chưa có dòng dữ liệu để xem trước.' : 'Chọn ít nhất một quy tắc để xem kết quả.'}
                </p> : <div className="overflow-x-auto"><table className="w-full text-left text-xs">
                  <thead className="bg-[#0b0e14] text-gray-400"><tr><th className="p-3">Dòng / Cột</th><th className="p-3">Trước</th><th className="p-3">Sau</th></tr></thead>
                  <tbody>{preview.rows.slice(0, 3).flatMap((row, index) => active.map(config => {
                    const before = row[config.columnName] ?? null;
                    const after = transformValue(before, config);
                    const changed = before !== after;
                    return <tr key={`${index}:${config.columnName}`} className="border-t border-gray-800">
                      <td className="p-3 text-gray-400">{index + 2} · {config.columnName}</td>
                      <td className="whitespace-pre-wrap break-all p-3 font-mono text-gray-400">{JSON.stringify(before)}</td>
                      <td className={`whitespace-pre-wrap break-all p-3 font-mono ${changed ? 'text-emerald-300' : 'text-gray-400'}`}>{JSON.stringify(after)}{changed && <Check size={12} className="mt-1 text-emerald-400" aria-label="Đã thay đổi" />}</td>
                    </tr>;
                  }))}</tbody>
                </table></div>}
              </div>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#2d3748] bg-[#11151c] p-4">
                <input type="checkbox" className="mt-0.5 accent-purple-500" disabled={busy} checked={writeBack} onChange={event => setWriteBack(event.target.checked)} />
                <span><span className="block text-xs font-medium">Ghi đè làm sạch lại Sheet gốc</span><span className="mt-2 block text-xs leading-relaxed text-gray-400">{writeBack ? 'Khi chạy đồng bộ, các ô thay đổi do chuẩn hóa sẽ được ghi lại vào Sheet nguồn.' : 'Dữ liệu được làm sạch trong bộ nhớ để so khớp. Các ô chỉ thay đổi do chuẩn hóa sẽ giữ nguyên trên Sheet nguồn.'}</span></span>
              </label>
            </div>
          </div>
        </div>
        <footer className="flex shrink-0 items-center justify-between gap-4 border-t border-[#2d3748] bg-[#11151c] px-5 py-4">
          <p className="hidden text-xs text-gray-500 sm:block">Cấu hình được lưu cho cả chạy thủ công và chạy theo lịch.</p>
          <div className="ml-auto flex gap-2">
            <button disabled={saving || connecting} onClick={close} className="rounded-lg border border-gray-700 px-4 py-2 text-xs text-gray-300 disabled:opacity-40">Hủy</button>
            <button disabled={busy || !hasSource || !!missing.length} onClick={() => void save()} className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-xs font-medium text-white hover:bg-purple-500 disabled:opacity-40">
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}{saving ? 'Đang lưu…' : 'Lưu cấu hình'}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
