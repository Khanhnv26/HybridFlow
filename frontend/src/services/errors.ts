export interface ErrorDetails {
  code: string;
  message: string;
  correlationId?: string;
  retryable: boolean;
  retryAfterSeconds: number;
  fieldErrors: { field: string; message: string }[];
  cancelled: boolean;
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export function errorDetails(error: unknown, fallback = 'Không hoàn tất thao tác. Vui lòng thử lại hoặc liên hệ quản trị viên.'): ErrorDetails {
  const source = object(error);
  const response = object(source.response);
  const data = object(response.data);
  const cancelled = source.code === 'ERR_CANCELED' || source.name === 'AbortError';
  const network = source.code === 'ERR_NETWORK';
  const timeout = source.code === 'ECONNABORTED' || source.code === 'ETIMEDOUT';
  const code = text(data.code) || (cancelled ? 'CANCELLED' : timeout ? 'REQUEST_TIMEOUT' : network ? 'NETWORK_ERROR' : 'UNKNOWN_ERROR');
  const message = cancelled ? '' : timeout ? 'Máy chủ phản hồi quá chậm. Vui lòng thử lại.'
    : network ? 'Không thể kết nối máy chủ. Kiểm tra mạng rồi thử lại.'
    : text(data.message) || (source.response || source.isAxiosError === true ? fallback : text(source.message)) || fallback;
  const fieldErrors = Array.isArray(data.fieldErrors) ? data.fieldErrors.flatMap(item => {
    const field = object(item);
    return typeof field.field === 'string' && typeof field.message === 'string' ? [{ field: field.field, message: field.message }] : [];
  }) : [];
  return { code, message, cancelled, fieldErrors, correlationId: text(data.correlationId),
    retryable: data.retryable === true || network || timeout,
    retryAfterSeconds: typeof data.retryAfterSeconds === 'number' && Number.isFinite(data.retryAfterSeconds) ? Math.max(0, data.retryAfterSeconds) : 0 };
}

export function errorMessage(error: unknown, fallback?: string) {
  const details = errorDetails(error, fallback);
  return details.cancelled ? '' : details.correlationId ? `${details.message} (Mã tra cứu: ${details.correlationId})` : details.message;
}

// Correlation IDs change per request; they must not cause repeated polling notifications.
export function errorFingerprint(error: unknown) {
  const details = errorDetails(error);
  return details.cancelled ? '' : `${details.code}:${details.message}`;
}
