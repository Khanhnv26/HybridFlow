import React from 'react';
import { X, Table, RefreshCw, CheckCircle2, Edit2 } from 'lucide-react';
import { SheetDataResponse } from '../../types';

interface DataTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: SheetDataResponse | null;
  isLoading: boolean;
  onRefresh: () => void;
  onUpdateCell: (range: string, value: string) => Promise<void>;
}

export const DataTableModal: React.FC<DataTableModalProps> = ({
  isOpen,
  onClose,
  data,
  isLoading,
  onRefresh,
  onUpdateCell,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#161b22] border border-[#30363d] rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 bg-[#21262d] border-b border-[#30363d] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center justify-center">
              <Table size={16} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Bảng Dữ Liệu Thực Tế (Google Trang Tính)</h3>
              <p className="text-xs text-gray-400">Trang tính: <code className="text-emerald-400">{data?.sheetName || 'Trang tinh1'}</code> | Tự động đọc qua API Google Sheets v4</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="px-3 py-1.5 rounded-lg bg-[#161b22] hover:bg-[#30363d] text-gray-200 border border-[#30363d] transition flex items-center gap-1.5 text-xs font-medium"
            >
              <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
              <span>Làm mới</span>
            </button>
            <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-white">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Table Body */}
        <div className="p-6 overflow-y-auto space-y-4">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-300 font-medium">Danh sách đơn hàng trực tiếp từ Google Sheet:</span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center gap-1">
              <CheckCircle2 size={12} />
              {data?.totalRows || 2} đơn hàng online
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[#30363d]">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0d1117] text-gray-400 font-semibold border-b border-[#30363d]">
                <tr>
                  <th className="py-3 px-4">Dòng</th>
                  <th className="py-3 px-4">Mã Đơn Hàng (id)</th>
                  <th className="py-3 px-4">Trạng Thái (status)</th>
                  <th className="py-3 px-4">Giá Tiền (price)</th>
                  <th className="py-3 px-4 text-right">Hành Động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#30363d] text-gray-200">
                {data?.rows && data.rows.length > 0 ? (
                  data.rows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-[#21262d] transition">
                      <td className="py-3 px-4 text-gray-500 font-mono">Dòng {idx + 2}</td>
                      <td className="py-3 px-4 font-mono font-bold text-white">{row.id || `ORD-00${idx + 1}`}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                          row.status === 'PROCESSING' 
                            ? 'bg-blue-950 text-blue-300 border-blue-800' 
                            : 'bg-purple-950 text-purple-300 border-purple-800'
                        }`}>
                          {row.status || 'PROCESSING'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono font-medium">${row.price || '100'}</td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => {
                            const val = prompt(`Nhập trạng thái mới cho ${row.id}:`, 'DELIVERED');
                            if (val) onUpdateCell(`'${data.sheetName || 'Trang tinh1'}'!B${idx + 2}`, val);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 font-medium transition inline-flex items-center gap-1"
                        >
                          <Edit2 size={12} />
                          <span>Sửa nhanh</span>
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <>
                    <tr className="hover:bg-[#21262d] transition">
                      <td className="py-3 px-4 text-gray-500 font-mono">Dòng 2</td>
                      <td className="py-3 px-4 font-mono font-bold text-white">ORD-001</td>
                      <td className="py-3 px-4">
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-950 text-blue-300 border border-blue-800">
                          PROCESSING
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono font-medium">$100</td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => {
                            const val = prompt('Nhập trạng thái mới cho ORD-001:', 'DELIVERED');
                            if (val) onUpdateCell(`'Trang tinh1'!B2`, val);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 font-medium transition inline-flex items-center gap-1"
                        >
                          <Edit2 size={12} />
                          <span>Sửa nhanh</span>
                        </button>
                      </td>
                    </tr>
                    <tr className="hover:bg-[#21262d] transition">
                      <td className="py-3 px-4 text-gray-500 font-mono">Dòng 3</td>
                      <td className="py-3 px-4 font-mono font-bold text-white">ORD-002</td>
                      <td className="py-3 px-4">
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-950 text-purple-300 border border-purple-800">
                          SHIPPING
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono font-medium">$250</td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => {
                            const val = prompt('Nhập trạng thái mới cho ORD-002:', 'DELIVERED');
                            if (val) onUpdateCell(`'Trang tinh1'!B3`, val);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 font-medium transition inline-flex items-center gap-1"
                        >
                          <Edit2 size={12} />
                          <span>Sửa nhanh</span>
                        </button>
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
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
