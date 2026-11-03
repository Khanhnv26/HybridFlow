import { errorMessage } from '../../services/errors';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Link, Play, RefreshCw, Save, X } from 'lucide-react';
import { ExcelIcon } from '../icons/BrandIcons';
import { googleService } from '../../services/api';
import { chooseSheetTab, parseSheetSource } from '../../services/sheetSource';
import type {
  OrchestrationNodeData,
  SheetDataResponse,
  SpreadsheetMetadataResponse,
} from '../../types';

interface Props {
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
  data,
  disabled,
  connected,
  connectionVersion,
  onClose,
  onConnectGoogle,
  onSave,
  onReadSource,
}: Props) {
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
    const controller = new AbortController();
    setMetadata(null);
    setSelectedTab('');
    setError('');
    setPreview(null);
    setNotice('');
    previewRequest.current?.abort();
    setPreviewing(false);
    if (!parsed.source || !connected) {
      setLoading(false);
      return () => controller.abort();
    }
    const source = parsed.source;
    setLoading(true);
    const timer = setTimeout(() => {
      const accessToken = localStorage.getItem('google_access_token');
      if (!accessToken) {
        setError('Kết nối Google để tải danh sách trang tính.');
        setLoading(false);
        return;
      }
      void googleService
        .getMetadata(accessToken, source.spreadsheetId, controller.signal)
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
  }, [parsed.source, connected, connectionVersion, retry, data.spreadsheetId, data.sheetName]);
  useEffect(() => () => previewRequest.current?.abort(), []);

  const selected =
    metadata?.spreadsheetId === parsed.source?.spreadsheetId
      ? metadata?.sheets.find((tab) => tab.title === selectedTab)
      : undefined;
  const busy = disabled || saving || previewing;
  const ready = connected && !!selected && !loading && !busy;
  const readPreview = async () => {
    if (!ready || !parsed.source) return;
    const controller = new AbortController();
    previewRequest.current?.abort();
    previewRequest.current = controller;
    setPreviewing(true);
    setPreview(null);
    setError('');
    try {
      const accessToken = localStorage.getItem('google_access_token');
      if (!accessToken) throw new Error('Kết nối Google trước khi xem trước dữ liệu.');
      const result = await (onReadSource
        ? onReadSource(parsed.source.spreadsheetId, selectedTab, controller.signal)
        : googleService.readSheet(
            accessToken,
            parsed.source.spreadsheetId,
            selectedTab,
            controller.signal,
          ));
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
      aria-modal="true"
      aria-labelledby="sheet-source-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
    >
      <div className="bg-[#171b24] border border-gray-700 rounded-2xl w-full hf-modal hf-modal--complex  flex flex-col overflow-hidden">
        <div className="hf-modal-header p-4 border-b border-gray-700 flex items-center justify-between gap-4">
          <div>
            <h3 id="sheet-source-title" className="font-semibold flex items-center gap-2.5">
              <ExcelIcon size={28} /> Google Trang Tính
            </h3>
            <p className="text-xs text-gray-400 mt-1">Chọn file và trang tính để đồng bộ</p>
          </div>
          <button
            disabled={saving}
            onClick={onClose}
            aria-label="Đóng"
            className="text-gray-400 hover:text-white disabled:opacity-40"
          >
            <X size={20} />
          </button>
        </div>
        <div className="hf-modal-body">
          <div className="p-4 space-y-4 text-sm">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-700 px-3 py-2.5">
              <span className="text-xs text-gray-400">
                Google: {connected ? 'Đã kết nối' : 'Chưa kết nối'}
              </span>
              <button
                disabled={busy || connecting}
                onClick={() => void connect()}
                className="text-xs text-blue-300 font-medium disabled:opacity-40"
              >
                {connecting
                  ? 'Đang mở Google...'
                  : connected
                    ? 'Kết nối tài khoản khác'
                    : 'Kết nối Google'}
              </button>
            </div>
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
                className="w-full p-3 rounded-lg bg-[#0b0e14] border border-gray-700 focus:border-blue-500 outline-none text-xs text-gray-200"
              />
              <p className="text-xs text-gray-500">Dán link chia sẻ hoặc mã file Google Sheets.</p>
            </label>
            {parsed.error && (
              <p role="alert" className="text-xs text-red-300">
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
                className="w-full p-3 rounded-lg bg-[#0b0e14] border border-gray-700 text-sm disabled:text-gray-500"
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
              <p className="text-xs text-gray-400 break-words">
                File: <span className="text-gray-200">{metadata.title}</span> ·{' '}
                {metadata.sheets.length} trang tính
              </p>
            )}
            {loading && (
              <p role="status" className="text-xs text-gray-400 flex gap-2 items-center">
                <RefreshCw size={13} className="animate-spin" />
                Đang lấy danh sách từ Google...
              </p>
            )}
            {notice && (
              <p role="status" className="text-xs text-amber-200">
                {notice}
              </p>
            )}
            {error && (
              <div role="alert" className="text-xs text-red-300 space-y-2">
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
              className="flex gap-2 items-center text-xs font-medium px-3 py-2 rounded-lg border border-gray-600 hover:bg-gray-800 disabled:opacity-40"
            >
              {previewing ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
              {previewing ? 'Đang đọc dữ liệu...' : 'Xem trước dữ liệu'}
            </button>
          </div>
          {preview && <div className="p-4 border-t border-gray-700 bg-[#13161f] text-sm space-y-4 min-w-0">
            <h4 className="font-medium text-gray-300">Xem trước trang tính</h4>
            {preview ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-gray-400">
                    {preview.sheetName} · {preview.totalRows} dòng
                  </p>
                  {selected && parsed.source && (
                    <a
                      href={`https://docs.google.com/spreadsheets/d/${parsed.source.spreadsheetId}/edit#gid=${selected.sheetId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-300 inline-flex gap-1 items-center"
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
                            <th key={i} className="p-2 border-b border-gray-700 font-medium">
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.rows.slice(0, 20).map((row, i) => (
                          <tr key={i}>
                            {preview.headers.map((header, j) => (
                              <td key={j} className="p-2 border-b border-gray-800">
                                {row[header] ?? ''}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-gray-500">Trang tính chưa có hàng tiêu đề.</p>
                )}
                {preview.rows.length === 0 && (
                  <p className="text-gray-500">Trang tính chưa có dòng dữ liệu.</p>
                )}
                {preview.rows.length > 20 && (
                  <p className="text-gray-500">Đang hiển thị 20 dòng đầu tiên.</p>
                )}
              </>
            ) : (
              <p className="text-gray-500 leading-relaxed">
                Chọn trang tính rồi bấm “Xem trước dữ liệu” để kiểm tra nội dung trước khi lưu.
              </p>
            )}
          </div>}
        </div>
        <div className="hf-modal-footer p-4 border-t border-gray-700 flex flex-wrap justify-between items-center gap-4">
          <p className="text-xs text-gray-500 max-w-md">
            Thay đổi chỉ áp dụng sau khi lưu. Nguồn mới sẽ cần xác nhận khởi tạo ở lần đồng bộ đầu
            tiên.
          </p>
          <div className="flex gap-3">
            <button disabled={saving} onClick={onClose} className="px-3 py-2 text-xs text-gray-400">
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
