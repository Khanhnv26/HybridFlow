import { useEffect, useState } from 'react';
import { X, RefreshCw, Plus, Trash2, Shield } from 'lucide-react';
import { ExcelIcon, TelegramIcon } from '../icons/BrandIcons';
import { workspaceConnectionService } from '../../services/api';
import { errorMessage } from '../../services/errors';
import type { WorkspaceConnectionResponse, WorkspaceRole } from '../../types';

interface WorkspaceConnectionsModalProps {
  workspaceId: string;
  userRole?: WorkspaceRole;
  onClose: () => void;
  onConnectionsChanged?: () => void;
}

export function WorkspaceConnectionsModal({
  workspaceId,
  userRole,
  onClose,
  onConnectionsChanged,
}: WorkspaceConnectionsModalProps) {
  const [connections, setConnections] = useState<WorkspaceConnectionResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [googleName, setGoogleName] = useState('Google Sheets');
  const [telegramName, setTelegramName] = useState('');
  const [telegramToken, setTelegramToken] = useState('');

  const isOwner = userRole === 'OWNER';
  const isManager = userRole === 'OWNER' || userRole === 'ADMIN';

  async function loadConnections(signal?: AbortSignal) {
    setLoading(true);
    setError('');
    try {
      const items = await workspaceConnectionService.list(workspaceId, signal);
      if (!signal?.aborted) {
        setConnections(items);
      }
    } catch (err) {
      if (!signal?.aborted) {
        setError(errorMessage(err));
      }
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void loadConnections(controller.signal);
    return () => controller.abort();
  }, [workspaceId]);

  async function handleAddGoogle() {
    if (busy || !googleName.trim()) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const { url } = await workspaceConnectionService.startGoogleOAuth(
        workspaceId,
        googleName.trim()
      );
      const popup = window.open(
        url,
        'google_connection_oauth',
        'width=600,height=700,menubar=no,toolbar=no'
      );
      if (!popup) {
        window.location.href = url;
      } else {
        const timer = setInterval(() => {
          if (popup.closed) {
            clearInterval(timer);
            void loadConnections().then(() => onConnectionsChanged?.());
          }
        }, 1000);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleAddTelegram() {
    if (busy || !telegramName.trim() || !telegramToken.trim()) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await workspaceConnectionService.createTelegram(
        workspaceId,
        telegramName.trim(),
        telegramToken.trim()
      );
      setTelegramName('');
      setTelegramToken('');
      setSuccess('Đã thêm kết nối Telegram thành công.');
      await loadConnections();
      onConnectionsChanged?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleGrantEditor(connectionId: string) {
    if (busy || !isOwner) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await workspaceConnectionService.grantRole(workspaceId, connectionId, 'EDITOR');
      setSuccess('Đã cấp quyền dùng kết nối cho Editor.');
      await loadConnections();
      onConnectionsChanged?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(connectionId: string) {
    if (busy || !isManager) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await workspaceConnectionService.revoke(workspaceId, connectionId);
      setSuccess('Đã thu hồi kết nối.');
      await loadConnections();
      onConnectionsChanged?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(connectionId: string) {
    if (busy || !isManager) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await workspaceConnectionService.delete(workspaceId, connectionId);
      setSuccess('Đã xóa kết nối.');
      await loadConnections();
      onConnectionsChanged?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="connections-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
    >
      <div className="bg-[#171b24] border border-gray-700 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden text-gray-100">
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          <div>
            <h3 id="connections-modal-title" className="font-semibold text-base flex items-center gap-2">
              <Shield size={20} className="text-blue-400" />
              Quản lý kết nối Workspace
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Kết nối Google Sheets và Telegram được lưu trữ và chia sẻ an toàn theo phân quyền
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            aria-label="Đóng"
            className="text-gray-400 hover:text-white disabled:opacity-40"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-6 text-sm flex-1">
          {error && (
            <div role="alert" className="p-3 bg-red-950/60 border border-red-800 text-red-200 text-xs rounded-lg flex items-center justify-between">
              <span>{error}</span>
              <button
                type="button"
                onClick={() => setError('')}
                className="text-red-400 hover:text-white"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {success && (
            <div role="status" className="p-3 bg-emerald-950/60 border border-emerald-800 text-emerald-200 text-xs rounded-lg flex items-center justify-between">
              <span>{success}</span>
              <button
                type="button"
                onClick={() => setSuccess('')}
                className="text-emerald-400 hover:text-white"
              >
                <X size={14} />
              </button>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Danh sách kết nối hiện có ({connections.length})
              </h4>
              <button
                type="button"
                disabled={loading || busy}
                onClick={() => void loadConnections()}
                className="text-xs text-gray-400 hover:text-white flex items-center gap-1"
              >
                <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                Làm mới
              </button>
            </div>

            {loading && connections.length === 0 ? (
              <p className="text-xs text-gray-500 py-4 text-center">Đang tải danh sách kết nối…</p>
            ) : connections.length === 0 ? (
              <p className="text-xs text-gray-500 py-4 text-center bg-[#11141c] rounded-lg border border-gray-800">
                Chưa có kết nối nào trong workspace này.
              </p>
            ) : (
              <div className="space-y-2">
                {connections.map((conn) => (
                  <div
                    key={conn.id}
                    className="p-3 rounded-lg bg-[#11141c] border border-gray-800 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 rounded-lg bg-gray-800/80 shrink-0">
                        {conn.provider === 'GOOGLE' ? (
                          <ExcelIcon size={20} />
                        ) : (
                          <TelegramIcon size={20} />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-gray-200 truncate">{conn.name}</span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                              conn.state === 'ACTIVE'
                                ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60'
                                : 'bg-red-950/80 text-red-400 border border-red-800/60'
                            }`}
                          >
                            {conn.state}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 truncate mt-0.5">
                          ID: {conn.id} · Đang dùng trong {conn.usageCount} workflow
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isOwner && conn.state === 'ACTIVE' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleGrantEditor(conn.id)}
                          className="px-2.5 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-blue-300 font-medium transition"
                          title="Cho phép Editor trong workspace sử dụng kết nối này"
                        >
                          Cấp Editor
                        </button>
                      )}

                      {isManager && conn.state === 'ACTIVE' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleRevoke(conn.id)}
                          className="px-2.5 py-1 text-xs rounded bg-amber-950/50 hover:bg-amber-900/60 text-amber-300 border border-amber-800/50 transition"
                        >
                          Thu hồi
                        </button>
                      )}

                      {isManager && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleDelete(conn.id)}
                          className="p-1.5 text-gray-400 hover:text-red-400 rounded hover:bg-red-950/30 transition"
                          title="Xóa kết nối"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {isManager && (
            <div className="pt-4 border-t border-gray-800 space-y-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Thêm kết nối mới
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3 rounded-lg bg-[#11141c] border border-gray-800 space-y-3">
                  <div className="flex items-center gap-2">
                    <ExcelIcon size={20} />
                    <span className="font-medium text-xs text-gray-200">Google Sheets OAuth</span>
                  </div>
                  <input
                    type="text"
                    disabled={busy}
                    placeholder="Tên kết nối (vd: Kho Hàng Google)"
                    value={googleName}
                    onChange={(e) => setGoogleName(e.target.value)}
                    className="w-full p-2 rounded bg-[#0b0e14] border border-gray-700 text-xs text-gray-200 outline-none"
                  />
                  <button
                    type="button"
                    disabled={busy || !googleName.trim()}
                    onClick={() => void handleAddGoogle()}
                    className="w-full py-2 px-3 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition"
                  >
                    <Plus size={14} />
                    Kết nối Google Account
                  </button>
                </div>

                <div className="p-3 rounded-lg bg-[#11141c] border border-gray-800 space-y-3">
                  <div className="flex items-center gap-2">
                    <TelegramIcon size={20} />
                    <span className="font-medium text-xs text-gray-200">Telegram Bot</span>
                  </div>
                  <input
                    type="text"
                    disabled={busy}
                    placeholder="Tên bot (vd: Cảnh Báo Kho)"
                    value={telegramName}
                    onChange={(e) => setTelegramName(e.target.value)}
                    className="w-full p-2 rounded bg-[#0b0e14] border border-gray-700 text-xs text-gray-200 outline-none"
                  />
                  <input
                    type="password"
                    disabled={busy}
                    placeholder="Bot Token (vd: 123456:ABC-DEF...)"
                    value={telegramToken}
                    onChange={(e) => setTelegramToken(e.target.value)}
                    className="w-full p-2 rounded bg-[#0b0e14] border border-gray-700 text-xs text-gray-200 outline-none"
                  />
                  <button
                    type="button"
                    disabled={busy || !telegramName.trim() || !telegramToken.trim()}
                    onClick={() => void handleAddTelegram()}
                    className="w-full py-2 px-3 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition"
                  >
                    <Plus size={14} />
                    Thêm Bot Telegram
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-700 flex justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs font-medium text-gray-200 transition"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
