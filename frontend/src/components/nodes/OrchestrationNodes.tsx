import React from 'react';
import { Handle, Position } from '@xyflow/react';
import {
  Table,
  Sparkles,
  Database,
  Send,
  Clock,
  Webhook,
  Split,
  Wand2,
  FileEdit,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { OrchestrationNodeData } from '../../types';

export const SheetsTriggerNode: React.FC<any> = ({ data, selected }) => {
  const nodeData = data as OrchestrationNodeData;
  return (
    <div
      className={`w-[300px] bg-[#1a1f29] rounded-2xl border-2 transition-all shadow-xl select-none ${
        selected ? 'border-emerald-400 ring-4 ring-emerald-500/20' : 'border-[#2d3748] hover:border-emerald-500/60'
      }`}
    >
      <div className="p-3 bg-[#131720] rounded-t-2xl border-b border-[#2d3748] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center">
            <Table size={16} />
          </div>
          <div>
            <span className="text-xs font-bold text-white block">Google Trang Tính</span>
            <span className="text-[10px] text-gray-400">Nguồn: Lắng nghe thay đổi</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {nodeData.isRunning ? (
            <RefreshCw size={13} className="text-emerald-400 animate-spin" />
          ) : (
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Sẵn sàng" />
          )}
        </div>
      </div>

      <div className="p-3 text-xs space-y-2">
        {/* Connected account chip */}
        <div className="px-2 py-1 rounded-lg bg-emerald-950/40 border border-emerald-800/50 flex items-center justify-between gap-3 text-[11px]">
          <span className="min-w-0 text-emerald-300 font-medium truncate">
            {nodeData.userAccount || 'Chưa kết nối Google'}
          </span>
          <span className="text-emerald-400 font-bold text-[10px] shrink-0">{nodeData.userAccount ? 'Đã nhận token' : 'Cần đăng nhập'}</span>
        </div>

        <div className="space-y-1 text-gray-400 text-[11px]">
          <div className="flex justify-between">
            <span>Trang tính:</span>
            <span className="text-gray-200 font-mono font-medium truncate max-w-[120px]">
              {nodeData.sheetName || 'Chưa chọn tab'}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Dữ liệu đọc:</span>
            <span className="text-gray-200 font-medium flex items-center gap-1">
              <CheckCircle2 size={12} className="text-emerald-400" />
              {nodeData.recordsCount === undefined ? 'Chưa đọc dữ liệu' : `${nodeData.recordsCount} dòng`}
            </span>
          </div>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="!w-3.5 !h-3.5 !bg-[#111827] !border-2 !border-emerald-400 hover:!scale-125"
      />
    </div>
  );
};

export const DiffEngineNode: React.FC<any> = ({ data, selected }) => {
  const nodeData = data as OrchestrationNodeData;
  return (
    <div
      className={`w-[320px] bg-[#1a1f29] rounded-2xl border-2 transition-all shadow-xl select-none ${
        selected ? 'border-purple-400 ring-4 ring-purple-500/20' : 'border-[#2d3748] hover:border-purple-500/60'
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
              <span className="font-bold text-[11px]">Phát hiện {nodeData.conflictCount} xung đột</span>
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
        selected ? 'border-blue-400 ring-4 ring-blue-500/20' : 'border-[#2d3748] hover:border-blue-500/60'
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
        selected ? 'border-sky-400 ring-4 ring-sky-500/20' : 'border-[#2d3748] hover:border-sky-500/60'
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
            <Send size={16} />
          </div>
          <div>
            <span className="text-xs font-bold text-white block">Báo Động Telegram</span>
            <span className="text-[10px] text-gray-400">Gửi tin nhắn khi có lệch</span>
          </div>
        </div>
      </div>

      <div className="p-3 text-xs space-y-2">
        <div className="flex items-center justify-between gap-3 text-[11px]">
          <span className="text-gray-400">Bot:</span>
          <span className="text-sky-300 font-medium">{nodeData.botName || 'Theo cấu hình máy chủ'}</span>
        </div>
        <div className="flex justify-between text-gray-400 text-[11px]">
          <span>Chat ID:</span>
          <span className="text-sky-300 font-mono">{nodeData.chatId || 'Chưa cấu hình'}</span>
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
    if (nodeData.type === 'scheduleTrigger') return <Clock size={16} className="text-emerald-400" />;
    if (nodeData.type === 'webhookTrigger') return <Webhook size={16} className="text-emerald-400" />;
    if (nodeData.type === 'routerCondition') return <Split size={16} className="text-purple-400" />;
    if (nodeData.type === 'dataTransform') return <Wand2 size={16} className="text-purple-400" />;
    if (nodeData.type === 'sheetWriteAction') return <FileEdit size={16} className="text-blue-400" />;
    return <Sparkles size={16} className="text-blue-400" />;
  };

  return (
    <div
      className={`w-64 bg-[#1a1f29] rounded-2xl border-2 transition-all shadow-xl select-none ${
        selected ? 'border-blue-400 ring-4 ring-blue-500/20' : 'border-[#2d3748] hover:border-gray-500'
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
