import React, { useState } from 'react';
import { X, AlertTriangle, CheckCircle2, Send, Table, Database, Sparkles } from 'lucide-react';

interface ConflictModalProps {
  isOpen: boolean;
  onClose: () => void;
  onResolve: (choice: 'SOURCE' | 'DESTINATION') => void;
  onSendTelegramTest: () => void;
}

export const ConflictModal: React.FC<ConflictModalProps> = ({
  isOpen,
  onClose,
  onResolve,
  onSendTelegramTest,
}) => {
  const [resolved, setResolved] = useState(false);
  const [chosenOption, setChosenOption] = useState<string | null>(null);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#161b22] border border-[#30363d] rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 bg-[#21262d] border-b border-[#30363d] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-950 text-amber-400 border border-amber-800 flex items-center justify-center">
              <AlertTriangle size={16} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Trung Tâm Xử Lý Lệch Dữ Liệu (Xung Đột 2 Chiều)</h3>
              <p className="text-xs text-gray-400">Đơn hàng bị chỉnh sửa cùng lúc ở cả 2 nguồn</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-white">
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 text-xs">
          {/* Situation Explanation */}
          <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-800/40 text-amber-300 leading-relaxed">
            <span className="font-bold">Tình huống phát hiện:</span> Đơn hàng <code className="bg-[#0b0f19] px-2 py-0.5 rounded text-white font-mono font-bold">ORD-003</code> bị thay đổi ở cả 2 nơi so với trạng thái ban đầu (<span className="font-semibold text-gray-300">NEW</span>). Để bảo vệ an toàn cho cửa hàng, hệ thống cần bạn chọn bên chính xác.
          </div>

          {/* 3-Column Comparison */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Base Snapshot */}
            <div className="p-3.5 rounded-xl bg-[#0d1117] border border-[#30363d] space-y-1">
              <span className="text-[11px] text-gray-500 font-medium block">1. Lúc ban đầu (Gốc)</span>
              <div className="text-sm font-bold text-gray-300 pt-1">NEW</div>
              <span className="text-[11px] text-gray-500">Chưa ai chỉnh sửa</span>
            </div>

            {/* Source Google Sheets */}
            <div className="p-3.5 rounded-xl bg-blue-950/30 border border-blue-800/50 space-y-1">
              <div className="flex items-center justify-between text-blue-400">
                <span className="text-[11px] font-bold">2. Google Trang Tính</span>
                <Table size={14} />
              </div>
              <div className="text-sm font-bold text-blue-200 pt-1">PROCESSING</div>
              <span className="text-[11px] text-blue-400/80">Nhân viên kho sửa</span>
            </div>

            {/* Target PostgreSQL */}
            <div className="p-3.5 rounded-xl bg-purple-950/30 border border-purple-800/50 space-y-1">
              <div className="flex items-center justify-between text-purple-400">
                <span className="text-[11px] font-bold">3. Hệ Thống Website</span>
                <Database size={14} />
              </div>
              <div className="text-sm font-bold text-purple-200 pt-1">CANCELLED</div>
              <span className="text-[11px] text-purple-400/80">Khách hủy trên web</span>
            </div>
          </div>

          {/* Decision Buttons */}
          {!resolved ? (
            <div className="space-y-3 pt-2">
              <div className="text-xs font-semibold text-white">Bạn muốn giữ trạng thái của bên nào?</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button
                  onClick={() => {
                    onResolve('SOURCE');
                    setResolved(true);
                    setChosenOption('Google Trang Tính (PROCESSING)');
                  }}
                  className="p-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-left transition shadow-lg flex items-center justify-between group"
                >
                  <div>
                    <div className="font-bold text-xs">Giữ dữ liệu Google Trang Tính</div>
                    <div className="text-[11px] text-blue-200 font-normal mt-0.5">Đặt đơn thành PROCESSING</div>
                  </div>
                  <CheckCircle2 size={18} className="text-blue-200 group-hover:scale-110 transition" />
                </button>

                <button
                  onClick={() => {
                    onResolve('DESTINATION');
                    setResolved(true);
                    setChosenOption('Hệ Thống Website (CANCELLED)');
                  }}
                  className="p-3.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-left transition shadow-lg flex items-center justify-between group"
                >
                  <div>
                    <div className="font-bold text-xs">Giữ dữ liệu Hệ Thống Web</div>
                    <div className="text-[11px] text-purple-200 font-normal mt-0.5">Đặt đơn thành CANCELLED</div>
                  </div>
                  <CheckCircle2 size={18} className="text-purple-200 group-hover:scale-110 transition" />
                </button>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800 text-emerald-300 space-y-2">
              <div className="flex items-center gap-2 font-bold text-sm text-emerald-400">
                <CheckCircle2 size={18} />
                Đã xử lý xong xung đột thành công!
              </div>
              <p className="text-xs text-gray-300">
                Bạn đã chọn: <strong className="text-white">{chosenOption}</strong>. Hệ thống đã tự động ghi đè và đồng bộ lại 100% khớp nhau giữa Google Sheet và Database.
              </p>
              <button
                onClick={() => setResolved(false)}
                className="text-xs text-emerald-400 underline hover:text-emerald-300"
              >
                Thử lại tình huống này
              </button>
            </div>
          )}

          {/* Telegram Alert Dispatcher */}
          <div className="pt-2 border-t border-[#30363d] flex items-center justify-between">
            <span className="text-gray-400 flex items-center gap-1.5">
              <Sparkles size={14} className="text-sky-400" />
              Đã tự động gửi thông báo về Telegram của bạn
            </span>
            <button
              onClick={onSendTelegramTest}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#21262d] hover:bg-[#30363d] text-sky-400 border border-[#30363d] flex items-center gap-1.5 transition"
            >
              <Send size={12} />
              Gửi lại tin nhắn điện thoại
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-[#21262d] border-t border-[#30363d] flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-semibold bg-[#161b22] hover:bg-[#30363d] text-white transition"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
