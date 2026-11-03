import React, { useState } from 'react';
import { Check, Play, RefreshCw, Save, Sparkles, X } from 'lucide-react';
import type { Node } from '@xyflow/react';
import type { OrchestrationNodeData, SheetDataResponse } from '../../types';
import { SheetSourceConfig } from './SheetSourceConfig';
import { TelegramConfig } from './TelegramConfig';
import { ScheduleConfig } from './ScheduleConfig';

interface Props {
  workflowId?: string;
  node: Node<OrchestrationNodeData> | null;
  onClose: () => void;
  disabled: boolean;
  connected: boolean;
  onUpdateData: (nodeId: string, data: Partial<OrchestrationNodeData>) => void;
  onTestStep: (nodeId: string) => Promise<unknown>;
  connectionVersion: number;
  onConnectGoogle: () => Promise<void>;
  onReadSource: (
    nodeId: string,
    spreadsheetId: string,
    sheetName: string,
    signal: AbortSignal,
  ) => Promise<SheetDataResponse>;
  onSaveSource: (nodeId: string, source: Partial<OrchestrationNodeData>) => Promise<void>;
  onSaveTelegram: (nodeId: string, settings: Partial<OrchestrationNodeData>) => Promise<void>;
  notificationConnected: boolean;
  availableColumns?: string[];
  upstreamSheets?: string[];
  previewRow?: Record<string, string>;
  previewConflict?: Record<string, string>;
  onRetryNotification?: (id: string) => Promise<void>;
}

export const NaturalLanguageConfigModal: React.FC<Props> = ({
  node,
  onClose,
  onUpdateData,
  onTestStep,
  disabled,
  connected,
  connectionVersion,
  onConnectGoogle,
  onSaveSource,
  onReadSource,
  onSaveTelegram,
  notificationConnected,
  workflowId,
  availableColumns = [],
  upstreamSheets = [],
  previewRow,
  previewConflict,
  onRetryNotification,
}) => {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [customColInput, setCustomColInput] = useState('');
  const [customColumns, setCustomColumns] = useState<string[]>([]);
  const [isCustomKeyMode, setIsCustomKeyMode] = useState(false);

  if (!node) return null;

  if (node.type === 'sheetsTrigger')
    return (
      <SheetSourceConfig
        data={node.data}
        disabled={disabled}
        connected={connected}
        connectionVersion={connectionVersion}
        onClose={onClose}
        onConnectGoogle={onConnectGoogle}
        onReadSource={(spreadsheetId, sheetName, signal) =>
          onReadSource(node.id, spreadsheetId, sheetName, signal)
        }
        onSave={(source) => onSaveSource(node.id, source)}
      />
    );

  if (node.type === 'scheduleTrigger')
    return (
      <ScheduleConfig
        workflowId={workflowId}
        data={node.data}
        disabled={disabled}
        onClose={onClose}
        onSave={(settings) => onSaveSource(node.id, settings)}
      />
    );

  if (node.type === 'telegramAction')
    return (
      <TelegramConfig
        data={node.data}
        disabled={disabled}
        notificationConnected={notificationConnected}
        availableColumns={availableColumns}
        previewRow={previewRow}
        previewConflict={previewConflict}
        onRetryNotification={onRetryNotification}
        onClose={onClose}
        onSave={(settings) => onSaveTelegram(node.id, settings)}
      />
    );

  const input = (label: string, field: keyof OrchestrationNodeData, placeholder = '') => (
    <label className="block space-y-2 min-w-0">
      <span className="text-xs font-semibold text-gray-300">{label}</span>
      <input
        disabled={disabled || testing}
        value={String(node.data[field] ?? '')}
        placeholder={placeholder}
        onChange={(e) => {
          setResult(null);
          onUpdateData(node.id, { [field]: e.target.value });
        }}
        className="w-full p-2.5 rounded-lg bg-[#0b0e14] border border-gray-700 text-gray-200 font-mono text-xs focus:border-purple-500 outline-none"
      />
    </label>
  );

  const test = async () => {
    setTesting(true);
    setError('');
    setResult(null);
    try {
      setResult(await onTestStep(node.id));
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } }; message?: string };
      setError(err.response?.data?.message || err.message || 'Chạy thử thất bại.');
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (node.type === 'diffEngine') {
        await onSaveSource(node.id, {
          uniqueKey: node.data.uniqueKey,
          sharedColumns: node.data.sharedColumns,
          conflictPolicy: node.data.conflictPolicy,
        });
      } else if (node.type === 'storageAction') {
        await onSaveSource(node.id, {
          tableName: node.data.tableName,
        });
      }
      onClose();
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } }; message?: string };
      setError(err.response?.data?.message || err.message || 'Không thể lưu cấu hình.');
    } finally {
      setSaving(false);
    }
  };

  // Parse result for diffEngine if available
  const resObj = (result && typeof result === 'object' ? result : null) as Record<string, unknown> | null;
  const historyList = Array.isArray(resObj?.history) ? (resObj.history as Record<string, unknown>[]) : [];
  const latestHistory = historyList[0] || null;

  let parsedHistoryResult: Record<string, unknown> | null = null;
  if (latestHistory?.result) {
    try {
      if (typeof latestHistory.result === 'string') {
        parsedHistoryResult = JSON.parse(latestHistory.result);
      } else if (typeof latestHistory.result === 'object') {
        parsedHistoryResult = latestHistory.result as Record<string, unknown>;
      }
    } catch {
      parsedHistoryResult = null;
    }
  }

  const progressSteps = Array.isArray(parsedHistoryResult?.progress)
    ? (parsedHistoryResult.progress as { label: string; stage?: string }[])
    : [];
  const totalRowsProcessed = typeof parsedHistoryResult?.totalRowsProcessed === 'number'
    ? parsedHistoryResult.totalRowsProcessed
    : Array.isArray(parsedHistoryResult?.cleanRecordIds)
    ? parsedHistoryResult.cleanRecordIds.length
    : null;
  const conflictsList = Array.isArray(resObj?.conflicts) ? resObj.conflicts : [];
  const runStatus = (latestHistory?.status as string) || (resObj?.status as string) || (result !== null ? 'SUCCESS' : '');
  const latency = (latestHistory?.latency as string) || '';

  // Current shared columns parsed as array
  const currentShared = (node.data.sharedColumns || '')
    .split(',')
    .map((s: string) => s.trim())
    .filter(Boolean);

  // Combine columns from availableColumns, current uniqueKey, current sharedColumns, and custom added columns
  const allKnownColumns = [...new Set([
    ...availableColumns,
    ...(node.data.uniqueKey ? [node.data.uniqueKey] : []),
    ...currentShared,
    ...customColumns,
  ])].filter(Boolean);

  const selectableColumns = allKnownColumns.filter((c) => c !== node.data.uniqueKey);

  const handleAddCustomColumn = () => {
    const col = customColInput.trim();
    if (!col) return;
    if (!customColumns.includes(col)) {
      setCustomColumns((prev) => [...prev, col]);
    }
    if (!currentShared.includes(col) && col !== node.data.uniqueKey) {
      const next = [...currentShared, col];
      onUpdateData(node.id, { sharedColumns: next.join(', ') });
    }
    setCustomColInput('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80" onClick={onClose}>
      <div
        className="bg-[#141922] border border-[#2d3748] rounded-2xl w-full max-w-4xl h-[88vh] max-h-[850px] flex flex-col text-gray-100 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - Đồng bộ 100% icon Sparkles và màu tím của khối Điều phối */}
        <div className="p-4 border-b border-[#2d3748] flex items-center justify-between gap-3 bg-[#161c26] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="p-2.5 rounded-xl bg-purple-950/50 border border-purple-800/60 text-purple-300 shrink-0">
              <Sparkles size={20} />
            </span>
            <div className="min-w-0">
              <h3 className="font-semibold text-sm truncate">
                {node.type === 'diffEngine' ? 'Điều phối & Đồng bộ' : node.data.label}
              </h3>
              <p className="text-xs text-gray-400 truncate">
                {node.type === 'diffEngine'
                  ? upstreamSheets.length > 0
                    ? `${upstreamSheets.length} Sheet đã kết nối · So khớp đa chiều`
                    : 'So khớp và đồng bộ dữ liệu giữa các Sheet'
                  : 'Cấu hình node hệ thống'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              disabled={testing || disabled}
              onClick={() => void test()}
              className="flex gap-2 items-center px-3.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-xs font-medium text-white transition disabled:opacity-40 shadow-sm"
            >
              {testing ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
              {testing ? 'Đang đọc kết quả...' : 'Đọc dữ liệu thật'}
            </button>
            <button
              disabled={testing || saving}
              onClick={onClose}
              aria-label="Đóng"
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 2-Column Grid */}
        <div className="grid md:grid-cols-2 overflow-hidden min-h-0 flex-1">

          {/* Left Panel: Cấu hình No-Code đơn giản, dễ hiểu, vừa vặn không cuộn */}
          <div className="p-5 space-y-4 text-sm overflow-y-auto min-w-0 h-full">
            {node.type === 'diffEngine' && (
              <>
                {/* 1. Cột định danh (Khóa chính) */}
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center justify-between">
                    <label htmlFor="unique-key-select" className="text-xs font-semibold text-gray-300">
                      Cột định danh (Khóa chính)
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsCustomKeyMode(!isCustomKeyMode)}
                      className="text-[11px] text-purple-400 hover:text-purple-300 underline"
                    >
                      {isCustomKeyMode ? 'Chọn từ danh sách' : 'Tự nhập tên cột'}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500">
                    Cột dùng để nhận biết dòng dữ liệu ở các Sheet (ví dụ: id, ma_sp).
                  </p>
                  {isCustomKeyMode || allKnownColumns.length === 0 ? (
                    <input
                      disabled={disabled || testing}
                      value={String(node.data.uniqueKey ?? '')}
                      placeholder="Nhập tên cột khóa (ví dụ: id, sku)..."
                      onChange={(e) => {
                        setResult(null);
                        onUpdateData(node.id, { uniqueKey: e.target.value });
                      }}
                      className="w-full p-2.5 rounded-lg bg-[#0b0e14] border border-gray-700 text-gray-200 font-mono text-xs outline-none focus:border-purple-500 min-w-0"
                    />
                  ) : (
                    <select
                      id="unique-key-select"
                      disabled={disabled || testing}
                      value={node.data.uniqueKey || ''}
                      onChange={(e) => {
                        setResult(null);
                        onUpdateData(node.id, { uniqueKey: e.target.value });
                      }}
                      className="w-full p-2.5 rounded-lg bg-[#0b0e14] border border-gray-700 text-xs text-gray-200 font-mono outline-none focus:border-purple-500 truncate"
                    >
                      <option value="">-- Bấm để chọn cột khóa (VD: id, ma_sp) --</option>
                      {allKnownColumns.map((col) => (
                        <option key={col} value={col}>
                          {col}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* 2. Các cột cần đồng bộ dữ liệu (Dạng checkbox 2 cột quen thuộc, dễ hiểu) */}
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-300">
                      Các cột cần đồng bộ dữ liệu
                    </span>
                    {selectableColumns.length > 1 && (
                      <div className="flex items-center gap-2 text-[11px]">
                        <button
                          type="button"
                          disabled={disabled || testing}
                          onClick={() => {
                            setResult(null);
                            onUpdateData(node.id, { sharedColumns: selectableColumns.join(', ') });
                          }}
                          className="text-purple-400 hover:text-purple-300"
                        >
                          Chọn tất cả
                        </button>
                        <span className="text-gray-600">·</span>
                        <button
                          type="button"
                          disabled={disabled || testing}
                          onClick={() => {
                            setResult(null);
                            onUpdateData(node.id, { sharedColumns: '' });
                          }}
                          className="text-gray-400 hover:text-gray-300"
                        >
                          Bỏ chọn
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">
                    Tích chọn các cột muốn giữ dữ liệu giống nhau giữa các Sheet.
                  </p>

                  <div className="rounded-xl border border-gray-700 bg-[#0b0e14] p-3 space-y-2.5">
                    {selectableColumns.length > 0 ? (
                      <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-1">
                        {selectableColumns.map((col) => {
                          const isChecked = currentShared.includes(col);
                          return (
                            <label
                              key={col}
                              title={col}
                              className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition border text-xs font-mono select-none min-w-0 ${
                                isChecked
                                  ? 'bg-purple-950/40 border-purple-700 text-purple-200'
                                  : 'bg-[#141922] border-gray-800 text-gray-400 hover:border-gray-700 hover:text-gray-300'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  setResult(null);
                                  const next = isChecked
                                    ? currentShared.filter((c: string) => c !== col)
                                    : [...currentShared, col];
                                  onUpdateData(node.id, { sharedColumns: next.join(', ') });
                                }}
                                className="accent-purple-500 rounded shrink-0 cursor-pointer"
                              />
                              <span className="truncate flex-1 min-w-0">{col}</span>
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500 py-1">
                        Chưa có cột chia sẻ. Nhập tên cột bên dưới để đồng bộ.
                      </p>
                    )}

                    {/* Ô thêm cột thủ công */}
                    <div className="flex items-center gap-2 pt-1 border-t border-gray-800">
                      <input
                        type="text"
                        disabled={disabled || testing}
                        value={customColInput}
                        placeholder="Thêm cột khác (ví dụ: price, status)..."
                        onChange={(e) => setCustomColInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddCustomColumn();
                          }
                        }}
                        className="flex-1 p-2 rounded-lg bg-[#141922] border border-gray-700 text-xs text-gray-200 font-mono outline-none focus:border-purple-500 min-w-0"
                      />
                      <button
                        type="button"
                        disabled={disabled || testing || !customColInput.trim()}
                        onClick={handleAddCustomColumn}
                        className="px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-xs font-medium text-white transition disabled:opacity-40 shrink-0"
                      >
                        Thêm
                      </button>
                    </div>
                  </div>
                </div>

                {/* 3. Khi dữ liệu hai bên xung đột (Dropdown chuẩn hệ thống, gọn gàng 1 dòng) */}
                <div className="space-y-1.5 min-w-0">
                  <label htmlFor="conflict-policy-select" className="text-xs font-semibold text-gray-300 block">
                    Khi dữ liệu hai bên xung đột
                  </label>
                  <select
                    id="conflict-policy-select"
                    disabled={disabled || testing}
                    value={node.data.conflictPolicy || 'ASK_TELEGRAM'}
                    onChange={(e) => {
                      setResult(null);
                      onUpdateData(node.id, { conflictPolicy: e.target.value });
                    }}
                    className="w-full p-2.5 rounded-lg bg-[#0b0e14] border border-gray-700 text-xs text-gray-200 outline-none focus:border-purple-500"
                  >
                    <option value="ASK_TELEGRAM">Chờ phê duyệt (gửi Telegram nếu đã nối khối)</option>
                    <option value="SOURCE_WINS">Ưu tiên nguồn đầu tiên</option>
                    <option value="DESTINATION_WINS">Ưu tiên đích cuối cùng</option>
                  </select>
                  <p className="text-xs text-gray-500">
                    Khi 2 bên cùng sửa 1 dòng dữ liệu, hệ thống sẽ giải quyết theo lựa chọn này.
                  </p>
                </div>
              </>
            )}

            {node.type === 'storageAction' && (
              <>
                {input('Tên vùng lưu trữ', 'tableName')}
                <p className="text-xs text-gray-400">
                  Mỗi nguồn, tab, cột khóa và vùng lưu trữ có snapshot riêng. Đổi cấu hình sẽ tạo
                  ngữ cảnh đồng bộ mới.
                </p>
              </>
            )}
          </div>

          {/* Right Panel: Kết quả đối soát trực quan */}
          <div className="p-5 bg-[#13161f] text-xs space-y-4 min-w-0 flex flex-col justify-between overflow-y-auto h-full">
            <div className="space-y-4 min-w-0">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-gray-300">Kết quả đối soát & đồng bộ</h4>
                {runStatus && (
                  <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-medium ${
                    runStatus === 'SUCCESS' ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-300' : 'bg-purple-950/60 border border-purple-800 text-purple-300'
                  }`}>
                    {runStatus}
                  </span>
                )}
              </div>

              {error && (
                <div role="alert" className="p-3 rounded-xl bg-red-950/40 border border-red-800/60 text-xs text-red-300">
                  {error}
                </div>
              )}

              {testing && (
                <div className="rounded-xl border border-gray-800 bg-[#0b0e14] p-8 text-center space-y-3">
                  <RefreshCw size={24} className="animate-spin text-purple-400 mx-auto" />
                  <p className="text-xs text-gray-300">Đang đọc dữ liệu từ các Sheet và tiến hành đối soát…</p>
                </div>
              )}

              {!testing && result !== null ? (
                <div className="space-y-3 min-w-0">
                  {/* Status Banner */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-[#0b0e14] border border-gray-700">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0"></span>
                      <span className="text-xs font-semibold text-emerald-300 truncate">
                        {runStatus === 'SUCCESS' ? 'Đối soát hoàn tất · Khớp dữ liệu' : runStatus}
                      </span>
                    </div>
                    {latency && (
                      <span className="text-[11px] font-mono text-gray-400 bg-gray-800 px-2 py-0.5 rounded shrink-0">
                        {latency}
                      </span>
                    )}
                  </div>

                  {/* Stats Cards */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-3 rounded-xl bg-[#0b0e14] border border-gray-800">
                      <span className="block text-lg font-bold text-gray-100 font-mono">
                        {totalRowsProcessed !== null ? totalRowsProcessed : '—'}
                      </span>
                      <span className="block text-[11px] text-gray-400 mt-0.5">Dòng đã xử lý</span>
                    </div>
                    <div className="p-3 rounded-xl bg-[#0b0e14] border border-gray-800">
                      <span className={`block text-lg font-bold font-mono ${conflictsList.length > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {conflictsList.length}
                      </span>
                      <span className="block text-[11px] text-gray-400 mt-0.5">Xung đột</span>
                    </div>
                    <div className="p-3 rounded-xl bg-[#0b0e14] border border-gray-800">
                      <span className="block text-lg font-bold text-gray-100 font-mono">
                        {currentShared.length || allKnownColumns.length}
                      </span>
                      <span className="block text-[11px] text-gray-400 mt-0.5">Cột đồng bộ</span>
                    </div>
                  </div>

                  {/* Progress Steps */}
                  {progressSteps.length > 0 && (
                    <div className="space-y-2 rounded-xl bg-[#0b0e14] border border-gray-800 p-3">
                      <span className="text-xs font-semibold text-gray-300 block">Tiến trình thực hiện</span>
                      <div className="space-y-2">
                        {progressSteps.map((step: any, idx: number) => (
                          <div key={idx} className="flex items-center gap-2 text-xs text-gray-300">
                            <Check size={14} className="text-emerald-400 shrink-0" />
                            <span className="truncate">{step.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : !testing ? (
                <div className="rounded-xl border border-gray-800 bg-[#0b0e14] p-8 text-center space-y-2">
                  <div className="w-10 h-10 rounded-full bg-purple-950/60 border border-purple-800/60 text-purple-400 mx-auto flex items-center justify-center">
                    <Sparkles size={18} />
                  </div>
                  <p className="font-medium text-gray-300 text-xs">Chưa có kết quả đối soát</p>
                  <p className="text-gray-500 text-xs leading-relaxed max-w-xs mx-auto">
                    Bấm nút “Đọc dữ liệu thật” ở góc trên để kiểm tra kết nối và đối soát trực tiếp giữa các Sheet.
                  </p>
                </div>
              ) : null}
            </div>

            <p className="text-[11px] text-gray-500 pt-2 border-t border-gray-800">
              Kết quả phản ánh trạng thái đối soát thực tế tại thời điểm đọc.
            </p>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#2d3748] flex justify-between items-center bg-[#11151c] shrink-0">
          <p className="text-xs text-gray-500 hidden sm:block">
            Cấu hình áp dụng cho chạy tự động theo lịch và chạy thủ công.
          </p>
          <div className="ml-auto flex gap-3">
            <button
              disabled={saving}
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-gray-700 text-xs text-gray-300 hover:bg-gray-800 transition disabled:opacity-40"
            >
              Hủy
            </button>
            <button
              disabled={saving || disabled}
              onClick={() => void handleSave()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-xs font-medium text-white transition disabled:opacity-40 shadow-sm"
            >
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? 'Đang lưu…' : 'Lưu cấu hình'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
