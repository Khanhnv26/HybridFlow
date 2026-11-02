import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Table } from 'lucide-react';
import { WorkflowNodeData } from '../../types';

export const GoogleSheetsNode: React.FC<any> = ({ data, selected }) => {
  const nodeData = data as WorkflowNodeData;

  return (
    <div className={`w-72 bg-[#161b22] border rounded-2xl shadow-xl transition-all ${
      selected ? 'border-blue-500 shadow-blue-500/20 ring-2 ring-blue-500/30' : 'border-[#30363d] hover:border-gray-500'
    }`}>
      {/* Node Header */}
      <div className="p-3 bg-[#21262d] rounded-t-2xl border-b border-[#30363d] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center justify-center">
            <Table size={14} />
          </div>
          <span className="text-xs font-bold text-white tracking-wide">Google Sheets</span>
        </div>
        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800 font-mono">
          TRIGGER
        </span>
      </div>

      {/* Node Body */}
      <div className="p-3 space-y-2 text-xs">
        <div className="flex justify-between text-gray-400">
          <span>Event:</span>
          <span className="text-gray-200 font-medium">On Row Change / Poll</span>
        </div>
        <div className="flex justify-between text-gray-400">
          <span>Sheet Tab:</span>
          <span className="text-emerald-400 font-mono font-medium">{nodeData.sheetName || 'Trang tinh1'}</span>
        </div>
        <div className="flex justify-between text-gray-400">
          <span>Range:</span>
          <span className="text-gray-300 font-mono">A1:Z</span>
        </div>
        <div className="pt-2 border-t border-[#30363d] flex items-center justify-between text-[11px] text-gray-400">
          <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Connected
          </span>
          <span className="text-gray-400 font-mono">2 records read</span>
        </div>
      </div>

      {/* Right Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="sheets-out"
        className="!w-3 !h-3 !bg-[#0d1117] !border-2 !border-emerald-500 hover:!scale-125"
      />
    </div>
  );
};
