import React, { useState } from 'react';
import { X, Table, CheckCircle2, RefreshCw } from 'lucide-react';

interface SheetConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  spreadsheetId: string;
  sheetName: string;
  onSave: (newId: string, newTab: string) => void;
  onTestRead: () => void;
}

export const SheetConfigModal: React.FC<SheetConfigModalProps> = ({
  isOpen,
  onClose,
  spreadsheetId,
  sheetName,
  onSave,
  onTestRead,
}) => {
  const [id, setId] = useState(spreadsheetId);
  const [tab, setTab] = useState(sheetName);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#161b22] border border-[#30363d] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 bg-[#21262d] border-b border-[#30363d] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center justify-center">
              <Table size={16} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Cấu Hình Google Trang Tính</h3>
              <p className="text-xs text-gray-400">Chọn file và trang tính cần tự động đồng bộ</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-white">
            <X size={16} />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-5 space-y-4 text-xs">
          <div>
            <label className="block text-gray-300 font-medium mb-1">Mã Spreadsheet ID (Lấy từ thanh địa chỉ Google Sheet)</label>
            <input
              type="text"
              value={id}
              onChange={(e) => setId(e.target.value)}
              className="w-full p-2.5 rounded-xl bg-[#0d1117] border border-[#30363d] text-gray-200 font-mono text-xs focus:border-emerald-500 outline-none"
              placeholder="Ví dụ: 1CEPRhWigLS4pOL4K25bQaNUvumjn1YufxfXiQvNVwyg"
            />
            <p className="text-[11px] text-gray-500 mt-1">Đoạn mã nằm giữa /d/ và /edit trên link trình duyệt của bạn.</p>
          </div>

          <div>
            <label className="block text-gray-300 font-medium mb-1">Tên Tab Trang Tính (Sheet Tab Name)</label>
            <input
              type="text"
              value={tab}
              onChange={(e) => setTab(e.target.value)}
              className="w-full p-2.5 rounded-xl bg-[#0d1117] border border-[#30363d] text-emerald-400 font-medium text-xs focus:border-emerald-500 outline-none"
              placeholder="Ví dụ: Trang tinh1 hoặc Sheet1"
            />
            <p className="text-[11px] text-gray-500 mt-1">Gõ đúng tên tab dưới cùng của file Google Sheet (ví dụ: Trang tinh1).</p>
          </div>

          <div>
            <label className="block text-gray-300 font-medium mb-1">Tần suất kiểm tra tự động</label>
            <select className="w-full p-2.5 rounded-xl bg-[#0d1117] border border-[#30363d] text-gray-200 text-xs focus:border-emerald-500 outline-none">
              <option value="1m">Mỗi 1 phút (Khuyên dùng)</option>
              <option value="5s">Mỗi 5 giây (Thời gian thực)</option>
              <option value="5m">Mỗi 5 phút (Tiết kiệm tài nguyên)</option>
            </select>
          </div>

          {/* Test Status Banner */}
          <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-800/40 text-emerald-400 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <CheckCircle2 size={15} />
              Đã kết nối với Google API v4
            </span>
            <button
              onClick={onTestRead}
              type="button"
              className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium"
            >
              <RefreshCw size={12} />
              Kiểm tra đọc ngay
            </button>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-[#21262d] border-t border-[#30363d] flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-gray-300 hover:bg-[#30363d] transition"
          >
            Hủy
          </button>
          <button
            onClick={() => {
              onSave(id, tab);
              onClose();
            }}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg transition"
          >
            Lưu Cấu Hình
          </button>
        </div>
      </div>
    </div>
  );
};
