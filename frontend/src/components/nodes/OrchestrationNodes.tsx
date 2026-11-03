import React, { useLayoutEffect } from 'react';
import { Handle, Position, useUpdateNodeInternals } from '@xyflow/react';
import {
  Sparkles,
  Database,
  Clock,
  Webhook,
  Split,
  Wand2,
  FileEdit,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Zap,
} from 'lucide-react';
import { ExcelIcon, TelegramIcon } from '../icons/BrandIcons';
import { OrchestrationNodeData } from '../../types';

const cardClass = (selected: boolean, accent: string) =>
  `w-[280px] rounded-xl border bg-[#1a1f29] shadow-lg select-none ${selected ? accent : 'border-[#303b4b] hover:border-gray-500'}`;
const handleClass = '!h-3 !w-3 !border-2 !bg-[#111827] transition-colors hover:!bg-slate-700';
const stopNodeClick = (event: React.MouseEvent) => event.stopPropagation();

function useHandleGeometry(id?: string, layoutKey?: string) {
  const updateNodeInternals = useUpdateNodeInternals();
  useLayoutEffect(() => {
    if (id) updateNodeInternals(id);
  }, [id, layoutKey, updateNodeInternals]);
  return () => {
    if (id) updateNodeInternals(id);
  };
}

function NodeHeading({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 rounded-t-xl border-b border-[#293241] bg-[#141922] px-3 py-2.5">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 truncate text-xs font-semibold text-gray-100" title={title}>
        {title}
      </span>
    </div>
  );
}

export const SheetsTriggerNode: React.FC<any> = ({ id, data, selected }) => {
  const nodeData = data as OrchestrationNodeData;
  const refreshHandles = useHandleGeometry(id);
  const status = nodeData.readStatus || 'idle';
  const statusText =
    status === 'loading'
      ? 'Đang đọc'
      : status === 'error'
        ? 'Đọc thất bại'
        : status === 'success'
          ? `Đã đọc ${nodeData.recordsCount ?? 0} dòng`
          : 'Chưa đọc';
  const fileTitle =
    nodeData.spreadsheetTitle ||
    (nodeData.spreadsheetId ? 'Chưa lấy được tên file' : 'Chưa chọn file');
  return (
    <div className={cardClass(selected, 'border-emerald-400 ring-2 ring-emerald-500/20')}>
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className={`${handleClass} !border-emerald-400`}
      />
      <NodeHeading
        icon={<ExcelIcon size={24} />}
        title={`Sheet · Nguồn ${nodeData.sourceNumber || 1}`}
      />
      <div className="space-y-1.5 px-3 py-2.5 text-[11px]">
        <p className="truncate font-medium text-gray-100" title={fileTitle}>
          {fileTitle}
        </p>
        <p
          className="truncate text-emerald-300"
          title={nodeData.sheetName || 'Chưa chọn trang tính'}
        >
          Trang tính: {nodeData.sheetName || 'Chưa chọn'}
        </p>
        {status === 'error' && (
          <p
            role="alert"
            title={nodeData.readError}
            className="line-clamp-2 break-words text-red-300"
          >
            {nodeData.readError || 'Không đọc được dữ liệu. Vui lòng thử lại.'}
          </p>
        )}
        <details
          className="nodrag nopan text-[10px] text-gray-500"
          onClick={stopNodeClick}
          onToggle={refreshHandles}
        >
          <summary className="w-fit cursor-pointer hover:text-gray-300">Chi tiết nguồn</summary>
          <div className="nowheel node-scrollbar mt-2 max-h-32 space-y-1 overflow-y-auto break-words text-gray-400">
            <p>File: {fileTitle}</p>
            <p>Trang tính: {nodeData.sheetName || 'Chưa chọn'}</p>
            <p className="break-all">ID file: {nodeData.spreadsheetId || 'Chưa có'}</p>
            <p>Google: {nodeData.userAccount ? 'Đã kết nối' : 'Chưa kết nối'}</p>
            {nodeData.readAt && (
              <p>Lần đọc thành công: {new Date(nodeData.readAt).toLocaleString('vi-VN')}</p>
            )}
            {status === 'error' && <p className="text-red-300">{nodeData.readError}</p>}
          </div>
        </details>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-[#293241] px-3 py-2 text-[11px]">
        <span
          role="status"
          className={`flex min-w-0 items-center gap-1 ${status === 'error' ? 'text-red-300' : status === 'success' ? 'text-emerald-300' : status === 'loading' ? 'text-blue-300' : 'text-gray-400'}`}
        >
          {status === 'success' && <CheckCircle2 size={12} className="shrink-0" />}
          {status === 'error' && <AlertTriangle size={12} className="shrink-0" />}
          {status === 'loading' && <RefreshCw size={12} className="shrink-0 animate-spin" />}
          <span className="truncate" title={statusText}>
            {statusText}
          </span>
        </span>
        <button
          className="nodrag nopan shrink-0 text-blue-300 hover:text-blue-200"
          onClick={(event) => {
            event.stopPropagation();
            nodeData.onOpenData?.();
          }}
        >
          Xem dữ liệu
        </button>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className={`${handleClass} !border-emerald-400`}
      />
    </div>
  );
};

export const DiffEngineNode: React.FC<any> = ({ id, data, selected }) => {
  const nodeData = data as OrchestrationNodeData;
  const sheets = nodeData.connectedSheets || [];
  const configured = sheets.filter((sheet) => sheet.spreadsheetId.trim() && sheet.sheetName.trim());
  const pageCount = new Set(
    configured.map((sheet) => JSON.stringify([sheet.spreadsheetId, sheet.sheetName])),
  ).size;
  const unconfigured = sheets.length - configured.length;
  const legacy = nodeData.hasLegacyStorageConnection;
  const sheetHint = 'Nối với Google Sheet cần đồng bộ. Có thể nối nhiều khối Sheet vào cổng này.';
  const rightHint = legacy ? 'Kết nối với Kho lưu trữ trong luồng Sheet–Vault.' : sheetHint;
  const refreshHandles = useHandleGeometry(
    id,
    `${legacy}:${nodeData.hasConflict}:${sheets.length}`,
  );
  return (
    <div className={cardClass(selected, 'border-purple-400 ring-2 ring-purple-500/20')}>
      <Handle
        type="target"
        position={Position.Top}
        id="trigger"
        title="Nối từ khối Hẹn Giờ Định Kỳ phía trên để tự động kích hoạt luồng."
        aria-label="Cổng nhận kích hoạt hẹn giờ từ phía trên"
        className={`${handleClass} !border-emerald-400`}
      />
      <NodeHeading
        icon={<Sparkles size={18} className="text-purple-300" />}
        title="Điều phối & Đồng bộ"
      />
      <div className="space-y-1.5 px-3 py-2.5 text-[11px]">
        <div className="flex items-center justify-between gap-2 text-gray-400">
          <span>Cột định danh (Khóa)</span>
          <code
            className="max-w-[130px] truncate rounded border border-[#303b4b] bg-[#121620] px-1.5 py-0.5 text-purple-200"
            title={nodeData.uniqueKey}
          >
            {nodeData.uniqueKey || 'Chưa chọn khóa'}
          </code>
        </div>
        <details
          className="nodrag nopan text-gray-400"
          onClick={stopNodeClick}
          onToggle={refreshHandles}
        >
          <summary className="w-fit cursor-pointer hover:text-purple-300">
            Đã nối {pageCount} trang tính
            {unconfigured > 0 ? ` · ${unconfigured} chưa cấu hình` : ''}
          </summary>
          <div className="nowheel node-scrollbar mt-1.5 max-h-32 space-y-1 overflow-y-auto rounded-lg bg-[#121620] px-2.5 py-2">
            {sheets.length === 0 ? (
              <p className="text-gray-500">
                {legacy
                  ? 'Nối Sheet vào cổng bên trái để bắt đầu.'
                  : 'Nối Sheet vào một trong hai cổng Sheet để bắt đầu.'}
              </p>
            ) : (
              sheets.map((sheet) => {
                const sheetTitle =
                  sheet.spreadsheetTitle ||
                  (sheet.spreadsheetId
                    ? `File …${sheet.spreadsheetId.slice(-8)}`
                    : 'Chưa chọn file');
                const tabTitle = sheet.sheetName || 'Chưa chọn trang tính';
                return (
                  <p
                    key={sheet.nodeId}
                    className="truncate text-gray-200"
                    title={`Nguồn ${sheet.number} · ${sheetTitle} → ${tabTitle}`}
                  >
                    <span className="text-gray-500">Nguồn {sheet.number} · </span>
                    <span>{sheetTitle}</span> <span className="text-gray-500">→</span>{' '}
                    <span className="text-emerald-300">{tabTitle}</span>
                  </p>
                );
              })
            )}
          </div>
        </details>
        {nodeData.hasConflict && (
          <button
            onClick={(event) => {
              event.stopPropagation();
              nodeData.onOpenConflict?.();
            }}
            className="nodrag nopan flex w-full items-center justify-between gap-2 rounded-lg border border-amber-700/60 bg-amber-950/30 px-2 py-1 text-amber-300 hover:bg-amber-950/60"
          >
            <span className="flex items-center gap-1.5">
              <AlertTriangle size={12} /> {nodeData.conflictCount} xung đột
            </span>
            <span className="font-semibold">Xem ngay</span>
          </button>
        )}
      </div>
      <div className="relative flex h-8 items-center justify-between rounded-b-xl border-t border-[#293241] bg-[#151b25] px-2.5 text-[10px] font-medium">
        <Handle
          type="target"
          position={Position.Left}
          id="in"
          title={sheetHint}
          aria-label="Kết nối Sheet bên trái"
          style={{ top: '50%' }}
          className={`${handleClass} !border-purple-400`}
        />
        <span className="text-purple-200" title={sheetHint}>
          ⇄ Đầu vào
        </span>
        <span
          className="flex items-center gap-1 text-amber-200"
          title="Nối với Telegram để gửi cảnh báo khi có xung đột."
        >
          <Zap size={11} /> Báo động
        </span>
        <Handle
          type="source"
          position={Position.Bottom}
          id="conflict"
          title="Nối xuống Telegram để gửi cảnh báo xung đột."
          aria-label="Cảnh báo xung đột tới Telegram"
          className={`${handleClass} !border-amber-400`}
        />
        <span className="text-emerald-200" title={rightHint}>
          Hành động ➔
        </span>
        <Handle
          type="source"
          position={Position.Right}
          id="clean"
          title={rightHint}
          aria-label={legacy ? 'Kết nối Kho lưu trữ' : 'Kết nối mở rộng bên phải'}
          style={{ top: '50%' }}
          className={`${handleClass} !border-emerald-400`}
        />
      </div>
    </div>
  );
};

export const StorageActionNode: React.FC<any> = ({ data, selected }) => {
  const nodeData = data as OrchestrationNodeData;
  return (
    <div className={cardClass(selected, 'border-blue-400 ring-2 ring-blue-500/20')}>
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        title="Nhận dữ liệu từ khối So khớp."
        className={`${handleClass} !border-emerald-400`}
      />
      <NodeHeading icon={<Database size={20} className="text-blue-300" />} title="Kho lưu trữ" />
      <div className="space-y-1 px-3 py-2.5 text-[11px]">
        <p className="text-gray-500">Vùng lưu trữ</p>
        <p className="truncate font-medium text-blue-200" title={nodeData.tableName}>
          {nodeData.tableName || 'Chưa chọn vùng'}
        </p>
      </div>
    </div>
  );
};

export const TelegramActionNode: React.FC<any> = ({ id, data, selected }) => {
  const nodeData = data as OrchestrationNodeData;
  const refreshHandles = useHandleGeometry(id);
  const recipient =
    nodeData.telegramRecipientName ||
    (nodeData.chatId ? 'Đã có nơi nhận · mở để kiểm tra' : 'Chưa chọn nơi nhận');
  return (
    <div className={cardClass(selected, 'border-sky-400 ring-2 ring-sky-500/20')}>
      <Handle
        type="target"
        position={Position.Top}
        id="in"
        title="Nối với cổng cảnh báo ở đáy khối So khớp."
        aria-label="Nhận cảnh báo từ phía trên"
        className={`${handleClass} !border-amber-400`}
      />
      <NodeHeading icon={<TelegramIcon size={24} />} title="Telegram" />
      <div className="space-y-1.5 px-3 py-2.5 text-[11px]">
        <p className="text-gray-500">Nơi nhận cảnh báo</p>
        <p
          className={`truncate font-medium ${nodeData.chatId ? 'text-sky-200' : 'text-amber-300'}`}
          title={recipient}
        >
          {recipient}
        </p>
        <details
          className="nodrag nopan text-[10px] text-gray-500"
          onClick={stopNodeClick}
          onToggle={refreshHandles}
        >
          <summary className="w-fit cursor-pointer hover:text-gray-300">Chi tiết</summary>
          <div className="nowheel node-scrollbar mt-2 max-h-24 space-y-1 overflow-y-auto break-words text-gray-400">
            <p>Nơi nhận: {recipient}</p>
            <p>Bot: {nodeData.botName || 'Chưa có thông tin bot'}</p>
            {nodeData.chatId && <p className="break-all">Chat ID: {nodeData.chatId}</p>}
          </div>
        </details>
      </div>
    </div>
  );
};

export const ScheduleTriggerNode: React.FC<any> = ({ id, data, selected }) => {
  const nodeData = data as OrchestrationNodeData;
  useHandleGeometry(id);
  const isEnabled = nodeData.scheduleEnabled !== false;
  const interval = nodeData.scheduleIntervalMinutes || 5;
  const type = nodeData.scheduleType || 'interval';
  const time = nodeData.scheduleTime || '08:00';

  const scheduleDescription =
    type === 'daily'
      ? `${time} mỗi ngày`
      : interval >= 60
        ? `Mỗi ${Math.floor(interval / 60)} giờ`
        : `Mỗi ${interval} phút`;

  return (
    <div className={cardClass(selected, 'border-emerald-400 ring-2 ring-emerald-500/20')}>
      <NodeHeading
        icon={<Clock size={18} className="text-emerald-400" />}
        title={nodeData.label || 'Hẹn Giờ Định Kỳ'}
      />
      <div className="space-y-1.5 px-3 py-2.5 text-[11px]">
        <div className="flex items-center justify-between gap-2 text-gray-400">
          <span>Chu kỳ kích hoạt</span>
          <code
            className="truncate rounded border border-emerald-500/40 bg-emerald-950/40 px-2 py-0.5 text-xs font-semibold text-emerald-200"
            title={scheduleDescription}
          >
            {scheduleDescription}
          </code>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-gray-400">Trạng thái</span>
          <span
            className={`flex items-center gap-1 font-medium ${
              isEnabled ? 'text-emerald-300' : 'text-gray-400'
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                isEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'
              }`}
            />
            {isEnabled ? 'Đang kích hoạt' : 'Tạm dừng'}
          </span>
        </div>
        <p className="text-[10px] text-gray-500">Bấm khối để đổi chu kỳ phút / giờ</p>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        id="out"
        title="Nối thẳng xuống đỉnh khối Điều phối & Đồng bộ ở phía dưới."
        aria-label="Cổng xuất kích hoạt ở đáy"
        className={`${handleClass} !border-emerald-400`}
      />
    </div>
  );
};

// Generic Node for Palette Drag & Drop additions
export const GenericOrchestrationNode: React.FC<any> = ({ data, selected }) => {
  const nodeData = data as OrchestrationNodeData;
  const isTrigger = nodeData.category === 'trigger';
  const isAction = nodeData.category === 'action';

  const getIcon = () => {
    if (nodeData.type === 'scheduleTrigger')
      return <Clock size={16} className="text-emerald-400" />;
    if (nodeData.type === 'webhookTrigger')
      return <Webhook size={16} className="text-emerald-400" />;
    if (nodeData.type === 'routerCondition') return <Split size={16} className="text-purple-400" />;
    if (nodeData.type === 'dataTransform') return <Wand2 size={16} className="text-purple-400" />;
    if (nodeData.type === 'sheetWriteAction')
      return <FileEdit size={16} className="text-blue-400" />;
    return <Sparkles size={16} className="text-blue-400" />;
  };

  return (
    <div
      className={`w-64 bg-[#1a1f29] rounded-2xl border-2 transition-all shadow-xl select-none ${
        selected
          ? 'border-blue-400 ring-4 ring-blue-500/20'
          : 'border-[#2d3748] hover:border-gray-500'
      }`}
    >
      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Left}
          id="in"
          className="!w-3.5 !h-3.5 !bg-[#111827] !border-2 !border-blue-400 transition-colors hover:!bg-slate-700"
        />
      )}

      <div className="p-3 bg-[#131720] rounded-t-2xl border-b border-[#2d3748] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gray-800 border border-gray-700 flex items-center justify-center">
            {getIcon()}
          </div>
          <div>
            <span className="text-xs font-bold text-white block">{nodeData.label}</span>
            <span className="text-[10px] text-gray-400">{nodeData.subtitle}</span>
          </div>
        </div>
      </div>

      <div className="p-3 text-xs text-gray-400 space-y-1">
        <div className="text-[11px] text-gray-300">
          Click để điền các câu nói cấu hình tự nhiên.
        </div>
      </div>

      {!isAction && (
        <Handle
          type="source"
          position={Position.Right}
          id="out"
          className="!w-3.5 !h-3.5 !bg-[#111827] !border-2 !border-blue-400 transition-colors hover:!bg-slate-700"
        />
      )}
    </div>
  );
};
