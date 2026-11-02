import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Gavel } from 'lucide-react';

export const ResolverNode: React.FC<any> = ({ selected }) => {
  return (
    <div className={`w-72 bg-[#161b22] border rounded-2xl shadow-xl transition-all ${
      selected ? 'border-amber-500 shadow-amber-500/20 ring-2 ring-amber-500/30' : 'border-[#30363d] hover:border-gray-500'
    }`}>
      {/* Left Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        id="resolver-in"
        className="!w-3 !h-3 !bg-[#0d1117] !border-2 !border-amber-500 hover:!scale-125"
      />

      {/* Header */}
      <div className="p-3 bg-[#21262d] rounded-t-2xl border-b border-[#30363d] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-amber-950 text-amber-400 border border-amber-800 flex items-center justify-center">
            <Gavel size={14} />
          </div>
          <span className="text-xs font-bold text-white tracking-wide">Manual Resolver</span>
        </div>
        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-950 text-purple-400 border border-purple-800 font-mono">
          DECISION
        </span>
      </div>

      {/* Body */}
      <div className="p-3 space-y-2 text-xs">
        <div className="text-gray-400 text-[11px]">Choose winning state on conflict:</div>
        <div className="flex items-center gap-2 pt-1">
          <div className="flex-1 p-1.5 rounded-lg bg-blue-950/40 border border-blue-900/50 text-blue-300 text-center font-medium text-[11px]">
            Use Sheets
          </div>
          <div className="flex-1 p-1.5 rounded-lg bg-purple-950/40 border border-purple-900/50 text-purple-300 text-center font-medium text-[11px]">
            Use Postgres
          </div>
        </div>
        <div className="pt-2 border-t border-[#30363d] flex items-center justify-between text-[11px] text-gray-400">
          <span className="text-amber-400 font-medium">1-Click Resolution</span>
          <span>ORD-003</span>
        </div>
      </div>
    </div>
  );
};
