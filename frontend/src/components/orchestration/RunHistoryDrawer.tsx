import React, { useState } from 'react';
import {
  ChevronUp,
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Trash2,
  Terminal,
} from 'lucide-react';
import type { RunHistoryItem } from '../../types';
import { logConflictState } from '../../services/history';
import { ExecutionOutbox } from './ExecutionOutbox';
import type { NotificationOutboxItem } from '../../types';

interface RunHistoryDrawerProps {
  logs: RunHistoryItem[];
  activeConflictIds: number[];
  isRunning: boolean;
  onClearLogs: () => void;
  onOpenConflictModal: () => void;
  flowId?: string;
  loadNotifications?: (flowId: string, executionId: string, signal?: AbortSignal, offset?: number) => Promise<NotificationOutboxItem[]>;
  retryNotification?: (id: string) => Promise<void>;
}

export const RunHistoryDrawer: React.FC<RunHistoryDrawerProps> = ({
  logs,
  activeConflictIds,
  isRunning,
  onClearLogs,
  onOpenConflictModal,
  flowId,
  loadNotifications,
  retryNotification,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState('');

  const latestLog = logs[0];
  const activeIds = new Set(activeConflictIds);
  const hasOpenConflicts = activeIds.size > 0;
  const latestMessage = hasOpenConflicts
    ? `${activeIds.size} xung đột đang chờ xử lý.`
    : latestLog?.type === 'conflict'
      ? 'Không còn xung đột cần xử lý.'
      : latestLog?.message;

  return (
    <div className="absolute bottom-0 left-0 right-0 z-30 flex flex-col select-none transition-all duration-300">
      {/* Minimized Bar */}
      <div className="h-10 bg-surface/95 backdrop-blur-md border-t border-line px-3 flex items-center justify-between gap-2 text-xs">
        <div className="min-w-0 flex items-center gap-3">
          <div className="min-w-0 flex items-center gap-2">
            {isRunning ? (
              <span className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-ping"></span>
            ) : hasOpenConflicts ? (
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
            ) : latestLog?.type === 'error' ? (
              <span className="w-2.5 h-2.5 rounded-full bg-red-400"></span>
            ) : !latestLog || latestLog.type === 'info' ? (
              <span className="w-2.5 h-2.5 rounded-full bg-gray-500"></span>
            ) : (
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
            )}
            <span className="truncate font-semibold text-primary">
              {isRunning ? 'Đang điều phối...' : 'Nhật ký thực thi'}
            </span>
          </div>

          <div className="hidden xl:flex min-w-0 items-center gap-2 text-secondary border-l border-line/60 pl-3">
            {latestLog || hasOpenConflicts ? (
              <>
                {latestLog && <span className="text-xs text-muted">{latestLog.time}</span>}
                <span className="text-secondary truncate max-w-[420px]">{latestMessage}</span>
              </>
            ) : (
              <span className="text-muted italic">
                Chưa có phiên chạy nào. Bấm "Chạy Thử Luồng" để bắt đầu.
              </span>
            )}
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-2">
          {hasOpenConflicts && (
            <button
              onClick={onOpenConflictModal}
              className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-warning border border-amber-500/40 hover:bg-amber-500/30 text-xs font-bold flex items-center gap-1.5 animate-pulse transition"
            >
              <AlertTriangle size={12} />
              <span>Xem xung đột</span>
            </button>
          )}

          <button
            onClick={() => setIsOpen(!isOpen)}
            className="px-3 py-1 rounded-lg bg-subtle hover:bg-line text-secondary hover:text-primary transition flex items-center gap-1.5 text-xs font-medium"
          >
            <Terminal size={13} className="text-info" />
            <span>Lịch sử ({logs.length})</span>
            {isOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
      </div>

      {/* Expanded Log Drawer */}
      {isOpen && (
        <div className="h-[min(60vh,32rem)] bg-canvas border-t border-line flex flex-col p-4 overflow-hidden animate-slideUp">
          <div className="flex items-center justify-between pb-2 border-b border-subtle mb-2 text-xs">
            <div className="flex items-center gap-2 text-secondary">
              <Clock size={13} />
              <span className="font-semibold text-secondary">
                Chi tiết các phiên điều phối tự động &amp; lưu vết audit
              </span>
              <span className="px-2 py-0.5 rounded-full bg-surface text-secondary text-xs">
                {logs.length} bản ghi
              </span>
            </div>

            <button
              onClick={onClearLogs}
              disabled={isRunning || logs.length === 0}
              className="text-muted hover:text-danger text-xs flex items-center gap-1 transition disabled:opacity-40 disabled:pointer-events-none"
            >
              <Trash2 size={12} />
              <span>Xóa nhật ký</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-2 text-xs font-mono">
            {logs.length === 0 ? (
              <div className="h-full flex items-center justify-center text-muted text-xs italic">
                Chưa có dữ liệu lịch sử
              </div>
            ) : (
              logs.map((log) => {
                const state = logConflictState(log, activeIds);
                return (
                  <div
                    key={log.id}
                    className={`p-2.5 rounded-xl border transition ${
                      state.displayType === 'conflict'
                        ? 'bg-warning-soft border-amber-800/40 text-warning'
                        : state.displayType === 'error'
                          ? 'bg-danger-soft border-red-800/40 text-danger'
                          : 'bg-surface border-subtle text-secondary hover:border-line'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted">{log.time}</span>
                      <div className="flex items-center gap-2">
                        {state.displayType === 'conflict' ? (
                          <AlertTriangle size={14} className="text-warning shrink-0" />
                        ) : state.displayType === 'error' ? (
                          <AlertTriangle size={14} className="text-danger shrink-0" />
                        ) : state.displayType === 'info' && !state.resolved ? (
                          <Clock size={14} className="text-secondary shrink-0" />
                        ) : (
                          <CheckCircle2 size={14} className="text-success shrink-0" />
                        )}
                        <span className="font-sans font-medium text-xs">{log.message}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-xs font-sans">
                      {flowId && loadNotifications && retryNotification && <button type="button"
                        aria-expanded={selectedKey === JSON.stringify([flowId, log.id])}
                        className="px-2 py-1 rounded border border-line text-info"
                        onClick={() => setSelectedKey(value => value === JSON.stringify([flowId, log.id]) ? '' : JSON.stringify([flowId, log.id]))}>
                        {selectedKey === JSON.stringify([flowId, log.id]) ? 'Đóng thông báo' : 'Xem thông báo'}
                      </button>}
                      {state.pendingIds.length > 0 && (
                        <button
                          onClick={onOpenConflictModal}
                          className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-warning font-bold border border-amber-500/40 text-xs"
                        >
                          Xử lý ngay
                        </button>
                      )}
                      {state.resolved && <span className="text-success">Đã xử lý</span>}
                      {log.details && (
                        <span className="text-muted hidden sm:inline">{log.details}</span>
                      )}
                    </div>
                    </div>
                    {flowId && loadNotifications && retryNotification && selectedKey === JSON.stringify([flowId, log.id]) &&
                      <ExecutionOutbox key={selectedKey} flowId={flowId} executionId={log.id} load={loadNotifications} retry={retryNotification} />}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
