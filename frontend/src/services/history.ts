import type { ExecutionHistoryDto, RunHistoryItem, RunSyncResponse } from '../types';

export function historyLog(item: ExecutionHistoryDto): RunHistoryItem {
  let result: RunSyncResponse | null = null;
  try {
    result = item.result ? JSON.parse(item.result) : null;
  } catch {
    // The persisted status remains visible even when a legacy result cannot be read.
  }
  return {
    id: item.id,
    time: new Date(item.started_at).toLocaleString('vi-VN'),
    type:
      item.status === 'ERROR'
        ? 'error'
        : item.status === 'CONFLICT'
          ? 'conflict'
          : item.status === 'RUNNING' || item.status === 'AWAITING_CONFIRMATION'
            ? 'info'
            : 'success',
    message:
      item.status === 'ERROR'
        ? item.error || 'Đồng bộ thất bại.'
        : item.status === 'RUNNING'
          ? 'Phiên đang chạy.'
          : item.status === 'AWAITING_CONFIRMATION'
            ? 'Phiên này yêu cầu xác nhận khởi tạo snapshot từ Sheet.'
            : `Đồng bộ ${result?.cleanRecordIds?.length ?? 0} bản ghi; ${result?.conflicts?.length ?? 0} xung đột.`,
    details: result
      ? `Telegram: gửi ${result.notificationsSent}, lỗi ${result.notificationsFailed}.`
      : undefined,
    latency: result?.latency,
    recordsCount: result?.totalRowsProcessed,
    conflictIds: result?.conflicts?.map((conflict) => conflict.id) ?? [],
  };
}

export function logConflictState(log: RunHistoryItem, activeIds: ReadonlySet<number>) {
  const ids = log.conflictIds ?? [];
  const pendingIds = log.type === 'conflict' ? ids.filter((id) => activeIds.has(id)) : [];
  const resolved = log.type === 'conflict' && ids.length > 0 && pendingIds.length === 0;
  const displayType = log.type === 'conflict' && pendingIds.length === 0 ? 'info' : log.type;
  return { pendingIds, resolved, displayType };
}
