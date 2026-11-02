import React from 'react';
import { Table, Clock, Webhook, Sparkles, Split, Wand2, Database, Send, FileEdit, Plus } from 'lucide-react';
import { OrchestrationNodeType } from '../../types';

interface PaletteItem {
  type: OrchestrationNodeType;
  label: string;
  subtitle: string;
  category: 'trigger' | 'logic' | 'action';
  icon: React.ReactNode;
  color: string;
}

const PALETTE_ITEMS: PaletteItem[] = [
  // Nhóm 1: Nguồn dữ liệu
  {
    type: 'sheetsTrigger',
    label: 'Google Trang Tính',
    subtitle: 'Lắng nghe thay đổi dữ liệu',
    category: 'trigger',
    icon: <Table size={15} />,
    color: 'emerald',
  },
  {
    type: 'scheduleTrigger',
    label: 'Hẹn Giờ Định Kỳ',
    subtitle: 'Chạy mỗi 5 phút hoặc mỗi ngày',
    category: 'trigger',
    icon: <Clock size={15} />,
    color: 'emerald',
  },
  {
    type: 'webhookTrigger',
    label: 'Đón Sự Kiện Webhook',
    subtitle: 'Nhận dữ liệu từ app ngoài',
    category: 'trigger',
    icon: <Webhook size={15} />,
    color: 'emerald',
  },

  // Nhóm 2: Bộ não điều phối
  {
    type: 'diffEngine',
    label: 'So Khớp 2 Chiều',
    subtitle: '3-Way Diff chống ghi đè nhầm',
    category: 'logic',
    icon: <Sparkles size={15} />,
    color: 'purple',
  },
  {
    type: 'routerCondition',
    label: 'Rẽ Nhánh Điều Kiện',
    subtitle: 'Nếu... thì...',
    category: 'logic',
    icon: <Split size={15} />,
    color: 'purple',
  },
  {
    type: 'dataTransform',
    label: 'Chuẩn Hóa Dữ Liệu',
    subtitle: 'Đổi định dạng, ghép cột',
    category: 'logic',
    icon: <Wand2 size={15} />,
    color: 'purple',
  },

  // Nhóm 3: Hành động
  {
    type: 'storageAction',
    label: 'Kho Lưu Trữ An Toàn',
    subtitle: 'Lưu trữ & ghi nhớ bản gốc',
    category: 'action',
    icon: <Database size={15} />,
    color: 'blue',
  },
  {
    type: 'telegramAction',
    label: 'Báo Động Telegram',
    subtitle: 'Gửi tin nhắn tức thì về máy',
    category: 'action',
    icon: <Send size={15} />,
    color: 'sky',
  },
  {
    type: 'sheetWriteAction',
    label: 'Ghi Ngược Lại Sheet',
    subtitle: 'Cập nhật lại bảng tính',
    category: 'action',
    icon: <FileEdit size={15} />,
    color: 'blue',
  },
];

interface NodePaletteProps {
  onAddNode: (item: PaletteItem) => void;
  disabled?: boolean;
}

export const NodePalette: React.FC<NodePaletteProps> = ({ onAddNode, disabled }) => {
  const triggers = PALETTE_ITEMS.filter((i) => i.category === 'trigger');
  const logics = PALETTE_ITEMS.filter((i) => i.category === 'logic');
  const actions = PALETTE_ITEMS.filter((i) => i.category === 'action');

  const renderSection = (title: string, colorText: string, items: PaletteItem[]) => (
    <div className="space-y-1.5 mb-4">
      <div className={`text-[10px] font-bold uppercase tracking-wider px-1 ${colorText}`}>
        {title}
      </div>
      <div className="space-y-1.5">
        {items.map((item) => (
          <div
            key={item.type}
            onClick={() => { if (!disabled && ['sheetsTrigger', 'diffEngine', 'storageAction', 'telegramAction'].includes(item.type)) onAddNode(item); }}
            className="p-2.5 rounded-xl bg-[#171b22] border border-[#2d3748] hover:border-gray-500 hover:bg-[#202632] cursor-pointer transition flex items-center justify-between group shadow-sm"
            aria-disabled={disabled || !['sheetsTrigger', 'diffEngine', 'storageAction', 'telegramAction'].includes(item.type)}
            title={['sheetsTrigger', 'diffEngine', 'storageAction', 'telegramAction'].includes(item.type) ? 'Bấm để thêm' : 'Chưa hỗ trợ thực thi'}
          >
            <div className="flex items-center gap-2.5">
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                  item.color === 'emerald'
                    ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60'
                    : item.color === 'purple'
                    ? 'bg-purple-950/60 text-purple-400 border border-purple-800/60'
                    : item.color === 'sky'
                    ? 'bg-sky-950/60 text-sky-400 border border-sky-800/60'
                    : 'bg-blue-950/60 text-blue-400 border border-blue-800/60'
                }`}
              >
                {item.icon}
              </div>
              <div>
                <div className="text-xs font-semibold text-white group-hover:text-blue-300 transition leading-tight">
                  {item.label}
                </div>
                <div className="text-[10px] text-gray-400 truncate max-w-[140px] leading-tight mt-0.5">
                  {['sheetsTrigger', 'diffEngine', 'storageAction', 'telegramAction'].includes(item.type) ? item.subtitle : 'Chưa hỗ trợ thực thi'}
                </div>
              </div>
            </div>
            <Plus size={14} className="text-gray-500 group-hover:text-white transition shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <aside className="min-h-0 w-64 overflow-hidden bg-[#11151c] border-r border-[#2d3748] p-3 flex flex-col z-20 shrink-0 shadow-2xl select-none">
      <div className="shrink-0 pb-2 border-b border-[#2d3748] mb-3">
        <h3 className="text-xs font-bold text-white uppercase tracking-wider">Thư Viện Khối Điều Phối</h3>
        <p className="text-[11px] text-gray-400 mt-0.5">Bấm để thêm khối vào luồng</p>
      </div>

      <div className="palette-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain pr-2 pt-1 pb-2">
        {renderSection('1. Nguồn Dữ Liệu (Triggers)', 'text-emerald-400', triggers)}
        {renderSection('2. Bộ Não Điều Phối (Logic)', 'text-purple-400', logics)}
        {renderSection('3. Hành Động & Đích Đến', 'text-blue-400', actions)}
      </div>

      <div className="shrink-0 pt-2 border-t border-[#2d3748] text-[10px] text-gray-500 text-center">
        HybridFlow Orchestration Engine
      </div>
    </aside>
  );
};
