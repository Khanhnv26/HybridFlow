import React, { useState } from 'react';
import { X, RefreshCw, Edit2 } from 'lucide-react';
import type { SheetDataResponse } from '../../types';
import { cellRange } from '../../services/workflow';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  data: SheetDataResponse | null;
  isLoading: boolean;
  readError?: string;
  sources: {
    id: string;
    number: number;
    spreadsheetId: string;
    spreadsheetTitle?: string;
    sheetName: string;
  }[];
  selectedSourceId: string;
  onSelectSource: (nodeId: string) => void;
  onRefresh: () => void;
  onUpdateCell: (range: string, value: string) => Promise<void>;
}
export const DataTableModal: React.FC<Props> = ({
  isOpen,
  onClose,
  data,
  isLoading,
  onRefresh,
  onUpdateCell,
  readError,
  sources,
  selectedSourceId,
  onSelectSource,
}) => {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  if (!isOpen) return null;
  const source = sources.find((item) => item.id === selectedSourceId);
  const edit = async (rowIndex: number, colIndex: number) => {
    if (!data) return;
    const value = prompt(
      `Giá trị mới cho ${data.headers[colIndex]} (dòng ${rowIndex + 2}):`,
      data.rows[rowIndex][data.headers[colIndex]] ?? '',
    );
    if (value === null) return;
    setPending(true);
    setError('');
    try {
      await onUpdateCell(cellRange(data.sheetName, colIndex, rowIndex), value);
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } }; message?: string };
      setError(err.response?.data?.message || err.message || 'Không cập nhật được dữ liệu.');
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="bg-[#161b22] border border-gray-700 rounded-2xl w-full hf-modal hf-modal--data flex flex-col ">
        <div className="shrink-0 p-4 border-b border-gray-700 flex items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold">Dữ liệu Google Sheet</h3>
            <p className="text-xs text-gray-400 mt-1">
              {source
                ? `${source.spreadsheetTitle || 'Chưa lấy được tên file'} → ${source.sheetName || 'Chưa chọn trang tính'}`
                : 'Chưa có nguồn dữ liệu'}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              disabled={isLoading || pending || !source}
              onClick={onRefresh}
              aria-label="Tải lại dữ liệu"
            >
              <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
            </button>
            <button disabled={pending} onClick={onClose} aria-label="Đóng">
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="p-4 border-b border-gray-700 flex flex-wrap items-center gap-3 text-sm">
          <label htmlFor="table-source">Nguồn đang xem</label>
          <select
            id="table-source"
            disabled={pending || sources.length === 0}
            value={selectedSourceId}
            onChange={(event) => onSelectSource(event.target.value)}
            className="bg-gray-900 border border-gray-700 rounded px-3 py-2 min-w-0 max-w-full"
          >
            {sources.map((item) => (
              <option key={item.id} value={item.id}>
                Nguồn {item.number} ·{' '}
                {item.spreadsheetTitle || `File …${item.spreadsheetId.slice(-8)}`} →{' '}
                {item.sheetName || 'Chưa chọn trang tính'}
              </option>
            ))}
          </select>
          {data && <span className="text-gray-400">Đã đọc {data.totalRows} dòng</span>}
          {source?.spreadsheetId && (
            <details className="text-xs text-gray-500">
              <summary className="cursor-pointer">Chi tiết nguồn</summary>
              <p className="break-all">ID file: {source.spreadsheetId}</p>
            </details>
          )}
        </div>
        {readError && (
          <p role="alert" className="p-3 text-red-300 text-sm">
            Đọc thất bại: {readError}
          </p>
        )}
        {error && (
          <p role="alert" className="p-3 text-red-300 text-sm">
            {error}
          </p>
        )}
        <div className="hf-modal-body overflow-auto p-4">
          {isLoading ? (
            <p className="text-sm text-gray-400">Đang đọc dữ liệu từ Google Sheet...</p>
          ) : readError ? (
            <p className="text-sm text-gray-400">
              Kiểm tra lỗi phía trên rồi bấm tải lại để thử lại nguồn này.
            </p>
          ) : !data ? (
            <p className="text-sm text-gray-400">
              Kết nối Google và kiểm tra cấu hình nguồn để tải dữ liệu.
            </p>
          ) : data.rows.length === 0 ? (
            <p className="text-sm text-gray-400">Trang tính chưa có dòng dữ liệu.</p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="p-3">Dòng</th>
                  {data.headers.map((header, col) => (
                    <th key={`${col}-${header}`} className="p-3">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-b border-gray-800">
                    <td className="p-3 text-gray-500">{rowIndex + 2}</td>
                    {data.headers.map((header, colIndex) => (
                      <td key={colIndex} className="p-3">
                        <div className="flex items-center gap-3">
                          <span className="whitespace-pre-wrap">{row[header] ?? ''}</span>
                          <button
                            disabled={pending || isLoading || !!readError}
                            onClick={() => void edit(rowIndex, colIndex)}
                            aria-label={`Sửa ${header} dòng ${rowIndex + 2}`}
                            className="text-blue-400 disabled:opacity-40"
                          >
                            <Edit2 size={12} />
                          </button>
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <p className="shrink-0 p-4 text-xs text-gray-500 border-t border-gray-700">
          Các thay đổi ô chỉ được ghi vào file và trang tính đang chọn. Chạy luồng để đồng bộ các
          nguồn.
        </p>
      </div>
    </div>
  );
};
