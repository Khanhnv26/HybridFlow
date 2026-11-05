import { useExitMotion } from '../../hooks/useExitMotion';
import { errorMessage } from '../../services/errors';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Link, Play, RefreshCw, Save, X } from 'lucide-react';
import { ExcelIcon } from '../icons/BrandIcons';
import { googleService, workspaceConnectionService } from '../../services/api';
import { chooseSheetTab, parseSheetSource } from '../../services/sheetSource';
import type {
  OrchestrationNodeData,
  SheetDataResponse,
  SpreadsheetMetadataResponse,
  WorkspaceConnectionResponse,
} from '../../types';

interface Props {
  workspaceId?: string;
  data: OrchestrationNodeData;
  disabled: boolean;
  connected: boolean;
  connectionVersion: number;
  onClose: () => void;
  onConnectGoogle: () => Promise<void>;
  onReadSource?: (
    spreadsheetId: string,
    sheetName: string,
    signal: AbortSignal,
  ) => Promise<SheetDataResponse>;
  onSave: (source: Partial<OrchestrationNodeData>) => Promise<void>;
}


export function SheetSourceConfig({
  workspaceId,
  data,
  disabled,
  connected,
  connectionVersion,
  onClose,
  onConnectGoogle,
  onSave,
  onReadSource,
}: Props) {
  const motionRef = useExitMotion(true);
  const [workspaceConnections, setWorkspaceConnections] = useState<WorkspaceConnectionResponse[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>(
    () => (typeof data.connectionId === 'string' ? data.connectionId : '')
  );
  const [link, setLink] = useState(
    () =>
      data.spreadsheetUrl ||
      (data.spreadsheetId
        ? `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}/edit`
        : ''),
  );
  const [metadata, setMetadata] = useState<SpreadsheetMetadataResponse | null>(null);
  const [selectedTab, setSelectedTab] = useState('');
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<SheetDataResponse | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [notice, setNotice] = useState('');
  const previewRequest = useRef<AbortController | null>(null);
  const parsed = useMemo(() => {
    try {
      return { source: parseSheetSource(link), error: '' };
    } catch (error) {
      return { source: null, error: link.trim() ? errorMessage(error) : '' };
    }
  }, [link]);

  useEffect(() => {
    if (!workspaceId) return;
    const controller = new AbortController();
    workspaceConnectionService.list(workspaceId, controller.signal)
      .then((items) => {
        if (controller.signal.aborted) return;
        const googleConns = items.filter((c) => c.provider === 'GOOGLE' && c.state === 'ACTIVE');
        setWorkspaceConnections(googleConns);
        setSelectedConnectionId((prev) => {
          if (prev && googleConns.some((c) => c.id === prev)) return prev;
          return googleConns[0]?.id || '';
        });
      })
      .catch(() => {});
    return () => controller.abort();
  }, [workspaceId, connectionVersion]);

  useEffect(() => {
    const controller = new AbortController();
    setMetadata(null);
    setSelectedTab('');
    setError('');
    setPreview(null);
    setNotice('');
    previewRequest.current?.abort();
    setPreviewing(false);
    const hasConnection = workspaceId
      ? !!selectedConnectionId && workspaceConnections.some((c) => c.id === selectedConnectionId)
      : connected;
    if (!parsed.source || !hasConnection) {
      setLoading(false);
      return () => controller.abort();
    }
    const source = parsed.source;
    setLoading(true);
    const timer = setTimeout(() => {
      const fetchMetadata = workspaceId && selectedConnectionId
        ? workspaceConnectionService.getSheetMetadata(workspaceId, selectedConnectionId, source.spreadsheetId, controller.signal)
        : (() => {
            const accessToken = localStorage.getItem('google_access_token');
            if (!accessToken) {
              setError('Kết nối Google để tải danh sách trang tính.');
              setLoading(false);
              return null;
            }
            return googleService.getMetadata(accessToken, source.spreadsheetId, controller.signal);
          })();

      if (!fetchMetadata) return;

      void fetchMetadata
        .then((result) => {
          if (controller.signal.aborted) return;
          if (result.spreadsheetId !== source.spreadsheetId)
            throw new Error('Danh sách trang tính không khớp file đã chọn.');
          setMetadata(result);
          const tab = chooseSheetTab(result.sheets, source, data);
          setSelectedTab(tab);
          if (source.gid !== undefined && !tab)
            setNotice('Tab trong link không còn tồn tại. Chọn một trang tính trong danh sách.');
          else if (data.spreadsheetId === source.spreadsheetId && data.sheetName && !tab)
            setNotice('Trang tính đã lưu không còn đúng tên. Chọn lại trang tính trước khi lưu.');
        })
        .catch((error) => {
          if (!controller.signal.aborted) setError(errorMessage(error));
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [parsed.source, connected, connectionVersion, retry, data.spreadsheetId, data.sheetName, workspaceId, selectedConnectionId, workspaceConnections]);
  useEffect(() => () => previewRequest.current?.abort(), []);

  const selected =
    metadata?.spreadsheetId === parsed.source?.spreadsheetId
      ? metadata?.sheets.find((tab) => tab.title === selectedTab)
      : undefined;
  const busy = disabled || saving || previewing;
  const connectionActive = workspaceId
    ? !!selectedConnectionId && workspaceConnections.some((c) => c.id === selectedConnectionId)
    : connected;
  const ready = connectionActive && !!selected && !loading && !busy;
  const readPreview = async () => {
    if (!ready || !parsed.source) return;
    const controller = new AbortController();
    previewRequest.current?.abort();
    previewRequest.current = controller;
    setPreviewing(true);
    setPreview(null);
    setError('');
    try {
      const result = await (workspaceId && selectedConnectionId
        ? workspaceConnectionService.readSheet(
            workspaceId,
            selectedConnectionId,
            parsed.source.spreadsheetId,
            selectedTab,
            controller.signal,
          )
        : (() => {
            const accessToken = localStorage.getItem('google_access_token');
            if (!accessToken) throw new Error('Kết nối Google trước khi xem trước dữ liệu.');
            return onReadSource
              ? onReadSource(parsed.source.spreadsheetId, selectedTab, controller.signal)
              : googleService.readSheet(
                  accessToken,
                  parsed.source.spreadsheetId,
                  selectedTab,
                  controller.signal,
                );
          })());
      if (!controller.signal.aborted) setPreview(result);
    } catch (error) {
      if (!controller.signal.aborted) setError(errorMessage(error));
    } finally {
      if (!controller.signal.aborted) setPreviewing(false);
    }
  };
  const save = async () => {
    if (!ready || !parsed.source || !selected) return;
    setSaving(true);
    setError('');
    try {
      await onSave({
        ...(workspaceId && selectedConnectionId ? { connectionId: selectedConnectionId } : {}),
        spreadsheetId: parsed.source.spreadsheetId,
        spreadsheetTitle: metadata?.title,
        sheetName: selected.title,
        spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${parsed.source.spreadsheetId}/edit#gid=${selected.sheetId}`,
      });
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };
  const connect = async () => {
    setConnecting(true);
    setError('');
    try {
      await onConnectGoogle();
      setNotice(
        'Hoàn tất đăng nhập trong cửa sổ Google. Danh sách trang tính sẽ tự tải sau khi kết nối.',
      );
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="sheet-source-title"
      ref={motionRef} className="hf-motion-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
    >
      <div className="bg-elevated border border-line rounded-2xl w-full hf-modal hf-modal--complex  flex flex-col overflow-hidden">
        <div className="hf-modal-header p-4 border-b border-line flex items-center justify-between gap-4">
          <div>
            <h3 id="sheet-source-title" className="font-semibold flex items-center gap-2.5">
              <ExcelIcon size={28} /> Google Trang Tính
            </h3>
            <p className="text-xs text-secondary mt-1">Chọn file và trang tính để đồng bộ</p>
          </div>
          <button
            disabled={saving}
            onClick={onClose}
            aria-label="Đóng"
            className="text-secondary hover:text-primary disabled:opacity-40"
          >
            <X size={20} />
          </button>
        </div>
        <div className="hf-modal-body">
          <div className="p-4 space-y-4 text-sm">
            {workspaceId ? (
              <div className="space-y-2 rounded-lg border border-line p-3 bg-surface">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-secondary font-medium">
                    Kết nối Google trong Workspace
                  </span>
                  <button
                    type="button"
                    disabled={busy || connecting}
                    onClick={() => void connect()}
                    className="text-xs text-info font-medium disabled:opacity-40"
                  >
                    {connecting ? 'Đang mở Google...' : '+ Thêm kết nối'}
                  </button>
                </div>
                {workspaceConnections.length === 0 ? (
                  <p className="text-xs text-warning">
                    Chưa có kết nối Google trong workspace. Bấm "+ Thêm kết nối" để cấp quyền.
                  </p>
                ) : (
                  <select
                    disabled={busy}
                    value={selectedConnectionId}
                    onChange={(event) => {
                      previewRequest.current?.abort();
                      setSelectedConnectionId(event.target.value);
                      setMetadata(null);
                      setSelectedTab('');
                      setPreview(null);
                      setError('');
                    }}
                    className="w-full p-2 rounded bg-canvas border border-line text-xs text-primary"
                  >
                    {workspaceConnections.map((conn) => (
                      <option key={conn.id} value={conn.id}>
                        {conn.name} ({conn.id})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5">
                <span className="text-xs text-secondary">
                  Google: {connected ? 'Đã kết nối' : 'Chưa kết nối'}
                </span>
                <button
                  disabled={busy || connecting}
                  onClick={() => void connect()}
                  className="text-xs text-info font-medium disabled:opacity-40"
                >
                  {connecting
                    ? 'Đang mở Google...'
                    : connected
                      ? 'Kết nối tài khoản khác'
                      : 'Kết nối Google'}
                </button>
              </div>
            )}
            <label className="block space-y-2">
              <span className="flex items-center gap-2">
                <Link size={14} />
                Link Google Sheets
              </span>
              <input
                type="text"
                autoComplete="off"
                spellCheck={false}
                disabled={busy}
                value={link}
                placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                aria-invalid={!!parsed.error}
                onChange={(event) => {
                  previewRequest.current?.abort();
                  setLink(event.target.value);
                  setMetadata(null);
                  setSelectedTab('');
                  setPreview(null);
                  setError('');
                }}
                className="w-full p-3 rounded-lg bg-canvas border border-line focus:border-blue-500 outline-none text-xs text-primary"
              />
              <p className="text-xs text-muted">Dán link chia sẻ hoặc mã file Google Sheets.</p>
            </label>
            {parsed.error && (
              <p role="alert" className="text-xs text-danger">
                {parsed.error}
              </p>
            )}
            <label className="block space-y-2">
              <span>Trang tính</span>
              <select
                disabled={busy || loading || !metadata}
                value={selectedTab}
                onChange={(event) => {
                  previewRequest.current?.abort();
                  setSelectedTab(event.target.value);
                  setPreview(null);
                  setError('');
                  setNotice('');
                }}
                className="w-full p-3 rounded-lg bg-canvas border border-line text-sm disabled:text-muted"
              >
                <option value="">
                  {loading
                    ? 'Đang tải trang tính...'
                    : !connected
                      ? 'Kết nối Google để chọn trang tính'
                      : metadata
                        ? 'Chọn trang tính'
                        : 'Dán link để tải danh sách trang tính'}
                </option>
                {metadata?.sheets.map((tab) => (
                  <option key={tab.sheetId} value={tab.title}>
                    {tab.title}
                  </option>
                ))}
              </select>
            </label>
            {metadata && (
              <p className="text-xs text-secondary break-words">
                File: <span className="text-primary">{metadata.title}</span> ·{' '}
                {metadata.sheets.length} trang tính
              </p>
            )}
            {loading && (
              <p role="status" className="text-xs text-secondary flex gap-2 items-center">
                <RefreshCw size={13} className="animate-spin" />
                Đang lấy danh sách từ Google...
              </p>
            )}
            {notice && (
              <p role="status" className="text-xs text-warning">
                {notice}
              </p>
            )}
            {error && (
              <div role="alert" className="text-xs text-danger space-y-2">
                <p>{error}</p>
                {!metadata && parsed.source && connected && (
                  <button
                    disabled={busy || loading}
                    onClick={() => setRetry((value) => value + 1)}
                    className="underline"
                  >
                    Tải lại danh sách trang tính
                  </button>
                )}
              </div>
            )}
            <button
              disabled={!ready}
              onClick={() => void readPreview()}
              className="flex gap-2 items-center text-xs font-medium px-3 py-2 rounded-lg border border-line hover:bg-elevated disabled:opacity-40"
            >
              {previewing ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
              {previewing ? 'Đang đọc dữ liệu...' : 'Xem trước dữ liệu'}
            </button>
          </div>
          {preview && <div className="p-4 border-t border-line bg-elevated text-sm space-y-4 min-w-0">
            <h4 className="font-medium text-secondary">Xem trước trang tính</h4>
            {preview ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-secondary">
                    {preview.sheetName} · {preview.totalRows} dòng
                  </p>
                  {selected && parsed.source && (
                    <a
                      href={`https://docs.google.com/spreadsheets/d/${parsed.source.spreadsheetId}/edit#gid=${selected.sheetId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-info inline-flex gap-1 items-center"
                    >
                      Mở Sheet
                      <ExternalLink size={12} />
                    </a>
                  )}
                </div>
                {preview.headers.length > 0 ? (
                  <div className="overflow-auto max-h-72">
                    <table className="w-full text-left whitespace-nowrap">
                      <thead>
                        <tr>
                          {preview.headers.map((header, i) => (
                            <th key={i} className="p-2 border-b border-line font-medium">
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.rows.slice(0, 20).map((row, i) => (
                          <tr key={i}>
                            {preview.headers.map((header, j) => (
                              <td key={j} className="p-2 border-b border-line">
                                {row[header] ?? ''}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-muted">Trang tính chưa có hàng tiêu đề.</p>
                )}
                {preview.rows.length === 0 && (
                  <p className="text-muted">Trang tính chưa có dòng dữ liệu.</p>
                )}
                {preview.rows.length > 20 && (
                  <p className="text-muted">Đang hiển thị 20 dòng đầu tiên.</p>
                )}
              </>
            ) : (
              <p className="text-muted leading-relaxed">
                Chọn trang tính rồi bấm “Xem trước dữ liệu” để kiểm tra nội dung trước khi lưu.
              </p>
            )}
          </div>}
        </div>
        <div className="hf-modal-footer p-4 border-t border-line flex flex-wrap justify-between items-center gap-4">
          <p className="text-xs text-muted max-w-md">
            Thay đổi chỉ áp dụng sau khi lưu. Nguồn mới sẽ cần xác nhận khởi tạo ở lần đồng bộ đầu
            tiên.
          </p>
          <div className="flex gap-3">
            <button disabled={saving} onClick={onClose} className="px-3 py-2 text-xs text-secondary">
              Hủy
            </button>
            <button
              disabled={!ready}
              onClick={() => void save()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-medium flex items-center gap-2 disabled:opacity-40"
            >
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? 'Đang lưu...' : 'Lưu nguồn dữ liệu'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
