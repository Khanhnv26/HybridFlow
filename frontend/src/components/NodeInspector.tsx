import React from 'react';
import { X, Play, Sliders, CheckCircle2 } from 'lucide-react';
import { WorkflowNodeData } from '../types';

interface NodeInspectorProps {
  selectedNode: any;
  onClose: () => void;
  onUpdateNodeData: (nodeId: string, newData: Partial<WorkflowNodeData>) => void;
  onTestNode: (nodeId: string) => void;
}

export const NodeInspector: React.FC<NodeInspectorProps> = ({
  selectedNode,
  onClose,
  onUpdateNodeData,
  onTestNode,
}) => {
  if (!selectedNode) {
    return (
      <aside className="w-80 bg-[#161b22] border-l border-[#30363d] p-4 flex flex-col z-20 shrink-0 shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-[#30363d] mb-4">
          <div className="flex items-center gap-2 text-gray-300">
            <Sliders size={14} className="text-blue-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider">Node Inspector</h3>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-gray-500">
          <Sliders size={32} className="mb-3 text-gray-600" />
          <p className="text-xs font-medium text-gray-400">No node selected</p>
          <p className="text-[11px] mt-1 text-gray-500">Click on any node on the canvas to inspect and configure its parameters.</p>
        </div>
      </aside>
    );
  }

  const data = selectedNode.data as WorkflowNodeData;

  return (
    <aside className="w-80 bg-[#161b22] border-l border-[#30363d] p-4 flex flex-col z-20 shrink-0 shadow-2xl overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[#30363d] mb-4">
        <div>
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">{data.label}</h3>
          <p className="text-[11px] text-gray-400 font-mono">ID: {selectedNode.id}</p>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-[#21262d] text-gray-400 hover:text-white transition"
        >
          <X size={15} />
        </button>
      </div>

      {/* Dynamic Content by Node Type */}
      <div className="space-y-4 text-xs flex-1">
        {selectedNode.type === 'googleSheets' && (
          <>
            <div>
              <label className="block text-gray-400 mb-1 text-[11px]">Spreadsheet ID</label>
              <input
                type="text"
                value={data.spreadsheetId || ''}
                onChange={(e) => onUpdateNodeData(selectedNode.id, { spreadsheetId: e.target.value })}
                className="w-full p-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-gray-200 font-mono text-[11px] focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-gray-400 mb-1 text-[11px]">Sheet Tab Name</label>
              <input
                type="text"
                value={data.sheetName || ''}
                onChange={(e) => onUpdateNodeData(selectedNode.id, { sheetName: e.target.value })}
                className="w-full p-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-emerald-400 font-mono text-xs focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-gray-400 mb-1 text-[11px]">Polling Mode</label>
              <select className="w-full p-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-gray-200 text-xs focus:border-blue-500 outline-none">
                <option value="poll-1m">Every 1 minute</option>
                <option value="poll-5s">Every 5 seconds (Realtime)</option>
                <option value="manual">Manual / Webhook trigger only</option>
              </select>
            </div>
          </>
        )}

        {selectedNode.type === 'diffEngine' && (
          <>
            <div>
              <label className="block text-gray-400 mb-1 text-[11px]">Engine Algorithm</label>
              <div className="p-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-purple-300 font-mono text-xs">
                ThreeWayDiffEngine.java (Pure Java)
              </div>
            </div>
            <div>
              <label className="block text-gray-400 mb-1 text-[11px]">Field Resolution Strategy</label>
              <select className="w-full p-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-gray-200 text-xs focus:border-blue-500 outline-none">
                <option>Detect &amp; Route to Conflict Handler</option>
                <option>Source Wins (Auto-overwrite DB)</option>
                <option>Destination Wins (Auto-overwrite Sheets)</option>
              </select>
            </div>
          </>
        )}

        {selectedNode.type === 'postgres' && (
          <>
            <div>
              <label className="block text-gray-400 mb-1 text-[11px]">Target Table</label>
              <input
                type="text"
                value={data.tableName || 'orders'}
                onChange={(e) => onUpdateNodeData(selectedNode.id, { tableName: e.target.value })}
                className="w-full p-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-blue-300 font-mono text-xs focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-gray-400 mb-1 text-[11px]">JPA Upsert Method</label>
              <div className="p-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-gray-300 font-mono text-xs">
                saveAndFlush(Entity)
              </div>
            </div>
          </>
        )}

        {selectedNode.type === 'telegram' && (
          <>
            <div>
              <label className="block text-gray-400 mb-1 text-[11px]">Target Telegram Chat ID</label>
              <input
                type="text"
                value={data.chatId || ''}
                onChange={(e) => onUpdateNodeData(selectedNode.id, { chatId: e.target.value })}
                className="w-full p-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-sky-300 font-mono text-xs focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-gray-400 mb-1 text-[11px]">Bot Token (Configured in backend)</label>
              <div className="p-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-gray-400 font-mono text-[11px] truncate">
                Được cấu hình trên máy chủ
              </div>
            </div>
          </>
        )}

        {/* Execution Health Status */}
        <div className="pt-3 border-t border-[#30363d]">
          <label className="block text-gray-400 mb-1 text-[11px]">Node Health Status</label>
          <div className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-800/40 text-emerald-400 text-xs flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 size={13} />
              Ready
            </span>
            <span className="font-mono text-gray-400">Latency: 1.09s</span>
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="pt-4 border-t border-[#30363d] mt-4">
        <button
          onClick={() => onTestNode(selectedNode.id)}
          className="w-full py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white shadow-md transition flex items-center justify-center gap-2"
        >
          <Play size={13} />
          <span>Test This Node</span>
        </button>
      </div>
    </aside>
  );
};
