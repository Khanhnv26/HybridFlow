import React from 'react';
import { Play, RotateCcw, Table, Terminal, ExternalLink, ShieldCheck, Sparkles } from 'lucide-react';

interface HeaderProps {
  onRunWorkflow: () => void;
  onResetLayout: () => void;
  onOpenPreview: () => void;
  onToggleTerminal: () => void;
  onConnectGoogle: () => void;
  isExecuting: boolean;
  isTerminalOpen: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  onRunWorkflow,
  onResetLayout,
  onOpenPreview,
  onToggleTerminal,
  onConnectGoogle,
  isExecuting,
  isTerminalOpen,
}) => {
  return (
    <header className="h-14 bg-[#161b22] border-b border-[#30363d] px-4 flex items-center justify-between z-30 shrink-0 shadow-lg">
      {/* Brand & Title */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-emerald-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <Sparkles size={16} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white tracking-wide">HybridFlow</span>
              <span className="px-1.5 py-0.5 text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded font-mono">
                SPA PRO
              </span>
            </div>
            <span className="text-[11px] text-gray-400">Two-Way Google Sheets &amp; Postgres Automation</span>
          </div>
        </div>

        {/* Live Status Indicators */}
        <div className="hidden md:flex items-center gap-2 pl-4 border-l border-[#30363d]">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/40 border border-emerald-800/40 text-emerald-400 text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="font-medium">Google Connected</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-950/40 border border-blue-800/40 text-blue-400 text-xs">
            <ShieldCheck size={13} />
            <span>Telegram Bot Active</span>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2.5">
        <button
          onClick={onConnectGoogle}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[#21262d] hover:bg-[#30363d] text-gray-200 border border-[#30363d] flex items-center gap-1.5 transition"
          title="Re-authenticate or connect another Google account"
        >
          <ExternalLink size={13} />
          <span>OAuth Connect</span>
        </button>

        <button
          onClick={onOpenPreview}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[#21262d] hover:bg-[#30363d] text-gray-200 border border-[#30363d] flex items-center gap-1.5 transition"
        >
          <Table size={13} className="text-emerald-400" />
          <span>Data Preview</span>
        </button>

        <button
          onClick={onToggleTerminal}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition flex items-center gap-1.5 ${
            isTerminalOpen 
              ? 'bg-blue-600/20 border-blue-500 text-blue-300' 
              : 'bg-[#21262d] hover:bg-[#30363d] border-[#30363d] text-gray-200'
          }`}
        >
          <Terminal size={13} className="text-blue-400" />
          <span>Terminal</span>
        </button>

        <button
          onClick={onResetLayout}
          className="p-1.5 text-xs font-medium rounded-lg bg-[#21262d] hover:bg-[#30363d] text-gray-300 border border-[#30363d] transition"
          title="Reset canvas node positions"
        >
          <RotateCcw size={14} />
        </button>

        <button
          onClick={onRunWorkflow}
          disabled={isExecuting}
          className={`px-4 py-1.5 text-xs font-bold rounded-lg shadow-lg transition flex items-center gap-2 ${
            isExecuting
              ? 'bg-emerald-800 text-emerald-200 cursor-not-allowed'
              : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/40 hover:shadow-emerald-600/30'
          }`}
        >
          <Play size={13} className={isExecuting ? 'animate-spin' : 'fill-current'} />
          <span>{isExecuting ? 'Executing...' : 'Test Run Workflow'}</span>
        </button>
      </div>
    </header>
  );
};
