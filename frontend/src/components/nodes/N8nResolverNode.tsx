import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Gavel } from 'lucide-react';

export const N8nResolverNode: React.FC<any> = ({ selected }) => {
  return (
    <div className={`w-64 bg-[#1e232d] rounded-2xl border-2 transition-all shadow-2xl cursor-pointer ${
      selected ? 'border-amber-400 ring-4 ring-amber-500/20 shadow-amber-950/50' : 'border-[#2d3748] hover:border-amber-500/60'
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
          <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center shadow-inner">
            <Gavel size={16} />
          </div>
          <div>
            <span className="text-xs font-bold text-white tracking-wide block">Xử Lý Xung Đột</span>
            <span className="text-[10px] text-gray-400">Chọn phương án thắng</span>
          </div>
        </div>
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-950 text-purple-300 border border-purple-800">
          QUYẾT ĐỊNH
        </span>
      </div>

      {/* Body */}
      <div className="p-3 space-y-2 text-xs">
        <div className="flex items-center justify-between text-gray-400">
          <span>Quyền lựa chọn:</span>
          <span className="text-amber-300 font-medium">Bấm 1 nút là xong</span>
        </div>
        <div className="flex items-center justify-between text-gray-400">
          <span>Tình huống mẫu:</span>
          <span className="text-gray-200 font-mono">ORD-003</span>
        </div>
      </div>
    </div>
  );
};
