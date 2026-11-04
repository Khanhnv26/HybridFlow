import { errorMessage } from '../../services/errors';
import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  Save,
  Send,
  User,
  Users,
  X,
} from 'lucide-react';
import { TelegramIcon } from '../icons/BrandIcons';
import { telegramService, workspaceConnectionService, workspaceTelegramApi } from '../../services/api';
import { conflictVariables, invalidTemplateVariables, renderTemplatePreview } from '../../services/notificationPreview';
import type {
  OrchestrationNodeData,
  TelegramBotInfo,
  TelegramLink,
  TelegramRecipient,
  WorkspaceConnectionResponse,
} from '../../types';

interface Props {
  workspaceId?: string;
  data: OrchestrationNodeData;
  disabled: boolean;
  notificationConnected: boolean;
  availableColumns?: string[];
  previewRow?: Record<string, string>;
  previewConflict?: Record<string, string>;
  onRetryNotification?: (id: string) => Promise<void>;
  onClose: () => void;
  onSave: (data: Partial<OrchestrationNodeData>) => Promise<void>;
}


export function TelegramConfig({
  workspaceId,
  data,
  disabled,
  notificationConnected,
  availableColumns = [],
  previewRow,
  previewConflict,
  onRetryNotification,
  onClose,
  onSave,
}: Props) {
  const [workspaceConnections, setWorkspaceConnections] = useState<WorkspaceConnectionResponse[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>(
    () => (typeof data.connectionId === 'string' ? data.connectionId : '')
  );
  const setup = useMemo(() => workspaceId ? workspaceTelegramApi(workspaceId, selectedConnectionId) : telegramService,
    [workspaceId, selectedConnectionId]);
  const [type, setType] = useState<TelegramRecipient['recipientType']>(
    data.telegramRecipientType || (data.chatId?.startsWith('-') ? 'GROUP' : 'PRIVATE'),
  );
  const [bot, setBot] = useState<TelegramBotInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [recipient, setRecipient] = useState<TelegramRecipient | null>(null);
  const [chatId, setChatId] = useState(data.chatId || '');
  const [recordTemplate, setRecordTemplate] = useState(data.recordTemplate || '');
  const [conflictTemplate, setConflictTemplate] = useState(data.conflictTemplate || '');
  const [session, setSession] = useState<TelegramLink | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [waitingError, setWaitingError] = useState('');

  useEffect(() => {
    if (!workspaceId) return;
    const controller = new AbortController();
    workspaceConnectionService.list(workspaceId, controller.signal)
      .then((items) => {
        if (controller.signal.aborted) return;
        const teleConns = items.filter((c) => c.provider === 'TELEGRAM' && c.state === 'ACTIVE');
        setWorkspaceConnections(teleConns);
        setSelectedConnectionId((prev) => {
          if (prev && teleConns.some((c) => c.id === prev)) return prev;
          return teleConns[0]?.id || '';
        });
      })
      .catch(error => { if (!controller.signal.aborted) { setError(errorMessage(error)); setLoading(false); } });
    return () => controller.abort();
  }, [workspaceId]);

  useEffect(() => {
    if (workspaceId && !selectedConnectionId) {
      setBot(null); setRecipient(null); setSession(null); setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setBot(null);
    setRecipient(null);
    setSession(null);
    void setup
      .getBot(controller.signal)
      .then(async (info) => {
        if (controller.signal.aborted) return;
        setBot(info);
        if (info.configured && data.chatId && (!workspaceId || data.connectionId === selectedConnectionId)) {
          const savedType =
            data.telegramRecipientType || (data.chatId.startsWith('-') ? 'GROUP' : 'PRIVATE');
          const saved = await setup.checkRecipient(
            data.chatId,
            savedType,
            controller.signal,
          );
          if (!controller.signal.aborted) setRecipient(saved);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(errorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [retry, data.chatId, data.telegramRecipientType, data.connectionId, selectedConnectionId, workspaceId, setup]);

  useEffect(() => {
    if (!session || session.status !== 'WAITING') return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (Date.now() >= Date.parse(session.expiresAt)) {
        setSession({ ...session, status: 'EXPIRED' });
        return;
      }
      try {
        const result = await setup.pollLink(session.id, controller.signal);
        if (controller.signal.aborted) return;
        if (result.status === 'CONNECTED' && result.recipient) {
          setRecipient(result.recipient);
          setChatId(result.recipient.chatId);
          setSession(result);
          setWaitingError('');
          setError('');
          return;
        }
        if (result.status === 'EXPIRED') {
          setSession(result);
          return;
        }
        setWaitingError('');
      } catch (error) {
        if (!controller.signal.aborted) setWaitingError(errorMessage(error));
      }
      if (!controller.signal.aborted) timer = setTimeout(() => void poll(), 3000);
    };
    timer = setTimeout(() => void poll(), 1500);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [session, setup]);

  const locked = disabled || busy || saving || loading;
  const invalidVariables = [...invalidTemplateVariables(recordTemplate, availableColumns), ...invalidTemplateVariables(conflictTemplate, conflictVariables)];
  const canUseRecipient = !!bot?.configured && !!recipient && !locked;
  const selectType = (next: TelegramRecipient['recipientType']) => {
    setType(next);
    setSession(null);
    setRecipient(null);
    setChatId('');
    setSuccess('');
    setError('');
    setWaitingError('');
  };
  const createLink = async () => {
    setBusy(true);
    setSession(null);
    setRecipient(null);
    setChatId('');
    setError('');
    setSuccess('');
    setWaitingError('');
    try {
      setSession(await setup.startLink(type));
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  const checkManual = async () => {
    setBusy(true);
    setSession(null);
    setRecipient(null);
    setError('');
    setSuccess('');
    try {
      setRecipient(await setup.checkRecipient(chatId.trim(), type));
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  const sendTest = async () => {
    if (!recipient) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const result = await setup.sendTest(recipient.chatId, type);
      if (!result.success) throw new Error(result.message);
      setRecipient(result.recipient);
      setSuccess(result.message);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (!recipient || !bot) return;
    if (invalidVariables.length) { setError(`Biến template không hợp lệ: ${invalidVariables.join(', ')}`); return; }
    setSaving(true);
    setError('');
    try {
      await onSave({
        ...(workspaceId && selectedConnectionId ? { connectionId: selectedConnectionId } : {}),
        chatId: recipient.chatId,
        telegramRecipientType: type,
        telegramRecipientName: recipient.name,
        botName: bot.username ? `@${bot.username}` : undefined,
        recordTemplate: recordTemplate.trim() || undefined,
        conflictTemplate: conflictTemplate.trim() || undefined,
      });
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="telegram-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
    >
      <div className="bg-elevated border border-line rounded-2xl w-full hf-modal hf-modal--complex  flex flex-col overflow-hidden">
        <div className="hf-modal-header p-4 border-b border-line flex items-start justify-between gap-4">
          <div>
            <h3 id="telegram-title" className="font-semibold flex items-center gap-2">
              <TelegramIcon size={28} />
              Nhận cảnh báo qua Telegram
            </h3>
            <p className="text-xs text-secondary mt-2">
              Chọn nơi nhận để được báo khi dữ liệu cần bạn xử lý.
            </p>
          </div>
          <button
            disabled={busy || saving}
            onClick={onClose}
            aria-label="Đóng"
            className="text-secondary hover:text-primary disabled:opacity-40"
          >
            <X size={20} />
          </button>
        </div>
        <div className="hf-modal-body p-4 space-y-4 text-sm">
          {workspaceId && (
            <div className="space-y-2 rounded-lg border border-line p-3 bg-surface">
              <div className="flex items-center justify-between">
                <span className="text-xs text-secondary font-medium">
                  Bot Telegram trong Workspace
                </span>
                {bot?.username && (
                  <span className="text-xs text-info font-medium">
                    @{bot.username}
                  </span>
                )}
              </div>
              {workspaceConnections.length === 0 ? (
                <p className="text-xs text-warning">
                  Chưa có bot Telegram trong workspace. Hãy cấu hình kết nối Telegram trong mục Quản lý kết nối.
                </p>
              ) : (
                <select
                  disabled={disabled || busy || saving}
                  value={selectedConnectionId}
                  onChange={(e) => { setSelectedConnectionId(e.target.value); setChatId(''); setRecipient(null); setSession(null); setSuccess(''); }}
                  className="w-full p-2 rounded bg-canvas border border-line text-xs text-primary"
                >
                  {workspaceConnections.map((conn) => (
                    <option key={conn.id} value={conn.id}>
                      {conn.name} ({conn.id})
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
          {loading ? (
            <p role="status" className="text-secondary text-xs flex items-center gap-2">
              <RefreshCw size={14} className="animate-spin" />
              Đang kiểm tra bot Telegram...
            </p>
          ) : bot?.configured ? (
            <p className="text-xs text-secondary">
              Bot gửi cảnh báo: <span className="text-info">@{bot.username}</span>
            </p>
          ) : (
            <p className="text-xs text-warning">
              {bot?.message || 'Chưa kiểm tra được kết nối bot.'}
            </p>
          )}
          {!loading && !bot?.configured && (
            <button
              onClick={() => setRetry((value) => value + 1)}
              className="text-xs text-info underline"
            >
              Kiểm tra lại bot
            </button>
          )}
          <fieldset disabled={locked || !bot?.configured} className="space-y-3">
            <legend className="font-medium mb-3">1. Bạn muốn nhận tin ở đâu?</legend>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  ['PRIVATE', 'Gửi cho tôi', 'Nhận riêng trong Telegram', User],
                  ['GROUP', 'Gửi vào nhóm', 'Cả nhóm cùng nhận cảnh báo', Users],
                ] as const
              ).map(([value, label, detail, Icon]) => (
                <label
                  key={value}
                  className={`p-3 rounded-lg border cursor-pointer ${type === value ? 'border-sky-500 bg-info-soft' : 'border-line'}`}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="telegram-recipient"
                      value={value}
                      checked={type === value}
                      disabled={
                        locked || !bot?.configured || (value === 'GROUP' && !bot.canJoinGroups)
                      }
                      onChange={() => selectType(value)}
                    />
                    <Icon size={15} />
                    <span className="text-sm font-medium">{label}</span>
                  </span>
                  <span className="block mt-2 text-xs text-secondary">{detail}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <section className="space-y-3">
            <h4 className="font-medium">2. Kết nối nơi nhận</h4>
            <p className="text-xs text-secondary leading-relaxed">
              {type === 'PRIVATE'
                ? 'Mở bot trên Telegram và bấm Start (Bắt đầu). Sau đó quay lại đây; ứng dụng sẽ tự nhận tài khoản của bạn.'
                : 'Mở liên kết bên dưới, chọn nhóm và thêm bot. Bạn cần có quyền thêm bot vào nhóm; bot cần được phép gửi tin nhắn.'}
            </p>
            <button
              disabled={locked || !bot?.configured}
              onClick={() => void createLink()}
              className="px-3 py-2 rounded-lg border border-line text-xs disabled:opacity-40"
            >
              {session
                ? 'Tạo liên kết mới'
                : type === 'PRIVATE'
                  ? 'Kết nối với bot'
                  : 'Kết nối nhóm Telegram'}
            </button>
            {session?.status === 'WAITING' && (
              <div className="space-y-3 rounded-lg border border-line p-3">
                <a
                  href={session.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-xs font-medium"
                >
                  <ExternalLink size={14} />
                  {type === 'PRIVATE' ? 'Mở bot trên Telegram' : 'Chọn nhóm trên Telegram'}
                </a>
                <p role="status" className="text-xs text-secondary flex items-center gap-2">
                  <RefreshCw size={13} className="animate-spin" />
                  Đang chờ bạn xác nhận trong Telegram. Liên kết có hiệu lực 10 phút.
                </p>
                <p className="text-xs text-secondary">
                  Nếu bot đã có trong cuộc trò chuyện, gửi lệnh này{' '}
                  {type === 'GROUP' ? 'vào nhóm đã chọn' : 'cho bot'}:
                </p>
                <code className="block text-xs text-secondary break-all select-all">
                  {session.command}
                </code>
                {waitingError && (
                  <p role="alert" className="text-xs text-warning">
                    {waitingError}
                  </p>
                )}
              </div>
            )}
            {session?.status === 'EXPIRED' && (
              <p role="status" className="text-xs text-warning">
                Liên kết đã hết hạn. Tạo liên kết mới để tiếp tục.
              </p>
            )}
            {recipient && (
              <div className="rounded-lg border border-emerald-800 bg-success-soft p-3 flex items-center gap-3">
                <CheckCircle2 size={18} className="text-success shrink-0" />
                <div>
                  <p className="text-xs text-secondary">
                    Nơi nhận đã chọn · {recipient.recipientType === 'GROUP' ? 'Nhóm' : 'Cá nhân'}
                  </p>
                  <p className="font-medium mt-1">{recipient.name}</p>
                </div>
              </div>
            )}
          </section>
          <section className="space-y-3">
            <h4 className="font-medium">3. Kiểm tra gửi tin</h4>
            <p className="text-xs text-secondary">
              Gửi một tin nhắn thử đến nơi nhận đang chọn. Bạn không cần chờ có xung đột dữ liệu.
            </p>
            <button
              disabled={!canUseRecipient}
              onClick={() => void sendTest()}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-line text-xs disabled:opacity-40"
            >
              <Send size={14} />
              Gửi tin nhắn thử
            </button>
            {success && (
              <p role="status" className="text-xs text-success">
                {success}
              </p>
            )}
          </section>

          {/* Section 4: Mẫu tin nhắn (Template) */}
          <details className="space-y-3 border-t border-line pt-4">
            <summary className="cursor-pointer text-sm font-medium text-primary">Tùy chỉnh mẫu nội dung thông báo</summary>
            <p className="text-xs text-secondary">
              Tùy chỉnh nội dung tin nhắn gửi về Telegram. Dùng biến dạng <code className="text-info">{`{tên_cột}`}</code> hoặc bấm nút bên dưới để chèn nhanh.
            </p>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-secondary">
                Mẫu thông báo bản ghi (khi nhận từ Rẽ Nhánh Điều Kiện):
              </label>
              <textarea
                rows={2}
                value={recordTemplate}
                placeholder="Ví dụ: Đơn {id} chuyển sang trạng thái {status}."
                onChange={(e) => setRecordTemplate(e.target.value)}
                className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-xs font-mono text-primary placeholder-gray-500 focus:border-sky-400 focus:outline-none"
              />
              {availableColumns.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-xs text-muted">Chèn biến:</span>
                  {availableColumns.map((col) => (
                    <button
                      key={col}
                      type="button"
                      onClick={() => setRecordTemplate((prev) => `${prev}{${col}}`)}
                      className="px-1.5 py-0.5 rounded bg-elevated hover:bg-subtle text-xs font-mono text-info border border-line transition cursor-pointer"
                    >
                      +{col}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-secondary">
                Mẫu cảnh báo xung đột (khi nhận từ nhánh Có xung đột):
              </label>
              <textarea
                rows={2}
                value={conflictTemplate}
                placeholder="Ví dụ: Bản ghi {recordId} xung đột trên cột {columnName}."
                onChange={(e) => setConflictTemplate(e.target.value)}
                className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-xs font-mono text-primary placeholder-gray-500 focus:border-sky-400 focus:outline-none"
              />
              {conflictVariables.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-xs text-muted">Chèn biến:</span>
                  {conflictVariables.map((col) => (
                    <button
                      key={col}
                      type="button"
                      onClick={() => setConflictTemplate((prev) => `${prev}{${col}}`)}
                      className="px-1.5 py-0.5 rounded bg-elevated hover:bg-subtle text-xs font-mono text-warning border border-line transition cursor-pointer"
                    >
                      +{col}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </details>

          {invalidVariables.length > 0 && <p role="alert" className="text-xs text-danger">Biến template không hợp lệ: {[...new Set(invalidVariables)].join(', ')}</p>}
          {previewRow && recordTemplate && <details className="text-sm space-y-2"><summary className="cursor-pointer">Xem trước bản ghi đã đọc</summary><pre className="whitespace-pre-wrap">{renderTemplatePreview(recordTemplate, previewRow)}</pre></details>}
          {previewConflict && conflictTemplate && <details className="text-sm space-y-2"><summary className="cursor-pointer">Xem trước xung đột</summary><pre className="whitespace-pre-wrap">{renderTemplatePreview(conflictTemplate, previewConflict)}</pre></details>}
          {!!data.notificationItems?.length && <section className="space-y-2 text-xs">
            <h4>Thông báo của lượt chạy gần nhất</h4>
            {data.notificationItems.filter(item => item.state !== 'SKIPPED').map(item => <div key={item.id} className="border-t border-line py-2">
              <p>{item.state === 'SENT' ? 'Đã gửi' : item.state === 'SENDING' ? 'Đang gửi' : item.state === 'PENDING' ? 'Đang chờ' : 'Gửi lỗi'} · {item.message.slice(0, 100)}</p>
              {item.lastError && <p className="text-warning">{errorMessage({ response: { data: { message: item.lastError, code: item.errorCode, correlationId: item.correlationId } } })}</p>}
              {onRetryNotification && ['FAILED', 'DEAD'].includes(item.state) && <button disabled={busy} className="text-info" onClick={async () => {
                setBusy(true); setError('');
                try { await onRetryNotification(item.id); } catch (error) { setError(errorMessage(error)); } finally { setBusy(false); }
              }}>Thử gửi lại</button>}
            </div>)}
          </section>}
          <details className="border-t border-line pt-3">
            <summary className="cursor-pointer text-xs text-secondary">
              Thiết lập nâng cao · nhập Chat ID
            </summary>
            <div className="mt-3 space-y-3">
              <p className="text-xs text-muted">
                Dùng khi bạn đã biết mã cuộc trò chuyện. Bot vẫn cần được mở bằng Start hoặc được
                thêm vào nhóm.
              </p>
              <label className="block text-xs space-y-2">
                <span>Telegram Chat ID</span>
                <input
                  value={chatId}
                  disabled={locked || !bot?.configured}
                  placeholder={
                    type === 'GROUP'
                      ? 'Mã nhóm, thường bắt đầu bằng dấu -'
                      : 'Mã cuộc trò chuyện cá nhân'
                  }
                  onChange={(event) => {
                    setChatId(event.target.value);
                    setRecipient(null);
                    setSession(null);
                    setSuccess('');
                    setError('');
                  }}
                  className="w-full rounded-lg border border-line bg-canvas px-3 py-2 font-mono text-sm"
                />
              </label>
              <button
                disabled={locked || !bot?.configured || !chatId.trim()}
                onClick={() => void checkManual()}
                className="text-xs text-info disabled:opacity-40"
              >
                Kiểm tra nơi nhận
              </button>
            </div>
          </details>
          {error && (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}
          {(busy || saving) && (
            <p role="status" className="text-xs text-secondary flex items-center gap-2">
              <RefreshCw size={13} className="animate-spin" />
              {saving ? 'Đang lưu nơi nhận...' : 'Đang chờ phản hồi Telegram...'}
            </p>
          )}
          {!notificationConnected && (
            <p className="text-xs text-warning">
              Khối Telegram chưa được nối với nhánh xung đột hoặc rẽ nhánh. Sau khi lưu, hãy nối dây để nhận thông báo tự động.
            </p>
          )}
        </div>
        <div className="hf-modal-footer p-4 border-t border-line flex flex-wrap items-center justify-between gap-4">
          <p className="text-xs text-muted max-w-sm">
            Gửi thử không thay đổi cấu hình. Chỉ áp dụng nơi nhận mới sau khi lưu.
          </p>
          <div className="flex gap-3">
            <button
              disabled={busy || saving}
              onClick={onClose}
              className="text-xs text-secondary px-3 py-2"
            >
              Hủy
            </button>
            <button
              disabled={!canUseRecipient || invalidVariables.length > 0}
              onClick={() => void save()}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium disabled:opacity-40"
            >
              <Save size={14} />
              Lưu cấu hình Telegram
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
