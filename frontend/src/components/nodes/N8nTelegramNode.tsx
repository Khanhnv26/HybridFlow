import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Send, BellRing } from 'lucide-react';

export const N8nTelegramNode: React.FC<any> = ({ data, selected }) => {
  return (
    <div className={`w-64 bg-[#1e232d] rounded-2xl border-2 transition-all shadow-2xl cursor-pointer ${
      selected ? 'border-sky-400 ring-4 ring-sky-500/20 shadow-sky-950/50' : 'border-[#2d3748] hover:border-sky-500/60'
    }`}>
      {/* Left Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!w-3.5 !h-3.5 !bg-[#111827] !border-2 !border-amber-400 hover:!scale-125 !transition-transform"
      />

      {/* Header */}
      <div className="p-3 bg-[#171b22] rounded-t-2xl border-b border-[#2d3748] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/40 flex items-center justify-center shadow-inner">
            <Send size={16} />
          </div>
          <div>
            <span className="text-xs font-bold text-white tracking-wide block">Báo Động Telegram</span>
            <span className="text-[10px] text-gray-400">Tin nhắn tức thì</span>
          </div>
        </div>
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-400 border border-amber-800">
          KHI LỆCH
        </span>
      </div>

      {/* Body */}
      <div className="p-3 space-y-2 text-xs">
        <div className="flex items-center justify-between text-gray-400">
          <span>Người nhận:</span>
          <span className="text-sky-300 font-mono font-medium">Chat ID {data.chatId || '8706234310'}</span>
        </div>
        <div className="flex items-center justify-between text-gray-400">
          <span>Trạng thái:</span>
          <span className="text-emerald-400 flex items-center gap-1 font-medium">
            <BellRing size={12} /> @HybridFlowBot
          </span>
        </div>
      </div>
    </div>
  );
};
