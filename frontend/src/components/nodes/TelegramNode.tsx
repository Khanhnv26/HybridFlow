import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Send, BellRing } from 'lucide-react';
import { WorkflowNodeData } from '../../types';

export const TelegramNode: React.FC<NodeProps<any>> = ({ data, selected }) => {
  const nodeData = data as WorkflowNodeData;

  return (
    <div className={`w-72 bg-[#161b22] border rounded-2xl shadow-xl transition-all ${
      selected ? 'border-sky-500 shadow-sky-500/20 ring-2 ring-sky-500/30' : 'border-[#30363d] hover:border-gray-500'
    }`}>
      {/* Left Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        id="telegram-in"
        className="!w-3 !h-3 !bg-[#0d1117] !border-2 !border-amber-500 hover:!scale-125"
      />

      {/* Header */}
      <div className="p-3 bg-[#21262d] rounded-t-2xl border-b border-[#30363d] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-sky-950 text-sky-400 border border-sky-800 flex items-center justify-center">
            <Send size={14} />
          </div>
          <span className="text-xs font-bold text-white tracking-wide">Telegram Alert</span>
        </div>
        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-950 text-amber-400 border border-amber-800 font-mono">
          ON CONFLICT
        </span>
      </div>

      {/* Body */}
      <div className="p-3 space-y-2 text-xs">
        <div className="flex justify-between text-gray-400">
          <span>Action:</span>
          <span className="text-amber-400 font-semibold">Push Live Notification</span>
        </div>
        <div className="flex justify-between text-gray-400">
          <span>Target Chat ID:</span>
          <span className="text-gray-200 font-mono">{nodeData.chatId || '8706234310'}</span>
        </div>
        <div className="flex justify-between text-gray-400">
          <span>Bot Status:</span>
          <span className="text-emerald-400 font-medium">@HybridFlowBot Active</span>
        </div>
        <div className="pt-2 border-t border-[#30363d] flex items-center justify-between text-[11px] text-gray-400">
          <span className="flex items-center gap-1.5 text-sky-400">
            <BellRing size={12} />
            Immediate Dispatch
          </span>
          <span className="text-gray-400 font-mono">1 alert sent</span>
        </div>
      </div>
    </div>
  );
};
