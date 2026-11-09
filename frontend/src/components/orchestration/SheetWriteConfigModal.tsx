import { useExitMotion } from '../../hooks/useExitMotion';
import { errorMessage } from '../../services/errors';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  ExternalLink,
  FileEdit,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { ExcelIcon } from '../icons/BrandIcons';
import { chooseSheetTab, parseSheetSource } from '../../services/sheetSource';
import { workspaceConnectionService } from '../../services/api';
import type {
  OrchestrationNodeData,
  SheetColumnMapping,
  SheetWritePreviewRequest,
  SheetWritePreviewResponse,
  SpreadsheetMetadataResponse,
  WorkspaceConnectionResponse,
} from '../../types';

interface SheetWriteConfigModalProps {
  workspaceId?: string;
  workflowId?: string;
  data: OrchestrationNodeData;
  sourceHeaders?: string[];
  sourceSpreadsheetId?: string;
  sourceSheetName?: string;
  sourceConnectionId?: string;
  defaultKeyColumn?: string;
  onClose: () => void;
  onSave: (data: Partial<OrchestrationNodeData>) => Promise<void>;
  onPreview?: (request: SheetWritePreviewRequest, signal?: AbortSignal) => Promise<SheetWritePreviewResponse>;
  onApply?: (previewToken: string) => Promise<void>;
}

export function SheetWriteConfigModal({
  workspaceId,
  workflowId,
  data,
  sourceHeaders = [],
  sourceSpreadsheetId,
  sourceSheetName,
  sourceConnectionId: selectedConnectionId,
  defaultKeyColumn = 'id',
  onClose,
  onSave,
  onPreview,
  onApply,
}: SheetWriteConfigModalProps) {
  const motionRef = useExitMotion(true);
  const [workspaceConnections, setWorkspaceConnections] = useState<WorkspaceConnectionResponse[]>([]);

  const [link, setLink] = useState(
    () =>
      data.targetSpreadsheetUrl ||
      data.spreadsheetUrl ||
      (data.targetSpreadsheetId || data.spreadsheetId
        ? `https://docs.google.com/spreadsheets/d/${data.targetSpreadsheetId || data.spreadsheetId}/edit`
        : '')
  );

  const [metadata, setMetadata] = useState<SpreadsheetMetadataResponse | null>(null);
  const [selectedTab, setSelectedTab] = useState(
    () => data.targetSheetName || data.sheetName || ''
  );
  const [targetHeaders, setTargetHeaders] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [sourceKeyColumn, setSourceKeyColumn] = useState(
    () => data.sourceKeyColumn || defaultKeyColumn || 'id'
  );
  const [targetKeyColumn, setTargetKeyColumn] = useState(
    () => data.targetKeyColumn || ''
  );

  const [columnMappings, setColumnMappings] = useState<SheetColumnMapping[]>(
    () => (data.columnMappings && data.columnMappings.length > 0 ? [...data.columnMappings] : [])
  );

  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewResult, setPreviewResult] = useState<SheetWritePreviewResponse | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const previewRequest = useRef<AbortController | null>(null);

  const parsed = useMemo(() => {
    try {
      return parseSheetSource(link);
    } catch {
      return null;
    }
  }, [link]);
  const spreadsheetId = parsed ? parsed.spreadsheetId : '';
  const savedMappings = data.columnMappings || [];
  const settingsSaved = spreadsheetId === (data.targetSpreadsheetId || data.spreadsheetId)
    && selectedTab === (data.targetSheetName || data.sheetName)
    && sourceKeyColumn === (data.sourceKeyColumn || defaultKeyColumn)
    && targetKeyColumn === data.targetKeyColumn
    && columnMappings.length === savedMappings.length
    && columnMappings.every((mapping, i) => mapping.sourceColumn === savedMappings[i].sourceColumn
      && mapping.targetColumn === savedMappings[i].targetColumn);
  const hasTargetAccess = !!selectedConnectionId && !!metadata && targetHeaders.includes(targetKeyColumn);
  const busy = saving || applying;

  useEffect(() => {
    setPreviewResult(null);
    setPreviewError('');
    setPreviewLoading(false);
    return () => previewRequest.current?.abort();
  }, [workspaceId, workflowId, sourceSpreadsheetId, sourceSheetName, selectedConnectionId, spreadsheetId,
    selectedTab, sourceKeyColumn, targetKeyColumn, columnMappings]);

  // 1. Tải danh sách Google Connections trong workspace
  useEffect(() => {
    if (!workspaceId) return;
    const controller = new AbortController();
    workspaceConnectionService
      .list(workspaceId, controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) setWorkspaceConnections(items);
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(errorMessage(err));
        }
      });
    return () => controller.abort();
  }, [workspaceId]);

  // 2. Tải metadata của Google Sheet đích khi có link + connection
  useEffect(() => {
    if (!workspaceId || !selectedConnectionId || !spreadsheetId) {
      setMetadata(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setMetadata(null);
    setError('');

    workspaceConnectionService
      .getSheetMetadata(workspaceId, selectedConnectionId, spreadsheetId, controller.signal)
      .then((meta) => {
        if (controller.signal.aborted) return;
        setMetadata(meta);
        if (meta.sheets.length > 0) {
          if (!selectedTab || !meta.sheets.some((s) => s.title === selectedTab)) {
            const tab = chooseSheetTab(meta.sheets, parsed || { spreadsheetId }, { spreadsheetId, sheetName: selectedTab });
            setSelectedTab(tab || meta.sheets[0].title);
          }
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(errorMessage(err));
          setMetadata(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [workspaceId, selectedConnectionId, spreadsheetId]);

  // 3. Tải headers của tab đích khi chọn tab
  useEffect(() => {
    setTargetHeaders([]);
    if (!workspaceId || !selectedConnectionId || !spreadsheetId || !selectedTab) {
      return;
    }
    const controller = new AbortController();
    workspaceConnectionService
      .readSheet(
        workspaceId,
        selectedConnectionId,
        spreadsheetId,
        selectedTab,
        controller.signal
      )
      .then((sheetData) => {
        if (controller.signal.aborted) return;
        const headers = sheetData.headers || [];
        setTargetHeaders(headers);
        if (!targetKeyColumn && headers.length > 0) {
          // Gợi ý tự động: nếu có cột trùng tên với sourceKeyColumn
          const matched = headers.find((h) => h.toLowerCase() === sourceKeyColumn.toLowerCase());
          setTargetKeyColumn(matched || headers[0]);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(errorMessage(err));
        }
      });

    return () => controller.abort();
  }, [workspaceId, selectedConnectionId, spreadsheetId, selectedTab]);

  function handleAddMapping() {
    const availableSrc = sourceHeaders.find((h) => h !== sourceKeyColumn && !columnMappings.some((m) => m.sourceColumn === h)) || sourceHeaders[0] || '';
    const availableTgt = targetHeaders.find((h) => h !== targetKeyColumn && !columnMappings.some((m) => m.targetColumn === h)) || targetHeaders[0] || '';
    setColumnMappings((prev) => [...prev, { sourceColumn: availableSrc, targetColumn: availableTgt }]);
  }

  function handleRemoveMapping(index: number) {
    setColumnMappings((prev) => prev.filter((_, i) => i !== index));
  }

  function handleUpdateMapping(index: number, field: 'sourceColumn' | 'targetColumn', value: string) {
    setColumnMappings((prev) =>
      prev.map((m, i) => (i === index ? { ...m, [field]: value } : m))
    );
  }

  async function handlePreview() {
    if (!onPreview || !workspaceId || !workflowId || !spreadsheetId || !selectedTab) {
      setPreviewError('Vui lòng chọn đầy đủ bảng tính đích và tab trước khi xem trước.');
      return;
    }
    if (!sourceKeyColumn || !targetKeyColumn) {
      setPreviewError('Vui lòng chọn cột khóa ở cả bảng tính nguồn và bảng tính đích.');
      return;
    }
    if (columnMappings.length === 0) {
      setPreviewError('Cần thiết lập ít nhất một cặp cột ánh xạ.');
      return;
    }

    const srcId = sourceSpreadsheetId || data.spreadsheetId || '';
    const srcTab = sourceSheetName || data.sheetName || '';
    if (!srcId || !srcTab) {
      setPreviewError('Không tìm thấy thông tin bảng tính nguồn. Hãy kiểm tra khối Google Sheets nguồn.');
      return;
    }

    const previewReq: SheetWritePreviewRequest = {
      sourceSpreadSheetId: srcId,
      sourceSheetName: srcTab,
      sourceKeyColumn,
      targetSpreadSheetId: spreadsheetId,
      targetSheetName: selectedTab,
      targetKeyColumn,
      columnMappings,
    };

    setPreviewLoading(true);
    setPreviewError('');
    setPreviewResult(null);
    previewRequest.current?.abort();
    const controller = new AbortController();
    previewRequest.current = controller;

    try {
      const result = await onPreview(previewReq, controller.signal);
      if (!controller.signal.aborted) setPreviewResult(result);
    } catch (err) {
      if (!controller.signal.aborted) setPreviewError(errorMessage(err));
    } finally {
      if (!controller.signal.aborted) setPreviewLoading(false);
    }
  }

  async function handleApply() {
    const token = previewResult?.previewToken;
    if (!onApply || !token || !settingsSaved || busy) return;
    setApplying(true);
    setPreviewError('');
    try {
      await onApply(token);
      onClose();
    } catch (err) {
      setPreviewResult(null);
      setPreviewError(errorMessage(err));
    } finally {
      setApplying(false);
    }
  }

  async function handleSave() {
    if (!spreadsheetId || !selectedTab) {
      setError('Vui lòng điền liên kết Google Sheets đích và chọn tab.');
      return;
    }
    if (!targetKeyColumn) {
      setError('Vui lòng chọn cột khóa đích.');
      return;
    }
    if (columnMappings.length === 0) {
      setError('Cần ít nhất một cặp cột ánh xạ để ghi về bảng tính.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await onSave({
        targetSpreadsheetId: spreadsheetId,
        targetSpreadsheetUrl: link.trim(),
        targetSpreadsheetTitle: metadata?.title || data.targetSpreadsheetTitle,
        targetSheetName: selectedTab,
        sourceKeyColumn,
        targetKeyColumn,
        columnMappings,
        connectionId: undefined,
      });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        ref={motionRef}
        className="w-full max-w-3xl max-h-[90vh] bg-surface-900 border border-surface-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-surface-100"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-800 bg-surface-900/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <FileEdit size={20} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-surface-50">Cấu hình: Ghi về bảng tính</h2>
              <p className="text-xs text-surface-400">
                Tìm dòng theo cột khóa và cập nhật các cột đã ánh xạ trên Google Sheets đích
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="p-1.5 rounded-lg text-surface-400 hover:text-surface-100 hover:bg-surface-800 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <fieldset disabled={busy} className="min-w-0 flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm flex items-start gap-2.5">
              <AlertTriangle size={18} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Section 1: Chọn Kết nối & File Google Sheet đích */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400">
              1. Bảng tính đích
            </h3>

            <p className="text-xs text-surface-300">
              {selectedConnectionId
                ? `Dùng kết nối Google của Sheet nguồn — ${workspaceConnections.find(c => c.id === selectedConnectionId)?.name || selectedConnectionId}`
                : 'Chọn kết nối Google cho Sheet nguồn trước khi cấu hình Sheet đích.'}
            </p>

            {/* Link bảng tính */}
            <div>
              <label className="block text-xs font-medium text-surface-300 mb-1.5">
                Đường dẫn hoặc ID Google Sheets đích
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit"
                  className="w-full px-3.5 py-2.5 pl-10 bg-surface-950 border border-surface-800 rounded-xl text-sm placeholder:text-surface-600 focus:outline-none focus:border-blue-500"
                />
                <ExcelIcon size={18} className="absolute left-3 top-3 text-surface-500" />
                {spreadsheetId && (
                  <a
                    href={`https://docs.google.com/spreadsheets/d/${spreadsheetId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="absolute right-3 top-2.5 p-1 rounded text-surface-400 hover:text-surface-200"
                    title="Mở trên tab mới"
                  >
                    <ExternalLink size={16} />
                  </a>
                )}
              </div>
            </div>

            {/* Metadata & Tab Selection */}
            {loading ? (
              <div className="flex items-center gap-2 text-xs text-surface-400 py-1">
                <RefreshCw size={14} className="animate-spin text-blue-400" />
                <span>Đang đọc danh sách trang tính...</span>
              </div>
            ) : metadata ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-surface-300 mb-1.5">
                    Trang tính (Tab) đích
                  </label>
                  <select
                    value={selectedTab}
                    onChange={(e) => setSelectedTab(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-950 border border-surface-800 rounded-xl text-sm focus:outline-none focus:border-blue-500"
                  >
                    {metadata.sheets.map((s) => (
                      <option key={s.sheetId} value={s.title}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col justify-end">
                  <p className="text-xs text-surface-400">
                    Tên file: <span className="text-surface-200 font-medium">{metadata.title}</span>
                  </p>
                  <p className="text-xs text-surface-400 mt-1">
                    Số cột tìm thấy: <span className="text-surface-200 font-medium">{targetHeaders.length}</span>
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          <div className="border-t border-surface-800/80 pt-5 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400">
              2. Khóa đối soát (Key Column)
            </h3>
            <p className="text-xs text-surface-400">
              Hệ thống dựa vào giá trị khóa này để tìm đúng dòng trên Google Sheets đích cần cập nhật.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-surface-300 mb-1.5">
                  Cột khóa nguồn (Sheet gốc)
                </label>
                <select
                  value={sourceKeyColumn}
                  onChange={(e) => setSourceKeyColumn(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-950 border border-surface-800 rounded-xl text-sm focus:outline-none focus:border-blue-500"
                >
                  {sourceHeaders.length > 0 ? (
                    sourceHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))
                  ) : (
                    <option value={sourceKeyColumn}>{sourceKeyColumn}</option>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-surface-300 mb-1.5">
                  Cột khóa đích (Sheet đích)
                </label>
                <select
                  value={targetKeyColumn}
                  onChange={(e) => setTargetKeyColumn(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-950 border border-surface-800 rounded-xl text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="">-- Chọn cột khóa đích --</option>
                  {targetHeaders.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Section 3: Ánh xạ từng cột (Field Mapping) */}
          <div className="border-t border-surface-800/80 pt-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400">
                  3. Ánh xạ cột dữ liệu
                </h3>
                <p className="text-xs text-surface-400 mt-0.5">
                  Chỉ những cột được ánh xạ mới bị thay đổi. Các cột chứa công thức hoặc ghi chú khác vẫn giữ nguyên.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddMapping}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition"
              >
                <Plus size={14} />
                <span>Thêm cột ánh xạ</span>
              </button>
            </div>

            {columnMappings.length === 0 ? (
              <div className="p-4 rounded-xl border border-dashed border-surface-800 text-center text-xs text-surface-500">
                Chưa có cột nào được ánh xạ. Bấm "Thêm cột ánh xạ" ở trên để bắt đầu.
              </div>
            ) : (
              <div className="space-y-2.5">
                {columnMappings.map((mapping, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-3 p-2.5 rounded-xl bg-surface-950/60 border border-surface-800/80"
                  >
                    <div className="flex-1">
                      <label className="block text-[10px] text-surface-400 mb-1">Cột nguồn</label>
                      <select
                        value={mapping.sourceColumn}
                        onChange={(e) => handleUpdateMapping(idx, 'sourceColumn', e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-surface-900 border border-surface-700/80 rounded-lg text-xs focus:outline-none focus:border-blue-500"
                      >
                        {sourceHeaders.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    <ArrowRight size={16} className="text-surface-500 shrink-0 mt-4" />

                    <div className="flex-1">
                      <label className="block text-[10px] text-surface-400 mb-1">Cột đích</label>
                      <select
                        value={mapping.targetColumn}
                        onChange={(e) => handleUpdateMapping(idx, 'targetColumn', e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-surface-900 border border-surface-700/80 rounded-lg text-xs focus:outline-none focus:border-blue-500"
                      >
                        <option value="">-- Chọn cột đích --</option>
                        {targetHeaders
                          .filter((h) => h !== targetKeyColumn)
                          .map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveMapping(idx)}
                      className="p-1.5 mt-4 rounded-lg text-surface-500 hover:text-rose-400 hover:bg-rose-500/10 transition"
                      title="Xóa ánh xạ này"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 4: Khu vực Xem trước (Readonly Preview) */}
          <div className="border-t border-surface-800/80 pt-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400">
                  4. Xem trước thay đổi (Readonly)
                </h3>
                <p className="text-xs text-surface-400 mt-0.5">
                  Xem các ô đích dự kiến cập nhật trước khi áp dụng.
                </p>
              </div>
              <button
                type="button"
                onClick={handlePreview}
                disabled={previewLoading || !onPreview || !hasTargetAccess || columnMappings.length === 0}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                <RefreshCw size={14} className={previewLoading ? 'animate-spin' : ''} />
                <span>{previewLoading ? 'Đang phân tích...' : 'Xem trước thay đổi'}</span>
              </button>
            </div>

            {previewError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
                {previewError}
              </div>
            )}

            {previewResult && (
              <div className="space-y-4">
                {previewResult.errors.length > 0 && (
                  <ul role="alert" className="list-disc pl-5 text-xs text-rose-300">
                    {previewResult.errors.map((issue, index) => <li key={index}>{issue}</li>)}
                  </ul>
                )}
                {/* Badges */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
                    <p className="text-[11px] text-blue-300">Sẽ cập nhật</p>
                    <p className="text-lg font-bold text-blue-400">{previewResult.changes.length} ô</p>
                  </div>
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                    <p className="text-[11px] text-amber-300">Không tìm thấy ở đích</p>
                    <p className="text-lg font-bold text-amber-400">{previewResult.unmatchedRows.length} dòng</p>
                  </div>
                  <div className="p-3 rounded-xl bg-surface-800/60 border border-surface-700/60">
                    <p className="text-[11px] text-surface-300">Thiếu khóa nguồn</p>
                    <p className="text-lg font-bold text-surface-200">{previewResult.missingSourceKeyRows.length} dòng</p>
                  </div>
                  <div
                    className={`p-3 rounded-xl border ${
                      previewResult.duplicateTargetKeys.length > 0
                        ? 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                        : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                    }`}
                  >
                    <p className="text-[11px]">Khóa trùng ở đích</p>
                    <p className="text-lg font-bold">
                      {previewResult.duplicateTargetKeys.length > 0
                        ? `${previewResult.duplicateTargetKeys.length} khóa`
                        : '0 (An toàn)'}
                    </p>
                  </div>
                </div>

                {/* Cảnh báo khóa trùng nếu có */}
                {previewResult.duplicateTargetKeys.length > 0 && (
                  <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 space-y-1">
                    <p className="font-semibold flex items-center gap-1.5">
                      <AlertTriangle size={15} />
                      Bảng tính đích có khóa bị trùng lặp:
                    </p>
                    <ul className="list-disc pl-5 space-y-0.5">
                      {previewResult.duplicateTargetKeys.map((dup, i) => (
                        <li key={i}>
                          Khóa <code className="bg-rose-950/60 px-1 py-0.5 rounded">{dup.key}</code> xuất hiện ở các dòng: {dup.targetRowNumbers.join(', ')}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Bảng chi tiết thay đổi */}
                {previewResult.changes.length > 0 ? (
                  <div className="border border-surface-800 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-surface-800/80 text-surface-300 font-medium sticky top-0">
                        <tr>
                          <th className="px-3 py-2">Khóa</th>
                          <th className="px-3 py-2">Dòng đích</th>
                          <th className="px-3 py-2">Cột đích</th>
                          <th className="px-3 py-2">Giá trị hiện tại</th>
                          <th className="px-3 py-2">Giá trị mới</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-surface-800 text-surface-200">
                        {previewResult.changes.map((change, idx) => (
                          <tr key={idx} className="hover:bg-surface-800/40 transition">
                            <td className="px-3 py-2 font-mono text-surface-400">{change.key}</td>
                            <td className="px-3 py-2">{change.targetRowNumber}</td>
                            <td className="px-3 py-2 text-surface-300">{change.targetColumn}</td>
                            <td className="px-3 py-2 text-surface-500 line-through">
                              {change.currentValue || '∅'}
                            </td>
                            <td className="px-3 py-2 text-emerald-400 font-medium">
                              {change.newValue || '∅'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : previewResult.valid ? (
                  <div className="p-3 text-center text-xs text-surface-400 bg-surface-950/50 rounded-xl">
                    <CheckCircle size={16} className="inline mr-1.5 text-emerald-400" />
                    Không có ô nào cần cập nhật trong các dòng đã đối soát.
                  </div>
                ) : null}
                {previewResult.valid && (
                  <p className="text-xs text-surface-400">
                    {settingsSaved
                      ? 'Áp dụng sẽ chạy workflow và khởi tạo checkpoint nếu đây là lần chạy đầu.'
                      : 'Lưu cấu hình, sau đó mở lại khối để xem trước và áp dụng.'}
                  </p>
                )}
              </div>
            )}
          </div>
        </fieldset>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-surface-800 bg-surface-900/80">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 text-sm text-surface-300 hover:text-surface-100 hover:bg-surface-800 rounded-xl transition"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={busy || !hasTargetAccess || columnMappings.length === 0}
            className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-lg shadow-blue-600/20 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            <Save size={16} />
            <span>{saving ? 'Đang lưu...' : 'Lưu cấu hình'}</span>
          </button>
          {onApply && (
            <button
              type="button"
              onClick={handleApply}
              disabled={busy || !settingsSaved || !previewResult?.valid || !previewResult.previewToken}
              className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm disabled:opacity-50"
            >
              {applying ? 'Đang áp dụng…' : 'Áp dụng bản xem trước'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
