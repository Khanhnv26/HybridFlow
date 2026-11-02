import React from 'react';
import { ExcelIcon } from '../icons/BrandIcons';
import { Play, RotateCcw, Clock, Layers, MoreHorizontal } from 'lucide-react';

interface StudioHeaderProps {
  isRunning: boolean;
  onRunWorkflow: () => void;
  onResetLayout: () => void;
  onOpenTable: () => void;
  onConnectGoogle: () => void;
  connected: boolean;
  autoActive: boolean;
  onAutoChange: (active: boolean) => void;
  intervalMs: number;
  onIntervalChange: (interval: number) => void;
  onSaveWorkflow: () => void;
}

export const StudioHeader: React.FC<StudioHeaderProps> = ({
  isRunning, onRunWorkflow, onResetLayout, onOpenTable, onConnectGoogle,
  connected, autoActive: isAutoActive, onAutoChange, intervalMs, onIntervalChange, onSaveWorkflow,
}) => {

  return (
    <header className="relative z-30 shrink-0 border-b border-[#2d3748] bg-[#11141c] select-none">
      <div className="flex h-14 min-w-0 items-center gap-4 px-4 sm:gap-6 sm:px-6">
        <div className="flex shrink-0 items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-600">
            <Layers size={18} className="text-white" />
          </div>
          <span className="hidden text-sm font-extrabold tracking-wide text-white sm:inline">HybridFlow</span>
        </div>
        <div className="min-w-0 flex-1 border-l border-[#2d3748] pl-4 sm:pl-6">
          <p className="text-[10px] text-gray-500">Luồng điều phối</p>
          <h1 className="truncate text-xs font-semibold text-gray-200 sm:text-sm" title="Đồng bộ Đơn Hàng 2 Chiều (Google Sheets ↔ Kho Dữ Liệu)">
            Đồng bộ dữ liệu 2 chiều <span className="font-normal text-gray-400">(Google Sheets ↔ Vault)</span>
          </h1>
        </div>
        <button type="button" onClick={onConnectGoogle} aria-label="Kết nối tài khoản Google" title="Kết nối tài khoản Google" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-emerald-700 bg-emerald-950/40 text-xs font-bold text-emerald-300 transition hover:bg-emerald-900/50">
          {connected ? 'G' : '+'}
        </button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-[#212938] px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={!connected} onClick={() => onAutoChange(!isAutoActive)} aria-pressed={isAutoActive} className={`flex h-9 items-center gap-2 whitespace-nowrap rounded-lg border px-3 text-xs font-semibold transition ${isAutoActive ? 'border-emerald-700/60 bg-emerald-950/40 text-emerald-300' : 'border-gray-700 bg-gray-800/60 text-gray-400'}`}>
            <span className={`h-2 w-2 rounded-full ${isAutoActive ? 'bg-emerald-400' : 'bg-gray-500'}`} />
            Tự động khi mở trang: {isAutoActive ? 'Bật' : 'Tắt'}
          </button>
          <label className="flex h-9 items-center gap-2 rounded-lg border border-[#2d3748] bg-[#171b24] px-3 text-gray-400">
            <Clock size={14} className="shrink-0" />
            <select aria-label="Chu kỳ chạy tự động" value={intervalMs} onChange={(e) => onIntervalChange(Number(e.target.value))} className="bg-[#171b24] text-xs font-medium text-gray-200 outline-none">
              <option value={300000}>Mỗi 5 phút</option>
              <option value={900000}>Mỗi 15 phút</option>
              <option value={3600000}>Mỗi 1 giờ</option>
            </select>
          </label>
        </div>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <button disabled={isRunning} onClick={onSaveWorkflow} className="h-9 px-3 rounded-lg border border-gray-700 text-xs">Lưu cấu hình</button>
          <button type="button" onClick={onOpenTable} className="flex h-9 items-center gap-2 whitespace-nowrap rounded-lg border border-[#2d3748] bg-[#171b24] px-3 text-xs font-semibold text-gray-300 transition hover:bg-[#202532] hover:text-white">
            <ExcelIcon size={20} className="shrink-0" /> Xem bảng tính
          </button>
          <button type="button" onClick={onRunWorkflow} disabled={isRunning} className="flex h-9 items-center gap-2 whitespace-nowrap rounded-lg bg-indigo-600 px-4 text-xs font-bold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50">
            <Play size={13} className="shrink-0 fill-current" />
            {isRunning ? 'Đang chạy...' : 'Chạy thử luồng'}
          </button>
          <details className="group relative shrink-0">
            <summary aria-label="Thao tác khác" title="Thao tác khác" className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-lg border border-[#2d3748] text-gray-400 hover:bg-[#202532] hover:text-white [&::-webkit-details-marker]:hidden">
              <MoreHorizontal size={18} />
            </summary>
            <div className="absolute right-0 top-full z-50 mt-2 w-52 rounded-xl border border-[#2d3748] bg-[#171b24] p-1.5">
              <button type="button" disabled={isRunning} onClick={(event) => { onResetLayout(); event.currentTarget.closest('details')?.removeAttribute('open'); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs text-gray-300 hover:bg-[#252d3b] hover:text-white">
                <RotateCcw size={14} /> Đặt lại bố cục
              </button>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
};
