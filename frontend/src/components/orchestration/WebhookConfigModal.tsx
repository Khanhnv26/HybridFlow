import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle,
  ChevronDown,
  Copy,
  RefreshCw,
  Save,
  ShieldAlert,
  Webhook,
  X,
} from 'lucide-react';
import { useExitMotion } from '../../hooks/useExitMotion';
import { errorMessage } from '../../services/errors';
import { webhookService } from '../../services/api';
import type { OrchestrationNodeData, WorkflowWebhookInfo } from '../../types';

const actionButton = 'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium hover:bg-elevated disabled:opacity-50';
const disclosure = 'flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-primary [&::-webkit-details-marker]:hidden';
const codeBlock = 'max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-line bg-canvas p-2.5 font-mono text-xs text-secondary';

interface WebhookConfigModalProps {
  workspaceId?: string;
  workflowId?: string;
  data: OrchestrationNodeData;
  disabled: boolean;
  onClose: () => void;
  onSave: (data: Partial<OrchestrationNodeData>) => Promise<void>;
}

export function WebhookConfigModal({
  workspaceId,
  workflowId,
  data,
  disabled,
  onClose,
  onSave,
}: WebhookConfigModalProps) {
  const motionRef = useExitMotion(true);

  const [webhookInfo, setWebhookInfo] = useState<WorkflowWebhookInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [showRotateConfirm, setShowRotateConfirm] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [saving, setSaving] = useState(false);

  const origin = typeof window !== 'undefined' && window.location ? window.location.origin : '';
  const fullWebhookUrl = webhookInfo?.webhookToken
    ? `${origin}/api/v1/webhooks/${webhookInfo.webhookToken}`
    : '';
  const lastPayload = webhookInfo?.lastPayload;
  const sampleJson = lastPayload != null ? JSON.stringify(lastPayload, null, 2) : webhookInfo?.lastPayloadSample;

  const sampleCurl = `curl -X POST "${fullWebhookUrl || 'https://api.hybridflow.vn/api/v1/webhooks/YOUR_TOKEN'}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "student_id": "SV001",
    "full_name": "Nguyen Van A",
    "email": "a@edu.vn",
    "phone": "0901234567",
    "course_code": "K2026",
    "tuition_fee": 5000000
  }'`;

  // 1. Initial load
  useEffect(() => {
    if (!workspaceId || !workflowId) return;
    const controller = new AbortController();
    setLoading(true);
    webhookService
      .get(workspaceId, workflowId, controller.signal)
      .then((info) => {
        if (!controller.signal.aborted) {
          setWebhookInfo(info);
          setError('');
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(errorMessage(err, 'Không tải được thông tin Webhook.'));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [workspaceId, workflowId]);

  // 2. Polling every 2.5s for real-time sample capture while modal is open
  useEffect(() => {
    if (!workspaceId || !workflowId) return;
    const timer = setInterval(() => {
      webhookService
        .get(workspaceId, workflowId)
        .then((info) => {
          setWebhookInfo((prev) => {
            if (!prev) return info;
            if (prev.lastReceivedAt !== info.lastReceivedAt || prev.webhookToken !== info.webhookToken || prev.enabled !== info.enabled) {
              return info;
            }
            return prev;
          });
        })
        .catch(() => {});
    }, 2500);
    return () => clearInterval(timer);
  }, [workspaceId, workflowId]);

  const copyToClipboard = async (text: string, isCurl = false) => {
    try {
      await navigator.clipboard.writeText(text);
      setError('');
    } catch {
      setError('Không thể sao chép tự động. Hãy chọn và sao chép nội dung.');
      return;
    }
    if (isCurl) {
      setCopiedCurl(true);
      setTimeout(() => setCopiedCurl(false), 2500);
    } else {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2500);
    }
  };

  const handleToggleStatus = async () => {
    if (!workspaceId || !workflowId || !webhookInfo || toggling) return;
    setToggling(true);
    setError('');
    try {
      const updated = await webhookService.updateStatus(workspaceId, workflowId, !webhookInfo.enabled);
      setWebhookInfo(updated);
    } catch (err) {
      setError(errorMessage(err, 'Không đổi được trạng thái Webhook.'));
    } finally {
      setToggling(false);
    }
  };

  const handleRotate = async () => {
    if (!workspaceId || !workflowId || rotating) return;
    setRotating(true);
    setError('');
    try {
      const rotated = await webhookService.rotate(workspaceId, workflowId);
      setWebhookInfo(rotated);
      setShowRotateConfirm(false);
    } catch (err) {
      setError(errorMessage(err, 'Không đổi được mã Token Webhook.'));
    } finally {
      setRotating(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await onSave({
        webhookToken: webhookInfo?.webhookToken || data.webhookToken,
        webhookSampleFields: webhookInfo?.sampleFields || data.webhookSampleFields || [],
      });
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'Lưu cấu hình Webhook thất bại.'));
    } finally {
      setSaving(false);
    }
  };

  const changing = rotating || saving || toggling;
  const busy = disabled || loading || changing;

  return (
    <div ref={motionRef} className="hf-motion-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <section
        role="dialog"
        aria-modal="false"
        aria-labelledby="webhook-config-title"
        className="hf-modal hf-modal--complex flex flex-col rounded-2xl border border-line bg-surface text-primary"
      >
        <header className="hf-modal-header flex items-center justify-between gap-3 border-b border-line">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-success-soft text-success">
              <Webhook size={18} />
            </span>
            <div className="min-w-0">
              <h2 id="webhook-config-title" className="font-semibold">Cấu hình Webhook</h2>
              <p className="text-xs text-secondary">Nhận dữ liệu JSON từ ứng dụng ngoài.</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Đóng"
            onClick={onClose}
            disabled={changing}
            className="shrink-0 rounded-lg p-2 text-secondary hover:bg-elevated hover:text-primary disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </header>

        <fieldset disabled={busy} aria-busy={loading} className="hf-modal-body min-w-0 flex-1 space-y-4 p-4">
          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-line bg-danger-soft p-2.5 text-sm text-danger">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <section aria-labelledby="webhook-endpoint" className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="webhook-endpoint" className="text-sm font-semibold">Địa chỉ nhận</h3>
              {webhookInfo && (
                <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium ${
                  webhookInfo.enabled ? 'bg-success-soft text-success' : 'bg-elevated text-secondary'
                }`}>
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
                  {webhookInfo.enabled ? 'Đang nhận' : 'Tạm ngưng'}
                </span>
              )}
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <input
                type="text"
                aria-label="Địa chỉ Webhook"
                readOnly
                value={fullWebhookUrl}
                placeholder={loading ? 'Đang tải…' : 'Chưa có địa chỉ'}
                className="min-w-0 flex-1 select-all rounded-lg border border-line bg-canvas px-2.5 py-1.5 font-mono text-xs text-primary"
              />
              <button
                type="button"
                aria-label="Sao chép địa chỉ Webhook"
                onClick={() => void copyToClipboard(fullWebhookUrl)}
                disabled={!fullWebhookUrl || busy}
                className={actionButton}
              >
                {copiedUrl ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                {copiedUrl ? 'Đã chép' : 'Sao chép'}
              </button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-secondary"><code className="text-primary">POST</code> · JSON</p>
              {webhookInfo && (
                <button type="button" onClick={handleToggleStatus} disabled={busy} className={actionButton}>
                  {webhookInfo.enabled ? 'Tạm ngưng nhận' : 'Bật nhận'}
                </button>
              )}
            </div>
          </section>

          <section aria-labelledby="webhook-sample" className="space-y-2.5 border-t border-line pt-3">
            <h3 id="webhook-sample" className="text-sm font-semibold">Dữ liệu mẫu</h3>
            {webhookInfo?.lastReceivedAt ? (
              <>
                <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-success">
                  <CheckCircle size={14} className="shrink-0" />
                  <span>Nhận lần cuối</span>
                  <time dateTime={webhookInfo.lastReceivedAt}>
                    {new Date(webhookInfo.lastReceivedAt).toLocaleString('vi-VN')}
                  </time>
                </p>
                {!!webhookInfo.sampleFields?.length && (
                  <ul aria-label="Trường đã nhận diện" className="flex max-h-24 flex-wrap content-start gap-1.5 overflow-y-auto">
                    {webhookInfo.sampleFields.map(field => (
                      <li key={field} title={field} className="max-w-full truncate rounded-md border border-line bg-elevated px-1.5 py-0.5 font-mono text-xs text-primary">
                        {field}
                      </li>
                    ))}
                  </ul>
                )}
                {sampleJson && (
                  <details className="group space-y-2">
                    <summary className={disclosure}>
                      <ChevronDown size={14} className="shrink-0 -rotate-90 text-secondary group-open:rotate-0" />
                      Xem JSON gốc
                    </summary>
                    <pre className={codeBlock}>{sampleJson}</pre>
                  </details>
                )}
              </>
            ) : (
              <p className="rounded-lg border border-line bg-canvas px-2.5 py-2 text-xs text-secondary">
                {loading ? 'Đang tải dữ liệu mẫu…' : !webhookInfo ? 'Chưa có dữ liệu mẫu.' : webhookInfo.enabled
                  ? 'Chưa có mẫu. Gửi một yêu cầu thử để nhận diện các trường.'
                  : 'Chưa có mẫu. Bật nhận để gửi thử.'}
              </p>
            )}
          </section>

          <details className="group space-y-2.5 border-t border-line pt-3">
            <summary className={disclosure}>
              <ChevronDown size={14} className="shrink-0 -rotate-90 text-secondary group-open:rotate-0" />
              Gửi thử bằng curl
            </summary>
            <p className="text-xs text-secondary">Chạy lệnh trong terminal hoặc nhập vào Postman.</p>
            <pre className={codeBlock}>{sampleCurl}</pre>
            <button
              type="button"
              onClick={() => void copyToClipboard(sampleCurl, true)}
              disabled={!fullWebhookUrl || busy}
              className={actionButton}
            >
              {copiedCurl ? <Check size={14} className="text-success" /> : <Copy size={14} />}
              {copiedCurl ? 'Đã chép lệnh' : 'Sao chép lệnh curl'}
            </button>
          </details>

          {webhookInfo && (
            <details className="group space-y-2.5 border-t border-line pt-3">
              <summary className={disclosure}>
                <ChevronDown size={14} className="shrink-0 -rotate-90 text-secondary group-open:rotate-0" />
                Bảo mật
              </summary>
              {!showRotateConfirm ? (
                <button type="button" onClick={() => setShowRotateConfirm(true)} disabled={busy} className={actionButton}>
                  <RefreshCw size={14} />
                  Đổi token
                </button>
              ) : (
                <div className="space-y-2 rounded-lg border border-line bg-warning-soft p-2.5">
                  <p className="flex items-start gap-2 text-xs text-warning">
                    <ShieldAlert size={15} className="shrink-0" />
                    Đổi token sẽ vô hiệu hóa URL cũ. Cập nhật URL mới ở các ứng dụng đang gửi dữ liệu.
                  </p>
                  <div className="flex flex-wrap justify-end gap-2">
                    <button type="button" onClick={() => setShowRotateConfirm(false)} disabled={rotating} className={actionButton}>
                      Hủy
                    </button>
                    <button type="button" onClick={handleRotate} disabled={rotating} className={`${actionButton} text-danger`}>
                      {rotating ? 'Đang đổi…' : 'Xác nhận đổi token'}
                    </button>
                  </div>
                </div>
              )}
            </details>
          )}
        </fieldset>

        <footer className="hf-modal-footer flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface">
          <button type="button" onClick={onClose} disabled={changing} className={actionButton}>
            Đóng
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-medium text-on-accent hover:bg-purple-500 disabled:opacity-50"
          >
            <Save size={15} />
            {saving ? 'Đang lưu…' : 'Lưu cấu hình'}
          </button>
        </footer>
      </section>
    </div>
  );
}
