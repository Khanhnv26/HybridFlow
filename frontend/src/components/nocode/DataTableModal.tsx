import { useExitMotion } from '../../hooks/useExitMotion';
import { errorMessage } from '../../services/errors';
import React, { useEffect, useRef, useState } from 'react';
import { X, RefreshCw, Edit2, Check, CheckCircle2 } from 'lucide-react';
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
  data: sourceData,
  isLoading,
  onRefresh,
  onUpdateCell,
  readError,
  sources,
  selectedSourceId,
  onSelectSource,
}) => {
  const motionRef = useExitMotion(isOpen);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<{ row: number; col: number; original: string; value: string; snapshot: SheetDataResponse } | null>(null);
  const [saved, setSaved] = useState('');
  const saving = useRef(false);
  const dialog = useRef<HTMLDivElement>(null);
  const editedCell = useRef<string | null>(null);
  const data = pending && editing ? editing.snapshot : sourceData;
  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => previous?.focus();
  }, [isOpen]);
  useEffect(() => {
    if (editing || pending || !editedCell.current) return;
    dialog.current?.querySelector<HTMLButtonElement>(`[data-edit-cell="${editedCell.current}"]`)?.focus();
    editedCell.current = null;
  }, [editing, pending]);
  useEffect(() => {
    if (saving.current) return;
    setEditing(null);
    setError('');
    setSaved('');
  }, [isOpen, selectedSourceId, sourceData?.spreadsheetId, sourceData?.sheetName]);
  if (!isOpen) return null;
  const source = sources.find((item) => item.id === selectedSourceId);
  const edit = (row: number, col: number) => {
    if (!data || pending || isLoading || readError || editing) return;
    const original = data.rows[row][data.headers[col]] ?? '';
    editedCell.current = `${row}:${col}`;
    setEditing({ row, col, original, value: original, snapshot: data });
    setError(''); setSaved('');
  };
  const cancel = () => {
    if (saving.current) return;
    setEditing(null); setError('');
  };
  const save = async () => {
    if (!data || !editing || saving.current || isLoading || readError) return;
    if (editing.value === editing.original) { cancel(); return; }
    saving.current = true;
    setPending(true);
    setError('');
    try {
      await onUpdateCell(cellRange(data.sheetName, editing.col, editing.row), editing.value);
      setSaved(`Đã lưu ${data.headers[editing.col]} · dòng ${editing.row + 2}`);
      setEditing(null);
    } catch (e) {
      setError(errorMessage(e, 'Không cập nhật được dữ liệu.'));
    } finally {
      saving.current = false;
      setPending(false);
    }
  };
  return (
    <div ref={motionRef} className="hf-motion-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="sheet-data-title" className="bg-surface border border-line rounded-2xl w-full hf-modal hf-modal--data flex flex-col sheet-data-dialog" onKeyDown={event => {
        if (event.key === 'Escape') {
          event.preventDefault(); event.stopPropagation();
          if (saving.current) return;
          if (editing) cancel(); else onClose();
        }
        if (event.key === 'Tab') {
          const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary') || []);
          const first = controls[0], last = controls[controls.length - 1];
          if (!first) { event.preventDefault(); return; }
          if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first.focus(); }
        }
      }}>
        <div className="shrink-0 p-4 border-b border-line flex items-center justify-between gap-4">
          <div>
            <h3 id="sheet-data-title" className="font-semibold">Dữ liệu Google Sheet</h3>
            <p className="text-xs text-secondary mt-1">
              {source
                ? `${source.spreadsheetTitle || 'Chưa lấy được tên file'} → ${source.sheetName || 'Chưa chọn trang tính'}`
                : 'Chưa có nguồn dữ liệu'}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              disabled={isLoading || pending || !!editing || !source}
              onClick={onRefresh}
              aria-label="Tải lại dữ liệu"
            >
              <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
            </button>
            <button disabled={pending || !!editing} onClick={onClose} aria-label="Đóng" title={editing ? 'Lưu hoặc hủy ô đang sửa trước khi đóng' : 'Đóng bảng dữ liệu'}>
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="p-4 border-b border-line flex flex-wrap items-center gap-3 text-sm">
          <label htmlFor="table-source">Nguồn đang xem</label>
          <select
            id="table-source"
            disabled={pending || !!editing || sources.length === 0}
            value={selectedSourceId}
            onChange={(event) => onSelectSource(event.target.value)}
            className="bg-surface border border-line rounded px-3 py-2 min-w-0 max-w-full"
          >
            {sources.map((item) => (
              <option key={item.id} value={item.id}>
                Nguồn {item.number} ·{' '}
                {item.spreadsheetTitle || `File …${item.spreadsheetId.slice(-8)}`} →{' '}
                {item.sheetName || 'Chưa chọn trang tính'}
              </option>
            ))}
          </select>
          {data && <span className="text-secondary">Đã đọc {data.totalRows} dòng</span>}
          {source?.spreadsheetId && (
            <details className="text-xs text-muted">
              <summary className="cursor-pointer">Chi tiết nguồn</summary>
              <p className="break-all">ID file: {source.spreadsheetId}</p>
            </details>
          )}
        </div>
        {readError && (
          <p role="alert" className="p-3 text-danger text-sm">
            Đọc thất bại: {readError}
          </p>
        )}
        {saved && <p role="status" className="flex items-center gap-2 px-4 py-2 text-success text-sm"><CheckCircle2 size={15} />{saved}</p>}
        {editing && <div className="sheet-edit-status" aria-live="polite"><span>Đang sửa <strong>{data?.headers[editing.col]}</strong> · dòng {editing.row + 2}</span><span>{pending ? 'Đang lưu vào trang tính…' : 'Enter để lưu · Esc để hủy · Shift+Enter để xuống dòng'}</span></div>}
        <div className="hf-modal-body overflow-auto p-4">
          {isLoading && !pending ? (
            <p className="text-sm text-secondary">Đang đọc dữ liệu từ Google Sheet...</p>
          ) : readError ? (
            <p className="text-sm text-secondary">
              Kiểm tra lỗi phía trên rồi bấm tải lại để thử lại nguồn này.
            </p>
          ) : !data ? (
            <p className="text-sm text-secondary">
              Kết nối Google và kiểm tra cấu hình nguồn để tải dữ liệu.
            </p>
          ) : data.rows.length === 0 ? (
            <p className="text-sm text-secondary">Trang tính chưa có dòng dữ liệu.</p>
          ) : (
            <table className="sheet-data-table w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line">
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
                  <tr key={rowIndex} className="border-b border-line">
                    <td className="p-3 text-muted">{rowIndex + 2}</td>
                    {data.headers.map((header, colIndex) => (
                      <td key={colIndex} className={`p-3 ${editing?.row === rowIndex && editing.col === colIndex ? 'sheet-cell-editing' : ''}`} onDoubleClick={() => edit(rowIndex, colIndex)}>
                        {editing?.row === rowIndex && editing.col === colIndex ? <div className="sheet-cell-editor">
                          <label className="sr-only" htmlFor="sheet-cell-value">Giá trị {header} dòng {rowIndex + 2}</label>
                          <textarea id="sheet-cell-value" autoFocus rows={2} value={editing.value} disabled={pending} aria-invalid={!!error} aria-describedby={error ? 'sheet-cell-error' : undefined}
                            onFocus={event => event.currentTarget.select()}
                            onChange={event => setEditing(current => current ? { ...current, value: event.target.value } : null)}
                            onKeyDown={event => {
                              if (event.nativeEvent?.isComposing) return;
                              if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void save(); }
                            }} />
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => void save()} disabled={pending} className="sheet-cell-save" aria-label={`Lưu ${header} dòng ${rowIndex + 2}`}>
                              {pending ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}{pending ? 'Đang lưu…' : 'Lưu ô'}
                            </button>
                            <button type="button" onClick={cancel} disabled={pending} className="sheet-cell-cancel" aria-label={`Hủy sửa ${header} dòng ${rowIndex + 2}`}>Hủy</button>
                          </div>
                          {error && <p id="sheet-cell-error" role="alert" className="text-xs text-danger">{error} Bạn có thể sửa lại hoặc bấm Lưu ô để thử lại.</p>}
                        </div> : <div className="flex items-center justify-between gap-3">
                          <span className="whitespace-pre-wrap break-words">{row[header] || <span className="text-muted">—</span>}</span>
                          <button
                            type="button"
                            data-edit-cell={`${rowIndex}:${colIndex}`}
                            disabled={pending || isLoading || !!readError || !!editing}
                            onClick={() => edit(rowIndex, colIndex)}
                            aria-label={`Sửa ${header} dòng ${rowIndex + 2}`}
                            className="sheet-cell-edit-button text-info disabled:opacity-40"
                          >
                            <Edit2 size={14} />
                          </button>
                        </div>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <p className="shrink-0 p-4 text-xs text-muted border-t border-line">
          <span className="block mb-1 text-secondary">Nhấp đúp vào ô hoặc bấm biểu tượng bút để sửa. Thay đổi chỉ được ghi khi bấm Lưu ô hoặc Enter.</span>
          Các thay đổi ô chỉ được ghi vào file và trang tính đang chọn. Chạy luồng để đồng bộ các
          nguồn.
        </p>
      </div>
    </div>
  );
};
