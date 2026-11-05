import { useExitMotion } from '../../hooks/useExitMotion';
import { errorMessage } from '../../services/errors';
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
  const motionRef = useExitMotion(true);
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

  const close = () => { if (!saving && !connecting) { request.current?.abort(); onClose(); } };
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving && !connecting) { request.current?.abort(); onClose(); }
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [saving, connecting, onClose]);
  const examples: Record<TransformRule, string> = {
    TRIM: '“  Hà   Nội  ” → “Hà Nội”', UPPERCASE: '“đã giao” → “ĐÃ GIAO”',
    LOWERCASE: '“ĐÃ GIAO” → “đã giao”', CAPITALIZE: '“hÀ nỘi” → “Hà Nội”',
    PHONE_VN: '“0912 345 678” → “+84912345678”', DEFAULT_IF_EMPTY: 'Ô trống → giá trị bạn chọn',
  };
  const displayValue = (value: string | null | undefined) => value == null || value === '' ? 'Ô trống' : value;


  return (
    <div
      ref={motionRef} className="hf-motion-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={close}
    >
      <section
        role="dialog"
        aria-modal="false"
        aria-labelledby="transform-title"
        className="flex  w-full hf-modal hf-modal--complex flex-col overflow-hidden rounded-2xl border border-line bg-surface text-primary shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        {/* Modal Header */}
        <header className="hf-modal-header flex shrink-0 items-center justify-between border-b border-line p-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="rounded-xl border border-purple-800/60 bg-violet-soft p-2.5 text-violet">
              <Wand2 size={20} />
            </span>
            <div className="min-w-0">
              <h2 id="transform-title" className="text-base font-semibold">Chuẩn hóa dữ liệu</h2>
              <p className="mt-1 truncate text-sm text-secondary">
                Làm sạch dữ liệu trước khi so sánh và đồng bộ.
              </p>
            </div>
          </div>
          <button
            aria-label="Đóng"
            disabled={saving || connecting}
            onClick={close}
            className="rounded p-2 text-secondary hover:bg-elevated hover:text-primary disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </header>

        {/* 2-Column Split: Master-Detail matching SheetSourceConfig */}
        <div className="hf-modal-body">
          
          {/* Left Panel: Configuration */}
          <div className="min-w-0 space-y-4 p-4 text-sm">
            {hasSource && !connected && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-warning-soft p-3 text-sm text-warning">
                <span>Kết nối Google để kiểm tra cột và xem trước dữ liệu thật.</span>
                <button
                  disabled={busy}
                  className="rounded bg-amber-700 px-3 py-1.5 text-sm font-medium text-on-accent hover:bg-amber-600 disabled:opacity-40"
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
              <p role="alert" className="rounded-lg border border-red-800/50 bg-danger-soft p-3 text-sm text-danger">
                {error}
              </p>
            )}

            {missing.length > 0 && (
              <div role="alert" className="rounded-lg border border-amber-800/50 bg-warning-soft p-3 text-sm text-warning">
                <p className="font-medium">Cột không còn trong Sheet. Bỏ quy tắc hoặc bổ sung cột trước khi lưu:</p>
                <ul className="mt-1 list-inside list-disc">
                  {missing.map(item => (
                    <li key={`${item.name}:${item.column}`}>{item.name} → {item.column}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Chọn cột */}
            <div className="min-w-0 space-y-4 rounded-xl border border-line bg-canvas p-4">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <span className="text-sm font-semibold text-secondary">
                  1. Chọn cột cần làm sạch ({columns.length})
                </span>
                <span className="text-xs text-secondary">
                  {active.length} cột có quy tắc
                </span>
              </div>

              <p className="text-sm leading-relaxed text-secondary">Quy tắc áp dụng chung cho {inputs.length} Sheet. Chọn từng cột để chỉnh cách làm sạch.</p>
              {!columns.length ? (
                <p className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-muted">
                  {reading ? 'Đang lấy danh sách cột…' : 'Đọc Sheet để lấy danh sách cột.'}
                </p>
              ) : (
                <>
                  {columns.length > 5 && (
                    <label className="hf-search-field flex items-center gap-2 rounded-lg border border-line bg-canvas px-2.5 py-2 text-muted">
                      <Search size={16} className="shrink-0" aria-hidden="true" />
                      <input
                        type="search"
                        aria-label="Tìm tên cột"
                        value={colSearchQuery}
                        onChange={(e) => setColSearchQuery(e.target.value)}
                        placeholder="Tìm tên cột..."
                        className="text-sm text-primary placeholder:text-muted"
                      />
                    </label>
                  )}
                  <div className="grid max-h-64 grid-cols-2 gap-3 overflow-y-auto p-1 sm:grid-cols-3">
                    {filteredColumns.map(column => {
                      const config = configs.find(item => item.columnName === column);
                      const count = config?.rules?.length || 0;
                      const isSelected = activeCol === column;
                      return (
                        <button
                          key={column}
                          type="button"
                          title={column}
                          aria-pressed={isSelected}
                          onClick={() => setSelectedColumn(column)}
                          className={`flex min-h-[60px] min-w-0 flex-col items-start justify-center gap-1.5 rounded-lg border px-3 py-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 ${
                            isSelected
                              ? 'border-purple-400 bg-violet-soft text-primary shadow-sm'
                              : count > 0
                              ? 'border-purple-800 bg-violet-soft text-violet hover:border-purple-600'
                              : 'border-line bg-canvas text-secondary hover:border-line hover:text-primary'
                          }`}
                        >
                          <span className="w-full truncate font-mono font-medium">{column}</span>
                          {(
                            <span
                              className={`text-xs leading-none ${
                                isSelected ? 'text-violet' : 'text-violet'
                              }`}
                            >
                              {count > 0 ? `${count} quy tắc` : 'Chưa có quy tắc'}
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
                  className={`rounded-xl border border-line bg-canvas p-3 space-y-3 ${isCurrent ? 'block' : 'hidden'}`}
                >
                  <legend className="sr-only">{column}</legend>
                  <div className="flex items-center justify-between border-b border-line pb-2">
                    <span className="text-sm font-semibold text-violet">
                      2. Chọn cách làm sạch cho cột: <span className="font-mono text-primary">{column}</span>
                    </span>
                    <span className="text-sm text-muted">
                      {config.rules.length} quy tắc
                    </span>
                  </div>

                  <p className="text-secondary">Chọn một hoặc nhiều quy tắc. Các kiểu viết hoa và viết thường sẽ thay thế nhau.</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {transformRules.map(([rule, label]) => (
                      <label key={rule} className="flex items-start gap-3 rounded-lg border border-line p-3 text-sm text-secondary cursor-pointer">
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 shrink-0 accent-purple-500"
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
                        <span><span className="block font-medium">{label}</span><span className="mt-1 block text-sm text-secondary">{examples[rule]}</span></span>
                      </label>
                    ))}
                  </div>

                  {config.rules.length > 0 && (
                    <details className="rounded-lg border border-line p-3 space-y-2">
                      <summary className="cursor-pointer text-secondary">Nâng cao: thứ tự áp dụng quy tắc</summary>
                      <p className="text-secondary">Áp dụng từ trên xuống. Đổi thứ tự có thể làm kết quả khác đi.</p>
                      <ol className="space-y-1">
                        {config.rules.map((rule, index) => (
                          <li
                            key={`${rule}:${index}`}
                            className="flex items-center justify-between gap-2 rounded border border-line bg-surface p-1.5 text-sm"
                          >
                            <span className="font-mono text-secondary text-sm">
                              {index + 1}. {ruleLabel(rule)}
                            </span>
                            <span className="flex gap-1">
                              <button
                                type="button"
                                aria-label={`Đưa ${ruleLabel(rule)} lên trong ${column}`}
                                disabled={busy || index === 0}
                                onClick={() => moveRule(config, index, -1)}
                                className="rounded p-2 text-secondary hover:bg-elevated hover:text-primary disabled:opacity-25"
                              >
                                <ArrowUp size={18} />
                              </button>
                              <button
                                type="button"
                                aria-label={`Đưa ${ruleLabel(rule)} xuống trong ${column}`}
                                disabled={busy || index === config.rules.length - 1}
                                onClick={() => moveRule(config, index, 1)}
                                className="rounded p-1 text-secondary hover:bg-elevated hover:text-primary disabled:opacity-25"
                              >
                                <ArrowDown size={18} />
                              </button>
                            </span>
                          </li>
                        ))}
                      </ol>
                    </details>
                  )}

                  {config.rules.includes('PHONE_VN') && <p className="text-secondary">Số điện thoại không nhận diện được sẽ giữ nguyên.</p>}
                  {config.rules.includes('DEFAULT_IF_EMPTY') && (
                    <label className="block space-y-1 border-t border-line pt-2 text-sm text-secondary">
                      <span>Giá trị mặc định (khi ô trống)</span>
                      <input
                        aria-label={`Giá trị mặc định cho ${column}`}
                        className="w-full rounded border border-line bg-surface p-2 text-sm text-primary outline-none focus:border-purple-500"
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
          <div className="min-w-0 space-y-4 border-t border-line p-4 text-sm">
            <details className="space-y-3 min-w-0">
              <summary className="cursor-pointer font-semibold text-primary">3. Xem kết quả mẫu</summary>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="sr-only">Kết quả mẫu</h4>
                  <p className="mt-0.5 text-sm text-muted">Tối đa 3 dòng của cột {activeCol || 'đang chọn'}. Xem trước không ghi dữ liệu.</p>
                </div>
                {inputs.length > 0 && (
                  <select
                    aria-label="Sheet xem trước"
                    value={selectedId}
                    onChange={event => setSelectedId(event.target.value)}
                    className="rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-sm text-primary outline-none focus:border-purple-500 max-w-full"
                  >
                    {inputs.map(input => (
                      <option key={input.nodeId} value={input.nodeId}>{input.name}</option>
                    ))}
                  </select>
                )}
              </div>

                <button
                  disabled={busy || !hasSource || !connected}
                  onClick={() => void read()}
                  className="flex items-center gap-1.5 text-sm text-secondary hover:text-primary disabled:opacity-40"
                >
                  <RefreshCw size={12} className={reading ? 'animate-spin' : ''} />
                  {reading ? 'Đang đọc Sheet…' : 'Đọc lại dữ liệu mẫu'}
                </button>
              {!preview || !preview.rows.length || !activeCol ? (
                <div className="rounded-xl border border-line bg-canvas p-6 text-center text-sm text-muted">
                  {reading
                    ? 'Đang đọc dữ liệu mẫu…'
                    : !preview
                    ? 'Đọc Sheet để xem trước.'
                    : !preview.rows.length
                    ? 'Sheet chưa có dòng dữ liệu.'
                    : 'Chọn cột để xem kết quả.'}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-line bg-canvas">
                  <table className="w-full table-fixed text-left">
                    <thead className="sticky top-0 z-10 border-b border-line bg-elevated text-secondary">
                      <tr>
                        <th className="p-2.5 text-center text-muted w-14 font-medium">Dòng</th>
                        <th className="p-2.5 font-medium w-[34%]">Trước</th>
                        <th className="p-2.5 font-medium w-[34%]">Sau</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800 font-mono">
                      {preview.rows.slice(0, 3).flatMap((row, index) =>
                        [configs.find(config => config.columnName === activeCol) || { columnName: activeCol, rules: [] }].map(config => {
                          const before = row[config.columnName] ?? null;
                          const after = transformValue(before, config);
                          const changed = before !== after;
                          const isSelected = config.columnName === activeCol;
                          return (
                            <tr
                              key={`${index}:${config.columnName}`}
                              className={`hover:bg-surface transition ${isSelected ? 'bg-violet-soft' : ''}`}
                            >
                              <td className="p-2.5 text-center text-muted font-sans text-sm">{index + 2}</td>
                              <td className="p-3 text-secondary whitespace-pre-wrap break-words" title={String(before)}>
                                <span>{displayValue(before)}</span>
                              </td>
                              <td className={`p-3 whitespace-pre-wrap break-words ${changed ? 'font-medium text-success' : 'text-secondary'}`} title={String(after)}>
                                <div className="space-y-1">
                                  <span className="block">{displayValue(after)}</span>
                                  <span className="flex items-center gap-1 text-xs">{changed && <Check size={14} />}{changed ? 'Có thay đổi' : 'Giữ nguyên'}</span>
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
            </details>

            <section className="space-y-3 rounded-xl border border-line bg-canvas p-4">
              <h3 className="font-semibold text-primary">Ghi dữ liệu đã làm sạch về Sheet gốc?</h3>
              <p className="text-secondary">Chỉ ghi khi chạy đồng bộ. Lưu cấu hình chưa ghi dữ liệu. Nếu tắt, dữ liệu vẫn được làm sạch để so sánh và chuyển sang bước tiếp theo.</p>
              {inputs.map(input => <label key={input.nodeId} className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3">
                <input type="checkbox" aria-label={`Ghi dữ liệu đã làm sạch về ${input.name}`} disabled={busy}
                  className="mt-1 h-4 w-4 shrink-0 accent-purple-500" checked={writeBackBySource[input.nodeId] ?? writeBack}
                  onChange={event => {
                    setWriteBackBySource(current => ({ ...current, [input.nodeId]: event.target.checked }));
                    if (inputs.length === 1) setWriteBack(event.target.checked);
                  }} />
                <span><span className="block font-medium text-primary">{input.name}</span><span className="mt-1 block text-secondary">Ghi dữ liệu đã làm sạch về Sheet này</span></span>
              </label>)}
              {Object.entries(readErrors).map(([id, detail]) => <p key={id} role="alert" className="text-danger">{inputs.find(input => input.nodeId === id)?.name}: {detail}</p>)}
            </section>

            {unverified && !reading && (
              <p role="status" className="text-sm text-warning">
                Đọc đủ các Sheet để kiểm tra cột trước khi lưu quy tắc.
              </p>
            )}
          </div>

        </div>

        <p className="shrink-0 border-t border-line px-5 py-2 text-xs text-secondary">Đổi quy tắc hoặc cách ghi về Sheet có thể yêu cầu xác nhận khởi tạo lại luồng ở lần chạy tiếp theo.</p>
        {/* Modal Footer */}
        <footer className="hf-modal-footer flex shrink-0 items-center justify-between border-t border-line bg-surface px-5 py-3">
          <p className="hidden text-sm text-muted sm:block">
            Lưu cấu hình chưa ghi dữ liệu.
          </p>
          <div className="ml-auto flex gap-3">
            <button
              disabled={saving || connecting}
              onClick={close}
              className="px-3 py-2 text-sm text-secondary hover:text-primary disabled:opacity-40"
            >
              Hủy
            </button>
            <button
              disabled={busy || !hasSource || !!missing.length || !!unverified}
              onClick={() => void save()}
              className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-on-accent hover:bg-purple-500 disabled:opacity-40"
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
