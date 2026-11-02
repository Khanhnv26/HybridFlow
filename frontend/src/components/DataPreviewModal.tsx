import React, { useState } from 'react';
import { X, Table, RefreshCw, Send, CheckCircle2, AlertTriangle } from 'lucide-react';
import { SheetDataResponse } from '../types';

interface DataPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: SheetDataResponse | null;
  isLoading: boolean;
  onRefresh: () => void;
  onUpdateCell: (range: string, value: string) => Promise<void>;
  onResolveConflict: (resolution: 'SOURCE' | 'DESTINATION') => void;
  onSendTelegramTest: () => void;
}

export const DataPreviewModal: React.FC<DataPreviewModalProps> = ({
  isOpen,
  onClose,
  data,
  isLoading,
  onRefresh,
  onUpdateCell,
  onResolveConflict,
  onSendTelegramTest,
}) => {
  const [conflictResolved, setConflictResolved] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#161b22] border border-[#30363d] rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Modal Header */}
        <div className="p-4 bg-[#21262d] border-b border-[#30363d] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center justify-center">
              <Table size={16} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide">Live Google Sheets Data &amp; Conflict Center</h2>
              <p className="text-xs text-gray-400">Sheet: <code className="text-emerald-400">{data?.sheetName || 'Trang tinh1'}</code> | API: <code className="text-blue-400">/api/v1/connections/google/sheets/read</code></p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="p-1.5 rounded-lg bg-[#161b22] hover:bg-[#30363d] text-gray-300 border border-[#30363d] transition flex items-center gap-1.5 text-xs"
            >
              <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-[#30363d] text-gray-400 hover:text-white transition"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs">

          {/* Table Preview Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-white flex items-center gap-2">
                <Table size={14} className="text-emerald-400" />
                Live Rows Preview (Online Google Sheet)
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                {data?.totalRows || 2} records fetched
              </span>
            </div>

            <div className="overflow-x-auto rounded-xl border border-[#30363d]">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#0d1117] text-gray-400 font-semibold border-b border-[#30363d]">
                  <tr>
                    <th className="py-2.5 px-4">Row #</th>
                    <th className="py-2.5 px-4">ID (Primary Key)</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4">Price ($)</th>
                    <th className="py-2.5 px-4 text-right">Quick Edit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#30363d] text-gray-200">
                  {data?.rows && data.rows.length > 0 ? (
                    data.rows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-[#21262d] transition">
                        <td className="py-2.5 px-4 text-gray-500 font-mono">{idx + 2}</td>
                        <td className="py-2.5 px-4 font-mono font-medium text-white">{row.id || `ORD-00${idx + 1}`}</td>
                        <td className="py-2.5 px-4">
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-950 text-blue-300 border border-blue-800">
                            {row.status || 'PROCESSING'}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 font-mono">${row.price || '100'}</td>
                        <td className="py-2.5 px-4 text-right">
                          <button
                            onClick={() => {
                              const val = prompt(`Cập nhật trạng thái cho ${row.id}:`, 'DELIVERED');
                              if (val) onUpdateCell(`'${data.sheetName || 'Trang tinh1'}'!B${idx + 2}`, val);
                            }}
                            className="text-blue-400 hover:text-blue-300 transition"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <>
                      <tr className="hover:bg-[#21262d] transition">
                        <td className="py-2.5 px-4 text-gray-500 font-mono">2</td>
                        <td className="py-2.5 px-4 font-mono font-medium text-white">ORD-001</td>
                        <td className="py-2.5 px-4">
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-950 text-blue-300 border border-blue-800">
                            PROCESSING
                          </span>
                        </td>
                        <td className="py-2.5 px-4 font-mono">$100</td>
                        <td className="py-2.5 px-4 text-right">
                          <button
                            onClick={() => {
                              const val = prompt('Cập nhật trạng thái cho ORD-001:', 'DELIVERED');
                              if (val) onUpdateCell(`'Trang tinh1'!B2`, val);
                            }}
                            className="text-blue-400 hover:text-blue-300 transition"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                      <tr className="hover:bg-[#21262d] transition">
                        <td className="py-2.5 px-4 text-gray-500 font-mono">3</td>
                        <td className="py-2.5 px-4 font-mono font-medium text-white">ORD-002</td>
                        <td className="py-2.5 px-4">
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-950 text-purple-300 border border-purple-800">
                            SHIPPING
                          </span>
                        </td>
                        <td className="py-2.5 px-4 font-mono">$250</td>
                        <td className="py-2.5 px-4 text-right">
                          <button
                            onClick={() => {
                              const val = prompt('Cập nhật trạng thái cho ORD-002:', 'DELIVERED');
                              if (val) onUpdateCell(`'Trang tinh1'!B3`, val);
                            }}
                            className="text-blue-400 hover:text-blue-300 transition"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 3-Way Conflict Resolver Card */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-[#161b22] to-amber-950/20 border border-amber-600/40 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle size={15} className="text-amber-400" />
                <span className="font-bold text-white">3-Way Diff Conflict Simulation (ORD-003)</span>
              </div>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                conflictResolved ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-amber-950 text-amber-400 border border-amber-800'
              }`}>
                {conflictResolved ? 'RESOLVED' : 'REQUIRES ACTION'}
              </span>
            </div>

            {!conflictResolved ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
                  <div className="p-2.5 rounded-lg bg-[#0d1117] border border-gray-800">
                    <div className="text-gray-400 text-[11px] mb-1">Base Snapshot (v0)</div>
                    <div className="font-semibold text-gray-300">NEW</div>
                    <div className="text-[10px] text-gray-500 mt-1">Common Ancestor</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-blue-950/30 border border-blue-800/40">
                    <div className="text-blue-400 text-[11px] mb-1">Google Sheets (Source)</div>
                    <div className="font-semibold text-blue-200">PROCESSING</div>
                    <div className="text-[10px] text-blue-400/80 mt-1">Edited by Operator</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-purple-950/30 border border-purple-800/40">
                    <div className="text-purple-400 text-[11px] mb-1">PostgreSQL (Dest DB)</div>
                    <div className="font-semibold text-purple-200">CANCELLED</div>
                    <div className="text-[10px] text-purple-400/80 mt-1">Updated via Webhook</div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-800">
                  <span className="text-[11px] text-gray-400 mr-auto">Choose winning resolution:</span>
                  <button
                    onClick={() => {
                      onResolveConflict('SOURCE');
                      setConflictResolved(true);
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition shadow"
                  >
                    Accept Google Sheets
                  </button>
                  <button
                    onClick={() => {
                      onResolveConflict('DESTINATION');
                      setConflictResolved(true);
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white transition shadow"
                  >
                    Accept PostgreSQL
                  </button>
                </div>
              </>
            ) : (
              <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-800/40 text-emerald-400 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <CheckCircle2 size={15} />
                  Conflict resolved cleanly. Google Sheets &amp; PostgreSQL synchronized!
                </span>
                <button
                  onClick={() => setConflictResolved(false)}
                  className="text-xs text-gray-400 hover:text-white underline"
                >
                  Reset Conflict Test
                </button>
              </div>
            )}
          </div>

          {/* Quick Telegram Bot Test */}
          <div className="p-3 rounded-xl bg-blue-950/20 border border-blue-900/40 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Send size={15} className="text-sky-400" />
              <div>
                <span className="font-semibold text-white">Telegram Notification Channel</span>
                <p className="text-[11px] text-gray-400">Direct alert to chat ID: <code className="text-sky-300 font-mono">8706234310</code></p>
              </div>
            </div>
            <button
              onClick={onSendTelegramTest}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white transition shadow flex items-center gap-1.5"
            >
              <Send size={12} />
              <span>Send Test Alert</span>
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};
