import React, { useState } from 'react';
import { X, Play, Table, Sparkles, Database, Send, CheckCircle2, RefreshCw } from 'lucide-react';
import { Node } from '@xyflow/react';
import { OrchestrationNodeData } from '../../types';

interface NaturalLanguageConfigModalProps {
  node: Node<OrchestrationNodeData> | null;
  onClose: () => void;
  onUpdateData: (nodeId: string, newData: Partial<OrchestrationNodeData>) => void;
  onTestStep: (nodeId: string) => Promise<any>;
}

export const NaturalLanguageConfigModal: React.FC<NaturalLanguageConfigModalProps> = ({
  node,
  onClose,
  onUpdateData,
  onTestStep,
}) => {
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  if (!node) return null;

  const data = node.data;

  const handleTest = async () => {
    setIsTesting(true);
    try {
      const res = await onTestStep(node.id);
      setTestResult(res);
    } finally {
      setIsTesting(false);
    }
  };

  const getIcon = () => {
    if (node.type === 'sheetsTrigger') return <Table size={18} className="text-emerald-400" />;
    if (node.type === 'diffEngine') return <Sparkles size={18} className="text-purple-400" />;
    if (node.type === 'storageAction') return <Database size={18} className="text-blue-400" />;
    if (node.type === 'telegramAction') return <Send size={18} className="text-sky-400" />;
    return <Sparkles size={18} className="text-amber-400" />;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-[#171b24] border border-[#2d3748] rounded-2xl w-full max-w-4xl h-[78vh] shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="h-14 px-5 bg-[#12151d] border-b border-[#2d3748] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#202532] border border-[#2d3748] flex items-center justify-center">
              {getIcon()}
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-wide">{data.label}</h3>
              <p className="text-[11px] text-gray-400">{data.subtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleTest}
              disabled={isTesting}
              className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md transition flex items-center gap-2"
            >
              {isTesting ? <RefreshCw size={13} className="animate-spin" /> : <Play size={13} className="fill-current" />}
              <span>{isTesting ? 'Đang chạy...' : 'Chạy thử bước này'}</span>
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white transition">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal 2 Columns */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* Left Column: Natural Language Configuration Form */}
          <div className="w-1/2 p-6 border-r border-[#2d3748] overflow-y-auto space-y-5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">
                Cấu Hình Dạng Ngôn Ngữ Tự Nhiên (No-Code)
              </span>
              <span className="text-[11px] text-gray-500">Điền vào chỗ trống</span>
            </div>

            {/* Google Sheets Trigger */}
            {node.type === 'sheetsTrigger' && (
              <div className="p-4 rounded-xl bg-[#12151d] border border-[#2d3748] space-y-3 leading-relaxed text-gray-300">
                <p>
                  Tôi muốn theo dõi các thay đổi từ trang tính:
                  <input
                    type="text"
                    value={data.sheetName || 'Trang tinh1'}
                    onChange={(e) => onUpdateData(node.id, { sheetName: e.target.value })}
                    className="mx-1 px-2.5 py-1 rounded-lg bg-[#0b0e14] border border-emerald-500/50 text-emerald-400 font-bold outline-none font-mono text-xs inline-block"
                  />
                  thuộc file Google Sheet có mã:
                </p>
                <input
                  type="text"
                  value={data.spreadsheetId || ''}
                  onChange={(e) => onUpdateData(node.id, { spreadsheetId: e.target.value })}
                  className="w-full p-2.5 rounded-xl bg-[#0b0e14] border border-[#2d3748] text-gray-300 font-mono text-[11px] focus:border-emerald-500 outline-none"
                />
                <div className="pt-2 border-t border-[#2d3748] flex items-center justify-between text-gray-400 text-[11px]">
                  <span>Tài khoản liên kết:</span>
                  <span className="text-emerald-400 font-medium flex items-center gap-1">
                    <CheckCircle2 size={12} /> vankhanhak54@gmail.com
                  </span>
                </div>
              </div>
            )}

            {/* 3-Way Diff Engine (Natural Language Fill-in-the-blank) */}
            {node.type === 'diffEngine' && (
              <div className="p-4 rounded-xl bg-[#12151d] border border-[#2d3748] space-y-4 leading-relaxed text-gray-300">
                <div>
                  <p className="mb-1.5">1. Hãy so sánh các bản ghi dữ liệu dựa trên cột mã duy nhất:</p>
                  <select
                    value={data.uniqueKey || 'id'}
                    onChange={(e) => onUpdateData(node.id, { uniqueKey: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-[#0b0e14] border border-purple-500/50 text-purple-300 font-bold outline-none text-xs"
                  >
                    <option value="id">Cột "id" (Mã đơn hàng / Mã định danh duy nhất)</option>
                    <option value="email">Cột "email" (Địa chỉ thư điện tử)</option>
                    <option value="sku">Cột "sku" (Mã sản phẩm / Kho)</option>
                  </select>
                </div>

                <div>
                  <p className="mb-1.5">2. Nếu phát hiện cả 2 nơi cùng sửa một dòng dữ liệu (Xung đột):</p>
                  <select
                    value={data.conflictPolicy || 'ASK_TELEGRAM'}
                    onChange={(e) => onUpdateData(node.id, { conflictPolicy: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-[#0b0e14] border border-amber-500/50 text-amber-300 font-bold outline-none text-xs"
                  >
                    <option value="ASK_TELEGRAM">Báo qua Telegram và chờ tôi bấm duyệt (An toàn nhất)</option>
                    <option value="SOURCE_WINS">Luôn tự động ưu tiên dữ liệu trên Google Trang Tính</option>
                    <option value="DESTINATION_WINS">Luôn tự động ưu tiên dữ liệu trong Kho Lưu Trữ</option>
                  </select>
                </div>

                <div className="p-2.5 rounded-lg bg-purple-950/20 border border-purple-900/40 text-[11px] text-purple-300">
                  Thuật toán 3-Way Diff sẽ âm thầm ghi nhớ bản gốc ban đầu để so khớp chính xác 100%.
                </div>
              </div>
            )}

            {/* Storage Action */}
            {node.type === 'storageAction' && (
              <div className="p-4 rounded-xl bg-[#12151d] border border-[#2d3748] space-y-3 leading-relaxed text-gray-300">
                <p>
                  Khi dữ liệu hợp lệ, hãy tự động lưu trữ và ghi nhớ bản gốc vào phân vùng kho:
                </p>
                <input
                  type="text"
                  value={data.tableName || 'orders'}
                  onChange={(e) => onUpdateData(node.id, { tableName: e.target.value })}
                  className="w-full p-2.5 rounded-xl bg-[#0b0e14] border border-blue-500/50 text-blue-300 font-bold font-mono outline-none text-xs"
                />
                <p className="text-[11px] text-gray-500">
                  Dữ liệu này được lưu trữ an toàn trong Vault của HybridFlow để phục vụ đối soát và báo cáo.
                </p>
              </div>
            )}

            {/* Telegram Action */}
            {node.type === 'telegramAction' && (
              <div className="p-4 rounded-xl bg-[#12151d] border border-[#2d3748] space-y-3 leading-relaxed text-gray-300">
                <p>
                  Bắn tin nhắn báo động khẩn cấp về điện thoại của tôi qua Chat ID:
                </p>
                <input
                  type="text"
                  value={data.chatId || '8706234310'}
                  onChange={(e) => onUpdateData(node.id, { chatId: e.target.value })}
                  className="w-full p-2.5 rounded-xl bg-[#0b0e14] border border-sky-500/50 text-sky-300 font-bold font-mono outline-none text-xs"
                />
                <div className="pt-2 border-t border-[#2d3748] flex items-center justify-between text-[11px] text-gray-400">
                  <span>Kênh gửi:</span>
                  <span className="text-emerald-400 font-medium">@HybridFlowBot (Sẵn sàng)</span>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Output Data / Results */}
          <div className="w-1/2 p-6 bg-[#13161f] overflow-y-auto flex flex-col text-xs">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                Dữ Liệu Thực Tế Chạy Qua Bước Này (Output)
              </span>
              <span className="text-[10px] text-emerald-400 font-mono">Live Sync</span>
            </div>

            <div className="flex-1 rounded-xl bg-[#0b0e14] border border-[#2d3748] p-4 font-mono text-[11px] text-gray-300 overflow-y-auto">
              {testResult ? (
                <pre className="text-emerald-400 whitespace-pre-wrap">{JSON.stringify(testResult, null, 2)}</pre>
              ) : (
                <pre className="text-gray-400 whitespace-pre-wrap">
{node.type === 'sheetsTrigger' && `[
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
  "soKhop": "ThanhCong",
  "banGhiSach": ["ORD-001", "ORD-002"],
  "phatHienXungDot": 1,
  "chiTietLech": {
    "maDinhDanh": "ORD-003",
    "truong": "status",
    "banGoc": "NEW",
    "googleSheet": "PROCESSING",
    "heThong": "CANCELLED"
  }
}`}
{node.type === 'storageAction' && `{
  "vungLuu": "orders",
  "soBanGhiLuu": 2,
  "trangThai": "DA_LUU_AN_TOAN"
}`}
{node.type === 'telegramAction' && `{
  "chatId": "8706234310",
  "daGuiThanhCong": true,
  "noiDung": "⚠️ Cảnh báo: ORD-003 bị sửa 2 nơi cùng lúc!"
}`}
                </pre>
              )}
            </div>

            <p className="text-[11px] text-gray-500 mt-2 text-center">
              Dữ liệu được chuyển tiếp tự động sang khối tiếp theo theo mũi tên dây nối.
            </p>
          </div>

        </div>

      </div>
    </div>
  );
};
