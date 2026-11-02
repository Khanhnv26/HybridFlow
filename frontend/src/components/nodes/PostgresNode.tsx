import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Database, CheckCircle } from 'lucide-react';
import { WorkflowNodeData } from '../../types';

export const PostgresNode: React.FC<NodeProps<any>> = ({ data, selected }) => {
  const nodeData = data as WorkflowNodeData;

  return (
    <div className={`w-72 bg-[#161b22] border rounded-2xl shadow-xl transition-all ${
      selected ? 'border-blue-500 shadow-blue-500/20 ring-2 ring-blue-500/30' : 'border-[#30363d] hover:border-gray-500'
    }`}>
      {/* Left Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        id="postgres-in"
        className="!w-3 !h-3 !bg-[#0d1117] !border-2 !border-emerald-500 hover:!scale-125"
      />

      {/* Header */}
      <div className="p-3 bg-[#21262d] rounded-t-2xl border-b border-[#30363d] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-blue-950 text-blue-400 border border-blue-800 flex items-center justify-center">
            <Database size={14} />
          </div>
          <span className="text-xs font-bold text-white tracking-wide">PostgreSQL Target</span>
        </div>
        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800 font-mono">
          ON SUCCESS
        </span>
      </div>

      {/* Body */}
      <div className="p-3 space-y-2 text-xs">
        <div className="flex justify-between text-gray-400">
          <span>Action:</span>
          <span className="text-emerald-400 font-semibold">JPA Upsert Record</span>
        </div>
        <div className="flex justify-between text-gray-400">
          <span>Target Table:</span>
          <span className="text-gray-200 font-mono font-medium">{nodeData.tableName || 'orders'}</span>
        </div>
        <div className="flex justify-between text-gray-400">
          <span>Database:</span>
          <span className="text-gray-300 font-mono">hybridflow (5432)</span>
        </div>
        <div className="pt-2 border-t border-[#30363d] flex items-center justify-between text-[11px] text-gray-400">
          <span className="flex items-center gap-1.5 text-blue-400">
            <CheckCircle size={12} />
            Flyway Migration V1
          </span>
          <span className="text-gray-400 font-mono">~12ms</span>
        </div>
      </div>
    </div>
  );
};
