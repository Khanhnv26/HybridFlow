import React from 'react';
import { Play, Sparkles, Table, CheckCircle2, RefreshCw, ExternalLink } from 'lucide-react';

interface HeaderNoCodeProps {
  isRunning: boolean;
  isAutoSyncEnabled: boolean;
  onToggleAutoSync: () => void;
  onRunTest: () => void;
  onOpenTable: () => void;
  onConnectGoogle: () => void;
}

export const HeaderNoCode: React.FC<HeaderNoCodeProps> = ({
  isRunning,
  isAutoSyncEnabled,
  onToggleAutoSync,
  onRunTest,
  onOpenTable,
  onConnectGoogle,
}) => {
  return (
    <header className="h-16 bg-[#111827] border-b border-[#1f2937] px-6 flex items-center justify-between z-30 shrink-0 shadow-md">
      {/* Brand & Automation Name */}
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-emerald-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
          <Sparkles size={20} />
        </div>
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-base font-bold text-white tracking-tight">Đồng Bộ Đơn Hàng Tự Động</h1>
            <span className="px-2 py-0.5 text-xs font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800 rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              {isAutoSyncEnabled ? 'Đang chạy' : 'Tạm dừng'}
            </span>
          </div>
          <p className="text-xs text-gray-400">Google Trang tính ⟷ Cơ sở dữ liệu bán hàng &amp; Telegram</p>
        </div>
      </div>

      {/* Control Actions (Zapier Style) */}
      <div className="flex items-center gap-3">
        {/* Toggle Switch */}
        <div className="flex items-center gap-2 bg-[#0b0f19] px-3 py-1.5 rounded-xl border border-[#1f2937]">
          <span className="text-xs text-gray-300 font-medium">Tự động đồng bộ:</span>
          <button
            onClick={onToggleAutoSync}
            className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-300 ${
              isAutoSyncEnabled ? 'bg-emerald-600 justify-end' : 'bg-gray-700 justify-start'
            }`}
          >
            <div className="w-4 h-4 rounded-full bg-white shadow-md"></div>
          </button>
        </div>

        {/* View Data Table */}
        <button
          onClick={onOpenTable}
          className="px-3.5 py-2 text-xs font-medium rounded-xl bg-[#1f2937] hover:bg-[#374151] text-gray-200 border border-[#374151] flex items-center gap-2 transition shadow-sm"
        >
          <Table size={15} className="text-emerald-400" />
          <span>Bảng dữ liệu thực tế</span>
        </button>

        {/* Google OAuth Status */}
        <button
          onClick={onConnectGoogle}
          className="px-3 py-2 text-xs font-medium rounded-xl bg-[#1f2937] hover:bg-[#374151] text-gray-200 border border-[#374151] flex items-center gap-1.5 transition"
          title="Kết nối lại hoặc đổi tài khoản Google"
        >
          <CheckCircle2 size={14} className="text-blue-400" />
          <span>vankhanhak54@gmail.com</span>
          <ExternalLink size={12} className="text-gray-400" />
        </button>

        {/* Run Test Button */}
        <button
          onClick={onRunTest}
          disabled={isRunning}
          className={`px-4 py-2 text-xs font-bold rounded-xl shadow-lg transition flex items-center gap-2 ${
            isRunning
              ? 'bg-blue-800 text-blue-200 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/40'
          }`}
        >
          {isRunning ? (
            <>
              <RefreshCw size={14} className="animate-spin" />
              <span>Đang kiểm tra dữ liệu...</span>
            </>
          ) : (
            <>
              <Play size={14} className="fill-current" />
              <span>Chạy thử ngay</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
};
