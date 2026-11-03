import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { X, AlertTriangle, Check, RefreshCw } from 'lucide-react';
import { TelegramIcon } from '../icons/BrandIcons';
import { conflictSources } from '../../services/conflictSources';
import type { SyncConflictDto, OrchestrationNodeData } from '../../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  conflict: SyncConflictDto | null;
  remainingCount: number;
  sources?: OrchestrationNodeData[];
  onResolve: (value: string, conflict: SyncConflictDto) => Promise<void>;
  onSendTelegramTest: (conflictId: number) => Promise<void>;
}

export const ConflictModal: React.FC<Props> = ({
  isOpen,
  onClose,
  conflict,
  remainingCount,
  sources = [],
  onResolve,
  onSendTelegramTest,
}) => {
  const titleId = useId();
  const radioGroup = useId();
  const busy = useRef(false);
  const [pending, setPending] = useState<'resolve' | 'telegram' | null>(null);
  const [error, setError] = useState('');
  const [selection, setSelection] = useState<{ context: string; key: string } | null>(null);
  const context = JSON.stringify([
    conflict?.id,
    conflict?.observationsJson,
    conflict?.candidatesJson,
    conflict?.valueA,
    conflict?.valueB,
  ]);
  const candidates = useMemo(
    () => (conflict ? conflictSources(conflict, sources) : []),
    [conflict, sources],
  );
  const choices = useMemo(() => {
    if (candidates.length)
      return candidates.map((candidate) => ({
        ...candidate,
        title: candidate.legacyLabel
          ? `Lựa chọn ${candidate.number}`
          : candidate.spreadsheetTitle || `Nguồn ${candidate.number}`,
        subtitle: candidate.legacyLabel
          ? 'Nguồn cũ · xem chi tiết'
          : `Nguồn ${candidate.number} · ${candidate.sheetName || 'Chưa có tên trang tính'}`,
      }));
    if (!conflict) return [];
    return [
      {
        key: 'source',
        number: 1,
        title: 'Google Sheet',
        subtitle: conflict.sheetName || 'Nguồn dữ liệu',
        value: conflict.valueA,
        legacyLabel: undefined,
        spreadsheetId: conflict.spreadsheetId,
      },
      {
        key: 'vault',
        number: 2,
        title: 'Kho lưu trữ',
        subtitle: 'Vault',
        value: conflict.valueB,
        legacyLabel: undefined,
        spreadsheetId: undefined,
      },
    ].filter(
      (choice): choice is typeof choice & { value: string } => typeof choice.value === 'string',
    );
  }, [candidates, conflict]);
  const selected =
    selection?.context === context
      ? choices.find((choice) => choice.key === selection.key)
      : undefined;
  const targets =
    candidates.length && candidates.every((candidate) => candidate.spreadsheetId)
      ? `${candidates.length} trang tính`
      : candidates.length
        ? 'tất cả trang tính trong luồng'
        : 'Google Sheet và kho lưu trữ';
  useEffect(() => {
    setSelection(null);
    setError('');
  }, [context, isOpen]);

  if (!isOpen) return null;
  const act = async (kind: 'resolve' | 'telegram', action: () => Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    setPending(kind);
    setError('');
    try {
      await action();
    } catch (error) {
      const detail = error as { response?: { data?: { message?: string } }; message?: string };
      setError(
        detail.response?.data?.message || detail.message || 'Thao tác thất bại. Vui lòng thử lại.',
      );
    } finally {
      busy.current = false;
      setPending(null);
    }
  };
  const displayValue = (value: string | undefined) =>
    value === '' ? '(trống)' : (value ?? '(chưa có)');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex  w-full hf-modal hf-modal--data flex-col overflow-hidden rounded-2xl border border-gray-700 bg-[#161b22] shadow-2xl"
      >
        <header className="hf-modal-header shrink-0 border-b border-gray-700 px-4 py-4 sm:px-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 id={titleId} className="flex items-center gap-2 font-semibold">
                <AlertTriangle size={18} className="text-amber-400" /> Chọn giá trị để đồng bộ
              </h3>
              <p className="mt-1 text-xs text-gray-400">{remainingCount} xung đột đang chờ xử lý</p>
            </div>
            <button
              disabled={!!pending}
              onClick={onClose}
              aria-label="Đóng"
              className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-white disabled:opacity-40"
            >
              <X size={18} />
            </button>
          </div>
          {conflict && (
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              <span className="min-w-0 break-words text-gray-400">
                Bản ghi <strong className="text-gray-100">{conflict.recordId}</strong>
              </span>
              <span className="min-w-0 break-words text-gray-400">
                Cột <strong className="text-gray-100">{conflict.columnName}</strong>
              </span>
              <span className="flex min-w-0 items-center gap-2 text-xs text-gray-400">
                Bản gốc{' '}
                <code className="max-h-16 max-w-[220px] overflow-auto whitespace-pre-wrap break-words rounded bg-gray-800 px-2 py-1 text-gray-200">
                  {displayValue(conflict.baseValue)}
                </code>
              </span>
            </div>
          )}
        </header>

        <div className="hf-modal-body min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-4">
          {!conflict ? (
            <p className="text-sm text-gray-400">Không có xung đột đang mở trong luồng này.</p>
          ) : (
            <>
              <p className="mb-3 text-xs text-gray-400">
                So sánh các nguồn rồi chọn một giá trị. Dữ liệu chỉ được ghi khi bạn bấm Áp dụng.
              </p>
              <div role="radiogroup" aria-label="Chọn nguồn giữ lại" className="space-y-2">
                {choices.map((choice, index) => {
                  const chosen = selected?.key === choice.key;
                  const inputId = `${radioGroup}-${index}`;
                  return (
                    <div
                      key={choice.key}
                      className={`grid grid-cols-[minmax(0,1fr)_24px] items-center gap-x-4 gap-y-2 rounded-xl border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(120px,0.65fr)_24px] sm:px-4 ${chosen ? 'border-blue-500 bg-blue-950/30 ring-1 ring-blue-500/30' : 'border-gray-700 bg-gray-900/30'}`}
                    >
                      <div className="min-w-0">
                        <label
                          htmlFor={inputId}
                          className="block cursor-pointer break-words text-sm font-semibold text-gray-100"
                        >
                          {choice.title}
                        </label>
                        <p className="mt-1 break-words text-xs text-gray-400">{choice.subtitle}</p>
                        {(choice.legacyLabel || choice.spreadsheetId) && (
                          <details className="mt-1.5 text-[10px] text-gray-500">
                            <summary className="w-fit cursor-pointer hover:text-gray-300">
                              Chi tiết nguồn
                            </summary>
                            <p className="mt-1 break-all">
                              {choice.legacyLabel || `ID file: ${choice.spreadsheetId}`}
                            </p>
                          </details>
                        )}
                      </div>
                      <label
                        htmlFor={inputId}
                        className="col-start-1 row-start-2 min-w-0 cursor-pointer sm:col-start-auto sm:row-start-auto"
                      >
                        <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-words text-base font-semibold tabular-nums text-gray-100">
                          {displayValue(choice.value)}
                        </pre>
                        <span
                          className={`mt-1 inline-block text-[10px] ${choice.value === conflict.baseValue ? 'text-gray-500' : 'text-amber-300'}`}
                        >
                          {choice.value === conflict.baseValue ? 'Giống bản gốc' : 'Đã thay đổi'}
                        </span>
                      </label>
                      <input
                        id={inputId}
                        type="radio"
                        name={radioGroup}
                        checked={chosen}
                        disabled={!!pending}
                        aria-label={`Chọn ${choice.title} · ${choice.subtitle}`}
                        onChange={() => {
                          setSelection({ context, key: choice.key });
                          setError('');
                        }}
                        className="col-start-2 row-start-1 h-4 w-4 cursor-pointer accent-blue-500 disabled:cursor-wait sm:col-start-3"
                      />
                    </div>
                  );
                })}
              </div>
              {choices.length === 0 && (
                <p className="text-sm text-amber-300">
                  Xung đột thiếu giá trị nguồn. Đóng và chạy lại đồng bộ để cập nhật.
                </p>
              )}
              <details className="mt-4 text-xs text-gray-500">
                <summary className="w-fit cursor-pointer hover:text-gray-300">
                  Thao tác khác
                </summary>
                <button
                  disabled={!!pending}
                  onClick={() => void act('telegram', () => onSendTelegramTest(conflict.id))}
                  className="mt-3 flex items-center gap-2 text-sky-300 disabled:opacity-40"
                >
                  <TelegramIcon size={16} />{' '}
                  {pending === 'telegram' ? 'Đang gửi...' : 'Gửi lại cảnh báo Telegram'}
                </button>
              </details>
            </>
          )}
        </div>

        <footer className="hf-modal-footer shrink-0 space-y-3 border-t border-gray-700 bg-[#131820] px-4 py-4 sm:px-4">
          {error && (
            <p
              role="alert"
              className="break-words rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-2 text-xs text-red-300"
            >
              {error}
            </p>
          )}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 text-xs">
              {selected ? (
                <>
                  <p className="flex items-center gap-1.5 text-blue-300">
                    <Check size={14} /> Đã chọn {selected.title}
                  </p>
                  <p className="mt-1 text-gray-400">
                    Áp dụng cho {targets}:{' '}
                    <strong className="break-words text-gray-100">
                      {selected.value.length > 100
                        ? `${selected.value.slice(0, 100)}…`
                        : displayValue(selected.value)}
                    </strong>
                  </p>
                </>
              ) : (
                <p className="text-gray-400">Chọn một nguồn ở trên để tiếp tục.</p>
              )}
              {pending && (
                <p role="status" className="mt-1 text-gray-400">
                  {pending === 'resolve'
                    ? 'Đang cập nhật dữ liệu. Vui lòng chờ...'
                    : 'Đang gửi cảnh báo Telegram...'}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                disabled={!!pending}
                onClick={onClose}
                className="rounded-lg border border-gray-700 px-3 py-2.5 text-xs text-gray-300 hover:bg-gray-800 disabled:opacity-40"
              >
                Để sau
              </button>
              <button
                disabled={!!pending || !selected || !conflict}
                onClick={() => {
                  if (selected && conflict)
                    void act('resolve', () => onResolve(selected.value, conflict));
                }}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
              >
                {pending === 'resolve' && <RefreshCw size={14} className="animate-spin" />}{' '}
                {pending === 'resolve' ? 'Đang áp dụng...' : 'Áp dụng giá trị đã chọn'}
              </button>
            </div>
          </div>
        </footer>
      </section>
    </div>
  );
};
