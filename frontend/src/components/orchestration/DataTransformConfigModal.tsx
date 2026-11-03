import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Check, RefreshCw, Save, Wand2, X } from 'lucide-react';
import type { ColumnTransformConfig, OrchestrationNodeData, SheetDataResponse, TransformRule } from '../../types';
import { transformRules, transformValue } from '../../services/dataTransform';

export interface TransformInput {
  nodeId: string;
  name: string;
  data?: SheetDataResponse;
  read: (signal: AbortSignal) => Promise<SheetDataResponse>;
}
interface Props {
  data: OrchestrationNodeData;
  sources?: TransformInput[];
  source?: SheetDataResponse;
  sourceName?: string;
  connected: boolean;
  connectionVersion: number;
  onConnectGoogle: () => Promise<void>;
  onRead?: (signal: AbortSignal) => Promise<SheetDataResponse>;
  onClose: () => void;
  onSave: (settings: { transforms: ColumnTransformConfig[]; writeBackCleanData: boolean; writeBackBySource?: Record<string, boolean> }) => Promise<void>;
  disabled: boolean;
}
function errorMessage(error: unknown) {
  const detail = error as { response?: { data?: { message?: string } }; message?: string };
  return detail.response?.data?.message || detail.message || 'Không hoàn tất thao tác. Vui lòng thử lại.';
}
const ruleLabel = (rule: TransformRule) => transformRules.find(([type]) => type === rule)?.[1] || rule;

export function DataTransformConfigModal({
  data, sources, source, sourceName, connected, connectionVersion, onConnectGoogle, onRead, onClose, onSave, disabled,
}: Props) {
  const inputs = sources || (onRead ? [{ nodeId: 'source', name: sourceName || 'Sheet nguồn', data: source, read: onRead }] : []);
  const inputKey = inputs.map(input => input.nodeId).join('|');
  const [configs, setConfigs] = useState(() => structuredClone(data.transforms || []));
  const [writeBack, setWriteBack] = useState(!!data.writeBackCleanData);
  const [writeBackBySource, setWriteBackBySource] = useState<Record<string, boolean>>(data.writeBackBySource || {});
  const [selectedId, setSelectedId] = useState(inputs[0]?.nodeId || '');
  const [previews, setPreviews] = useState<Record<string, SheetDataResponse>>(() =>
    Object.fromEntries(inputs.filter(input => input.data).map(input => [input.nodeId, input.data!])));
  const [readErrors, setReadErrors] = useState<Record<string, string>>({});
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  const readers = useRef(inputs);
  readers.current = inputs;
  const busy = disabled || reading || saving || connecting;
  const hasSource = inputs.length > 0;
  const active = configs.filter(config => config.rules.length);
  const preview = previews[selectedId];
  const missing = inputs.flatMap(input => previews[input.nodeId] ? active
    .filter(config => !previews[input.nodeId].headers.includes(config.columnName))
    .map(config => ({ name: input.name, column: config.columnName })) : []);
  const unverified = connected && active.length > 0 && inputs.some(input => !previews[input.nodeId]);
  const columns = [...new Set([...Object.values(previews).flatMap(sheet => sheet.headers), ...configs.map(config => config.columnName)])];

  const read = async () => {
    if (!readers.current.length) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const targets = readers.current;
    setReading(true); setError(''); setReadErrors({}); setPreviews({});
    const results = await Promise.allSettled(targets.map(async input => ({
      id: input.nodeId, sheet: await input.read(controller.signal),
    })));
    if (controller.signal.aborted) return;
    const next: Record<string, SheetDataResponse> = {};
    const failures: Record<string, string> = {};
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') next[result.value.id] = result.value.sheet;
      else failures[targets[index].nodeId] = errorMessage(result.reason);
    });
    setPreviews(next); setReadErrors(failures); setReading(false);
  };
  useEffect(() => {
    if (hasSource && connected && !disabled && readers.current.some(input => !input.data)) void read();
    else setReading(false);
    return () => request.current?.abort();
  }, [inputKey, connected, connectionVersion, disabled]);
  useEffect(() => {
    setPreviews(current => {
      const next = { ...current };
      for (const input of inputs) if (input.data) next[input.nodeId] = input.data;
      return next;
    });
  }, [source, sources]);

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
    if (busy || !hasSource || missing.length || unverified) return;
    setSaving(true); setError('');
    try {
      await onSave({ transforms: active, writeBackCleanData: writeBack,
        ...(inputs.length > 1 || data.writeBackBySource ? { writeBackBySource: Object.fromEntries(inputs.map(input =>
          [input.nodeId, writeBackBySource[input.nodeId] ?? writeBack])) } : {}),
      });
      onClose();
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setSaving(false); }
  };
  const close = () => { if (!saving && !connecting) onClose(); };

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 md:p-6" onClick={close}>
    <section role="dialog" aria-modal="true" aria-labelledby="transform-title"
      className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-[#2d3748] bg-[#141922] text-gray-100 shadow-2xl"
      onClick={event => event.stopPropagation()}>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[#2d3748] p-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="rounded-xl border border-purple-800/60 bg-purple-950/50 p-2.5 text-purple-300"><Wand2 size={20} /></span>
          <div className="min-w-0"><h2 id="transform-title" className="font-semibold">Chuẩn Hóa Dữ Liệu</h2>
            <p className="mt-1 truncate text-xs text-gray-400">{inputs.length > 1 ? `${inputs.length} Sheet · Một bộ quy tắc dùng chung` : sourceName || inputs[0]?.name || 'Sheet → Chuẩn hóa → So khớp'}</p>
          </div>
        </div>
        <button aria-label="Đóng" disabled={saving || connecting} onClick={close} className="rounded p-2 text-gray-400 hover:bg-gray-800 disabled:opacity-40"><X size={18} /></button>
      </header>
      <div className="min-h-0 overflow-y-auto p-4">
        <div className="mb-4 overflow-hidden rounded-xl border border-[#2d3748] bg-[#11151c]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-800 px-3 py-2">
            <h3 className="text-xs font-semibold">Nguồn dữ liệu <span className="font-normal text-gray-500">· Xử lý độc lập từng Sheet</span></h3>
            <button disabled={busy || !hasSource || !connected} onClick={() => void read()} className="flex items-center gap-2 rounded border border-gray-700 px-2.5 py-1.5 text-xs disabled:opacity-40">
              <RefreshCw size={12} className={reading ? 'animate-spin' : ''} />{reading ? 'Đang đọc Sheet…' : 'Đọc lại dữ liệu mẫu'}
            </button>
          </div>
          {!hasSource && <p className="p-3 text-xs text-amber-200">Nối một hoặc nhiều Google Sheet vào cổng bên trái để dùng chung quy tắc chuẩn hóa.</p>}
          <div className="max-h-36 divide-y divide-gray-800 overflow-y-auto">{inputs.map(input => <div key={input.nodeId} className="flex items-center justify-between gap-3 px-3 py-2">
            <button onClick={() => setSelectedId(input.nodeId)} title={input.name} className={`min-w-0 truncate text-left text-xs ${selectedId === input.nodeId ? 'font-medium text-purple-200' : 'text-gray-400'}`}>{input.name}</button>
            <div className="flex shrink-0 items-center gap-3">
              <span className={`text-[10px] ${readErrors[input.nodeId] ? 'text-red-300' : 'text-gray-500'}`}>{reading ? 'Đang đọc…' : readErrors[input.nodeId] ? 'Đọc thất bại' : previews[input.nodeId] ? `${previews[input.nodeId].totalRows} dòng` : 'Chưa đọc'}</span>
              {inputs.length > 1 && <label className="flex items-center gap-1.5 text-[10px] text-gray-400"><input type="checkbox" aria-label={`Ghi sạch về ${input.name}`} disabled={busy} checked={writeBackBySource[input.nodeId] ?? writeBack} onChange={event => setWriteBackBySource(current => ({ ...current, [input.nodeId]: event.target.checked }))} className="accent-purple-500" />Ghi sạch</label>}
            </div>
          </div>)}</div>
          {Object.entries(readErrors).map(([id, detail]) => <p key={id} role="alert" className="border-t border-red-900/50 px-3 py-2 text-xs text-red-300">{inputs.find(input => input.nodeId === id)?.name}: {detail}</p>)}
        </div>
        {hasSource && !connected && <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-amber-950/30 p-3 text-xs text-amber-200">
          <span>Kết nối Google để kiểm tra cột và xem trước dữ liệu thật.</span>
          <button disabled={busy} className="rounded bg-amber-700 px-3 py-2 text-white disabled:opacity-40" onClick={async () => {
            setConnecting(true); setError('');
            try { await onConnectGoogle(); } catch (reason) { setError(errorMessage(reason)); }
            finally { setConnecting(false); }
          }}>{connecting ? 'Đang mở…' : 'Kết nối Google'}</button>
        </div>}
        {error && <p role="alert" className="mb-3 rounded-lg bg-red-950/30 p-3 text-xs text-red-200">{error}</p>}
        {missing.length > 0 && <div role="alert" className="mb-3 rounded-lg bg-amber-950/30 p-3 text-xs text-amber-300">
          <p>Cột không còn trong Sheet. Bỏ quy tắc hoặc bổ sung cột trước khi lưu:</p>
          <ul className="mt-1 list-inside list-disc">{missing.map(item => <li key={`${item.name}:${item.column}`}>{item.name} → {item.column}</li>)}</ul>
        </div>}
        <div className="grid items-start gap-4 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <div className="mb-3"><h3 className="text-sm font-semibold">Quy tắc dùng chung <span className="text-xs font-normal text-gray-500">· {active.length} cột</span></h3>
              <p className="mt-1 text-xs text-gray-400">Mở từng cột để chỉnh. Quy tắc chạy từ trên xuống trên mọi Sheet đã nối.</p>
            </div>
            {!columns.length && <p className="rounded-xl border border-dashed border-gray-700 p-6 text-center text-xs text-gray-500">{reading ? 'Đang lấy danh sách cột…' : 'Đọc Sheet để lấy danh sách cột.'}</p>}
            <div className="space-y-2 lg:max-h-[45vh] lg:overflow-y-auto lg:pr-1">{columns.map(column => {
              const config: ColumnTransformConfig = configs.find(item => item.columnName === column) || { columnName: column, rules: [] };
              return <details key={column} open={config.rules.length > 0 || active.length === 0} className="rounded-xl border border-[#2d3748] bg-[#11151c]">
                <summary className="cursor-pointer px-3 py-2.5 text-xs font-medium text-purple-200">{column}<span className="float-right text-[10px] text-gray-500">{config.rules.length} quy tắc</span></summary>
                <fieldset disabled={busy} className="border-t border-gray-800 p-3"><legend className="sr-only">{column}</legend>
                  <div className="grid grid-cols-2 gap-2.5">{transformRules.map(([rule, label]) => <label key={rule} className="flex items-center gap-2 text-xs text-gray-300">
                    <input type="checkbox" className="accent-purple-500" checked={config.rules.includes(rule)} onChange={event => update(column, { rules: event.target.checked ? [...config.rules, rule] : config.rules.filter(item => item !== rule) })} />{label}
                  </label>)}</div>
                  {config.rules.length > 0 && <ol className="mt-3 space-y-1 border-t border-gray-800 pt-2">{config.rules.map((rule, index) => <li key={`${rule}:${index}`} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-gray-400">{index + 1}. {ruleLabel(rule)}</span><span className="flex gap-1">
                      <button type="button" aria-label={`Đưa ${ruleLabel(rule)} lên trong ${column}`} disabled={busy || index === 0} onClick={() => moveRule(config, index, -1)} className="rounded p-1 hover:bg-gray-800 disabled:opacity-25"><ArrowUp size={13} /></button>
                      <button type="button" aria-label={`Đưa ${ruleLabel(rule)} xuống trong ${column}`} disabled={busy || index === config.rules.length - 1} onClick={() => moveRule(config, index, 1)} className="rounded p-1 hover:bg-gray-800 disabled:opacity-25"><ArrowDown size={13} /></button>
                    </span>
                  </li>)}</ol>}
                  {config.rules.includes('DEFAULT_IF_EMPTY') && <label className="mt-3 block space-y-1 text-xs text-gray-400"><span>Giá trị mặc định</span>
                    <input aria-label={`Giá trị mặc định cho ${column}`} className="w-full rounded border border-gray-700 bg-[#0b0e14] p-2 text-gray-100" value={config.defaultValue || ''} onChange={event => update(column, { defaultValue: event.target.value })} />
                  </label>}
                </fieldset>
              </details>;
            })}</div>
          </div>
          <div className="space-y-3">
            <div className="overflow-hidden rounded-xl border border-[#2d3748] bg-[#11151c]">
              <div className="border-b border-gray-800 p-3"><h3 className="text-sm font-semibold">Xem trước kết quả</h3><p className="mt-1 text-xs text-gray-500">Tối đa 3 dòng mỗi Sheet. Xem trước không ghi dữ liệu.</p>
                {inputs.length > 1 && <select aria-label="Sheet xem trước" value={selectedId} onChange={event => setSelectedId(event.target.value)} className="mt-3 w-full rounded border border-gray-700 bg-[#0b0e14] p-2 text-xs">{inputs.map(input => <option key={input.nodeId} value={input.nodeId}>{input.name}</option>)}</select>}
              </div>
              {!preview || !preview.rows.length || !active.length ? <p className="p-6 text-center text-xs text-gray-500">
                {reading ? 'Đang đọc dữ liệu mẫu…' : !preview ? 'Đọc Sheet để xem trước.' : !preview.rows.length ? 'Sheet chưa có dòng dữ liệu.' : 'Chọn quy tắc để xem kết quả.'}
              </p> : <div className="max-h-[40vh] overflow-auto"><table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-[#0b0e14] text-gray-400"><tr><th className="p-3">Dòng / Cột</th><th className="p-3">Trước</th><th className="p-3">Sau</th></tr></thead>
                <tbody>{preview.rows.slice(0, 3).flatMap((row, index) => active.map(config => {
                  const before = row[config.columnName] ?? null;
                  const after = transformValue(before, config);
                  return <tr key={`${index}:${config.columnName}`} className="border-t border-gray-800">
                    <td className="p-3 text-gray-400">{index + 2} · {config.columnName}</td><td className="whitespace-pre-wrap break-all p-3 font-mono text-gray-400">{JSON.stringify(before)}</td>
                    <td className={`whitespace-pre-wrap break-all p-3 font-mono ${before !== after ? 'text-emerald-300' : 'text-gray-400'}`}>{JSON.stringify(after)}{before !== after && <Check size={12} className="mt-1" aria-label="Đã thay đổi" />}</td>
                  </tr>;
                }))}</tbody>
              </table></div>}
            </div>
            {inputs.length <= 1 ? <label className="flex items-start gap-3 rounded-xl border border-[#2d3748] bg-[#11151c] p-3">
              <input type="checkbox" className="mt-0.5 accent-purple-500" disabled={busy} checked={inputs[0] ? writeBackBySource[inputs[0].nodeId] ?? writeBack : writeBack} onChange={event => { setWriteBack(event.target.checked); if (inputs[0]) setWriteBackBySource(current => ({ ...current, [inputs[0].nodeId]: event.target.checked })); }} />
              <span className="text-xs"><span className="block font-medium">Ghi đè làm sạch lại Sheet gốc</span><span className="mt-1 block leading-relaxed text-gray-500">Áp dụng khi chạy đồng bộ. Tắt để chỉ làm sạch trong bộ nhớ trước khi so khớp.</span></span>
            </label> : <p className="text-xs leading-relaxed text-gray-500">Bật “Ghi sạch” riêng cho từng nguồn ở phía trên. Các Sheet giữ nguyên danh tính khi so khớp.</p>}
            {unverified && !reading && <p className="text-xs text-amber-300">Đọc đủ các Sheet để kiểm tra cột trước khi lưu quy tắc.</p>}
          </div>
        </div>
      </div>
      <footer className="flex shrink-0 items-center justify-between gap-4 border-t border-[#2d3748] bg-[#11151c] px-4 py-3">
        <p className="hidden text-xs text-gray-500 sm:block">Áp dụng cho chạy thủ công và chạy theo lịch.</p>
        <div className="ml-auto flex gap-2"><button disabled={saving || connecting} onClick={close} className="rounded-lg border border-gray-700 px-4 py-2 text-xs disabled:opacity-40">Hủy</button>
          <button disabled={busy || !hasSource || !!missing.length || !!unverified} onClick={() => void save()} className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-xs font-medium hover:bg-purple-500 disabled:opacity-40">
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}{saving ? 'Đang lưu…' : 'Lưu cấu hình'}
          </button>
        </div>
      </footer>
    </section>
  </div>;
}
