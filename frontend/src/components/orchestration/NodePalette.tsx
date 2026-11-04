import React, { useEffect, useRef, useState } from 'react';
import { Clock, Webhook, Sparkles, Split, Wand2, Database, FileEdit, Plus, Search } from 'lucide-react';
import { ExcelIcon, TelegramIcon } from '../icons/BrandIcons';
import { OrchestrationNodeType } from '../../types';

interface PaletteItem {
  type: OrchestrationNodeType;
  label: string;
  subtitle: string;
  category: 'trigger' | 'logic' | 'action';
  icon: React.ReactNode;
  color: string;
}

const executableTypes = new Set<OrchestrationNodeType>([
  'sheetsTrigger', 'scheduleTrigger', 'diffEngine', 'dataTransform', 'routerCondition', 'storageAction', 'telegramAction',
]);

const PALETTE_ITEMS: PaletteItem[] = [
  // Nhóm 1: Nguồn dữ liệu
  {
    type: 'sheetsTrigger',
    label: 'Google Trang Tính',
    subtitle: 'Lắng nghe thay đổi dữ liệu',
    category: 'trigger',
    icon: <ExcelIcon size={22} />,
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
    label: 'Điều phối & Đồng bộ',
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
    subtitle: 'Làm sạch cột trước khi so khớp',
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
    icon: <TelegramIcon size={22} />,
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
  open?: boolean;
  onAddNode: (item: PaletteItem) => void;
  disabled?: boolean;
}

export const NodePalette: React.FC<NodePaletteProps> = ({ onAddNode, disabled, open = true }) => {
  const palette = useRef<HTMLElement>(null);
  useEffect(() => { if (palette.current) palette.current.inert = !open; }, [open]);
  const [query, setQuery] = useState('');
  const normalize = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
  const matching = PALETTE_ITEMS.filter(item => normalize(`${item.label} ${item.subtitle} ${item.type}`).includes(normalize(query.trim())));
  const triggers = matching.filter((i) => i.category === 'trigger');
  const logics = matching.filter((i) => i.category === 'logic');
  const actions = matching.filter((i) => i.category === 'action');

  const renderSection = (title: string, colorText: string, items: PaletteItem[]) => items.length > 0 && (
    <div className="space-y-1.5 mb-4">
      <div className={`text-xs font-bold uppercase tracking-wider px-1 ${colorText}`}>
        {title}
      </div>
      <div className="space-y-1.5">
        {items.map((item) => (
          <button
            type="button"
            disabled={disabled || !executableTypes.has(item.type)}
            key={item.type}
            onClick={() => { if (!disabled && executableTypes.has(item.type)) onAddNode(item); }}
            className="w-full text-left disabled:opacity-40 disabled:cursor-not-allowed p-2.5 rounded-xl bg-elevated border border-line hover:border-line hover:bg-subtle cursor-pointer transition flex items-center justify-between group shadow-sm"
            aria-disabled={disabled || !executableTypes.has(item.type)}
            title={executableTypes.has(item.type) ? 'Bấm để thêm' : 'Chưa hỗ trợ thực thi'}
          >
            <div className="flex items-center gap-2.5">
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                  item.color === 'emerald'
                    ? 'bg-success-soft text-success border border-emerald-800/60'
                    : item.color === 'purple'
                    ? 'bg-violet-soft text-violet border border-purple-800/60'
                    : item.color === 'sky'
                    ? 'bg-info-soft text-info border border-sky-800/60'
                    : 'bg-info-soft text-info border border-blue-800/60'
                }`}
              >
                {item.icon}
              </div>
              <div>
                <div className="text-xs font-semibold text-primary group-hover:text-info transition leading-tight">
                  {item.label}
                </div>
                <div className="text-xs text-secondary leading-snug mt-1">
                  {executableTypes.has(item.type) ? item.subtitle : 'Chưa hỗ trợ thực thi'}
                </div>
              </div>
            </div>
            <Plus size={14} className="text-muted group-hover:text-primary transition shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <aside ref={palette} data-open={open} aria-hidden={!open} aria-label="Thư viện khối" className="node-palette min-h-0 w-72 overflow-hidden bg-surface border-r border-line p-3 flex flex-col z-20 shrink-0 select-none">
      <div className="shrink-0 pb-2 border-b border-line mb-3">
        <h3 className="text-xs font-bold text-primary uppercase tracking-wider">Thư Viện Khối Điều Phối</h3>
        <p className="text-xs text-secondary mt-0.5">Bấm để thêm khối vào luồng</p>
        <label className="mt-3 flex items-center gap-2 rounded-lg border border-line bg-elevated px-2.5 py-2 text-muted">
          <Search size={15} className="shrink-0" />
          <input aria-label="Tìm khối" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm khối…" className="min-w-0 w-full bg-transparent text-sm text-primary outline-none placeholder:text-muted" />
        </label>
      </div>

      <div className="palette-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain pr-2 pt-1 pb-2">
        {renderSection('1. Nguồn Dữ Liệu (Triggers)', 'text-success', triggers)}
        {renderSection('2. Bộ Não Điều Phối (Logic)', 'text-violet', logics)}
        {renderSection('3. Hành Động & Đích Đến', 'text-info', actions)}
        {matching.length === 0 && <p role="status" className="px-1 py-4 text-sm text-secondary">Không tìm thấy khối. Thử từ khóa khác.</p>}
      </div>

      <div className="shrink-0 pt-2 border-t border-line text-xs text-muted text-center">
        HybridFlow Orchestration Engine
      </div>
    </aside>
  );
};
