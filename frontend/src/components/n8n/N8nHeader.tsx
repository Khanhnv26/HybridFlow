import React from 'react';
import { Play, RotateCcw, Table, ExternalLink, Sparkles, RefreshCw } from 'lucide-react';

interface N8nHeaderProps {
  isRunning: boolean;
  onRunWorkflow: () => void;
  onResetLayout: () => void;
  onOpenTable: () => void;
  onConnectGoogle: () => void;
}

export const N8nHeader: React.FC<N8nHeaderProps> = ({
  isRunning,
  onRunWorkflow,
  onResetLayout,
  onOpenTable,
  onConnectGoogle,
}) => {
  return (
    <header className="h-14 bg-[#161a22] border-b border-[#2d3748] px-5 flex items-center justify-between z-30 shrink-0 shadow-lg select-none">
      {/* Brand & Workflow Title */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-emerald-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <Sparkles size={16} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white tracking-wide">HybridFlow Workflow Studio</span>
              <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800 rounded-full font-mono">
                NO-CODE
              </span>
            </div>
            <span className="text-[11px] text-gray-400">Luồng tự động đồng bộ 2 chiều (Kéo thả trực quan)</span>
          </div>
        </div>

        {/* Live Indicators */}
        <div className="hidden md:flex items-center gap-2 pl-4 border-l border-[#2d3748]">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/40 border border-emerald-800/40 text-emerald-400 text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Google Sheets Connected</span>
          </div>
        </div>
      </div>

      {/* Control Actions */}
      <div className="flex items-center gap-2.5">
        <button
          onClick={onConnectGoogle}
          className="px-3 py-1.5 text-xs font-medium rounded-xl bg-[#212732] hover:bg-[#2d3748] text-gray-200 border border-[#2d3748] flex items-center gap-1.5 transition"
        >
          <ExternalLink size={13} />
          <span>vankhanhak54@gmail.com</span>
        </button>

        <button
          onClick={onOpenTable}
          className="px-3 py-1.5 text-xs font-medium rounded-xl bg-[#212732] hover:bg-[#2d3748] text-gray-200 border border-[#2d3748] flex items-center gap-1.5 transition"
        >
          <Table size={13} className="text-emerald-400" />
          <span>Bảng dữ liệu</span>
        </button>

        <button
          onClick={onResetLayout}
          className="p-1.5 text-xs font-medium rounded-xl bg-[#212732] hover:bg-[#2d3748] text-gray-300 border border-[#2d3748] transition"
          title="Đặt lại vị trí các node"
        >
          <RotateCcw size={14} />
        </button>

        <button
          onClick={onRunWorkflow}
          disabled={isRunning}
          className={`px-4 py-1.5 text-xs font-bold rounded-xl shadow-lg transition flex items-center gap-2 ${
            isRunning
              ? 'bg-emerald-800 text-emerald-200 cursor-not-allowed'
              : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/40 hover:shadow-emerald-600/30'
          }`}
        >
          {isRunning ? (
            <>
              <RefreshCw size={13} className="animate-spin" />
              <span>Đang chạy luồng...</span>
            </>
          ) : (
            <>
              <Play size={13} className="fill-current" />
              <span>Chạy thử luồng (Test Run)</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
};
