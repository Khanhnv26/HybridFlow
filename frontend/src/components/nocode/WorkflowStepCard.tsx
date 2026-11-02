import React from 'react';
import { Table, Sparkles, Database, Send, CheckCircle2, ChevronRight, Edit3 } from 'lucide-react';

interface WorkflowStepsProps {
  sheetName: string;
  totalRecords: number;
  onOpenSheetConfig: () => void;
  onOpenConflictCard: () => void;
}

export const WorkflowSteps: React.FC<WorkflowStepsProps> = ({
  sheetName,
  totalRecords,
  onOpenSheetConfig,
  onOpenConflictCard,
}) => {
  return (
    <div className="max-w-4xl mx-auto space-y-6 py-4">

      {/* ================= STEP 1: TRIGGER ================= */}
      <div className="relative group">
        <div className="p-6 rounded-2xl bg-[#111827] border border-[#1f2937] hover:border-emerald-500/50 transition-all shadow-xl space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-emerald-950/70 text-emerald-400 border border-emerald-800/60 flex items-center justify-center shadow-lg shadow-emerald-950/50">
                <Table size={24} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">Bước 1: Nguồn kích hoạt</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                    KHI CÓ THAY ĐỔI
                  </span>
                </div>
                <h3 className="text-base font-bold text-white mt-0.5">Google Trang Tính (Google Sheets)</h3>
              </div>
            </div>
            <button
              onClick={onOpenSheetConfig}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1f2937] hover:bg-[#374151] text-gray-200 border border-[#374151] flex items-center gap-1.5 transition"
            >
              <Edit3 size={13} />
              <span>Chỉnh sửa</span>
            </button>
          </div>

          {/* Description */}
          <p className="text-xs text-gray-400 leading-relaxed">
            Hệ thống tự động lắng nghe và đọc dữ liệu mỗi khi bạn thêm đơn hàng mới hoặc chỉnh sửa giá, trạng thái trên Google Sheet.
          </p>

          {/* Configuration Summary Pills */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-[#1f2937] text-xs">
            <div className="p-2.5 rounded-xl bg-[#0b0f19] border border-[#1f2937]">
              <span className="text-[11px] text-gray-500 block">Tài khoản kết nối</span>
              <span className="font-medium text-gray-200 flex items-center gap-1.5 mt-0.5">
                <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
                <span className="truncate">vankhanhak54@gmail.com</span>
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-[#0b0f19] border border-[#1f2937]">
              <span className="text-[11px] text-gray-500 block">Trang tính đang theo dõi</span>
              <span className="font-medium text-emerald-400 font-mono mt-0.5 block truncate">
                {sheetName || 'Trang tinh1'}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-[#0b0f19] border border-[#1f2937]">
              <span className="text-[11px] text-gray-500 block">Dữ liệu hiện tại</span>
              <span className="font-medium text-blue-300 mt-0.5 block">
                {totalRecords} đơn hàng online
              </span>
            </div>
          </div>
        </div>

        {/* Down Connecting Line */}
        <div className="w-0.5 h-8 bg-gradient-to-b from-emerald-500 to-purple-500 mx-auto my-1"></div>
      </div>

      {/* ================= STEP 2: SMART DIFF ENGINE ================= */}
      <div className="relative group">
        <div className="p-6 rounded-2xl bg-[#111827] border border-[#1f2937] hover:border-purple-500/50 transition-all shadow-xl space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-purple-950/70 text-purple-400 border border-purple-800/60 flex items-center justify-center shadow-lg shadow-purple-950/50">
                <Sparkles size={24} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-purple-400">Bước 2: Kiểm tra thông minh</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-950 text-purple-400 border border-purple-800">
                    TỰ ĐỘNG SO KHỚP 2 CHIỀU
                  </span>
                </div>
                <h3 className="text-base font-bold text-white mt-0.5">Bộ Lọc So Khớp &amp; Chống Ghi Đè Nhầm</h3>
              </div>
            </div>
            <button
              onClick={onOpenConflictCard}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 flex items-center gap-1.5 transition"
            >
              <span>Xem xung đột mẫu</span>
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Description */}
          <p className="text-xs text-gray-400 leading-relaxed">
            Hệ thống đối chiếu dữ liệu giữa Google Sheet và Hệ thống lưu trữ. Nếu cả 2 nơi cùng sửa một đơn hàng cùng lúc, hệ thống sẽ bảo vệ dữ liệu, không tự ý ghi đè mà gửi câu hỏi cho bạn quyết định.
          </p>

          {/* Logic Branches Display */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-[#1f2937] text-xs">
            <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-800/40 space-y-1">
              <div className="flex items-center gap-2 text-emerald-400 font-bold">
                <CheckCircle2 size={14} />
                <span>Nhánh 1: Dữ liệu hợp lệ (Không lệch)</span>
              </div>
              <p className="text-[11px] text-gray-400">
                Tự động lưu và cập nhật ngay lập tức vào Cơ sở dữ liệu bán hàng.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-800/40 space-y-1">
              <div className="flex items-center gap-2 text-amber-400 font-bold">
                <Send size={14} />
                <span>Nhánh 2: Phát hiện lệch dữ liệu (Xung đột)</span>
              </div>
              <p className="text-[11px] text-gray-400">
                Lập tức gửi tin nhắn về điện thoại qua Telegram để bạn bấm chọn bên đúng.
              </p>
            </div>
          </div>
        </div>

        {/* Down Connecting Line */}
        <div className="w-0.5 h-8 bg-gradient-to-b from-purple-500 to-blue-500 mx-auto my-1"></div>
      </div>

      {/* ================= STEP 3: ACTIONS (TWO DESTINATIONS) ================= */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Action 3A: Database */}
        <div className="p-5 rounded-2xl bg-[#111827] border border-[#1f2937] hover:border-blue-500/50 transition-all shadow-xl space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-950/70 text-blue-400 border border-blue-800/60 flex items-center justify-center shadow-md">
              <Database size={20} />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-400">Hành động 3A: Lưu trữ</span>
              <h4 className="text-sm font-bold text-white">Kho Dữ Liệu Bán Hàng (Database)</h4>
            </div>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            Lưu đơn hàng vào cơ sở dữ liệu an toàn để phục vụ in hóa đơn, xuất kho và xem báo cáo doanh thu.
          </p>
          <div className="pt-2 border-t border-[#1f2937] flex items-center justify-between text-xs text-gray-400">
            <span>Bảng lưu trữ: <code className="text-blue-300 font-mono">orders</code></span>
            <span className="text-emerald-400 font-medium">Tự động 100%</span>
          </div>
        </div>

        {/* Action 3B: Telegram Alert */}
        <div className="p-5 rounded-2xl bg-[#111827] border border-[#1f2937] hover:border-sky-500/50 transition-all shadow-xl space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-950/70 text-sky-400 border border-sky-800/60 flex items-center justify-center shadow-md">
              <Send size={20} />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-sky-400">Hành động 3B: Báo động</span>
              <h4 className="text-sm font-bold text-white">Tin Nhắn Telegram (@HybridFlowBot)</h4>
            </div>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            Bắn thông báo trực tiếp về app Telegram trên điện thoại của bạn ngay khi có đơn hàng bị thay đổi bất thường.
          </p>
          <div className="pt-2 border-t border-[#1f2937] flex items-center justify-between text-xs text-gray-400">
            <span>Điện thoại nhận: <code className="text-sky-300 font-mono">Chat ID 8706234310</code></span>
            <span className="text-sky-400 font-medium">Tức thì ~0.5s</span>
          </div>
        </div>

      </div>

    </div>
  );
};
