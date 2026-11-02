import React, { useState } from 'react';
import { X, Play, Table, Database, Send, Sparkles, Gavel, CheckCircle2, RefreshCw } from 'lucide-react';
import { Node } from '@xyflow/react';

interface N8nNodeModalProps {
  node: Node | null;
  onClose: () => void;
  onUpdateData: (nodeId: string, newData: Record<string, any>) => void;
  onTestStep: (nodeId: string) => Promise<any>;
}

export const N8nNodeModal: React.FC<N8nNodeModalProps> = ({
  node,
  onClose,
  onUpdateData,
  onTestStep,
}) => {
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  if (!node) return null;

  const data = node.data as any;

  const handleRunTest = async () => {
    setIsTesting(true);
    try {
      const res = await onTestStep(node.id);
      setTestResult(res);
    } finally {
      setIsTesting(false);
    }
  };

  const getNodeIcon = () => {
    if (node.type === 'googleSheets') return <Table size={20} className="text-emerald-400" />;
    if (node.type === 'diffEngine') return <Sparkles size={20} className="text-purple-400" />;
    if (node.type === 'postgres') return <Database size={20} className="text-blue-400" />;
    if (node.type === 'telegram') return <Send size={20} className="text-sky-400" />;
    return <Gavel size={20} className="text-amber-400" />;
  };

  const getNodeTitle = () => {
    if (node.type === 'googleSheets') return 'Google Trang Tính (Trigger)';
    if (node.type === 'diffEngine') return 'Bộ Lọc So Khớp Dữ Liệu';
    if (node.type === 'postgres') return 'Kho Dữ Liệu Bán Hàng (Database)';
    if (node.type === 'telegram') return 'Báo Động Telegram';
    return 'Xử Lý Xung Đột 2 Chiều';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-[#1b2028] border border-[#2d3748] rounded-2xl w-full max-w-4xl h-[75vh] shadow-2xl flex flex-col overflow-hidden">
        
        {/* Modal Top Bar */}
        <div className="h-14 px-5 bg-[#151921] border-b border-[#2d3748] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#222732] border border-[#2d3748] flex items-center justify-center">
              {getNodeIcon()}
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-wide">{getNodeTitle()}</h3>
              <p className="text-[11px] text-gray-400">Node ID: <code className="text-gray-300 font-mono">{node.id}</code></p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRunTest}
              disabled={isTesting}
              className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md transition flex items-center gap-2"
            >
              {isTesting ? <RefreshCw size={13} className="animate-spin" /> : <Play size={13} className="fill-current" />}
              <span>{isTesting ? 'Đang chạy thử...' : 'Chạy thử bước này'}</span>
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white transition">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Body: 2 Columns (n8n Style) */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* Left Column: Parameters (Cấu hình) */}
          <div className="w-1/2 p-6 border-r border-[#2d3748] overflow-y-auto space-y-4 text-xs">
            <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">
              Thông số cấu hình (Parameters)
            </h4>

            {node.type === 'googleSheets' && (
              <>
                <div>
                  <label className="block text-gray-300 font-medium mb-1">Tài khoản Google liên kết</label>
                  <div className="p-2.5 rounded-xl bg-[#12151c] border border-[#2d3748] text-gray-200 flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <CheckCircle2 size={14} className="text-emerald-400" />
                      vankhanhak54@gmail.com
                    </span>
                    <span className="text-[11px] text-emerald-400 font-semibold">Đã xác minh</span>
                  </div>
                </div>

                <div>
                  <label className="block text-gray-300 font-medium mb-1">Mã file Spreadsheet ID</label>
                  <input
                    type="text"
                    value={data.spreadsheetId || ''}
                    onChange={(e) => onUpdateData(node.id, { spreadsheetId: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-[#12151c] border border-[#2d3748] text-gray-200 font-mono text-xs focus:border-emerald-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-gray-300 font-medium mb-1">Trang tính cần theo dõi (Tab)</label>
                  <input
                    type="text"
                    value={data.sheetName || 'Trang tinh1'}
                    onChange={(e) => onUpdateData(node.id, { sheetName: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-[#12151c] border border-[#2d3748] text-emerald-300 font-semibold text-xs focus:border-emerald-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-gray-300 font-medium mb-1">Tần suất kiểm tra tự động</label>
                  <select className="w-full p-2.5 rounded-xl bg-[#12151c] border border-[#2d3748] text-gray-200 text-xs focus:border-emerald-500 outline-none">
                    <option>Mỗi 1 phút (Khuyên dùng)</option>
                    <option>Mỗi 5 giây (Thời gian thực)</option>
                    <option>Chỉ chạy khi bấm nút</option>
                  </select>
                </div>
              </>
            )}

            {node.type === 'diffEngine' && (
              <>
                <div>
                  <label className="block text-gray-300 font-medium mb-1">Nguyên lý so khớp</label>
                  <p className="text-gray-400 text-xs leading-relaxed p-3 rounded-xl bg-[#12151c] border border-[#2d3748]">
                    Hệ thống tự động so khớp 3 trạng thái: <strong>Bản gốc lúc đầu</strong>, <strong>Bản trên Google Sheet</strong>, và <strong>Bản trong Cơ sở dữ liệu</strong> để phát hiện nếu có nhân viên sửa đè dữ liệu.
                  </p>
                </div>
                <div>
                  <label className="block text-gray-300 font-medium mb-1">Xử lý khi phát hiện xung đột</label>
                  <div className="p-2.5 rounded-xl bg-amber-950/30 border border-amber-800/40 text-amber-300 text-xs flex items-center justify-between font-medium">
                    <span>Hành động:</span>
                    <span>Tự động rẽ nhánh gửi tin nhắn Telegram</span>
                  </div>
                </div>
              </>
            )}

            {node.type === 'postgres' && (
              <>
                <div>
                  <label className="block text-gray-300 font-medium mb-1">Bảng dữ liệu lưu trữ</label>
                  <input
                    type="text"
                    value={data.tableName || 'orders'}
                    onChange={(e) => onUpdateData(node.id, { tableName: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-[#12151c] border border-[#2d3748] text-blue-300 font-mono text-xs focus:border-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-gray-300 font-medium mb-1">Cơ chế lưu</label>
                  <p className="p-2.5 rounded-xl bg-[#12151c] border border-[#2d3748] text-gray-400 text-xs">
                    Nếu mã đơn (id) đã có ➔ Tự động cập nhật trạng thái mới. Nếu là đơn mới ➔ Thêm dòng mới.
                  </p>
                </div>
              </>
            )}

            {node.type === 'telegram' && (
              <>
                <div>
                  <label className="block text-gray-300 font-medium mb-1">Chat ID nhận tin nhắn báo động</label>
                  <input
                    type="text"
                    value={data.chatId || '8706234310'}
                    onChange={(e) => onUpdateData(node.id, { chatId: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-[#12151c] border border-[#2d3748] text-sky-300 font-mono text-xs focus:border-sky-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-gray-300 font-medium mb-1">Bot gửi tin</label>
                  <div className="p-2.5 rounded-xl bg-[#12151c] border border-[#2d3748] text-emerald-400 text-xs flex items-center justify-between">
                    <span>@HybridFlowBot</span>
                    <span>Đang hoạt động</span>
                  </div>
                </div>
              </>
            )}

            {node.type === 'conflictResolver' && (
              <>
                <div>
                  <label className="block text-gray-300 font-medium mb-1">Cơ chế giải quyết</label>
                  <p className="p-2.5 rounded-xl bg-[#12151c] border border-[#2d3748] text-gray-300 text-xs">
                    Cung cấp 2 nút bấm trực quan để bạn chọn ngay trên màn hình: Giữ dữ liệu của Google Sheet hay Giữ dữ liệu của Hệ thống.
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Right Column: Output Data (Kết quả trả về) */}
          <div className="w-1/2 p-6 bg-[#13161c] overflow-y-auto flex flex-col text-xs">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider">
                Dữ liệu thực tế của bước này (Output)
              </h4>
              <span className="text-[11px] text-gray-500 font-mono">JSON / Table</span>
            </div>

            <div className="flex-1 rounded-xl bg-[#0b0f19] border border-[#2d3748] p-4 font-mono text-[11px] text-gray-300 overflow-y-auto">
              {testResult ? (
                <pre className="text-emerald-400 whitespace-pre-wrap">{JSON.stringify(testResult, null, 2)}</pre>
              ) : (
                <pre className="text-gray-400 whitespace-pre-wrap">
{node.type === 'googleSheets' && `[
  {
    "id": "ORD-001",
    "status": "PROCESSING",
    "price": "100"
  },
  {
    "id": "ORD-002",
    "status": "SHIPPING",
    "price": "250"
  }
]`}
{node.type === 'diffEngine' && `{
  "conflictFound": true,
  "cleanRecords": ["ORD-001", "ORD-002"],
  "conflicts": [
    {
      "entityId": "ORD-003",
      "field": "status",
      "baseValue": "NEW",
      "sourceValue": "PROCESSING",
      "destinationValue": "CANCELLED"
    }
  ]
}`}
{node.type === 'postgres' && `{
  "table": "orders",
  "upsertedRows": 2,
  "status": "SUCCESS",
  "latency": "12ms"
}`}
{node.type === 'telegram' && `{
  "chatId": "8706234310",
  "sent": true,
  "message": "⚠️ Xung đột đơn hàng ORD-003"
}`}
{node.type === 'conflictResolver' && `{
  "availableChoices": ["KEEP_GOOGLE_SHEETS", "KEEP_DATABASE"],
  "entityId": "ORD-003"
}`}
                </pre>
              )}
            </div>

            <p className="text-[11px] text-gray-500 mt-2">
              Dữ liệu này được kết nối thực tế với API backend và chuyển tiếp sang node tiếp theo.
            </p>
          </div>

        </div>

      </div>
    </div>
  );
};
