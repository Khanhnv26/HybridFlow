import React, { useState } from 'react';
import { X, Play, RefreshCw } from 'lucide-react';
import type { Node } from '@xyflow/react';
import type { OrchestrationNodeData, SheetDataResponse } from '../../types';
import { SheetSourceConfig } from './SheetSourceConfig';
import { TelegramConfig } from './TelegramConfig';
interface Props {
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
}) => {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState('');
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
  if (node.type === 'telegramAction')
    return (
      <TelegramConfig
        data={node.data}
        disabled={disabled}
        notificationConnected={notificationConnected}
        onClose={onClose}
        onSave={(settings) => onSaveTelegram(node.id, settings)}
      />
    );
  const input = (label: string, field: keyof OrchestrationNodeData, placeholder = '') => (
    <label className="block space-y-2">
      <span>{label}</span>
      <input
        disabled={disabled || testing}
        value={String(node.data[field] ?? '')}
        placeholder={placeholder}
        onChange={(e) => {
          setResult(null);
          onUpdateData(node.id, { [field]: e.target.value });
        }}
        className="w-full p-2.5 rounded bg-[#0b0e14] border border-gray-700 text-gray-200 font-mono text-xs"
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
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
      <div className="bg-[#171b24] border border-gray-700 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col">
        <div className="p-4 border-b border-gray-700 flex items-center justify-between gap-3">
          <h3 className="font-semibold">{node.data.label}</h3>
          <div className="flex items-center gap-4">
            <button
              disabled={testing || disabled}
              onClick={() => void test()}
              className="flex gap-2 items-center px-3 py-2 rounded bg-blue-600 text-xs disabled:opacity-40"
            >
              {testing ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}{' '}
              {testing ? 'Đang đọc kết quả...' : 'Đọc dữ liệu thật'}
            </button>
            <button disabled={testing} onClick={onClose} aria-label="Đóng">
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="grid md:grid-cols-2 overflow-auto">
          <div className="p-5 space-y-4 text-sm">
            {node.type === 'diffEngine' && (
              <>
                {input('Tên cột khóa duy nhất', 'uniqueKey', 'Nhập đúng tên cột trên Sheet')}
                {input(
                  'Các cột được chia sẻ giữa các Sheet',
                  'sharedColumns',
                  'Ví dụ: status, quantity, note',
                )}
                <p className="text-xs text-gray-400">
                  Nhập tên cột, ngăn cách bằng dấu phẩy. Chỉ các cột này được đồng bộ giữa các
                  Sheet; không chọn cột chứa thông tin riêng.
                </p>
                <label className="block space-y-2">
                  <span>Khi dữ liệu hai bên xung đột</span>
                  <select
                    disabled={disabled || testing}
                    value={node.data.conflictPolicy}
                    onChange={(e) => {
                      setResult(null);
                      onUpdateData(node.id, { conflictPolicy: e.target.value });
                    }}
                    className="w-full p-2.5 rounded bg-[#0b0e14] border border-gray-700 text-xs"
                  >
                    <option value="ASK_TELEGRAM">
                      Chờ phê duyệt (gửi Telegram nếu đã nối khối)
                    </option>
                    <option value="SOURCE_WINS">Ưu tiên nguồn đầu tiên</option>
                    <option value="DESTINATION_WINS">Ưu tiên đích cuối cùng</option>
                  </select>
                </label>
                <p className="text-xs text-gray-400">
                  Kết quả bên phải là xung đột và lịch sử đã lưu. Dùng nút chạy luồng để đối soát
                  mới.
                </p>
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
          <div className="p-5 bg-[#13161f] text-xs space-y-3">
            <h4 className="text-gray-400">Kết quả API</h4>
            {error && (
              <p role="alert" className="text-red-300">
                {error}
              </p>
            )}
            {result !== null ? (
              <pre className="whitespace-pre-wrap break-words text-emerald-300">
                {JSON.stringify(result, null, 2)}
              </pre>
            ) : (
              <p className="text-gray-500">Chưa đọc kết quả cho cấu hình này.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
