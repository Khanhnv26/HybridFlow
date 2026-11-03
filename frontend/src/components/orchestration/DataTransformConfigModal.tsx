import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Check, RefreshCw, Save, Search, Wand2, X } from 'lucide-react';
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
  data,
  sources,
  source,
  sourceName,
  connected,
  connectionVersion,
  onConnectGoogle,
  onRead,
  onClose,
  onSave,
  disabled,
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
  const [selectedColumn, setSelectedColumn] = useState<string>('');
  const [colSearchQuery, setColSearchQuery] = useState('');

  const filteredColumns = columns.filter(col =>
    col.toLowerCase().includes(colSearchQuery.toLowerCase().trim()),
  );

  const activeCol = selectedColumn && columns.includes(selectedColumn)
    ? selectedColumn
    : (columns[0] || '');

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
      await onSave({
        transforms: active,
        writeBackCleanData: writeBack,
        ...(inputs.length > 1 || data.writeBackBySource ? {
          writeBackBySource: Object.fromEntries(inputs.map(input =>
            [input.nodeId, writeBackBySource[input.nodeId] ?? writeBack]))
        } : {}),
      });
      onClose();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSaving(false);
    }
  };

  const close = () => { if (!saving && !connecting) onClose(); };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={close}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="transform-title"
        className="flex h-[88vh] max-h-[850px] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[#2d3748] bg-[#141922] text-gray-100 shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        {/* Modal Header */}
        <header className="flex shrink-0 items-center justify-between border-b border-[#2d3748] p-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="rounded-xl border border-purple-800/60 bg-purple-950/50 p-2.5 text-purple-300">
              <Wand2 size={20} />
            </span>
            <div className="min-w-0">
              <h2 id="transform-title" className="font-semibold">Chuẩn Hóa Dữ Liệu</h2>
              <p className="mt-1 truncate text-xs text-gray-400">
                {inputs.length > 1 ? `${inputs.length} Sheet · Một bộ quy tắc dùng chung` : sourceName || inputs[0]?.name || 'Sheet → Chuẩn hóa → So khớp'}
              </p>
            </div>
          </div>
          <button
            aria-label="Đóng"
            disabled={saving || connecting}
            onClick={close}
            className="rounded p-2 text-gray-400 hover:bg-gray-800 hover:text-white disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </header>

        {/* 2-Column Split: Master-Detail matching SheetSourceConfig */}
        <div className="grid min-h-0 flex-1 overflow-hidden md:grid-cols-2">
          
          {/* Left Panel: Configuration */}
          <div className="space-y-4 overflow-y-auto p-5 text-sm min-w-0 h-full">
            {hasSource && !connected && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-700 bg-amber-950/30 p-3 text-xs text-amber-200">
                <span>Kết nối Google để kiểm tra cột và xem trước dữ liệu thật.</span>
                <button
                  disabled={busy}
                  className="rounded bg-amber-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-40"
                  onClick={async () => {
                    setConnecting(true); setError('');
                    try { await onConnectGoogle(); } catch (reason) { setError(errorMessage(reason)); }
                    finally { setConnecting(false); }
                  }}
                >
                  {connecting ? 'Đang mở…' : 'Kết nối Google'}
                </button>
              </div>
            )}

            {error && (
              <p role="alert" className="rounded-lg border border-red-800/50 bg-red-950/30 p-3 text-xs text-red-300">
                {error}
              </p>
            )}

            {missing.length > 0 && (
              <div role="alert" className="rounded-lg border border-amber-800/50 bg-amber-950/30 p-3 text-xs text-amber-300">
                <p className="font-medium">Cột không còn trong Sheet. Bỏ quy tắc hoặc bổ sung cột trước khi lưu:</p>
                <ul className="mt-1 list-inside list-disc">
                  {missing.map(item => (
                    <li key={`${item.name}:${item.column}`}>{item.name} → {item.column}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Block 1: Nguồn dữ liệu */}
            <div className="space-y-2 rounded-xl border border-gray-700 bg-[#0b0e14] p-3">
              <div className="flex items-center justify-between gap-2 border-b border-gray-800 pb-2">
                <h3 className="text-xs font-semibold text-gray-300">
                  Nguồn dữ liệu <span className="font-normal text-gray-500">· {inputs.length} Sheet</span>
                </h3>
                <button
                  disabled={busy || !hasSource || !connected}
                  onClick={() => void read()}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 disabled:opacity-40"
                >
                  <RefreshCw size={12} className={reading ? 'animate-spin' : ''} />
                  {reading ? 'Đang đọc Sheet…' : 'Đọc lại dữ liệu mẫu'}
                </button>
              </div>

              {!hasSource && (
                <p className="p-2 text-xs text-amber-200">
                  Nối một hoặc nhiều Google Sheet vào cổng bên trái để dùng chung quy tắc chuẩn hóa.
                </p>
              )}

              {inputs.length > 0 && (
                <div className="max-h-52 space-y-1.5 overflow-y-auto pr-1">
                  {inputs.map(input => {
                    const isSelected = selectedId === input.nodeId;
                    return (
                      <div
                        key={input.nodeId}
                        onClick={() => setSelectedId(input.nodeId)}
                        className={`flex items-center justify-between gap-3 rounded-lg border p-2 transition cursor-pointer ${
                          isSelected
                            ? 'border-purple-800/80 bg-purple-950/40 text-purple-200'
                            : 'border-gray-800 bg-[#141922] text-gray-400 hover:border-gray-700 hover:text-gray-300'
                        }`}
                      >
                        <div className="min-w-0 flex-1 pr-2">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setSelectedId(input.nodeId); }}
                            title={input.name}
                            className={`block w-full truncate text-left text-xs ${isSelected ? 'font-medium text-purple-200' : 'text-gray-400'}`}
                          >
                            {input.name}
                          </button>
                          <span className={`block text-[10px] truncate ${readErrors[input.nodeId] ? 'text-red-300' : 'text-gray-500'}`}>
                            {reading ? 'Đang đọc…' : readErrors[input.nodeId] ? 'Đọc thất bại' : previews[input.nodeId] ? `${previews[input.nodeId].totalRows} dòng` : 'Chưa đọc'}
                          </span>
                        </div>

                        {inputs.length > 1 && (
                          <label
                            className="flex shrink-0 items-center gap-1.5 text-xs text-gray-400 cursor-pointer select-none"
                            onClick={e => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              aria-label={`Ghi sạch về ${input.name}`}
                              disabled={busy}
                              checked={writeBackBySource[input.nodeId] ?? writeBack}
                              onChange={event => setWriteBackBySource(current => ({ ...current, [input.nodeId]: event.target.checked }))}
                              className="accent-purple-500"
                            />
                            Ghi sạch
                          </label>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {Object.entries(readErrors).map(([id, detail]) => (
                <p key={id} role="alert" className="border-t border-red-900/50 pt-2 text-xs text-red-300">
                  {inputs.find(input => input.nodeId === id)?.name}: {detail}
                </p>
              ))}

              {inputs.length <= 1 && (
                <label className="flex items-start gap-2.5 border-t border-gray-800 pt-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-purple-500"
                    disabled={busy}
                    checked={inputs[0] ? writeBackBySource[inputs[0].nodeId] ?? writeBack : writeBack}
                    onChange={event => {
                      setWriteBack(event.target.checked);
                      if (inputs[0]) setWriteBackBySource(current => ({ ...current, [inputs[0].nodeId]: event.target.checked }));
                    }}
                  />
                  <div className="text-xs">
                    <span className="block font-medium text-gray-200">Ghi đè làm sạch lại Sheet gốc</span>
                    <span className="mt-0.5 block text-gray-400">
                      Áp dụng khi chạy đồng bộ. Tắt để chỉ làm sạch trong bộ nhớ trước khi so khớp.
                    </span>
                  </div>
                </label>
              )}
            </div>

            {/* Block 2: Cột dữ liệu (Pill Selector) */}
            <div className="space-y-2 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-300">
                  Cột dữ liệu ({columns.length})
                </span>
                <span className="text-xs text-purple-300 font-mono">
                  {active.length} cột có quy tắc
                </span>
              </div>

              {!columns.length ? (
                <p className="rounded-xl border border-dashed border-gray-700 p-4 text-center text-xs text-gray-500">
                  {reading ? 'Đang lấy danh sách cột…' : 'Đọc Sheet để lấy danh sách cột.'}
                </p>
              ) : (
                <>
                  {columns.length > 5 && (
                    <div className="relative">
                      <Search size={13} className="absolute left-2.5 top-2.5 text-gray-500 pointer-events-none" />
                      <input
                        type="text"
                        value={colSearchQuery}
                        onChange={(e) => setColSearchQuery(e.target.value)}
                        placeholder="Tìm tên cột..."
                        className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-[#0b0e14] border border-gray-700 text-xs text-gray-200 placeholder-gray-500 outline-none focus:border-purple-500"
                      />
                    </div>
                  )}
                  <div className="max-h-28 overflow-y-auto pr-1 flex flex-wrap gap-1.5">
                    {filteredColumns.map(column => {
                      const config = configs.find(item => item.columnName === column);
                      const count = config?.rules?.length || 0;
                      const isSelected = activeCol === column;
                      return (
                        <button
                          key={column}
                          type="button"
                          title={column}
                          onClick={() => setSelectedColumn(column)}
                          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-mono transition max-w-[150px] ${
                            isSelected
                              ? 'border-purple-500 bg-purple-600 font-medium text-white shadow-sm'
                              : count > 0
                              ? 'border-purple-800 bg-purple-950/40 text-purple-200 hover:border-purple-600'
                              : 'border-gray-700 bg-[#0b0e14] text-gray-400 hover:border-gray-600 hover:text-gray-200'
                          }`}
                        >
                          <span className="truncate">{column}</span>
                          {count > 0 && (
                            <span
                              className={`rounded-full px-1.5 text-[11px] font-sans shrink-0 ${
                                isSelected ? 'bg-purple-800 text-white' : 'bg-purple-900/60 text-purple-300'
                              }`}
                            >
                              {count}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Block 3: Fieldsets for columns (activeCol prominent, others hidden for full test query compatibility) */}
            {columns.map(column => {
              const config: ColumnTransformConfig = configs.find(item => item.columnName === column) || { columnName: column, rules: [] };
              const isCurrent = column === activeCol;
              return (
                <fieldset
                  key={column}
                  disabled={busy}
                  className={`rounded-xl border border-gray-700 bg-[#0b0e14] p-3 space-y-3 ${isCurrent ? 'block' : 'hidden'}`}
                >
                  <legend className="sr-only">{column}</legend>
                  <div className="flex items-center justify-between border-b border-gray-800 pb-2">
                    <span className="text-xs font-semibold text-purple-300">
                      Quy tắc cho cột: <span className="font-mono text-gray-100">{column}</span>
                    </span>
                    <span className="text-xs text-gray-500">
                      {config.rules.length} quy tắc
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {transformRules.map(([rule, label]) => (
                      <label key={rule} className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                        <input
                          type="checkbox"
                          className="accent-purple-500"
                          checked={config.rules.includes(rule)}
                          onChange={event => {
                            let nextRules = event.target.checked
                              ? [...config.rules, rule]
                              : config.rules.filter(item => item !== rule);
                            // Conflict auto-resolution
                            if (event.target.checked) {
                              if (rule === 'UPPERCASE') nextRules = nextRules.filter(r => r !== 'LOWERCASE' && r !== 'CAPITALIZE');
                              else if (rule === 'LOWERCASE') nextRules = nextRules.filter(r => r !== 'UPPERCASE' && r !== 'CAPITALIZE');
                              else if (rule === 'CAPITALIZE') nextRules = nextRules.filter(r => r !== 'UPPERCASE' && r !== 'LOWERCASE');
                            }
                            update(column, { rules: nextRules });
                          }}
                        />
                        {label}
                      </label>
                    ))}
                  </div>

                  {config.rules.length > 0 && (
                    <div className="border-t border-gray-800 pt-2 space-y-1">
                      <span className="block text-[11px] text-gray-400">Thứ tự thực thi (từ trên xuống):</span>
                      <ol className="space-y-1">
                        {config.rules.map((rule, index) => (
                          <li
                            key={`${rule}:${index}`}
                            className="flex items-center justify-between gap-2 rounded border border-gray-800 bg-[#141922] p-1.5 text-xs"
                          >
                            <span className="font-mono text-gray-300 text-xs">
                              {index + 1}. {ruleLabel(rule)}
                            </span>
                            <span className="flex gap-1">
                              <button
                                type="button"
                                aria-label={`Đưa ${ruleLabel(rule)} lên trong ${column}`}
                                disabled={busy || index === 0}
                                onClick={() => moveRule(config, index, -1)}
                                className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-white disabled:opacity-25"
                              >
                                <ArrowUp size={13} />
                              </button>
                              <button
                                type="button"
                                aria-label={`Đưa ${ruleLabel(rule)} xuống trong ${column}`}
                                disabled={busy || index === config.rules.length - 1}
                                onClick={() => moveRule(config, index, 1)}
                                className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-white disabled:opacity-25"
                              >
                                <ArrowDown size={13} />
                              </button>
                            </span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {config.rules.includes('DEFAULT_IF_EMPTY') && (
                    <label className="block space-y-1 border-t border-gray-800 pt-2 text-xs text-gray-400">
                      <span>Giá trị mặc định (khi ô trống)</span>
                      <input
                        aria-label={`Giá trị mặc định cho ${column}`}
                        className="w-full rounded border border-gray-700 bg-[#141922] p-2 text-xs text-gray-100 outline-none focus:border-purple-500"
                        value={config.defaultValue || ''}
                        onChange={event => update(column, { defaultValue: event.target.value })}
                        placeholder="Ví dụ: N/A"
                      />
                    </label>
                  )}
                </fieldset>
              );
            })}
          </div>

          {/* Right Panel: Spreadsheet Preview matching SheetSourceConfig */}
          <div className="flex min-w-0 flex-col justify-between space-y-4 bg-[#13161f] p-5 text-xs overflow-y-auto h-full">
            <div className="space-y-3 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="font-medium text-gray-300">Xem trước kết quả</h4>
                  <p className="mt-0.5 text-xs text-gray-500">Tối đa 3 dòng mỗi Sheet. Xem trước không ghi dữ liệu.</p>
                </div>
                {inputs.length > 1 && (
                  <select
                    aria-label="Sheet xem trước"
                    value={selectedId}
                    onChange={event => setSelectedId(event.target.value)}
                    className="rounded-lg border border-gray-700 bg-[#0b0e14] px-2.5 py-1.5 text-xs text-gray-200 outline-none focus:border-purple-500 max-w-[200px] truncate"
                  >
                    {inputs.map(input => (
                      <option key={input.nodeId} value={input.nodeId}>{input.name}</option>
                    ))}
                  </select>
                )}
              </div>

              {!preview || !preview.rows.length || !active.length ? (
                <div className="rounded-xl border border-gray-800 bg-[#0b0e14] p-6 text-center text-xs text-gray-500">
                  {reading
                    ? 'Đang đọc dữ liệu mẫu…'
                    : !preview
                    ? 'Đọc Sheet để xem trước.'
                    : !preview.rows.length
                    ? 'Sheet chưa có dòng dữ liệu.'
                    : 'Chọn quy tắc để xem kết quả.'}
                </div>
              ) : (
                <div className="max-h-[52vh] overflow-auto rounded-lg border border-gray-800 bg-[#0b0e14]">
                  <table className="w-full table-fixed text-left">
                    <thead className="sticky top-0 z-10 border-b border-gray-700 bg-[#161c26] text-gray-400">
                      <tr>
                        <th className="p-2.5 text-center text-gray-500 w-12 font-medium">#</th>
                        <th className="p-2.5 font-medium w-[26%]">Cột</th>
                        <th className="p-2.5 font-medium w-[34%]">Trước</th>
                        <th className="p-2.5 font-medium w-[34%]">Sau</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800 font-mono">
                      {preview.rows.slice(0, 3).flatMap((row, index) =>
                        active.map(config => {
                          const before = row[config.columnName] ?? null;
                          const after = transformValue(before, config);
                          const changed = before !== after;
                          const isSelected = config.columnName === activeCol;
                          return (
                            <tr
                              key={`${index}:${config.columnName}`}
                              className={`hover:bg-[#141922] transition ${isSelected ? 'bg-purple-950/20' : ''}`}
                            >
                              <td className="p-2.5 text-center text-gray-500 font-sans text-xs">{index + 2}</td>
                              <td className="p-2.5 truncate" title={config.columnName}>
                                <span className={`block truncate ${isSelected ? 'font-medium text-purple-300' : 'text-gray-400'}`}>
                                  {config.columnName}
                                </span>
                              </td>
                              <td className="p-2.5 text-gray-400 truncate" title={String(before)}>
                                <span className="block truncate">{JSON.stringify(before)}</span>
                              </td>
                              <td className={`p-2.5 truncate ${changed ? 'font-medium text-emerald-300' : 'text-gray-400'}`} title={String(after)}>
                                <div className="flex items-center justify-between gap-1.5 min-w-0">
                                  <span className="truncate">{JSON.stringify(after)}</span>
                                  {changed && <Check size={12} className="text-emerald-300 shrink-0" aria-label="Đã thay đổi" />}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {unverified && !reading && (
              <p role="status" className="text-xs text-amber-300">
                Đọc đủ các Sheet để kiểm tra cột trước khi lưu quy tắc.
              </p>
            )}
          </div>

        </div>

        {/* Modal Footer */}
        <footer className="flex shrink-0 items-center justify-between border-t border-[#2d3748] bg-[#11151c] px-5 py-3">
          <p className="hidden text-xs text-gray-500 sm:block">
            Áp dụng cho chạy thủ công và chạy theo lịch.
          </p>
          <div className="ml-auto flex gap-3">
            <button
              disabled={saving || connecting}
              onClick={close}
              className="px-3 py-2 text-xs text-gray-400 hover:text-white disabled:opacity-40"
            >
              Hủy
            </button>
            <button
              disabled={busy || !hasSource || !!missing.length || !!unverified}
              onClick={() => void save()}
              className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-xs font-medium text-white hover:bg-purple-500 disabled:opacity-40"
            >
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? 'Đang lưu…' : 'Lưu cấu hình'}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
