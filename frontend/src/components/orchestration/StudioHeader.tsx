import React from 'react';
import { ExcelIcon } from '../icons/BrandIcons';
import { Play, RotateCcw, Clock, Layers, MoreHorizontal, Shield, Save } from 'lucide-react';

interface StudioHeaderProps {
  isRunning: boolean;
  onRunWorkflow: () => void;
  onResetLayout: () => void;
  onOpenTable: () => void;
  onConnectGoogle: () => void;
  onManageConnections?: () => void;
  connected: boolean;
  autoActive: boolean;
  onAutoChange: (active: boolean) => void;
  intervalMs: number;
  onIntervalChange: (interval: number) => void;
  onSaveWorkflow: () => void;
}

export const StudioHeader: React.FC<StudioHeaderProps> = ({
  isRunning, onRunWorkflow, onResetLayout, onOpenTable, onConnectGoogle, onManageConnections,
  connected, autoActive: isAutoActive, onAutoChange, intervalMs, onIntervalChange, onSaveWorkflow,
}) => {

  return (
    <header className="studio-toolbar relative z-30 shrink-0 border-b border-line bg-surface select-none">
      <div className="min-w-0 flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-on-accent"><Layers size={17} /></span>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold text-primary">Trình chỉnh sửa luồng</h1>
          <p className="text-xs text-secondary">Thiết kế · Kết nối · Đồng bộ</p>
        </div>
      </div>
      <div className="studio-actions flex items-center gap-2">
        <details className="relative">
          <summary className="toolbar-button list-none cursor-pointer [&::-webkit-details-marker]:hidden" aria-label="Cài đặt chạy tự động">
            <Clock size={15} /><span>Tự động: {isAutoActive ? 'Bật' : 'Tắt'}</span>
          </summary>
          <div className="toolbar-popover space-y-3">
            <p className="text-sm font-semibold text-primary">Lịch chạy tự động</p>
            <p className="text-xs text-secondary">Chỉ hoạt động khi trang này đang mở.</p>
            <button type="button" disabled={!connected} onClick={() => onAutoChange(!isAutoActive)} aria-pressed={isAutoActive} className="toolbar-button w-full justify-between disabled:opacity-50">
              Tự động khi mở trang <span className={isAutoActive ? 'text-success' : 'text-secondary'}>{isAutoActive ? 'Bật' : 'Tắt'}</span>
            </button>
            <label className="flex items-center justify-between gap-2 text-xs text-secondary">Chu kỳ
              <select aria-label="Chu kỳ chạy tự động" value={intervalMs} onChange={e => onIntervalChange(Number(e.target.value))} className="rounded-md border border-line bg-elevated p-2 text-primary">
                <option value={300000}>Mỗi 5 phút</option><option value={900000}>Mỗi 15 phút</option><option value={3600000}>Mỗi 1 giờ</option>
              </select>
            </label>
            {!connected && <p className="text-xs text-warning">Kết nối nguồn Google để bật lịch chạy.</p>}
          </div>
        </details>
        <button type="button" onClick={onOpenTable} className="toolbar-button" title="Xem bảng tính"><ExcelIcon size={18} /><span className="hidden lg:inline">Bảng tính</span></button>
        <button type="button" disabled={isRunning} onClick={onSaveWorkflow} className="toolbar-button disabled:opacity-50"><Save size={15} /><span>Lưu cấu hình</span></button>
        <button type="button" onClick={onRunWorkflow} disabled={isRunning} title="Chạy luồng với cấu hình hiện tại; có thể ghi dữ liệu và gửi thông báo" className="flex h-9 items-center gap-2 whitespace-nowrap rounded-lg bg-indigo-600 px-4 text-xs font-semibold text-on-accent hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50">
          <Play size={14} className="fill-current" />{isRunning ? 'Đang chạy...' : 'Chạy thử luồng'}
        </button>
        <details className="relative shrink-0">
          <summary aria-label="Thao tác khác" title="Thao tác khác" className="toolbar-button list-none cursor-pointer [&::-webkit-details-marker]:hidden"><MoreHorizontal size={18} /></summary>
          <div className="toolbar-popover space-y-1">
            {onManageConnections && <button type="button" onClick={event => { onManageConnections(); event.currentTarget.closest('details')?.removeAttribute('open'); }} className="toolbar-menu-item"><Shield size={15} /> Quản lý kết nối</button>}
            <button type="button" onClick={event => { onConnectGoogle(); event.currentTarget.closest('details')?.removeAttribute('open'); }} className="toolbar-menu-item"><span className="font-bold text-success">G</span>{connected ? 'Kết nối thêm Google' : 'Kết nối Google'}</button>
            <button type="button" disabled={isRunning} onClick={event => { onResetLayout(); event.currentTarget.closest('details')?.removeAttribute('open'); }} className="toolbar-menu-item disabled:opacity-50"><RotateCcw size={15} /> Sắp xếp bố cục</button>
          </div>
        </details>
      </div>
    </header>
  );
};
