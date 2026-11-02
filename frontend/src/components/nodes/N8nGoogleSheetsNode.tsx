import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Table, CheckCircle2 } from 'lucide-react';

export const N8nGoogleSheetsNode: React.FC<any> = ({ data, selected }) => {
  return (
    <div className={`w-64 bg-[#1e232d] rounded-2xl border-2 transition-all shadow-2xl cursor-pointer ${
      selected ? 'border-emerald-400 ring-4 ring-emerald-500/20 shadow-emerald-950/50' : 'border-[#2d3748] hover:border-emerald-500/60'
    }`}>
      {/* Node Top Header */}
      <div className="p-3 bg-[#171b22] rounded-t-2xl border-b border-[#2d3748] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center shadow-inner">
            <Table size={16} />
          </div>
          <div>
            <span className="text-xs font-bold text-white tracking-wide block">Google Trang Tính</span>
            <span className="text-[10px] text-gray-400">Trigger: Lắng nghe thay đổi</span>
          </div>
        </div>
        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Đang kết nối"></div>
      </div>

      {/* Node Body */}
      <div className="p-3 space-y-2 text-xs">
        <div className="flex items-center justify-between text-gray-400">
          <span>File theo dõi:</span>
          <span className="text-emerald-300 font-medium font-mono text-[11px] truncate max-w-[120px]">
            {data.sheetName || 'Trang tinh1'}
          </span>
        </div>
        <div className="flex items-center justify-between text-gray-400">
          <span>Trạng thái:</span>
          <span className="text-xs text-gray-200 flex items-center gap-1 font-medium">
            <CheckCircle2 size={12} className="text-emerald-400" />
            2 đơn hàng
          </span>
        </div>
      </div>

      {/* Right Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="!w-3.5 !h-3.5 !bg-[#111827] !border-2 !border-emerald-400 hover:!scale-125 !transition-transform"
      />
    </div>
  );
};
