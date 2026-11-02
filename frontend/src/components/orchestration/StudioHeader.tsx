import React, { useState } from 'react';
import { Play, RotateCcw, Table, Clock, Layers, MoreHorizontal } from 'lucide-react';

interface StudioHeaderProps {
  isRunning: boolean;
  onRunWorkflow: () => void;
  onResetLayout: () => void;
  onOpenTable: () => void;
  onConnectGoogle: () => void;
}

export const StudioHeader: React.FC<StudioHeaderProps> = ({
  isRunning, onRunWorkflow, onResetLayout, onOpenTable, onConnectGoogle,
}) => {
  const [isAutoActive, setIsAutoActive] = useState(true);
  const [scheduleInterval, setScheduleInterval] = useState('5m');

  return (
    <header className="relative z-30 shrink-0 border-b border-[#2d3748] bg-[#11141c] select-none">
      <div className="flex h-14 min-w-0 items-center gap-4 px-4 sm:gap-6 sm:px-6">
        <div className="flex shrink-0 items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-600">
            <Layers size={18} className="text-white" />
          </div>
          <span className="hidden text-sm font-extrabold tracking-wide text-white sm:inline">HybridFlow</span>
          <span className="hidden rounded border border-indigo-800 bg-indigo-950 px-1.5 text-[10px] font-bold text-indigo-300 lg:inline">STUDIO</span>
        </div>
        <div className="min-w-0 flex-1 border-l border-[#2d3748] pl-4 sm:pl-6">
          <p className="text-[10px] text-gray-500">Luồng điều phối</p>
          <h1 className="truncate text-xs font-semibold text-gray-200 sm:text-sm" title="Đồng bộ Đơn Hàng 2 Chiều (Google Sheets ↔ Kho Dữ Liệu)">
            Đồng bộ Đơn Hàng 2 Chiều <span className="font-normal text-gray-400">(Google Sheets ↔ Kho Dữ Liệu)</span>
          </h1>
        </div>
        <button type="button" onClick={onConnectGoogle} aria-label="Kết nối tài khoản Google" title="Kết nối tài khoản Google" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-emerald-700 bg-emerald-950/40 text-xs font-bold text-emerald-300 transition hover:bg-emerald-900/50">
          K
        </button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-[#212938] px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => setIsAutoActive(!isAutoActive)} aria-pressed={isAutoActive} className={`flex h-9 items-center gap-2 whitespace-nowrap rounded-lg border px-3 text-xs font-semibold transition ${isAutoActive ? 'border-emerald-700/60 bg-emerald-950/40 text-emerald-300' : 'border-gray-700 bg-gray-800/60 text-gray-400'}`}>
            <span className={`h-2 w-2 rounded-full ${isAutoActive ? 'bg-emerald-400' : 'bg-gray-500'}`} />
            Tự động: {isAutoActive ? 'Đang bật' : 'Đang tắt'}
          </button>
          <label className="flex h-9 items-center gap-2 rounded-lg border border-[#2d3748] bg-[#171b24] px-3 text-gray-400">
            <Clock size={14} className="shrink-0" />
            <select aria-label="Chu kỳ chạy tự động" value={scheduleInterval} onChange={(e) => setScheduleInterval(e.target.value)} className="bg-[#171b24] text-xs font-medium text-gray-200 outline-none">
              <option value="5m">Mỗi 5 phút</option>
              <option value="15m">Mỗi 15 phút</option>
              <option value="1h">Mỗi 1 giờ</option>
              <option value="instant">Khi có dữ liệu mới</option>
            </select>
          </label>
        </div>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <button type="button" onClick={onOpenTable} className="flex h-9 items-center gap-2 whitespace-nowrap rounded-lg border border-[#2d3748] bg-[#171b24] px-3 text-xs font-semibold text-gray-300 transition hover:bg-[#202532] hover:text-white">
            <Table size={14} className="shrink-0 text-emerald-400" /> Xem bảng tính
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
              <button type="button" onClick={(event) => { onResetLayout(); event.currentTarget.closest('details')?.removeAttribute('open'); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs text-gray-300 hover:bg-[#252d3b] hover:text-white">
                <RotateCcw size={14} /> Đặt lại bố cục
              </button>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
};
