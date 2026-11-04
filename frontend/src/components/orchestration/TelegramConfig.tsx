import { errorMessage } from '../../services/errors';
import { useEffect, useState } from 'react';
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
import { telegramService, workspaceConnectionService } from '../../services/api';
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
      .catch(() => {});
    return () => controller.abort();
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId || !selectedConnectionId) return;
    const controller = new AbortController();
    workspaceConnectionService.getTelegramInfo(workspaceId, selectedConnectionId, controller.signal)
      .then((info) => {
        if (!controller.signal.aborted && info.botUsername) {
          setBot({
            configured: info.configured,
            username: info.botUsername,
            displayName: info.firstName || info.botUsername,
            canJoinGroups: true,
            message: '',
          });
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [workspaceId, selectedConnectionId]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setBot(null);
    void telegramService
      .getBot(controller.signal)
      .then(async (info) => {
        if (controller.signal.aborted) return;
        setBot(info);
        if (info.configured && data.chatId) {
          const savedType =
            data.telegramRecipientType || (data.chatId.startsWith('-') ? 'GROUP' : 'PRIVATE');
          const saved = await telegramService.checkRecipient(
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
  }, [retry, data.chatId, data.telegramRecipientType]);

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
        const result = await telegramService.pollLink(session.id, controller.signal);
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
  }, [session]);

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
      setSession(await telegramService.startLink(type));
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
      setRecipient(await telegramService.checkRecipient(chatId.trim(), type));
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
      const result = await telegramService.sendTest(recipient.chatId, type);
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
      <div className="bg-[#171b24] border border-gray-700 rounded-2xl w-full hf-modal hf-modal--complex  flex flex-col overflow-hidden">
        <div className="hf-modal-header p-4 border-b border-gray-700 flex items-start justify-between gap-4">
          <div>
            <h3 id="telegram-title" className="font-semibold flex items-center gap-2">
              <TelegramIcon size={28} />
              Nhận cảnh báo qua Telegram
            </h3>
            <p className="text-xs text-gray-400 mt-2">
              Chọn nơi nhận để được báo khi dữ liệu cần bạn xử lý.
            </p>
          </div>
          <button
            disabled={busy || saving}
            onClick={onClose}
            aria-label="Đóng"
            className="text-gray-400 hover:text-white disabled:opacity-40"
          >
            <X size={20} />
          </button>
        </div>
        <div className="hf-modal-body p-4 space-y-4 text-sm">
          {workspaceId && (
            <div className="space-y-2 rounded-lg border border-gray-700 p-3 bg-[#11141c]">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-300 font-medium">
                  Bot Telegram trong Workspace
                </span>
                {bot?.username && (
                  <span className="text-xs text-blue-400 font-medium">
                    @{bot.username}
                  </span>
                )}
              </div>
              {workspaceConnections.length === 0 ? (
                <p className="text-xs text-amber-300">
                  Chưa có bot Telegram trong workspace. Hãy cấu hình kết nối Telegram trong mục Quản lý kết nối.
                </p>
              ) : (
                <select
                  disabled={disabled || busy || saving}
                  value={selectedConnectionId}
                  onChange={(e) => setSelectedConnectionId(e.target.value)}
                  className="w-full p-2 rounded bg-[#0b0e14] border border-gray-700 text-xs text-gray-200"
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
            <p role="status" className="text-gray-400 text-xs flex items-center gap-2">
              <RefreshCw size={14} className="animate-spin" />
              Đang kiểm tra bot Telegram...
            </p>
          ) : bot?.configured ? (
            <p className="text-xs text-gray-400">
              Bot gửi cảnh báo: <span className="text-sky-300">@{bot.username}</span>
            </p>
          ) : (
            <p className="text-xs text-amber-200">
              {bot?.message || 'Chưa kiểm tra được kết nối bot.'}
            </p>
          )}
          {!loading && !bot?.configured && (
            <button
              onClick={() => setRetry((value) => value + 1)}
              className="text-xs text-blue-300 underline"
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
                  className={`p-3 rounded-lg border cursor-pointer ${type === value ? 'border-sky-500 bg-sky-950/20' : 'border-gray-700'}`}
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
                  <span className="block mt-2 text-xs text-gray-400">{detail}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <section className="space-y-3">
            <h4 className="font-medium">2. Kết nối nơi nhận</h4>
            <p className="text-xs text-gray-400 leading-relaxed">
              {type === 'PRIVATE'
                ? 'Mở bot trên Telegram và bấm Start (Bắt đầu). Sau đó quay lại đây; ứng dụng sẽ tự nhận tài khoản của bạn.'
                : 'Mở liên kết bên dưới, chọn nhóm và thêm bot. Bạn cần có quyền thêm bot vào nhóm; bot cần được phép gửi tin nhắn.'}
            </p>
            <button
              disabled={locked || !bot?.configured}
              onClick={() => void createLink()}
              className="px-3 py-2 rounded-lg border border-gray-600 text-xs disabled:opacity-40"
            >
              {session
                ? 'Tạo liên kết mới'
                : type === 'PRIVATE'
                  ? 'Kết nối với bot'
                  : 'Kết nối nhóm Telegram'}
            </button>
            {session?.status === 'WAITING' && (
              <div className="space-y-3 rounded-lg border border-gray-700 p-3">
                <a
                  href={session.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-xs font-medium"
                >
                  <ExternalLink size={14} />
                  {type === 'PRIVATE' ? 'Mở bot trên Telegram' : 'Chọn nhóm trên Telegram'}
                </a>
                <p role="status" className="text-xs text-gray-400 flex items-center gap-2">
                  <RefreshCw size={13} className="animate-spin" />
                  Đang chờ bạn xác nhận trong Telegram. Liên kết có hiệu lực 10 phút.
                </p>
                <p className="text-xs text-gray-400">
                  Nếu bot đã có trong cuộc trò chuyện, gửi lệnh này{' '}
                  {type === 'GROUP' ? 'vào nhóm đã chọn' : 'cho bot'}:
                </p>
                <code className="block text-xs text-gray-300 break-all select-all">
                  {session.command}
                </code>
                {waitingError && (
                  <p role="alert" className="text-xs text-amber-200">
                    {waitingError}
                  </p>
                )}
              </div>
            )}
            {session?.status === 'EXPIRED' && (
              <p role="status" className="text-xs text-amber-200">
                Liên kết đã hết hạn. Tạo liên kết mới để tiếp tục.
              </p>
            )}
            {recipient && (
              <div className="rounded-lg border border-emerald-800 bg-emerald-950/20 p-3 flex items-center gap-3">
                <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
                <div>
                  <p className="text-xs text-gray-400">
                    Nơi nhận đã chọn · {recipient.recipientType === 'GROUP' ? 'Nhóm' : 'Cá nhân'}
                  </p>
                  <p className="font-medium mt-1">{recipient.name}</p>
                </div>
              </div>
            )}
          </section>
          <section className="space-y-3">
            <h4 className="font-medium">3. Kiểm tra gửi tin</h4>
            <p className="text-xs text-gray-400">
              Gửi một tin nhắn thử đến nơi nhận đang chọn. Bạn không cần chờ có xung đột dữ liệu.
            </p>
            <button
              disabled={!canUseRecipient}
              onClick={() => void sendTest()}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-600 text-xs disabled:opacity-40"
            >
              <Send size={14} />
              Gửi tin nhắn thử
            </button>
            {success && (
              <p role="status" className="text-xs text-emerald-300">
                {success}
              </p>
            )}
          </section>

          {/* Section 4: Mẫu tin nhắn (Template) */}
          <details className="space-y-3 border-t border-gray-700 pt-4">
            <summary className="cursor-pointer text-sm font-medium text-gray-200">Tùy chỉnh mẫu nội dung thông báo</summary>
            <p className="text-xs text-gray-400">
              Tùy chỉnh nội dung tin nhắn gửi về Telegram. Dùng biến dạng <code className="text-sky-300">{`{tên_cột}`}</code> hoặc bấm nút bên dưới để chèn nhanh.
            </p>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-gray-300">
                Mẫu thông báo bản ghi (khi nhận từ Rẽ Nhánh Điều Kiện):
              </label>
              <textarea
                rows={2}
                value={recordTemplate}
                placeholder="Ví dụ: Đơn {id} chuyển sang trạng thái {status}."
                onChange={(e) => setRecordTemplate(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-[#0b0e14] px-3 py-2 text-xs font-mono text-gray-100 placeholder-gray-500 focus:border-sky-400 focus:outline-none"
              />
              {availableColumns.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] text-gray-500">Chèn biến:</span>
                  {availableColumns.map((col) => (
                    <button
                      key={col}
                      type="button"
                      onClick={() => setRecordTemplate((prev) => `${prev}{${col}}`)}
                      className="px-1.5 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-[10px] font-mono text-sky-300 border border-gray-700 transition cursor-pointer"
                    >
                      +{col}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-gray-300">
                Mẫu cảnh báo xung đột (khi nhận từ nhánh Có xung đột):
              </label>
              <textarea
                rows={2}
                value={conflictTemplate}
                placeholder="Ví dụ: Bản ghi {recordId} xung đột trên cột {columnName}."
                onChange={(e) => setConflictTemplate(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-[#0b0e14] px-3 py-2 text-xs font-mono text-gray-100 placeholder-gray-500 focus:border-sky-400 focus:outline-none"
              />
              {conflictVariables.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] text-gray-500">Chèn biến:</span>
                  {conflictVariables.map((col) => (
                    <button
                      key={col}
                      type="button"
                      onClick={() => setConflictTemplate((prev) => `${prev}{${col}}`)}
                      className="px-1.5 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-[10px] font-mono text-amber-300 border border-gray-700 transition cursor-pointer"
                    >
                      +{col}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </details>

          {invalidVariables.length > 0 && <p role="alert" className="text-xs text-red-300">Biến template không hợp lệ: {[...new Set(invalidVariables)].join(', ')}</p>}
          {previewRow && recordTemplate && <details className="text-sm space-y-2"><summary className="cursor-pointer">Xem trước bản ghi đã đọc</summary><pre className="whitespace-pre-wrap">{renderTemplatePreview(recordTemplate, previewRow)}</pre></details>}
          {previewConflict && conflictTemplate && <details className="text-sm space-y-2"><summary className="cursor-pointer">Xem trước xung đột</summary><pre className="whitespace-pre-wrap">{renderTemplatePreview(conflictTemplate, previewConflict)}</pre></details>}
          {!!data.notificationItems?.length && <section className="space-y-2 text-xs">
            <h4>Thông báo của lượt chạy gần nhất</h4>
            {data.notificationItems.filter(item => item.state !== 'SKIPPED').map(item => <div key={item.id} className="border-t border-gray-700 py-2">
              <p>{item.state === 'SENT' ? 'Đã gửi' : item.state === 'SENDING' ? 'Đang gửi' : item.state === 'PENDING' ? 'Đang chờ' : 'Gửi lỗi'} · {item.message.slice(0, 100)}</p>
              {item.lastError && <p className="text-amber-200">{errorMessage({ response: { data: { message: item.lastError, code: item.errorCode, correlationId: item.correlationId } } })}</p>}
              {onRetryNotification && ['FAILED', 'DEAD'].includes(item.state) && <button disabled={busy} className="text-sky-300" onClick={async () => {
                setBusy(true); setError('');
                try { await onRetryNotification(item.id); } catch (error) { setError(errorMessage(error)); } finally { setBusy(false); }
              }}>Thử gửi lại</button>}
            </div>)}
          </section>}
          <details className="border-t border-gray-700 pt-3">
            <summary className="cursor-pointer text-xs text-gray-400">
              Thiết lập nâng cao · nhập Chat ID
            </summary>
            <div className="mt-3 space-y-3">
              <p className="text-xs text-gray-500">
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
                  className="w-full rounded-lg border border-gray-700 bg-[#0b0e14] px-3 py-2 font-mono text-sm"
                />
              </label>
              <button
                disabled={locked || !bot?.configured || !chatId.trim()}
                onClick={() => void checkManual()}
                className="text-xs text-sky-300 disabled:opacity-40"
              >
                Kiểm tra nơi nhận
              </button>
            </div>
          </details>
          {error && (
            <p role="alert" className="text-xs text-red-300">
              {error}
            </p>
          )}
          {(busy || saving) && (
            <p role="status" className="text-xs text-gray-400 flex items-center gap-2">
              <RefreshCw size={13} className="animate-spin" />
              {saving ? 'Đang lưu nơi nhận...' : 'Đang chờ phản hồi Telegram...'}
            </p>
          )}
          {!notificationConnected && (
            <p className="text-xs text-amber-200">
              Khối Telegram chưa được nối với nhánh xung đột hoặc rẽ nhánh. Sau khi lưu, hãy nối dây để nhận thông báo tự động.
            </p>
          )}
        </div>
        <div className="hf-modal-footer p-4 border-t border-gray-700 flex flex-wrap items-center justify-between gap-4">
          <p className="text-xs text-gray-500 max-w-sm">
            Gửi thử không thay đổi cấu hình. Chỉ áp dụng nơi nhận mới sau khi lưu.
          </p>
          <div className="flex gap-3">
            <button
              disabled={busy || saving}
              onClick={onClose}
              className="text-xs text-gray-400 px-3 py-2"
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
