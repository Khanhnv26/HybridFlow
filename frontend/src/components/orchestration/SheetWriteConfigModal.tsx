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

const fieldClass = 'w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-primary disabled:opacity-50';
const secondaryButton = 'inline-flex items-center justify-center gap-2 rounded-lg border border-line px-3 py-2 text-sm font-medium text-primary hover:bg-elevated disabled:opacity-50';
const primaryButton = 'inline-flex items-center justify-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-on-accent hover:bg-purple-500 disabled:opacity-50';

interface SheetWriteConfigModalProps {
  workspaceId?: string;
  workflowId?: string;
  data: OrchestrationNodeData;
  sourceHeaders?: string[];
  sourceSpreadsheetId?: string;
  sourceSheetName?: string;
  sourceConnectionId?: string;
  upstream?: { id: string; label: string };
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
  upstream,
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
  const canApply = !!upstream && settingsSaved && !!previewResult?.valid && !!previewResult.previewToken;

  useEffect(() => {
    setPreviewResult(null);
    setPreviewError('');
    setPreviewLoading(false);
    return () => previewRequest.current?.abort();
  }, [workspaceId, workflowId, sourceSpreadsheetId, sourceSheetName, selectedConnectionId, spreadsheetId,
    selectedTab, sourceKeyColumn, targetKeyColumn, columnMappings, upstream?.id]);

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
    if (!upstream) {
      setPreviewError('Nối đầu vào từ So khớp hoặc Rẽ nhánh trước khi xem trước.');
      return;
    }
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
      upstreamNodeId: upstream.id,
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
    if (!onApply || !token || !canApply || busy) return;
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
    <div ref={motionRef} className="hf-motion-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <section
        role="dialog"
        aria-modal="false"
        aria-labelledby="sheet-write-title"
        className="hf-modal hf-modal--complex flex flex-col rounded-2xl border border-line bg-surface text-primary"
      >
        <header className="hf-modal-header flex items-start justify-between gap-3 border-b border-line">
          <div className="flex min-w-0 items-start gap-3">
            <span className="shrink-0 rounded-xl border border-line bg-info-soft p-2.5 text-info">
              <FileEdit size={20} />
            </span>
            <div className="min-w-0">
              <h2 id="sheet-write-title" className="font-semibold">Ghi về bảng tính</h2>
              <p className="mt-1 text-sm text-secondary">
                Tìm dòng theo cột khóa và cập nhật các cột được ánh xạ.
              </p>
              <p className="mt-1 text-xs text-secondary">
                {upstream ? `Nhận dữ liệu từ ${upstream.label}` : 'Nối đầu vào từ So khớp hoặc Rẽ nhánh.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Đóng cấu hình ghi về bảng tính"
            onClick={onClose}
            disabled={busy}
            className="shrink-0 rounded-lg p-2 text-secondary hover:bg-elevated hover:text-primary disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </header>

        {/* Body */}
        <fieldset disabled={busy} className="hf-modal-body min-w-0 flex-1 space-y-5 p-4">
          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-line bg-danger-soft p-3 text-sm text-danger">
              <AlertTriangle size={18} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Section 1: Chọn Kết nối & File Google Sheet đích */}
          <div className="space-y-3">
            <h3 className="font-semibold">
              1. Bảng tính đích
            </h3>

            <p className="text-xs text-secondary">
              {selectedConnectionId
                ? `Dùng kết nối Google của Sheet nguồn — ${workspaceConnections.find(c => c.id === selectedConnectionId)?.name || selectedConnectionId}`
                : 'Chọn kết nối Google cho Sheet nguồn trước khi cấu hình Sheet đích.'}
            </p>

            {/* Link bảng tính */}
            <div>
              <label htmlFor="sheet-write-link" className="mb-1.5 block text-sm font-medium">
                Đường dẫn hoặc ID Google Sheets đích
              </label>
              <div className="relative">
                <input
                  id="sheet-write-link"
                  type="text"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="Dán liên kết hoặc nhập ID"
                  className={`${fieldClass} pl-9 ${spreadsheetId ? 'pr-9' : ''}`}
                />
                <ExcelIcon size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" />
                {spreadsheetId && (
                  <a
                    href={`https://docs.google.com/spreadsheets/d/${spreadsheetId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-secondary hover:text-primary"
                    aria-label="Mở bảng tính đích trong tab mới"
                  >
                    <ExternalLink size={16} />
                  </a>
                )}
              </div>
            </div>

            {/* Metadata & Tab Selection */}
            {loading ? (
              <div className="flex items-center gap-2 text-xs text-secondary py-1">
                <RefreshCw size={14} className="animate-spin text-info" />
                <span>Đang đọc danh sách trang tính...</span>
              </div>
            ) : metadata ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="sheet-write-tab" className="mb-1.5 block text-sm font-medium">
                    Tab đích
                  </label>
                  <select
                    id="sheet-write-tab"
                    value={selectedTab}
                    onChange={(e) => setSelectedTab(e.target.value)}
                    className={fieldClass}
                  >
                    {metadata.sheets.map((s) => (
                      <option key={s.sheetId} value={s.title}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col justify-end">
                  <p className="text-xs text-secondary">
                    Tên file: <span className="text-primary font-medium">{metadata.title}</span>
                  </p>
                  <p className="text-xs text-secondary mt-1">
                    Số cột tìm thấy: <span className="text-primary font-medium">{targetHeaders.length}</span>
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-3 border-t border-line pt-4">
            <h3 className="font-semibold">
              2. Khóa đối soát
            </h3>
            <p className="text-xs text-secondary">
              Chọn cột dùng để tìm cùng một dòng ở hai bảng tính.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="sheet-write-source-key" className="mb-1.5 block text-sm font-medium">
                  Cột khóa nguồn
                </label>
                <select
                  id="sheet-write-source-key"
                  value={sourceKeyColumn}
                  onChange={(e) => setSourceKeyColumn(e.target.value)}
                  className={fieldClass}
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
                <label htmlFor="sheet-write-target-key" className="mb-1.5 block text-sm font-medium">
                  Cột khóa đích
                </label>
                <select
                  id="sheet-write-target-key"
                  value={targetKeyColumn}
                  onChange={(e) => setTargetKeyColumn(e.target.value)}
                  className={fieldClass}
                >
                  <option value="">Chọn cột khóa đích</option>
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
          <div className="space-y-3 border-t border-line pt-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold">
                  3. Ánh xạ cột dữ liệu
                </h3>
                <p className="text-xs text-secondary mt-0.5">
                  Chọn cột nguồn và cột đích cần cập nhật.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddMapping}
                className={secondaryButton}
              >
                <Plus size={14} />
                <span>Thêm cột ánh xạ</span>
              </button>
            </div>

            {columnMappings.length === 0 ? (
              <div className="rounded-lg border border-dashed border-line bg-canvas p-3 text-sm text-secondary">
                Chưa có cặp cột nào.
              </div>
            ) : (
              <div className="space-y-2.5">
                {columnMappings.map((mapping, idx) => (
                  <div
                    key={idx}
                    className="flex items-end gap-2 rounded-lg border border-line bg-elevated p-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <label htmlFor={`sheet-write-source-${idx}`} className="mb-1 block text-xs text-secondary">Cột nguồn</label>
                      <select
                        id={`sheet-write-source-${idx}`}
                        value={mapping.sourceColumn}
                        onChange={(e) => handleUpdateMapping(idx, 'sourceColumn', e.target.value)}
                        className={fieldClass}
                      >
                        {sourceHeaders.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    <ArrowRight size={16} className="mb-3 shrink-0 text-muted" />

                    <div className="min-w-0 flex-1">
                      <label htmlFor={`sheet-write-target-${idx}`} className="mb-1 block text-xs text-secondary">Cột đích</label>
                      <select
                        id={`sheet-write-target-${idx}`}
                        value={mapping.targetColumn}
                        onChange={(e) => handleUpdateMapping(idx, 'targetColumn', e.target.value)}
                        className={fieldClass}
                      >
                        <option value="">Chọn cột đích</option>
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
                      aria-label={`Xóa ánh xạ ${idx + 1}`}
                      onClick={() => handleRemoveMapping(idx)}
                      className="shrink-0 rounded-lg p-2 text-secondary hover:bg-danger-soft hover:text-danger"
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
          <div className="space-y-3 border-t border-line pt-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold">
                  4. Xem trước thay đổi
                </h3>
                <p className="text-xs text-secondary mt-0.5">
                  Xem các ô đích dự kiến cập nhật trước khi áp dụng.
                </p>
              </div>
              <button
                type="button"
                onClick={handlePreview}
                disabled={previewLoading || !onPreview || !upstream || !hasTargetAccess || columnMappings.length === 0}
                className={secondaryButton}
              >
                <RefreshCw size={14} className={previewLoading ? 'animate-spin' : ''} />
                <span>{previewLoading ? 'Đang phân tích...' : 'Xem trước thay đổi'}</span>
              </button>
            </div>

            {previewError && (
              <div role="alert" className="rounded-lg border border-line bg-danger-soft p-3 text-sm text-danger">
                {previewError}
              </div>
            )}

            {previewResult && (
              <div className="space-y-4">
                {previewResult.matchedRows != null && (
                  <p className="text-sm text-secondary">
                    <span className="font-semibold text-primary">{previewResult.matchedRows}</span> dòng khớp điều kiện rẽ nhánh
                  </p>
                )}
                {previewResult.errors.length > 0 && (
                  <ul role="alert" className="list-disc pl-5 text-xs text-danger">
                    {previewResult.errors.map((issue, index) => <li key={index}>{issue}</li>)}
                  </ul>
                )}
                {/* Badges */}
                <div className="flex flex-wrap gap-2">
                  <div className="flex-1 basis-32 rounded-lg border border-line bg-info-soft px-3 py-2">
                    <p className="text-[11px] text-secondary">Sẽ cập nhật</p>
                    <p className="text-lg font-bold text-info">{previewResult.changes.length} ô</p>
                  </div>
                  <div className="flex-1 basis-32 rounded-lg border border-line bg-warning-soft px-3 py-2">
                    <p className="text-[11px] text-secondary">Không tìm thấy ở đích</p>
                    <p className="text-lg font-bold text-warning">{previewResult.unmatchedRows.length} dòng</p>
                  </div>
                  <div className="flex-1 basis-32 rounded-lg border border-line bg-elevated px-3 py-2">
                    <p className="text-[11px] text-secondary">Thiếu khóa nguồn</p>
                    <p className="text-lg font-bold text-primary">{previewResult.missingSourceKeyRows.length} dòng</p>
                  </div>
                  <div
                    className={`flex-1 basis-32 rounded-lg border border-line px-3 py-2 ${
                      previewResult.duplicateTargetKeys.length > 0
                        ? 'bg-danger-soft text-danger'
                        : 'bg-success-soft text-success'
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
                  <div className="space-y-1 rounded-lg border border-line bg-danger-soft p-3 text-sm text-danger">
                    <p className="font-semibold flex items-center gap-1.5">
                      <AlertTriangle size={15} />
                      Bảng tính đích có khóa bị trùng lặp:
                    </p>
                    <ul className="list-disc pl-5 space-y-0.5">
                      {previewResult.duplicateTargetKeys.map((dup, i) => (
                        <li key={i}>
                          Khóa <code className="bg-surface px-1 py-0.5 rounded">{dup.key}</code> xuất hiện ở các dòng: {dup.targetRowNumbers.join(', ')}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Bảng chi tiết thay đổi */}
                {previewResult.changes.length > 0 ? (
                  <div role="region" aria-label="Chi tiết ô thay đổi" tabIndex={0} className="max-h-56 overflow-auto rounded-lg border border-line">
                    <table className="w-full min-w-[28rem] text-left text-xs">
                      <thead className="sticky top-0 whitespace-nowrap bg-elevated font-medium text-secondary">
                        <tr>
                          <th className="px-3 py-2">Khóa</th>
                          <th className="px-3 py-2">Dòng đích</th>
                          <th className="px-3 py-2">Cột đích</th>
                          <th className="px-3 py-2">Giá trị hiện tại</th>
                          <th className="px-3 py-2">Giá trị mới</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line text-primary">
                        {previewResult.changes.map((change, idx) => (
                          <tr key={idx} className="hover:bg-elevated transition">
                            <td className="whitespace-nowrap px-3 py-2 font-mono text-secondary">{change.key}</td>
                            <td className="px-3 py-2">{change.targetRowNumber}</td>
                            <td className="px-3 py-2 text-secondary">{change.targetColumn}</td>
                            <td className="px-3 py-2 text-muted line-through">
                              {change.currentValue || '∅'}
                            </td>
                            <td className="px-3 py-2 text-success font-medium">
                              {change.newValue || '∅'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : previewResult.valid ? (
                  <div className="rounded-lg border border-line bg-canvas p-3 text-sm text-secondary">
                    <CheckCircle size={16} className="inline mr-1.5 text-success" />
                    Không có ô nào cần cập nhật trong các dòng đã đối soát.
                  </div>
                ) : null}
                {previewResult.valid && (
                  <p className="text-xs text-secondary">
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
        <footer className="hf-modal-footer flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className={secondaryButton}
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={busy || !hasTargetAccess || columnMappings.length === 0}
            className={`${onApply && canApply ? secondaryButton : primaryButton} transition-none`}
          >
            <Save size={16} />
            <span>{saving ? 'Đang lưu...' : 'Lưu cấu hình'}</span>
          </button>
          {onApply && (
            <button
              type="button"
              onClick={handleApply}
              disabled={busy || !canApply}
              className={`${canApply ? primaryButton : secondaryButton} transition-none`}
            >
              {applying ? 'Đang áp dụng…' : 'Áp dụng bản xem trước'}
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
