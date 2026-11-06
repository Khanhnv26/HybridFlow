import React from 'react';
import { AccountMenu } from './AccountMenu';
import { WorkflowSwitcher } from '../workspace/WorkflowSwitcher';
import { ExcelIcon } from '../icons/BrandIcons';
import {
  Play,
  RotateCcw,
  Clock,
  ArrowUpRight,
  MoreHorizontal,
  Shield,
  Save,
} from 'lucide-react';
import { ThemeToggle } from '../ThemeToggle';
import type { Me, WorkspaceRole, StudioNavigation } from '../../types';

interface StudioHeaderProps {
  user?: Me;
  workspaceRole?: WorkspaceRole;
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
  navigation?: StudioNavigation;
  workflowEnabled?: boolean;
  onToggleWorkflowEnabled?: () => void;
  isTogglingWorkflow?: boolean;
}

export const StudioHeader: React.FC<StudioHeaderProps> = ({
  isRunning,
  onRunWorkflow,
  onResetLayout,
  onOpenTable,
  onConnectGoogle,
  onManageConnections,
  connected,
  autoActive: isAutoActive,
  onAutoChange,
  intervalMs,
  onIntervalChange,
  onSaveWorkflow,
  navigation,
  user,
  workspaceRole,
  workflowEnabled,
  onToggleWorkflowEnabled,
  isTogglingWorkflow,
}) => {
  return (
    <header className="studio-header relative z-50 shrink-0 border-b border-line bg-surface flex items-center justify-between select-none">
      {/* Cụm trái: Logo Brand + Breadcrumbs điều hướng 3 tầng */}
      <div className="studio-header-navigation flex items-center gap-3 min-w-0">
        {/* Brand Logo */}
        <div className="flex items-center gap-2 pr-2 sm:pr-3 border-r border-line shrink-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg studio-brand-mark text-on-accent">
            <ArrowUpRight size={23} />
          </div>
          <span className="font-bold text-sm tracking-tight text-primary hidden md:inline">
            HybridFlow
          </span>
        </div>

        {/* Breadcrumb Navigation hoặc Fallback Title */}
        {navigation ? (
          <WorkflowSwitcher navigation={navigation} />
        ) : (
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold text-primary">Trình chỉnh sửa luồng</h1>
            <p className="text-xs text-secondary">Thiết kế · Kết nối · Đồng bộ</p>
          </div>
        )}
      </div>

      {/* Cụm phải: Controls & Primary Actions */}
      <div className="studio-actions flex items-center shrink-0">
        {/* Auto Sync Popover */}
        <details className="relative">
          <summary
            className="toolbar-button list-none cursor-pointer [&::-webkit-details-marker]:hidden"
            aria-label="Cài đặt chạy tự động"
            title="Cài đặt chu kỳ chạy tự động"
          >
            <Clock size={14} className={isAutoActive ? 'text-emerald-400' : 'text-secondary'} />
            <span className="hidden xl:inline">Tự động:</span>
            <span className={isAutoActive ? 'text-success font-medium' : 'text-secondary'}>
              {isAutoActive ? 'Bật' : 'Tắt'}
            </span>
          </summary>
          <div className="toolbar-popover space-y-3">
            <p className="text-sm font-semibold text-primary">Lịch chạy tự động</p>
            <p className="text-xs text-secondary">Chỉ hoạt động khi trang này đang mở.</p>
            <button
              type="button"
              disabled={!connected}
              onClick={() => onAutoChange(!isAutoActive)}
              aria-pressed={isAutoActive}
              className="toolbar-button w-full justify-between disabled:opacity-50"
            >
              Tự động khi mở trang{' '}
              <span className={isAutoActive ? 'text-success font-bold' : 'text-secondary'}>
                {isAutoActive ? 'Bật' : 'Tắt'}
              </span>
            </button>
            <label className="flex items-center justify-between gap-2 text-xs text-secondary">
              Chu kỳ
              <select
                aria-label="Chu kỳ chạy tự động"
                value={intervalMs}
                onChange={(e) => onIntervalChange(Number(e.target.value))}
                className="rounded-md border border-line bg-elevated p-2 text-primary focus:outline-none"
              >
                <option value={300000}>Mỗi 5 phút</option>
                <option value={900000}>Mỗi 15 phút</option>
                <option value={3600000}>Mỗi 1 giờ</option>
              </select>
            </label>
            {!connected && (
              <p className="text-xs text-warning">Kết nối nguồn Google để bật lịch chạy.</p>
            )}
          </div>
        </details>

        {/* View Data Table Button (Vẫn dùng đúng ExcelIcon chuẩn BrandIcons) */}
        <button
          type="button"
          onClick={onOpenTable}
          aria-label="Xem bảng tính"
          className="toolbar-button"
          title="Xem và sửa trực tiếp dữ liệu bảng tính"
        >
          <ExcelIcon size={18} />
          <span className="hidden lg:inline">Bảng tính</span>
        </button>

        {/* Toggle Workflow Status Button */}
        {onToggleWorkflowEnabled && (
          <button
            type="button"
            disabled={isRunning || isTogglingWorkflow}
            onClick={onToggleWorkflowEnabled}
            aria-label={workflowEnabled ? 'Tắt workflow' : 'Bật workflow'}
            className={`toolbar-button transition-colors ${
              workflowEnabled
                ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20'
                : 'text-secondary border-line bg-elevated/40 hover:text-primary'
            } disabled:opacity-50`}
            title={
              workflowEnabled
                ? 'Workflow đang bật. Nhấp để tắt (tạm dừng).'
                : 'Workflow đang tắt. Nhấp để bật luồng.'
            }
          >
            <span
              className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                workflowEnabled
                  ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]'
                  : 'bg-zinc-400'
              }`}
            />
            <span className="hidden xl:inline">Luồng:</span>
            <span className={workflowEnabled ? 'text-emerald-400 font-semibold' : 'text-secondary font-medium'}>
              {isTogglingWorkflow ? 'Đang đổi…' : workflowEnabled ? 'Bật' : 'Tắt'}
            </span>
          </button>
        )}

        {/* Save Workflow Button */}
        <button
          type="button"
          disabled={isRunning}
          onClick={onSaveWorkflow}
          aria-label="Lưu cấu hình luồng"
          className="toolbar-button disabled:opacity-50"
          title="Lưu cấu hình luồng lên máy chủ"
        >
          <Save size={14} />
          <span className="hidden xl:inline">Lưu</span>
        </button>

        {/* Primary Action: Run Workflow */}
        <button
          type="button"
          onClick={onRunWorkflow}
          disabled={isRunning}
          title="Chạy thử luồng với cấu hình hiện tại"
          className="studio-header-run flex h-9 items-center gap-2 whitespace-nowrap rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 font-semibold text-on-accent transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Play size={13} className="fill-current shrink-0" />
          <span className="hidden sm:inline">{isRunning ? 'Đang chạy...' : 'Chạy thử luồng'}</span>
          <span className="sm:hidden">{isRunning ? 'Đang chạy…' : 'Chạy thử'}</span>
        </button>

        {/* Theme Toggle Button */}
        <ThemeToggle className="toolbar-button !px-2.5" />

        {/* More Actions Menu */}
        <details className="relative shrink-0">
          <summary
            aria-label="Thao tác khác"
            title="Thao tác khác"
            className="toolbar-button list-none cursor-pointer [&::-webkit-details-marker]:hidden"
          >
            <MoreHorizontal size={17} />
          </summary>
          <div className="toolbar-popover w-52 space-y-1">
            {onManageConnections && (
              <button
                type="button"
                onClick={(event) => {
                  onManageConnections();
                  event.currentTarget.closest('details')?.removeAttribute('open');
                }}
                className="toolbar-menu-item"
              >
                <Shield size={14} className="text-blue-400" />
                <span>Quản lý kết nối</span>
              </button>
            )}
            <button
              type="button"
              onClick={(event) => {
                onConnectGoogle();
                event.currentTarget.closest('details')?.removeAttribute('open');
              }}
              className="toolbar-menu-item"
            >
              <span className="font-bold text-success text-xs">G</span>
              <span>{connected ? 'Kết nối thêm Google' : 'Kết nối Google'}</span>
            </button>
            <button
              type="button"
              disabled={isRunning}
              onClick={(event) => {
                onResetLayout();
                event.currentTarget.closest('details')?.removeAttribute('open');
              }}
              className="toolbar-menu-item disabled:opacity-50"
            >
              <RotateCcw size={14} />
              <span>Sắp xếp bố cục</span>
            </button>

          </div>
        </details>
        <AccountMenu user={user} workspaceRole={workspaceRole || navigation?.workspaceRole}
          workspaceName={navigation?.workspaces.find(workspace => workspace.id === navigation.selectedWorkspaceId)?.name}
          onLogout={navigation?.onLogout} />
      </div>
    </header>
  );
};
