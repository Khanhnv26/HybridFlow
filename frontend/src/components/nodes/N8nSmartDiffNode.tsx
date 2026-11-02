import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Sparkles, Check, AlertTriangle } from 'lucide-react';

export const N8nSmartDiffNode: React.FC<any> = ({ selected }) => {
  return (
    <div className={`w-72 bg-[#1e232d] rounded-2xl border-2 transition-all shadow-2xl cursor-pointer ${
      selected ? 'border-purple-400 ring-4 ring-purple-500/20 shadow-purple-950/50' : 'border-[#2d3748] hover:border-purple-500/60'
    }`}>
      {/* Left Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!w-3.5 !h-3.5 !bg-[#111827] !border-2 !border-purple-400 hover:!scale-125 !transition-transform"
      />

      {/* Node Header */}
      <div className="p-3 bg-[#171b22] rounded-t-2xl border-b border-[#2d3748] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/40 flex items-center justify-center shadow-inner">
            <Sparkles size={16} />
          </div>
          <div>
            <span className="text-xs font-bold text-white tracking-wide block">So Khớp Dữ Liệu</span>
            <span className="text-[10px] text-gray-400">Tự động phát hiện xung đột</span>
          </div>
        </div>
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-950 text-purple-300 border border-purple-800">
          LOGIC
        </span>
      </div>

      {/* Node Body */}
      <div className="p-3 space-y-2 text-xs">
        <div className="p-2 rounded-xl bg-[#13161c] border border-[#2d3748] space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-emerald-400 flex items-center gap-1 font-medium">
              <Check size={12} /> Hợp lệ (Không lệch)
            </span>
            <span className="text-gray-400 text-[10px]">Cổng trên</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-amber-400 flex items-center gap-1 font-medium">
              <AlertTriangle size={12} /> Có xung đột (Sửa 2 nơi)
            </span>
            <span className="text-gray-400 text-[10px]">Cổng dưới</span>
          </div>
        </div>
      </div>

      {/* Output Handles */}
      <Handle
        type="source"
        position={Position.Right}
        id="clean"
        style={{ top: '38%' }}
        className="!w-3.5 !h-3.5 !bg-[#111827] !border-2 !border-emerald-400 hover:!scale-125 !transition-transform"
        title="Nhánh dữ liệu hợp lệ"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="conflict"
        style={{ top: '68%' }}
        className="!w-3.5 !h-3.5 !bg-[#111827] !border-2 !border-amber-400 hover:!scale-125 !transition-transform"
        title="Nhánh phát hiện lệch dữ liệu"
      />
    </div>
  );
};
