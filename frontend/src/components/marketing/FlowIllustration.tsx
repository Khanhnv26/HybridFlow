import { ArrowUpRight, Check, FileSpreadsheet, Send, ShieldCheck, RefreshCw } from 'lucide-react';

export function FlowIllustration({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flow-illustration${compact ? ' flow-illustration--compact' : ''}`} role="img" aria-label="Minh họa hai bảng Google Sheets đồng bộ qua HybridFlow và gửi yêu cầu duyệt tới Telegram">
      <div className="flow-status"><span><Check size={13} /> Đã đồng bộ</span><span><ShieldCheck size={13} /> Dữ liệu an toàn</span></div>
      <svg className="flow-connections" viewBox="0 0 640 460" fill="none" aria-hidden="true">
        {['M185 145 C230 145 220 230 250 230', 'M185 315 C230 315 220 230 250 230', 'M403 230 C435 230 420 225 455 225'].map((path, i) => <g key={path}>
          <path d={path} className="flow-wire-halo" />
          <path d={path} className="flow-wire" />
          <path d={path} className="flow-wire-particle" style={{ animationDelay: `${i * -.9}s` }} />
        </g>)}
      </svg>
      {['A', 'B'].map((source, i) => <div className={`flow-sheet flow-sheet--${source.toLowerCase()} flow-panel`} key={source} aria-hidden="true">
        <div className="flow-panel-heading"><span className="flow-app-icon"><FileSpreadsheet size={23} /></span><div><strong>Google Sheets</strong><small>Nguồn {source} · {i === 0 ? 'Bán hàng' : 'Tồn kho'}</small></div></div>
        <div className="flow-mini-sheet">{Array.from({ length: 16 }, (_, cell) => <span key={cell} style={{ animationDelay: `${cell * .12 + i}s` }} />)}</div>
        <div className="flow-sheet-caption"><span className="flow-live-dot" /> {i === 0 ? 'Đơn hàng mới' : 'Sẵn sàng đồng bộ'}</div>
      </div>)}
      <div className="flow-hub flow-panel" aria-hidden="true"><span className="flow-brand-mark"><ArrowUpRight size={33} strokeWidth={2.5} /></span><strong>HybridFlow</strong><span><RefreshCw size={13} /> Đồng bộ hai chiều</span><small>Kiểm soát xung đột</small></div>
      <div className="flow-telegram flow-panel" aria-hidden="true"><div className="flow-panel-heading"><span className="flow-telegram-icon"><Send size={22} /></span><div><strong>Telegram</strong><small>Duyệt ngay trên điện thoại</small></div></div><div className="flow-message"><ShieldCheck size={17} /><div><strong>Phát hiện thay đổi</strong><span>Giữ nguyên dữ liệu gốc.<br />Bạn quyết định số liệu cuối.</span></div></div><div className="flow-demo-actions"><span><Check size={13} /> Duyệt</span><span>Giữ bản gốc</span></div></div>
      <div className="flow-caption"><span className="flow-live-dot" /> Minh họa quy trình · Kết nối dữ liệu, giữ trọn kiểm soát</div>
    </div>
  );
}

export function MarketingBackdrop() {
  return <div className="marketing-backdrop" aria-hidden="true"><div className="marketing-grid" /><div className="marketing-orb marketing-orb--one" /><div className="marketing-orb marketing-orb--two" /><div className="marketing-wave" /></div>;
}
