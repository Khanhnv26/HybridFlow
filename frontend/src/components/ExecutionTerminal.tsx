import React from 'react';
import { Terminal, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { ExecutionLog } from '../types';

interface ExecutionTerminalProps {
  logs: ExecutionLog[];
  isOpen: boolean;
  onToggle: () => void;
  onClearLogs: () => void;
}

export const ExecutionTerminal: React.FC<ExecutionTerminalProps> = ({
  logs,
  isOpen,
  onToggle,
  onClearLogs,
}) => {
  return (
    <div className={`bg-[#0d1117] border-t border-[#30363d] flex flex-col z-30 shrink-0 transition-all duration-300 ${
      isOpen ? 'h-48' : 'h-9'
    }`}>
      {/* Drawer Header */}
      <div className="h-9 px-4 bg-[#161b22] border-b border-[#30363d] flex items-center justify-between text-xs select-none">
        <div className="flex items-center gap-2.5 font-mono cursor-pointer" onClick={onToggle}>
          <Terminal size={14} className="text-emerald-400" />
          <span className="font-bold text-white tracking-wide">Live Execution Terminal</span>
          <span className="text-gray-600">|</span>
          <span className="text-gray-400 text-[11px]">{logs.length} events logged</span>
        </div>

        <div className="flex items-center gap-2">
          {isOpen && (
            <button
              onClick={onClearLogs}
              className="p-1 text-gray-400 hover:text-gray-200 text-xs transition"
              title="Clear terminal logs"
            >
              <Trash2 size={13} />
            </button>
          )}
          <button
            onClick={onToggle}
            className="p-1 text-gray-400 hover:text-white transition"
          >
            {isOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
      </div>

      {/* Terminal Body */}
      {isOpen && (
        <div className="flex-1 p-3 font-mono text-[11px] overflow-y-auto space-y-1 text-gray-300 select-text">
          {logs.length === 0 ? (
            <div className="text-gray-500 italic">No execution events yet. Click 'Test Run Workflow' to execute pipeline.</div>
          ) : (
            logs.map((log) => {
              let color = 'text-gray-300';
              if (log.level === 'SUCCESS') color = 'text-emerald-400';
              if (log.level === 'WARN') color = 'text-amber-400';
              if (log.level === 'ERROR') color = 'text-rose-400';

              return (
                <div key={log.id} className="flex items-start gap-2 leading-relaxed">
                  <span className="text-gray-500 shrink-0">[{log.timestamp}]</span>
                  <span className={`font-semibold shrink-0 ${
                    log.level === 'SUCCESS' ? 'text-emerald-400' :
                    log.level === 'WARN' ? 'text-amber-400' :
                    log.level === 'ERROR' ? 'text-rose-400' : 'text-blue-400'
                  }`}>
                    [{log.level}]
                  </span>
                  <span className={color}>{log.message}</span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
