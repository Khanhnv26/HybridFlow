import React from 'react';
import { History, CheckCircle2, AlertTriangle, Info, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { ActivityEvent } from '../../types';

interface ActivityHistoryProps {
  events: ActivityEvent[];
  isOpen: boolean;
  onToggle: () => void;
}

export const ActivityHistory: React.FC<ActivityHistoryProps> = ({
  events,
  isOpen,
  onToggle,
}) => {
  return (
    <div className={`bg-[#111827] border-t border-[#1f2937] transition-all duration-300 flex flex-col z-20 shrink-0 ${
      isOpen ? 'h-64' : 'h-11'
    }`}>
      {/* Drawer Header */}
      <div 
        onClick={onToggle}
        className="h-11 px-6 bg-[#161b22] border-b border-[#1f2937] flex items-center justify-between text-xs cursor-pointer select-none hover:bg-[#1a202c] transition"
      >
        <div className="flex items-center gap-2.5">
          <History size={16} className="text-blue-400" />
          <span className="font-bold text-white tracking-wide">Nhật Ký Hoạt Động Tự Động (Lịch Sử Đồng Bộ)</span>
          <span className="text-gray-500">|</span>
          <span className="text-xs text-gray-400">{events.length} sự kiện gần nhất</span>
        </div>

        <div className="flex items-center gap-2 text-gray-400">
          <span className="text-[11px]">{isOpen ? 'Thu gọn' : 'Xem chi tiết'}</span>
          {isOpen ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
        </div>
      </div>

      {/* History Timeline */}
      {isOpen && (
        <div className="flex-1 p-4 overflow-y-auto space-y-2.5 text-xs">
          {events.length === 0 ? (
            <div className="text-gray-500 text-center py-6 italic">Chưa có sự kiện nào. Hãy bấm "Chạy thử ngay" để kiểm tra luồng.</div>
          ) : (
            events.map((evt) => (
              <div 
                key={evt.id} 
                className="p-3 rounded-xl bg-[#0b0f19] border border-[#1f2937] flex items-start justify-between gap-3 hover:border-gray-700 transition"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">
                    {evt.type === 'success' && <CheckCircle2 size={16} className="text-emerald-400" />}
                    {evt.type === 'warning' && <AlertTriangle size={16} className="text-amber-400" />}
                    {evt.type === 'info' && <Info size={16} className="text-blue-400" />}
                  </div>
                  <div>
                    <div className="font-semibold text-white">{evt.title}</div>
                    <p className="text-xs text-gray-400 mt-0.5">{evt.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-gray-500 text-[11px] shrink-0 font-mono">
                  <Clock size={12} />
                  <span>{evt.time}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
