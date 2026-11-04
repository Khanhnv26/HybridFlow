import { useRef, useState } from 'react';
import type { NotificationOutboxItem } from '../../types';
import { useWorkflowPolling } from '../../hooks/useWorkflowPolling';
import { errorMessage } from '../../services/errors';

interface Props {
  flowId: string;
  executionId: string;
  load: (flowId: string, executionId: string, signal?: AbortSignal, offset?: number) => Promise<NotificationOutboxItem[]>;
  retry: (id: string) => Promise<void>;
}

const states: Record<NotificationOutboxItem['state'], string> = {
  PENDING: 'Đang chờ', SENDING: 'Đang gửi', SENT: 'Đã gửi',
  FAILED: 'Lỗi · chờ thử lại', DEAD: 'Đã dừng thử lại', SKIPPED: 'Đã bỏ qua',
};
const date = (value: string) => new Date(value).toLocaleString('vi-VN');

export function ExecutionOutbox({ flowId, executionId, load, retry }: Props) {
  const [items, setItems] = useState<NotificationOutboxItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [retryError, setRetryError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const retrying = useRef(false);
  const [revision, setRevision] = useState(0);
  const [offset, setOffset] = useState(0);
  useWorkflowPolling(JSON.stringify([flowId, executionId, offset, revision]), async (_key, signal) => {
    const result = await load(flowId, executionId, signal, offset);
    if (!signal.aborted) { setItems(result); setLoaded(true); setLoadError(''); }
  }, error => setLoadError(errorMessage(error)), 2000);

  const resend = async (id: string) => {
    if (retrying.current) return;
    retrying.current = true;
    setBusy(id); setRetryError('');
    try {
      await retry(id);
      setItems(current => current.map(item => item.id === id ? { ...item, state: 'PENDING', attempts: 0, lastError: undefined, errorCode: undefined } : item));
      // Invalidate the current poll so a response started before retry cannot overwrite it.
      setRevision(value => value + 1);
    } catch (error) { setRetryError(errorMessage(error)); }
    finally { retrying.current = false; setBusy(null); }
  };
  const page = (next: number) => { setItems([]); setLoaded(false); setLoadError(''); setRetryError(''); setOffset(next); };

  return <section aria-label="Chi tiết thông báo" className="mt-3 border-t border-line pt-3 space-y-3 font-sans select-text">
    <h4 className="font-semibold text-primary">Thông báo của lượt chạy</h4>
    <p className="text-secondary break-all">Mã lượt chạy: {executionId}</p>
    <p className="text-secondary">Trạng thái gửi được cập nhật riêng với kết quả đồng bộ. Gửi lại chỉ xử lý thông báo đã chọn.</p>
    {loadError && <p role="alert" className="text-warning">Không tải được thông báo: {loadError}</p>}
    {retryError && <p role="alert" className="text-warning">{retryError}</p>}
    {!loaded && !loadError && <p role="status">Đang tải thông báo…</p>}
    {loaded && !loadError && items.length === 0 && <p>Không có thông báo trong trang này của lượt chạy.</p>}
    {items.map(item => <article key={item.id} className="border border-line rounded p-3 space-y-2">
      <div className="flex justify-between gap-3 flex-wrap">
        <strong>{states[item.state] || item.state}</strong>
        <span>Số lần thử trong đợt hiện tại: {item.attempts}</span>
      </div>
      <p className="break-all">{item.channel} · Nơi nhận: {item.destination} · Khối: {item.actionNodeId}</p>
      <p>{item.sourceType === 'CONFLICT' ? 'Cảnh báo xung đột' : 'Thông báo bản ghi'} · Tạo: {date(item.createdAt)}</p>
      {item.sentAt && <p>Đã gửi: {date(item.sentAt)}</p>}
      {['PENDING', 'FAILED'].includes(item.state) && <p>Lần thử kế tiếp sớm nhất: {date(item.availableAt)}</p>}
      <pre className="whitespace-pre-wrap break-words font-sans">{item.message}</pre>
      {item.errorCode && <p className="text-warning">Mã lỗi: {item.errorCode}</p>}
      {(item.lastError || item.errorCode) && <p className="text-warning">{errorMessage({ response: { data: {
        message: item.lastError || 'Gửi thông báo thất bại.', code: item.errorCode, correlationId: item.correlationId,
      } } })}</p>}
      {item.correlationId && <p className="text-secondary break-all">Mã tra cứu: {item.correlationId}</p>}
      {['FAILED', 'DEAD'].includes(item.state) && <button type="button" disabled={busy !== null}
        className="px-3 py-1 rounded border border-sky-700 text-info disabled:opacity-40"
        onClick={() => void resend(item.id)}>{busy === item.id ? 'Đang yêu cầu…' : 'Thử gửi lại'}</button>}
    </article>)}
    <nav aria-label="Trang thông báo" className="flex items-center gap-3">
      <button type="button" disabled={offset === 0 || busy !== null} onClick={() => page(Math.max(0, offset - 50))}>Trang trước</button>
      <span>Trang {offset / 50 + 1}</span>
      <button type="button" disabled={!loaded || !!loadError || items.length < 50 || busy !== null} onClick={() => page(offset + 50)}>Trang sau</button>
    </nav>
  </section>;
}
