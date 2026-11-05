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
import {
  OrchestrationNodeData,
  NodeExecutionState,
  RouterConditionItem,
  RouterMatchMode,
  RouterTriggerOn,
} from '../../types';

const cardClass = (selected: boolean, _accent: string, execution?: NodeExecutionState) =>
  `workflow-node workflow-node--${execution?.state || 'idle'} w-[260px] rounded-xl border bg-elevated shadow-lg select-none ${selected ? 'workflow-node--selected' : 'border-line hover:border-line'}`;
const handleClass = '!h-3 !w-3 !border-2 !bg-[#111827] transition-colors hover:!bg-subtle';
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

function NodeHeading({ icon, title, execution, hideIdle = false }: { icon: React.ReactNode; title: string; execution?: NodeExecutionState; hideIdle?: boolean }) {
  return (
    <>
    <div className="flex items-center gap-2 rounded-t-xl border-b border-line bg-surface px-3 py-2.5">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 truncate text-xs font-semibold text-primary" title={title}>
        {title}
      </span>
    </div>
    {(!hideIdle || execution && execution.state !== 'idle') && <div role="status" className={`workflow-node-status workflow-node-status--${execution?.state || 'idle'}`}>
      {execution?.state === 'running' ? <RefreshCw size={12} className="workflow-status-spinner" />
        : execution?.state === 'success' ? <CheckCircle2 size={12} />
        : ['warning', 'error'].includes(execution?.state || '') ? <AlertTriangle size={12} /> : <span className="workflow-idle-dot" />}
      <span title={execution?.label}>{execution?.label || 'Chưa chạy'}</span>
    </div>}
    </>
  );
}

export const SheetsTriggerNode: React.FC<any> = ({ id, data, selected }) => {
  const nodeData = data as OrchestrationNodeData;
  const refreshHandles = useHandleGeometry(id, String(!!nodeData.executionState && nodeData.executionState.state !== 'idle'));
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
    <div className={cardClass(selected, 'border-emerald-400 ring-2 ring-emerald-500/20', nodeData.executionState)}>
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className={`${handleClass} !border-emerald-400`}
      />
      <NodeHeading
        icon={<ExcelIcon size={24} />}
        title={`Sheet · Nguồn ${nodeData.sourceNumber || 1}`}
        hideIdle
        execution={nodeData.executionState}
      />
      <div className="space-y-1.5 px-3 py-2.5 text-xs">
        <p className="truncate font-medium text-primary" title={fileTitle}>
          {fileTitle}
        </p>
        <p
          className="truncate text-success"
          title={nodeData.sheetName || 'Chưa chọn trang tính'}
        >
          Trang tính: {nodeData.sheetName || 'Chưa chọn'}
        </p>
        {status === 'error' && (
          <p
            role="alert"
            title={nodeData.readError}
            className="line-clamp-2 break-words text-danger"
          >
            {nodeData.readError || 'Không đọc được dữ liệu. Vui lòng thử lại.'}
          </p>
        )}
        <details
          className="nodrag nopan text-xs text-muted"
          onClick={stopNodeClick}
          onToggle={refreshHandles}
        >
          <summary className="w-fit cursor-pointer hover:text-secondary">Chi tiết nguồn</summary>
          <div className="nowheel node-scrollbar mt-2 max-h-32 space-y-1 overflow-y-auto break-words text-secondary">
            <p>File: {fileTitle}</p>
            <p>Trang tính: {nodeData.sheetName || 'Chưa chọn'}</p>
            <p className="break-all">ID file: {nodeData.spreadsheetId || 'Chưa có'}</p>
            <p>Google: {nodeData.userAccount ? 'Đã kết nối' : 'Chưa kết nối'}</p>
            {nodeData.readAt && (
              <p>Lần đọc thành công: {new Date(nodeData.readAt).toLocaleString('vi-VN')}</p>
            )}
            {status === 'error' && <p className="text-danger">{nodeData.readError}</p>}
          </div>
        </details>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2 text-xs">
        <span
          role="status"
          className={`flex min-w-0 items-center gap-1 ${status === 'error' ? 'text-danger' : status === 'success' ? 'text-success' : status === 'loading' ? 'text-info' : 'text-secondary'}`}
        >
          {status === 'success' && <CheckCircle2 size={12} className="shrink-0" />}
          {status === 'error' && <AlertTriangle size={12} className="shrink-0" />}
          {status === 'loading' && <RefreshCw size={12} className="shrink-0 animate-spin" />}
          <span className="truncate" title={statusText}>
            {statusText}
          </span>
        </span>
        <button
          className="nodrag nopan shrink-0 text-info hover:text-info"
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
  const rightHint = legacy ? 'Kết nối với Kho lưu trữ trong luồng Sheet–Vault.' : 'Nối tới Rẽ Nhánh Điều Kiện';
  const refreshHandles = useHandleGeometry(
    id,
    `${legacy}:${nodeData.hasConflict}:${sheets.length}`,
  );
  return (
    <div className={cardClass(selected, 'border-purple-400 ring-2 ring-purple-500/20', nodeData.executionState)}>
      <Handle
        type="target"
        position={Position.Top}
        id="trigger"
        title="Nối từ khối Hẹn Giờ Định Kỳ phía trên để tự động kích hoạt luồng."
        aria-label="Cổng nhận kích hoạt hẹn giờ từ phía trên"
        className={`${handleClass} !border-emerald-400`}
      />
      <NodeHeading
        icon={<Sparkles size={18} className="text-violet" />}
        title="Điều phối & Đồng bộ"
        execution={nodeData.executionState}
      />
      <div className="space-y-1.5 px-3 py-2.5 text-xs">
        <div className="flex items-center justify-between gap-2 text-secondary">
          <span>Cột định danh (Khóa)</span>
          <code
            className="max-w-[130px] truncate rounded border border-line bg-subtle px-1.5 py-0.5 text-violet"
            title={nodeData.uniqueKey}
          >
            {nodeData.uniqueKey || 'Chưa chọn khóa'}
          </code>
        </div>
        <details
          className="nodrag nopan text-secondary"
          onClick={stopNodeClick}
          onToggle={refreshHandles}
        >
          <summary className="w-fit cursor-pointer hover:text-violet">
            Đã nối {pageCount} trang tính
            {unconfigured > 0 ? ` · ${unconfigured} chưa cấu hình` : ''}
          </summary>
          <div className="nowheel node-scrollbar mt-1.5 max-h-32 space-y-1 overflow-y-auto rounded-lg bg-subtle px-2.5 py-2">
            {sheets.length === 0 ? (
              <p className="text-muted">
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
                    className="truncate text-primary"
                    title={`Nguồn ${sheet.number} · ${sheetTitle} → ${tabTitle}`}
                  >
                    <span className="text-muted">Nguồn {sheet.number} · </span>
                    <span>{sheetTitle}</span> <span className="text-muted">→</span>{' '}
                    <span className="text-success">{tabTitle}</span>
                  </p>
                );
              })
            )}
          </div>
        </details>
        {nodeData.hasLegacySheetConnection && <p className="text-xs text-warning">Chuyển dây Sheet sang cổng ⇄ Đầu vào</p>}
        {nodeData.hasConflict && (
          <button
            onClick={(event) => {
              event.stopPropagation();
              nodeData.onOpenConflict?.();
            }}
            className="nodrag nopan flex w-full items-center justify-between gap-2 rounded-lg border border-amber-700/60 bg-warning-soft px-2 py-1 text-warning hover:bg-warning-soft"
          >
            <span className="flex items-center gap-1.5">
              <AlertTriangle size={12} /> {nodeData.conflictCount} xung đột
            </span>
            <span className="font-semibold">Xem ngay</span>
          </button>
        )}
      </div>
      <div className="relative flex h-8 items-center justify-between rounded-b-xl border-t border-line bg-elevated px-2.5 text-xs font-medium">
        <Handle
          type="target"
          position={Position.Left}
          id="in"
          title={sheetHint}
          aria-label="Kết nối Sheet bên trái"
          style={{ top: '50%' }}
          className={`${handleClass} !border-purple-400`}
        />
        <span className="text-violet" title={sheetHint}>
          ⇄ Đầu vào
        </span>
        <span
          className="flex items-center gap-1 text-warning"
          title="Nối với Telegram để gửi cảnh báo khi có xung đột."
        >
          <Zap size={11} /> Có xung đột
        </span>
        <Handle
          type="source"
          position={Position.Bottom}
          id="conflict"
          title="Nối xuống Telegram để gửi cảnh báo xung đột."
          aria-label="Cảnh báo xung đột tới Telegram"
          className={`${handleClass} !border-amber-400`}
        />
        <span className="text-success" title={rightHint}>
          Hành động ➔
        </span>
        <Handle
          type="source"
          position={Position.Right}
          id="clean"
          title={rightHint}
          aria-label={legacy ? 'Kết nối Kho lưu trữ' : 'Nối tới Rẽ Nhánh Điều Kiện'}
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
    <div className={cardClass(selected, 'border-blue-400 ring-2 ring-blue-500/20', nodeData.executionState)}>
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        title="Nhận dữ liệu từ khối So khớp."
        className={`${handleClass} !border-emerald-400`}
      />
      <NodeHeading icon={<Database size={20} className="text-info" />} title="Kho lưu trữ" execution={nodeData.executionState} />
      <div className="space-y-1 px-3 py-2.5 text-xs">
        <p className="text-muted">Vùng lưu trữ</p>
        <p className="truncate font-medium text-info" title={nodeData.tableName}>
          {nodeData.tableName || 'Chưa chọn vùng'}
        </p>
      </div>
    </div>
  );
};

export const RouterConditionNode: React.FC<any> = ({ id, data, selected }) => {
  const nodeData = data as OrchestrationNodeData;
  useHandleGeometry(id);
  const conditions = (nodeData.routerConditions || nodeData.conditions || []) as RouterConditionItem[];
  const triggerOn = (nodeData.routerTriggerOn || nodeData.triggerOn || 'CHANGED') as RouterTriggerOn;
  const matchMode = (nodeData.routerMatchMode || nodeData.matchMode || 'ALL') as RouterMatchMode;

  const triggerLabel =
    triggerOn === 'CREATED' ? 'KHI: Tạo mới' : triggerOn === 'UPDATED' ? 'KHI: Cập nhật' : 'KHI: Thay đổi';
  const modeLabel = matchMode === 'ANY' ? 'HOẶC (ANY)' : 'VÀ (ALL)';

  return (
    <div className={cardClass(selected, 'border-purple-400 ring-2 ring-purple-500/20', nodeData.executionState)}>
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        title="Nhận bản ghi sạch từ cổng 'Hành động ➔' của khối Điều phối & Đồng bộ."
        aria-label="Nhận kết quả sạch từ Điều phối & Đồng bộ"
        className={`${handleClass} !border-purple-400`}
      />
      <NodeHeading
        icon={<Split size={18} className="text-violet" />}
        title="Rẽ Nhánh Điều Kiện"
        execution={nodeData.executionState}
      />
      <div className="space-y-1.5 px-3 py-2.5 text-xs">
        <div className="flex items-center justify-between gap-1.5">
          <span className="rounded bg-violet-soft px-1.5 py-0.5 font-medium text-violet border border-purple-800/50">
            {triggerLabel}
          </span>
          <span className="rounded bg-elevated/80 px-1.5 py-0.5 text-secondary border border-line">
            {modeLabel}
          </span>
        </div>
        <p className="text-secondary">
          {conditions.length === 0 ? (
            <span className="text-warning/80">Chưa thiết lập điều kiện</span>
          ) : (
            <span>Đã cấu hình {conditions.length} điều kiện lọc</span>
          )}
        </p>
      </div>
      <div className="relative flex h-7 items-center justify-between rounded-b-xl border-t border-line bg-elevated px-2.5 text-xs font-medium">
        <span className="text-violet">Đầu vào ➔</span>
        <span className="text-success">Thỏa điều kiện ➔</span>
        <Handle
          type="source"
          position={Position.Right}
          id="out"
          title="Nối tới Telegram để gửi thông báo khi thỏa điều kiện."
          aria-label="Chuyển tiếp bản ghi thỏa mãn điều kiện"
          className={`${handleClass} !border-purple-400`}
        />
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
    <div className={cardClass(selected, 'border-sky-400 ring-2 ring-sky-500/20', nodeData.executionState)}>
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        title="Nối với cổng cảnh báo ở đáy khối So khớp hoặc cổng ra của khối Rẽ nhánh."
        aria-label="Nhận thông báo từ luồng"
        className={`${handleClass} !border-amber-400`}
      />
      <NodeHeading icon={<TelegramIcon size={24} />} title="Telegram" execution={nodeData.executionState} />
      <div className="space-y-1.5 px-3 py-2.5 text-xs">
        <p className="text-muted">Nơi nhận cảnh báo</p>
        <p className="text-secondary">Nhận từ {nodeData.incomingSourcesCount ?? 0} nhánh</p>
        <p
          className={`truncate font-medium ${nodeData.chatId ? 'text-info' : 'text-warning'}`}
          title={recipient}
        >
          {recipient}
        </p>
        {nodeData.recordTemplate && (
          <p className="text-xs text-secondary truncate" title={`Mẫu: ${nodeData.recordTemplate}`}>
            Mẫu: {nodeData.recordTemplate}
          </p>
        )}
        <details
          className="nodrag nopan text-xs text-muted"
          onClick={stopNodeClick}
          onToggle={refreshHandles}
        >
          <summary className="w-fit cursor-pointer hover:text-secondary">Chi tiết</summary>
          <div className="nowheel node-scrollbar mt-2 max-h-24 space-y-1 overflow-y-auto break-words text-secondary">
            <p>Nơi nhận: {recipient}</p>
            <p>Bot: {nodeData.botName || 'Chưa có thông tin bot'}</p>
            {nodeData.chatId && <p className="break-all">Chat ID: {nodeData.chatId}</p>}
            {nodeData.recordTemplate && <p className="break-all">Mẫu bản ghi: {nodeData.recordTemplate}</p>}
            {nodeData.conflictTemplate && <p className="break-all">Mẫu xung đột: {nodeData.conflictTemplate}</p>}
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
      : interval >= 60 && interval % 60 === 0
        ? `Mỗi ${Math.floor(interval / 60)} giờ`
        : `Mỗi ${interval} phút`;

  return (
    <div className={cardClass(selected, 'border-emerald-400 ring-2 ring-emerald-500/20', nodeData.executionState)}>
      <NodeHeading
        icon={<Clock size={18} className="text-success" />}
        title={nodeData.label || 'Hẹn Giờ Định Kỳ'}
        execution={nodeData.executionState}
      />
      <div className="space-y-1.5 px-3 py-2.5 text-xs">
        <div className="flex items-center justify-between gap-2 text-secondary">
          <span>Chu kỳ kích hoạt</span>
          <code
            className="truncate rounded border border-emerald-500/40 bg-success-soft px-2 py-0.5 text-xs font-semibold text-success"
            title={scheduleDescription}
          >
            {scheduleDescription}
          </code>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-secondary">Trạng thái</span>
          <span
            className={`flex items-center gap-1 font-medium ${
              isEnabled ? 'text-success' : 'text-secondary'
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                isEnabled ? 'bg-emerald-400' : 'bg-gray-500'
              }`}
            />
            {isEnabled ? 'Đang bật · chờ đến giờ' : 'Tạm dừng'}
          </span>
        </div>
        <p className="text-xs text-muted">Bấm khối để đổi chu kỳ phút / giờ</p>
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

export const DataTransformNode: React.FC<any> = ({ id, data, selected }) => {
  const nodeData = data as OrchestrationNodeData;
  const count = (nodeData.transforms || []).filter(config => config.rules.length).length;
  useHandleGeometry(id, String(count));
  return <div className={cardClass(selected, 'border-purple-400 ring-2 ring-purple-500/20', nodeData.executionState)}>
    <Handle type="target" position={Position.Left} id="in" className={handleClass + ' !border-purple-400'} />
    <NodeHeading icon={<Wand2 size={20} className="text-violet" />} title="Chuẩn Hóa Dữ Liệu" execution={nodeData.executionState} />
    <div className="space-y-2 px-3 py-3 text-xs">
      <p className="w-fit rounded-full bg-violet-soft px-2 py-1 text-violet">{count} cột · {nodeData.transformSourceCount || 0} Sheet</p>
      <p className="text-secondary">{nodeData.transformWriteBackCount ? 'Ghi sạch về ' + nodeData.transformWriteBackCount + ' Sheet' : 'Làm sạch trước khi so khớp'}</p>
      <p className="text-muted">Bấm để chọn cột và xem trước</p>
    </div>
    <Handle type="source" position={Position.Right} id="out" className={handleClass + ' !border-purple-400'} />
  </div>;
};

// Generic Node for Palette Drag & Drop additions
export const GenericOrchestrationNode: React.FC<any> = ({ data, selected }) => {
  const nodeData = data as OrchestrationNodeData;
  const isTrigger = nodeData.category === 'trigger';
  const isAction = nodeData.category === 'action';

  const getIcon = () => {
    if (nodeData.type === 'scheduleTrigger')
      return <Clock size={16} className="text-success" />;
    if (nodeData.type === 'webhookTrigger')
      return <Webhook size={16} className="text-success" />;
    if (nodeData.type === 'routerCondition') return <Split size={16} className="text-violet" />;
    if (nodeData.type === 'dataTransform') return <Wand2 size={16} className="text-violet" />;
    if (nodeData.type === 'sheetWriteAction')
      return <FileEdit size={16} className="text-info" />;
    return <Sparkles size={16} className="text-info" />;
  };

  return (
    <div
      className={`w-64 bg-elevated rounded-2xl border-2 transition-all shadow-xl select-none ${
        selected
          ? 'border-blue-400 ring-4 ring-blue-500/20'
          : 'border-line hover:border-line'
      }`}
    >
      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Left}
          id="in"
          className="!w-3.5 !h-3.5 !bg-[#111827] !border-2 !border-blue-400 transition-colors hover:!bg-subtle"
        />
      )}

      <div className="p-3 bg-surface rounded-t-2xl border-b border-line flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-elevated border border-line flex items-center justify-center">
            {getIcon()}
          </div>
          <div>
            <span className="text-xs font-bold text-primary block">{nodeData.label}</span>
            <span className="text-xs text-secondary">{nodeData.subtitle}</span>
          </div>
        </div>
      </div>

      <div className="p-3 text-xs text-secondary space-y-1">
        <div className="text-xs text-secondary">
          Click để điền các câu nói cấu hình tự nhiên.
        </div>
      </div>

      {!isAction && (
        <Handle
          type="source"
          position={Position.Right}
          id="out"
          className="!w-3.5 !h-3.5 !bg-[#111827] !border-2 !border-blue-400 transition-colors hover:!bg-subtle"
        />
      )}
    </div>
  );
};
