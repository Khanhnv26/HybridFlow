import React, { useState } from 'react';
import { X, RefreshCw, Edit2 } from 'lucide-react';
import type { SheetDataResponse } from '../../types';
import { cellRange } from '../../services/workflow';

interface Props {
  isOpen: boolean; onClose: () => void; data: SheetDataResponse | null; isLoading: boolean;
  onRefresh: () => void; onUpdateCell: (range: string, value: string) => Promise<void>;
}
export const DataTableModal: React.FC<Props> = ({ isOpen, onClose, data, isLoading, onRefresh, onUpdateCell }) => {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  if (!isOpen) return null;
  const edit = async (rowIndex: number, colIndex: number) => {
    if (!data) return;
    const value = prompt(`Giá trị mới cho ${data.headers[colIndex]} (dòng ${rowIndex + 2}):`, data.rows[rowIndex][data.headers[colIndex]] ?? '');
    if (value === null) return;
    setPending(true); setError('');
    try { await onUpdateCell(cellRange(data.sheetName, colIndex, rowIndex), value); }
    catch (e) { const err = e as { response?: { data?: { message?: string } }; message?: string };
      setError(err.response?.data?.message || err.message || 'Không cập nhật được dữ liệu.'); }
    finally { setPending(false); }
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
    <div className="bg-[#161b22] border border-gray-700 rounded-2xl w-full max-w-6xl flex flex-col max-h-[85vh]">
      <div className="p-4 border-b border-gray-700 flex items-center justify-between gap-4">
        <div><h3 className="font-semibold">Dữ liệu Google Sheet</h3><p className="text-xs text-gray-400 mt-1">{data ? `${data.sheetName} · ${data.totalRows} dòng` : 'Chưa tải được dữ liệu'}</p></div>
        <div className="flex gap-3"><button disabled={isLoading || pending} onClick={onRefresh} aria-label="Tải lại dữ liệu"><RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} /></button>
          <button onClick={onClose} aria-label="Đóng"><X size={18} /></button></div>
      </div>
      {error && <p role="alert" className="p-3 text-red-300 text-sm">{error}</p>}
      <div className="overflow-auto p-4">
        {isLoading ? <p className="text-sm text-gray-400">Đang đọc dữ liệu từ Google Sheet...</p>
          : !data ? <p className="text-sm text-gray-400">Kết nối Google và kiểm tra cấu hình nguồn để tải dữ liệu.</p>
          : data.rows.length === 0 ? <p className="text-sm text-gray-400">Trang tính chưa có dòng dữ liệu.</p>
          : <table className="w-full text-left text-xs"><thead><tr className="border-b border-gray-700"><th className="p-3">Dòng</th>
              {data.headers.map((header, col) => <th key={`${col}-${header}`} className="p-3">{header}</th>)}</tr></thead>
            <tbody>{data.rows.map((row, rowIndex) => <tr key={rowIndex} className="border-b border-gray-800">
              <td className="p-3 text-gray-500">{rowIndex + 2}</td>
              {data.headers.map((header, colIndex) => <td key={colIndex} className="p-3"><div className="flex items-center gap-3">
                <span className="whitespace-pre-wrap">{row[header] ?? ''}</span><button disabled={pending || isLoading} onClick={() => void edit(rowIndex, colIndex)}
                  aria-label={`Sửa ${header} dòng ${rowIndex + 2}`} className="text-blue-400 disabled:opacity-40"><Edit2 size={12} /></button>
              </div></td>)}</tr>)}</tbody></table>}
      </div>
      <p className="p-4 text-xs text-gray-500 border-t border-gray-700">Các thay đổi ô được ghi vào Sheet. Chạy luồng để đồng bộ với Vault.</p>
    </div>
  </div>;
};
