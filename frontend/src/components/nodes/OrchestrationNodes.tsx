import React from 'react';
import { Handle, Position } from '@xyflow/react';
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
} from 'lucide-react';
import { ExcelIcon, TelegramIcon } from '../icons/BrandIcons';
import { OrchestrationNodeData } from '../../types';

export const SheetsTriggerNode: React.FC<any> = ({ data, selected }) => {
  const nodeData = data as OrchestrationNodeData;
  const status = nodeData.readStatus || 'idle';
  const statusText =
    status === 'loading'
      ? 'Đang đọc'
      : status === 'error'
        ? 'Đọc thất bại'
        : status === 'success'
          ? `Đã đọc ${nodeData.recordsCount ?? 0} dòng`
          : 'Chưa đọc';
  return (
    <div
      className={`w-[320px] bg-[#1a1f29] rounded-2xl border-2 shadow-xl select-none ${selected ? 'border-emerald-400 ring-4 ring-emerald-500/20' : 'border-[#2d3748]'}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!w-3.5 !h-3.5 !bg-[#111827] !border-2 !border-emerald-400"
      />
      <div className="p-3 bg-[#131720] rounded-t-2xl border-b border-[#2d3748] flex gap-2.5 items-center">
        <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
          <ExcelIcon size={26} />
        </div>
        <div className="min-w-0 flex-1">
          <span className="text-xs font-bold text-white block">
            Nguồn {nodeData.sourceNumber || 1}
          </span>
          <span className="text-[10px] text-gray-400">Google Trang Tính</span>
        </div>
        {status === 'loading' && <RefreshCw size={14} className="text-blue-400 animate-spin" />}
      </div>
      <div className="p-3 space-y-2 text-[11px]">
        <div className="flex justify-between gap-2">
          <span className="text-gray-400 shrink-0">File:</span>
          <span className="text-gray-100 text-right break-words" title={nodeData.spreadsheetTitle}>
            {nodeData.spreadsheetTitle ||
              (nodeData.spreadsheetId ? 'Chưa lấy được tên file' : 'Chưa chọn file')}
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-gray-400 shrink-0">Trang tính:</span>
          <span className="text-emerald-300 text-right break-words">
            {nodeData.sheetName || 'Chưa chọn trang tính'}
          </span>
        </div>
        <div className="flex justify-between gap-2 pt-2 border-t border-gray-700">
          <span className="text-gray-400">Dữ liệu:</span>
          <span
            role="status"
            className={`flex items-center gap-1 ${status === 'error' ? 'text-red-300' : status === 'success' ? 'text-emerald-300' : 'text-gray-400'}`}
          >
            {status === 'success' && <CheckCircle2 size={12} />}
            {status === 'error' && <AlertTriangle size={12} />}
            {statusText}
          </span>
        </div>
        {status === 'error' && (
          <p role="alert" className="text-red-300 break-words">
            {nodeData.readError || 'Không đọc được dữ liệu. Vui lòng thử lại.'}
          </p>
        )}
        {nodeData.readAt && (
          <p className="text-[10px] text-gray-500">
            Lần đọc thành công: {new Date(nodeData.readAt).toLocaleString('vi-VN')}
          </p>
        )}
        <div className="text-[10px] text-gray-500">
          Google: {nodeData.userAccount ? 'Đã kết nối' : 'Chưa kết nối'}
        </div>
        <div
          className="flex items-center justify-between gap-2 nodrag nopan"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            className="nodrag nopan text-xs text-blue-300 hover:text-blue-200"
            onClick={() => nodeData.onOpenData?.()}
          >
            Xem dữ liệu
          </button>
          <details className="text-[10px] text-gray-500 max-w-[160px]">
            <summary className="cursor-pointer">Chi tiết nguồn</summary>
            <p className="break-all mt-1">ID file: {nodeData.spreadsheetId || 'Chưa có'}</p>
          </details>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="!w-3.5 !h-3.5 !bg-[#111827] !border-2 !border-emerald-400"
      />
    </div>
  );
};

export const DiffEngineNode: React.FC<any> = ({ data, selected }) => {
  const nodeData = data as OrchestrationNodeData;
  return (
    <div
      className={`w-[320px] bg-[#1a1f29] rounded-2xl border-2 transition-all shadow-xl select-none ${
        selected
          ? 'border-purple-400 ring-4 ring-purple-500/20'
          : 'border-[#2d3748] hover:border-purple-500/60'
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!w-3.5 !h-3.5 !bg-[#111827] !border-2 !border-purple-400 hover:!scale-125"
      />
      <div className="p-3 bg-[#131720] rounded-t-2xl border-b border-[#2d3748] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/40 flex items-center justify-center">
            <Sparkles size={16} />
          </div>
          <div>
            <span className="text-xs font-bold text-white block">Bộ Não So Khớp 2 Chiều</span>
            <span className="text-[10px] text-gray-400">3-Way Diff chống ghi đè</span>
          </div>
        </div>
      </div>

      <div className="p-3 text-xs space-y-2">
        <div className="text-gray-400 text-[11px] flex justify-between items-center">
          <span>Khóa so sánh:</span>
          <span className="text-purple-300 font-mono font-bold bg-[#121620] px-2 py-0.5 rounded border border-[#2d3748]">
            {nodeData.uniqueKey || 'Chưa chọn khóa'}
          </span>
        </div>

        {/* Conflict Trigger Banner */}
        {nodeData.hasConflict && (
          <div className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-600/60 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-amber-300">
              <AlertTriangle size={14} className="shrink-0" />
              <span className="font-bold text-[11px]">
                Phát hiện {nodeData.conflictCount} xung đột
              </span>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                nodeData.onOpenConflict?.();
              }}
              className="nodrag nopan shrink-0 px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-[10px] transition"
            >
              Xem ngay
            </button>
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="clean"
        style={{ top: '40%' }}
        className="!w-3.5 !h-3.5 !bg-[#111827] !border-2 !border-emerald-400 hover:!scale-125"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="conflict"
        style={{ top: '72%' }}
        className="!w-3.5 !h-3.5 !bg-[#111827] !border-2 !border-amber-400 hover:!scale-125"
      />
    </div>
  );
};

export const StorageActionNode: React.FC<any> = ({ data, selected }) => {
  const nodeData = data as OrchestrationNodeData;
  return (
    <div
      className={`w-[300px] bg-[#1a1f29] rounded-2xl border-2 transition-all shadow-xl select-none ${
        selected
          ? 'border-blue-400 ring-4 ring-blue-500/20'
          : 'border-[#2d3748] hover:border-blue-500/60'
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!w-3.5 !h-3.5 !bg-[#111827] !border-2 !border-emerald-400 hover:!scale-125"
      />
      <div className="p-3 bg-[#131720] rounded-t-2xl border-b border-[#2d3748] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/40 flex items-center justify-center">
            <Database size={16} />
          </div>
          <div>
            <span className="text-xs font-bold text-white block">Kho Lưu Trữ An Toàn</span>
            <span className="text-[10px] text-gray-400">Ghi nhớ bản gốc (Vault)</span>
          </div>
        </div>
      </div>

      <div className="p-3 text-xs text-gray-400 space-y-1.5">
        <div className="flex justify-between items-center">
          <span>Vùng lưu trữ:</span>
          <span className="text-blue-300 font-mono font-medium bg-[#121620] px-2 py-0.5 rounded border border-[#2d3748] text-[11px]">
            {nodeData.tableName || 'Chưa chọn vùng'}
          </span>
        </div>
      </div>
    </div>
  );
};

export const TelegramActionNode: React.FC<any> = ({ data, selected }) => {
  const nodeData = data as OrchestrationNodeData;
  return (
    <div
      className={`w-[300px] bg-[#1a1f29] rounded-2xl border-2 transition-all shadow-xl select-none ${
        selected
          ? 'border-sky-400 ring-4 ring-sky-500/20'
          : 'border-[#2d3748] hover:border-sky-500/60'
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!w-3.5 !h-3.5 !bg-[#111827] !border-2 !border-amber-400 hover:!scale-125"
      />
      <div className="p-3 bg-[#131720] rounded-t-2xl border-b border-[#2d3748] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/40 flex items-center justify-center">
            <TelegramIcon size={26} />
          </div>
          <div>
            <span className="text-xs font-bold text-white block">Cảnh Báo Telegram</span>
            <span className="text-[10px] text-gray-400">Báo khi dữ liệu cần xử lý</span>
          </div>
        </div>
      </div>

      <div className="p-3 text-xs space-y-2">
        <div className="flex items-center justify-between gap-3 text-[11px]">
          <span className="text-gray-400">Bot:</span>
          <span className="text-sky-300 font-medium">
            {nodeData.botName || 'Thiết lập trong khối'}
          </span>
        </div>
        <div className="flex justify-between text-gray-400 text-[11px]">
          <span>Nơi nhận:</span>
          <span className="text-sky-300 font-medium truncate max-w-[165px]">
            {nodeData.telegramRecipientName ||
              (nodeData.chatId ? 'Đã có nơi nhận · mở để kiểm tra' : 'Chưa chọn nơi nhận')}
          </span>
        </div>
      </div>
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
          className="!w-3.5 !h-3.5 !bg-[#111827] !border-2 !border-blue-400 hover:!scale-125"
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
          className="!w-3.5 !h-3.5 !bg-[#111827] !border-2 !border-blue-400 hover:!scale-125"
        />
      )}
    </div>
  );
};
