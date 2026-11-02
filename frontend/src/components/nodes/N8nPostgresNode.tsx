import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Database, CheckCircle2 } from 'lucide-react';

export const N8nPostgresNode: React.FC<any> = ({ data, selected }) => {
  return (
    <div className={`w-64 bg-[#1e232d] rounded-2xl border-2 transition-all shadow-2xl cursor-pointer ${
      selected ? 'border-blue-400 ring-4 ring-blue-500/20 shadow-blue-950/50' : 'border-[#2d3748] hover:border-blue-500/60'
    }`}>
      {/* Left Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!w-3.5 !h-3.5 !bg-[#111827] !border-2 !border-emerald-400 hover:!scale-125 !transition-transform"
      />

      {/* Header */}
      <div className="p-3 bg-[#171b22] rounded-t-2xl border-b border-[#2d3748] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/40 flex items-center justify-center shadow-inner">
            <Database size={16} />
          </div>
          <div>
            <span className="text-xs font-bold text-white tracking-wide block">Kho Dữ Liệu Bán Hàng</span>
            <span className="text-[10px] text-gray-400">PostgreSQL Database</span>
          </div>
        </div>
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
          LƯU TRỮ
        </span>
      </div>

      {/* Body */}
      <div className="p-3 space-y-2 text-xs">
        <div className="flex items-center justify-between text-gray-400">
          <span>Bảng lưu trữ:</span>
          <span className="text-blue-300 font-mono font-medium">{data.tableName || 'orders'}</span>
        </div>
        <div className="flex items-center justify-between text-gray-400">
          <span>Hành động:</span>
          <span className="text-emerald-400 flex items-center gap-1 font-medium">
            <CheckCircle2 size={12} /> Tự động lưu
          </span>
        </div>
      </div>
    </div>
  );
};
