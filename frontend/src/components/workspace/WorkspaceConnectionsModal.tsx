import { useEffect, useRef, useState } from 'react';
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
  const googlePopup = useRef<Window | null>(null);
  const callbackOrigin = useRef('');
  const closeTimer = useRef<ReturnType<typeof setInterval>>();
  const activeWorkspace = useRef(workspaceId);
  activeWorkspace.current = workspaceId;
  const changed = useRef(onConnectionsChanged);
  changed.current = onConnectionsChanged;

  const isOwner = userRole === 'OWNER';
  const isManager = userRole === 'OWNER' || userRole === 'ADMIN';

  async function loadConnections(signal?: AbortSignal) {
    setLoading(true);
    setError('');
    try {
      const items = await workspaceConnectionService.list(workspaceId, signal);
      if (!signal?.aborted && activeWorkspace.current === workspaceId) {
        setConnections(items);
      }
    } catch (err) {
      if (!signal?.aborted && activeWorkspace.current === workspaceId) {
        setError(errorMessage(err));
      }
    } finally {
      if (!signal?.aborted && activeWorkspace.current === workspaceId) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    setTelegramToken('');
    void loadConnections(controller.signal);
    const browser = typeof window === 'undefined' ? null : window;
    const receive = (event: MessageEvent) => {
      if (event.origin !== callbackOrigin.current || event.source !== googlePopup.current || !googlePopup.current) return;
      if (event.data?.type !== 'WORKSPACE_GOOGLE_CONNECTED' && event.data?.type !== 'WORKSPACE_GOOGLE_ERROR') return;
      clearInterval(closeTimer.current);
      googlePopup.current.close();
      googlePopup.current = null;
      callbackOrigin.current = '';
      setBusy(false);
      if (event.data.type === 'WORKSPACE_GOOGLE_ERROR') {
        setError(errorMessage({ response: { data: event.data } }));
        return;
      }
      setSuccess('Đã thêm kết nối Google vào workspace.');
      void loadConnections().then(() => changed.current?.());
    };
    browser?.addEventListener('message', receive);
    return () => {
      controller.abort();
      browser?.removeEventListener('message', receive);
      clearInterval(closeTimer.current);
      googlePopup.current?.close();
      googlePopup.current = null;
      callbackOrigin.current = '';
    };
  }, [workspaceId]);

  async function handleAddGoogle() {
    if (busy || !googleName.trim()) return;
    setBusy(true);
    setError('');
    setSuccess('');
    const popup = window.open('about:blank', 'google_connection_oauth', 'width=600,height=700,menubar=no,toolbar=no');
    googlePopup.current = popup;
    try {
      const { url, callbackOrigin: origin } = await workspaceConnectionService.startGoogleOAuth(
        workspaceId,
        googleName.trim()
      );
      if (activeWorkspace.current !== workspaceId) return;
      callbackOrigin.current = new URL(origin).origin;
      if (!popup) {
        window.location.href = url;
        setBusy(false);
      } else {
        popup.location.href = url;
        const startedAt = Date.now();
        closeTimer.current = setInterval(() => {
          if (popup.closed || Date.now() - startedAt > 600000) {
            clearInterval(closeTimer.current);
            if (!popup.closed) popup.close();
            googlePopup.current = null;
            callbackOrigin.current = '';
            setBusy(false);
            void loadConnections().then(() => changed.current?.());
          }
        }, 1000);
      }
    } catch (err) {
      popup?.close();
      googlePopup.current = null;
      callbackOrigin.current = '';
      setError(errorMessage(err));
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
      <div className="bg-elevated border border-line rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden text-primary">
        <div className="p-4 border-b border-line flex items-center justify-between">
          <div>
            <h3 id="connections-modal-title" className="font-semibold text-base flex items-center gap-2">
              <Shield size={20} className="text-info" />
              Quản lý kết nối Workspace
            </h3>
            <p className="text-xs text-secondary mt-0.5">
              Kết nối Google Sheets và Telegram được lưu trữ và chia sẻ an toàn theo phân quyền
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            aria-label="Đóng"
            className="text-secondary hover:text-primary disabled:opacity-40"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-6 text-sm flex-1">
          {error && (
            <div role="alert" className="p-3 bg-danger-soft border border-red-800 text-danger text-xs rounded-lg flex items-center justify-between">
              <span>{error}</span>
              <button
                type="button"
                onClick={() => setError('')}
                className="text-danger hover:text-primary"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {success && (
            <div role="status" className="p-3 bg-success-soft border border-emerald-800 text-success text-xs rounded-lg flex items-center justify-between">
              <span>{success}</span>
              <button
                type="button"
                onClick={() => setSuccess('')}
                className="text-success hover:text-primary"
              >
                <X size={14} />
              </button>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-secondary">
                Danh sách kết nối hiện có ({connections.length})
              </h4>
              <button
                type="button"
                disabled={loading || busy}
                onClick={() => void loadConnections()}
                className="text-xs text-secondary hover:text-primary flex items-center gap-1"
              >
                <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                Làm mới
              </button>
            </div>

            {loading && connections.length === 0 ? (
              <p className="text-xs text-muted py-4 text-center">Đang tải danh sách kết nối…</p>
            ) : connections.length === 0 ? (
              <p className="text-xs text-muted py-4 text-center bg-surface rounded-lg border border-line">
                Chưa có kết nối nào trong workspace này.
              </p>
            ) : (
              <div className="space-y-2">
                {connections.map((conn) => (
                  <div
                    key={conn.id}
                    className="p-3 rounded-lg bg-surface border border-line flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 rounded-lg bg-elevated/80 shrink-0">
                        {conn.provider === 'GOOGLE' ? (
                          <ExcelIcon size={20} />
                        ) : (
                          <TelegramIcon size={20} />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-primary truncate">{conn.name}</span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded font-semibold ${
                              conn.state === 'ACTIVE'
                                ? 'bg-success-soft text-success border border-emerald-800/60'
                                : 'bg-danger-soft text-danger border border-red-800/60'
                            }`}
                          >
                            {conn.state}
                          </span>
                        </div>
                        <p className="text-xs text-muted truncate mt-0.5">
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
                          className="px-2.5 py-1 text-xs rounded bg-elevated hover:bg-subtle text-info font-medium transition"
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
                          className="px-2.5 py-1 text-xs rounded bg-warning-soft hover:bg-warning-soft text-warning border border-amber-800/50 transition"
                        >
                          Thu hồi
                        </button>
                      )}

                      {isManager && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleDelete(conn.id)}
                          className="p-1.5 text-secondary hover:text-danger rounded hover:bg-danger-soft transition"
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
            <div className="pt-4 border-t border-line space-y-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-secondary">
                Thêm kết nối mới
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3 rounded-lg bg-surface border border-line space-y-3">
                  <div className="flex items-center gap-2">
                    <ExcelIcon size={20} />
                    <span className="font-medium text-xs text-primary">Google Sheets OAuth</span>
                  </div>
                  <input
                    type="text"
                    disabled={busy}
                    placeholder="Tên kết nối (vd: Kho Hàng Google)"
                    value={googleName}
                    onChange={(e) => setGoogleName(e.target.value)}
                    className="w-full p-2 rounded bg-canvas border border-line text-xs text-primary outline-none"
                  />
                  <button
                    type="button"
                    disabled={busy || !googleName.trim()}
                    onClick={() => void handleAddGoogle()}
                    className="w-full py-2 px-3 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-on-accent font-medium text-xs flex items-center justify-center gap-1.5 transition"
                  >
                    <Plus size={14} />
                    Kết nối Google Account
                  </button>
                </div>

                <div className="p-3 rounded-lg bg-surface border border-line space-y-3">
                  <div className="flex items-center gap-2">
                    <TelegramIcon size={20} />
                    <span className="font-medium text-xs text-primary">Telegram Bot</span>
                  </div>
                  <input
                    type="text"
                    disabled={busy}
                    placeholder="Tên bot (vd: Cảnh Báo Kho)"
                    value={telegramName}
                    onChange={(e) => setTelegramName(e.target.value)}
                    className="w-full p-2 rounded bg-canvas border border-line text-xs text-primary outline-none"
                  />
                  <input
                    type="password"
                    disabled={busy}
                    placeholder="Bot Token (vd: 123456:ABC-DEF...)"
                    value={telegramToken}
                    onChange={(e) => setTelegramToken(e.target.value)}
                    className="w-full p-2 rounded bg-canvas border border-line text-xs text-primary outline-none"
                  />
                  <button
                    type="button"
                    disabled={busy || !telegramName.trim() || !telegramToken.trim()}
                    onClick={() => void handleAddTelegram()}
                    className="w-full py-2 px-3 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-on-accent font-medium text-xs flex items-center justify-center gap-1.5 transition"
                  >
                    <Plus size={14} />
                    Thêm Bot Telegram
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-line flex justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="px-4 py-2 bg-elevated hover:bg-subtle rounded-lg text-xs font-medium text-primary transition"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
