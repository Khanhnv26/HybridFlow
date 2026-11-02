import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { GitCompare, AlertTriangle } from 'lucide-react';

export const DiffEngineNode: React.FC<any> = ({ selected }) => {
  return (
    <div className={`w-80 bg-[#161b22] border rounded-2xl shadow-xl transition-all ${
      selected ? 'border-purple-500 shadow-purple-500/20 ring-2 ring-purple-500/30' : 'border-[#30363d] hover:border-gray-500'
    }`}>
      {/* Left Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        id="diff-in"
        className="!w-3 !h-3 !bg-[#0d1117] !border-2 !border-purple-500 hover:!scale-125"
      />

      {/* Header */}
      <div className="p-3 bg-[#21262d] rounded-t-2xl border-b border-[#30363d] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-purple-950 text-purple-400 border border-purple-800 flex items-center justify-center">
            <GitCompare size={14} />
          </div>
          <span className="text-xs font-bold text-white tracking-wide">ThreeWayDiffEngine</span>
        </div>
        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-950 text-purple-400 border border-purple-800 font-mono">
          ALGORITHM
        </span>
      </div>

      {/* Body */}
      <div className="p-3 space-y-2 text-xs">
        <div className="text-gray-400 text-[11px]">Field-level 3-way conflict calculation:</div>
        <div className="grid grid-cols-3 gap-1.5 text-center text-[10px] font-mono">
          <div className="p-1 rounded bg-[#0d1117] text-gray-400 border border-gray-800">Base v0</div>
          <div className="p-1 rounded bg-blue-950/40 text-blue-300 border border-blue-900/50">Source</div>
          <div className="p-1 rounded bg-purple-950/40 text-purple-300 border border-purple-900/50">Dest DB</div>
        </div>
        <div className="p-2 rounded-lg bg-amber-950/30 border border-amber-900/40 text-[11px] text-amber-300 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <AlertTriangle size={12} />
            Branch Logic:
          </span>
          <span className="font-mono font-bold">hasConflict()</span>
        </div>
      </div>

      {/* Two Right Output Handles */}
      <Handle
        type="source"
        position={Position.Right}
        id="diff-clean"
        style={{ top: '35%' }}
        className="!w-3 !h-3 !bg-[#0d1117] !border-2 !border-emerald-500 hover:!scale-125"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="diff-conflict"
        style={{ top: '65%' }}
        className="!w-3 !h-3 !bg-[#0d1117] !border-2 !border-amber-500 hover:!scale-125"
      />
    </div>
  );
};
