import React, { useMemo, useState } from 'react';
import { X, AlertTriangle, Send } from 'lucide-react';
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
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const candidateEntries = useMemo(
    () => (conflict ? conflictSources(conflict, sources) : []),
    [conflict, sources],
  );

  if (!isOpen) return null;

  const act = async (action: () => Promise<void>) => {
    setPending(true);
    setError('');
    try {
      await action();
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } }; message?: string };
      setError(err.response?.data?.message || err.message || 'Thao tác thất bại.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="bg-[#161b22] border border-gray-700 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-auto">
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2">
            <AlertTriangle size={18} />
            Xử lý xung đột ({remainingCount})
          </h3>
          <button disabled={pending} onClick={onClose} aria-label="Đóng">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          {error && (
            <p role="alert" className="text-red-300 text-sm">
              {error}
            </p>
          )}
          {!conflict ? (
            <p className="text-sm text-gray-400">Không có xung đột đang mở trong luồng này.</p>
          ) : (
            <>
              <p className="text-sm">
                Bản ghi <strong>{conflict.recordId}</strong> · Cột{' '}
                <strong>{conflict.columnName}</strong>
              </p>

              {candidateEntries.length > 0 ? (
                <>
                  <div className="p-3 rounded border border-gray-700 text-sm">
                    <p className="text-xs text-gray-400 mb-1">Bản gốc trước khi thay đổi</p>
                    <pre className="whitespace-pre-wrap break-words">
                      {conflict.baseValue === '' ? '(trống)' : (conflict.baseValue ?? '(chưa có)')}
                    </pre>
                  </div>
                  <p className="text-xs text-gray-400">
                    Chọn một nguồn bên dưới. Giá trị được chọn sẽ đồng bộ tới tất cả trang tính
                    trong luồng.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {candidateEntries.map((candidate) => (
                      <div
                        key={candidate.key}
                        className="p-4 rounded-xl border border-gray-700 bg-gray-900/40 flex flex-col gap-3 min-w-0"
                      >
                        <p className="text-xs font-semibold text-emerald-300">
                          {candidate.legacyLabel ? 'Lựa chọn' : 'Nguồn'} {candidate.number}
                        </p>
                        {!candidate.legacyLabel && (
                          <dl className="text-xs space-y-2">
                            <div>
                              <dt className="text-gray-500">File</dt>
                              <dd className="text-gray-100 break-words">
                                {candidate.spreadsheetTitle || 'Chưa có tên file'}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-gray-500">Trang tính</dt>
                              <dd className="text-gray-100 break-words">{candidate.sheetName}</dd>
                            </div>
                          </dl>
                        )}
                        <div className="rounded-lg bg-black/20 p-3 flex-1">
                          <p className="text-[10px] text-gray-500 mb-1">Giá trị đang có</p>
                          <pre className="text-lg font-semibold whitespace-pre-wrap break-words">
                            {candidate.value === '' ? '(trống)' : candidate.value}
                          </pre>
                        </div>
                        <button
                          disabled={pending}
                          onClick={() => void act(() => onResolve(candidate.value, conflict))}
                          className="bg-blue-600 hover:bg-blue-500 px-3 py-2.5 rounded-lg text-sm disabled:opacity-40"
                        >
                          {candidate.legacyLabel
                            ? `Giữ lựa chọn ${candidate.number}`
                            : `Giữ giá trị từ Nguồn ${candidate.number}`}
                        </button>
                        <details className="text-[10px] text-gray-500">
                          <summary className="cursor-pointer">Chi tiết nguồn</summary>
                          <p className="break-all mt-1">
                            {candidate.legacyLabel || `ID file: ${candidate.spreadsheetId}`}
                          </p>
                        </details>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    {[
                      ['Snapshot', conflict.baseValue],
                      ['Google Sheet', conflict.valueA],
                      ['Vault', conflict.valueB],
                    ].map(([label, value]) => (
                      <div key={label} className="p-3 rounded border border-gray-700">
                        <p className="text-xs text-gray-400 mb-2">{label}</p>
                        <pre className="whitespace-pre-wrap break-words">
                          {value === '' ? '(trống)' : (value ?? '(không có giá trị)')}
                        </pre>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400">
                    Giá trị được chọn sẽ ghi vào Google Sheet, Vault và snapshot. Nếu dữ liệu đã
                    đổi, hệ thống yêu cầu chạy lại đồng bộ.
                  </p>
                  <div className="flex gap-3">
                    <button
                      disabled={pending || conflict.valueA === undefined}
                      onClick={() => void act(() => onResolve(conflict.valueA!, conflict))}
                      className="bg-blue-600 px-4 py-2 rounded text-sm disabled:opacity-40"
                    >
                      Giữ Google Sheet
                    </button>
                    <button
                      disabled={pending || conflict.valueB === undefined}
                      onClick={() => void act(() => onResolve(conflict.valueB!, conflict))}
                      className="bg-purple-600 px-4 py-2 rounded text-sm disabled:opacity-40"
                    >
                      Giữ Vault
                    </button>
                  </div>
                </>
              )}

              <button
                disabled={pending}
                onClick={() => void act(() => onSendTelegramTest(conflict.id))}
                className="flex gap-2 items-center text-sky-400 text-xs disabled:opacity-40"
              >
                <Send size={14} />
                Gửi lại cảnh báo Telegram
              </button>
              {pending && (
                <p role="status" className="text-xs text-gray-400">
                  Đang chờ kết quả máy chủ...
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
