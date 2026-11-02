import React, { useMemo, useState } from 'react';
import { X, AlertTriangle, Send } from 'lucide-react';
import type { SyncConflictDto } from '../../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  conflict: SyncConflictDto | null;
  remainingCount: number;
  onResolve: (value: string, conflict: SyncConflictDto) => Promise<void>;
  onSendTelegramTest: (conflictId: number) => Promise<void>;
}

export const ConflictModal: React.FC<Props> = ({
  isOpen,
  onClose,
  conflict,
  remainingCount,
  onResolve,
  onSendTelegramTest,
}) => {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const candidateEntries = useMemo(() => {
    if (!conflict?.candidatesJson) return null;
    try {
      const parsed = JSON.parse(conflict.candidatesJson) as { [label: string]: string };
      const entries = Object.entries(parsed);
      return entries.length > 0 ? entries : null;
    } catch {
      return null;
    }
  }, [conflict?.candidatesJson]);

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
      <div className="bg-[#161b22] border border-gray-700 rounded-2xl w-full max-w-2xl">
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

              {candidateEntries ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                    <div className="p-3 rounded border border-gray-700">
                      <p className="text-xs text-gray-400 mb-2">Snapshot (Bản gốc)</p>
                      <pre className="whitespace-pre-wrap break-words">
                        {conflict.baseValue === ''
                          ? '(trống)'
                          : (conflict.baseValue ?? '(chưa có)')}
                      </pre>
                    </div>
                    {candidateEntries.map(([sheetLabel, val]) => (
                      <div key={sheetLabel} className="p-3 rounded border border-gray-700">
                        <p className="text-xs text-emerald-400 mb-2 break-words">{sheetLabel}</p>
                        <pre className="whitespace-pre-wrap break-words">
                          {val === '' ? '(trống)' : (val ?? '(không có giá trị)')}
                        </pre>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400">
                    Giá trị bạn chọn sẽ được đồng bộ phủ xuống toàn bộ các bảng Google Sheet và lưu
                    vào Snapshot.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {candidateEntries.map(([sheetLabel, val], idx) => (
                      <button
                        key={sheetLabel}
                        disabled={pending}
                        onClick={() => void act(() => onResolve(val, conflict))}
                        className={`${
                          idx % 2 === 0 ? 'bg-blue-600' : 'bg-purple-600'
                        } px-4 py-2 rounded text-sm disabled:opacity-40`}
                      >
                        Giữ theo {sheetLabel} ({val})
                      </button>
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
