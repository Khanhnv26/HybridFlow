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

interface RunHistoryDrawerProps {
  logs: RunHistoryItem[];
  activeConflictIds: number[];
  isRunning: boolean;
  onClearLogs: () => void;
  onOpenConflictModal: () => void;
}

export const RunHistoryDrawer: React.FC<RunHistoryDrawerProps> = ({
  logs,
  activeConflictIds,
  isRunning,
  onClearLogs,
  onOpenConflictModal,
}) => {
  const [isOpen, setIsOpen] = useState(false);

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
      <div className="h-10 bg-[#12161f]/95 backdrop-blur-md border-t border-[#2d3748] px-5 flex items-center justify-between text-xs shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
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
            <span className="font-bold text-gray-200">
              {isRunning ? 'Đang điều phối luồng...' : 'Nhật Ký Điều Phối Hệ Thống'}
            </span>
          </div>

          <div className="hidden md:flex items-center gap-2 text-gray-400 border-l border-gray-700/60 pl-3">
            {latestLog || hasOpenConflicts ? (
              <>
                {latestLog && <span className="text-[11px] text-gray-500">{latestLog.time}</span>}
                <span className="text-gray-300 truncate max-w-[420px]">{latestMessage}</span>
              </>
            ) : (
              <span className="text-gray-500 italic">
                Chưa có phiên chạy nào. Bấm "Chạy Thử Luồng" để bắt đầu.
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasOpenConflicts && (
            <button
              onClick={onOpenConflictModal}
              className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 text-[11px] font-bold flex items-center gap-1.5 animate-pulse transition"
            >
              <AlertTriangle size={12} />
              <span>Xem xung đột</span>
            </button>
          )}

          <button
            onClick={() => setIsOpen(!isOpen)}
            className="px-3 py-1 rounded-lg bg-[#1f2633] hover:bg-[#2a3445] text-gray-300 hover:text-white transition flex items-center gap-1.5 text-xs font-medium"
          >
            <Terminal size={13} className="text-blue-400" />
            <span>Lịch sử ({logs.length})</span>
            {isOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
      </div>

      {/* Expanded Log Drawer */}
      {isOpen && (
        <div className="h-56 bg-[#0d1117] border-t border-[#2d3748] flex flex-col p-4 overflow-hidden animate-slideUp">
          <div className="flex items-center justify-between pb-2 border-b border-[#21262d] mb-2 text-xs">
            <div className="flex items-center gap-2 text-gray-400">
              <Clock size={13} />
              <span className="font-semibold text-gray-300">
                Chi tiết các phiên điều phối tự động &amp; lưu vết audit
              </span>
              <span className="px-2 py-0.5 rounded-full bg-[#161b22] text-gray-400 text-[10px]">
                {logs.length} bản ghi
              </span>
            </div>

            <button
              onClick={onClearLogs}
              disabled={isRunning || logs.length === 0}
              className="text-gray-500 hover:text-red-400 text-[11px] flex items-center gap-1 transition disabled:opacity-40 disabled:pointer-events-none"
            >
              <Trash2 size={12} />
              <span>Xóa nhật ký</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-2 text-xs font-mono">
            {logs.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-500 text-xs italic">
                Chưa có dữ liệu lịch sử
              </div>
            ) : (
              logs.map((log) => {
                const state = logConflictState(log, activeIds);
                return (
                  <div
                    key={log.id}
                    className={`p-2.5 rounded-xl border flex items-center justify-between transition ${
                      state.displayType === 'conflict'
                        ? 'bg-amber-950/20 border-amber-800/40 text-amber-200'
                        : state.displayType === 'error'
                          ? 'bg-red-950/20 border-red-800/40 text-red-200'
                          : 'bg-[#161b22] border-[#21262d] text-gray-300 hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] text-gray-500">{log.time}</span>
                      <div className="flex items-center gap-2">
                        {state.displayType === 'conflict' ? (
                          <AlertTriangle size={14} className="text-amber-400 shrink-0" />
                        ) : state.displayType === 'error' ? (
                          <AlertTriangle size={14} className="text-red-400 shrink-0" />
                        ) : state.displayType === 'info' && !state.resolved ? (
                          <Clock size={14} className="text-gray-400 shrink-0" />
                        ) : (
                          <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                        )}
                        <span className="font-sans font-medium text-xs">{log.message}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] font-sans">
                      {state.pendingIds.length > 0 && (
                        <button
                          onClick={onOpenConflictModal}
                          className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-bold border border-amber-500/40 text-[10px]"
                        >
                          Xử lý ngay
                        </button>
                      )}
                      {state.resolved && <span className="text-emerald-400">Đã xử lý</span>}
                      {log.details && (
                        <span className="text-gray-500 hidden sm:inline">{log.details}</span>
                      )}
                    </div>
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
