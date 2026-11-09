import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle,
  Copy,
  Radio,
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
  const [showPayload, setShowPayload] = useState(false);

  const origin = typeof window !== 'undefined' && window.location ? window.location.origin : '';
  const fullWebhookUrl = webhookInfo?.webhookToken
    ? `${origin}/api/v1/webhooks/${webhookInfo.webhookToken}`
    : '';

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
            if (prev.lastReceivedAt !== info.lastReceivedAt || prev.webhookToken !== info.webhookToken) {
              return info;
            }
            return prev;
          });
        })
        .catch(() => {});
    }, 2500);
    return () => clearInterval(timer);
  }, [workspaceId, workflowId]);

  const copyToClipboard = (text: string, isCurl = false) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(text);
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

  const busy = disabled || loading || rotating || saving || toggling;

  return (
    <div
      ref={motionRef}
      className="hf-motion-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    >
      <section
        role="dialog"
        aria-modal="false"
        aria-labelledby="webhook-config-title"
        className="hf-modal hf-modal--complex flex flex-col rounded-2xl border border-line bg-surface text-primary"
      >
        <header className="hf-modal-header flex items-start justify-between gap-3 border-b border-line p-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="shrink-0 rounded-xl border border-line bg-success-soft p-2.5 text-success">
              <Webhook size={20} />
            </span>
            <div className="min-w-0">
              <h2 id="webhook-config-title" className="font-semibold text-base">
                Cấu hình Webhook
              </h2>
              <p className="mt-1 text-sm text-secondary">
                Nhận dữ liệu từ Google Forms, CRM, Landing Page, LMS hoặc Postman để thêm dòng học viên.
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Đóng"
            onClick={onClose}
            disabled={busy}
            className="shrink-0 rounded-lg p-2 text-secondary hover:bg-elevated hover:text-primary disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </header>

        <fieldset disabled={busy} className="hf-modal-body min-w-0 flex-1 space-y-5 p-4 overflow-y-auto">
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-line bg-danger-soft p-3 text-sm text-danger"
            >
              <AlertTriangle size={18} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Section 1: Endpoint URL & Status */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">1. Địa chỉ Webhook (Endpoint Ingress)</h3>
              {webhookInfo && (
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                      webhookInfo.enabled
                        ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                        : 'bg-muted/10 text-secondary border border-line'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        webhookInfo.enabled ? 'bg-emerald-500 animate-pulse' : 'bg-secondary'
                      }`}
                    />
                    {webhookInfo.enabled ? 'Đang nhận dữ liệu' : 'Tạm ngưng'}
                  </span>
                  <button
                    type="button"
                    onClick={handleToggleStatus}
                    disabled={busy}
                    className="text-xs text-primary underline hover:text-purple-600"
                  >
                    {webhookInfo.enabled ? 'Tắt nhận' : 'Bật nhận'}
                  </button>
                </div>
              )}
            </div>

            <p className="text-xs text-secondary">
              Gửi yêu cầu HTTP POST kèm dữ liệu JSON tới đường dẫn này. Không cần truyền cookie xác thực (được bảo vệ bằng mã Token bí mật).
            </p>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  readOnly
                  value={loading ? 'Đang tải...' : fullWebhookUrl}
                  className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-primary font-mono select-all"
                />
              </div>
              <button
                type="button"
                onClick={() => copyToClipboard(fullWebhookUrl, false)}
                disabled={!fullWebhookUrl || busy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-elevated px-3 py-2 text-sm font-medium text-primary hover:bg-subtle transition"
              >
                {copiedUrl ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                <span>{copiedUrl ? 'Đã chép!' : 'Sao chép'}</span>
              </button>
            </div>

            <div className="pt-1">
              {!showRotateConfirm ? (
                <button
                  type="button"
                  onClick={() => setShowRotateConfirm(true)}
                  disabled={busy}
                  className="text-xs text-secondary hover:text-danger flex items-center gap-1 transition"
                >
                  <RefreshCw size={12} />
                  <span>Đổi mã Token (Rotate) nếu nghi ngờ bị lộ</span>
                </button>
              ) : (
                <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 space-y-2">
                  <div className="flex items-start gap-2 text-xs text-warning">
                    <ShieldAlert size={16} className="shrink-0 mt-0.5" />
                    <span>
                      Khi đổi mã Token, tất cả các hệ thống đang gửi vào URL cũ sẽ bị từ chối 404. Bạn sẽ cần cập nhật URL mới vào các app ngoài.
                    </span>
                  </div>
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => setShowRotateConfirm(false)}
                      disabled={rotating}
                      className="px-2.5 py-1 text-xs rounded border border-line text-secondary hover:text-primary"
                    >
                      Hủy
                    </button>
                    <button
                      type="button"
                      onClick={handleRotate}
                      disabled={rotating}
                      className="px-2.5 py-1 text-xs rounded bg-danger text-white hover:bg-danger/90 font-medium"
                    >
                      {rotating ? 'Đang đổi...' : 'Xác nhận đổi Token'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Integration sample & curl command */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">2. Lệnh mẫu kiểm thử (curl / Postman)</h3>
              <button
                type="button"
                onClick={() => copyToClipboard(sampleCurl, true)}
                className="text-xs text-primary flex items-center gap-1 hover:text-purple-600"
              >
                {copiedCurl ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                <span>{copiedCurl ? 'Đã sao chép curl!' : 'Sao chép lệnh curl'}</span>
              </button>
            </div>

            <pre className="rounded-lg border border-line bg-canvas p-3 text-xs font-mono text-secondary overflow-x-auto whitespace-pre">
              {sampleCurl}
            </pre>
          </div>

          {/* Section 3: Captured Payload & Sample Fields */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm">3. Dữ liệu mẫu nhận được (Payload Sample)</h3>

            {webhookInfo?.lastReceivedAt ? (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3.5 space-y-3">
                <div className="flex items-center justify-between text-xs text-emerald-600 font-medium">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle size={15} />
                    <span>Đã nhận dữ liệu lúc: {new Date(webhookInfo.lastReceivedAt).toLocaleString('vi-VN')}</span>
                  </span>
                  {webhookInfo.lastPayloadSample && (
                    <button
                      type="button"
                      onClick={() => setShowPayload(!showPayload)}
                      className="text-xs underline hover:text-emerald-700"
                    >
                      {showPayload ? 'Thu gọn JSON' : 'Xem JSON gốc'}
                    </button>
                  )}
                </div>

                {webhookInfo.sampleFields && webhookInfo.sampleFields.length > 0 && (
                  <div>
                    <p className="text-xs text-secondary mb-1.5 font-medium">
                      Các trường dữ liệu đã tự động nhận diện:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {webhookInfo.sampleFields.map((field) => (
                        <span
                          key={field}
                          className="px-2 py-0.5 rounded-md bg-canvas border border-line text-xs font-mono text-primary font-medium"
                        >
                          {field}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {showPayload && webhookInfo.lastPayloadSample && (
                  <pre className="rounded-lg border border-line bg-canvas p-2.5 text-xs font-mono text-secondary overflow-x-auto max-h-48 whitespace-pre-wrap">
                    {webhookInfo.lastPayloadSample}
                  </pre>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-line bg-canvas p-4 text-center space-y-2">
                <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-info-soft text-info">
                  <Radio size={16} className="animate-pulse" />
                </div>
                <p className="text-xs font-medium text-primary">Đang lắng nghe sự kiện thử nghiệm...</p>
                <p className="text-xs text-secondary max-w-sm mx-auto">
                  Hãy sao chép lệnh curl ở trên và chạy trong terminal hoặc gửi từ Postman để Webhook ghi nhận dữ liệu mẫu.
                </p>
              </div>
            )}
          </div>
        </fieldset>

        <footer className="hf-modal-footer flex items-center justify-end gap-2 border-t border-line p-4">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-line px-4 py-2 text-sm text-secondary hover:bg-elevated hover:text-primary transition"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50 transition"
          >
            <Save size={16} />
            <span>{saving ? 'Đang lưu...' : 'Lưu cấu hình'}</span>
          </button>
        </footer>
      </section>
    </div>
  );
}
