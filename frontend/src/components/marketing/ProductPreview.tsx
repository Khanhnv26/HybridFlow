import { useEffect, useRef, useState } from 'react';
import { ArrowDown, Check, FileSpreadsheet, MoreHorizontal, ShieldCheck } from 'lucide-react';

export function ProductSheet({ title, headers, rows, formula = '=SUM(C2:C4)', tone = 'green', label }: {
  title: string; headers: string[]; rows: string[][]; formula?: string;
  tone?: 'green' | 'amber' | 'neutral'; label?: string;
}) {
  return <div className={`product-sheet product-sheet--${tone}`}>
    <div className="product-sheet-title"><FileSpreadsheet size={21} /><div><strong>{title}</strong><small>Google Sheets <span>· Tệp &nbsp; Chỉnh sửa &nbsp; Xem &nbsp; Dữ liệu</span></small></div>{label && <span className="product-sheet-label">{label}</span>}<MoreHorizontal size={16} /></div>
    <div className="product-formula"><span>C4</span><i>fx</i><code>{formula}</code></div>
    <div className="product-table-scroll"><table><caption className="sr-only">{title}</caption><thead><tr><th aria-label="Số dòng">1</th>{headers.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i} className={i === 2 ? 'product-active-row' : ''}><th scope="row">{i + 2}</th>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>
    <small className="product-scroll-hint">Kéo ngang để xem bảng →</small>
    <div className="product-sheet-footer"><FileSpreadsheet size={12} /><span>Sheet 1</span><small>Đã lưu thay đổi</small></div>
  </div>;
}

export function HeroProduct() {
  const [synced, setSynced] = useState(false);
  const preview = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (typeof window === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setInterval(() => {
      if (!document.hidden && preview.current && preview.current.getBoundingClientRect().bottom > 0 && preview.current.getBoundingClientRect().top < window.innerHeight) setSynced(value => !value);
    }, 3600);
    return () => clearInterval(timer);
  }, []);
  return <div ref={preview} className={`editorial-product ${synced ? 'is-synced' : ''}`} aria-label="Minh họa đơn hàng thay đổi và tồn kho cập nhật từ 100 xuống 95">
    <div className="editorial-product-main"><ProductSheet title="Đơn hàng · Sale" headers={['Mã đơn', 'Sản phẩm', 'SL', 'Thành tiền']} rows={[
      ['#DH-101', 'Áo thun', '10', '1.000.000'], ['#DH-102', 'Túi tote', '3', '360.000'], ['#DH-103', 'Áo Polo Kem', '5', '2.200.000'], ['#DH-104', 'Mũ lưỡi trai', '4', '320.000'],
    ]} formula="=5" /></div>
    <div className="editorial-product-stock"><div><FileSpreadsheet size={17} /><strong>Kho · Tồn kho</strong></div><span>Mã sản phẩm <b>Tồn kho</b></span><p>POLO-KEM <strong key={String(synced)}>{synced ? '95' : '100'}</strong></p><small>{synced ? 'Đã trừ 5 chiếc' : 'Chờ đơn hàng mới'}</small></div>
    <div className="editorial-history"><strong>Lịch sử thay đổi: #DH-103</strong><div><span className="editorial-history-line" /><span>100 <ArrowDown size={12} /> <b className={synced ? 'history-updated' : ''}>95</b></span><p>Cập nhật từ Kho <time>10:24</time></p></div><div><span /><span>0 <ArrowDown size={12} /> <b>5</b></span><p>Đơn mới từ Sale <time>10:27</time></p></div></div>
    <button type="button" className="editorial-product-status" onClick={() => setSynced(value => !value)} aria-label="Chạy minh họa đồng bộ tồn kho"><Check size={13} />{synced ? '01 thay đổi · 02 bảng đã khớp' : 'Thử đồng bộ: 100 → 95'} <span aria-hidden="true">↻</span></button>
  </div>;
}

export const workflowSteps = [
  { title: 'Kết nối bảng tính', description: 'Chọn hai bảng Google Sheets bạn muốn giữ nhất quán dữ liệu.' },
  { title: 'Đặt quy tắc', description: 'Chọn cột, chiều đồng bộ và cách xử lý khi có xung đột.' },
  { title: 'Theo dõi & duyệt', description: 'Xem thay đổi, nhận thông báo và quyết định ngay trên Telegram.' },
];

export function SetupPreview({ step }: { step: number }) {
  return <div className="setup-preview" aria-live="polite">
    <div className="setup-title"><span className="editorial-mark">⇄</span><strong>HybridFlow <span>/ Tạo quy trình đồng bộ</span></strong><small>0{step + 1} / 03</small></div>
    <div className="setup-content" key={step}>
      <span className="editorial-kicker">{workflowSteps[step].title}</span>
      {step === 0 ? <><h3>Bảng tính nào cần kết nối?</h3><div className="setup-sources"><div><small>Bảng nguồn (A)</small><p><FileSpreadsheet size={22} /> Đơn hàng · Sale <Check size={15} /></p></div><span>⇄</span><div><small>Bảng đích (B)</small><p><FileSpreadsheet size={22} /> Kho · Tồn kho <Check size={15} /></p></div></div><div className="setup-notice"><ShieldCheck size={17} /> Kết nối bằng tài khoản Google của bạn.</div></> : step === 1 ? <><h3>Ghép cột. Giữ dữ liệu khớp.</h3><div className="setup-mapping"><div><b>Cột ở bảng nguồn (A)</b><b>Cột ở bảng đích (B)</b></div>{[['ma_don', 'ma_don'], ['so_luong', 'so_luong'], ['trang_thai', 'trang_thai']].map(([a, b]) => <div key={a}><span>{a}</span><span>{b}</span><i>⇄</i></div>)}</div><div className="setup-notice"><Check size={16} /> Đồng bộ hai chiều · Hỏi khi có xung đột</div></> : <><h3>Mọi thay đổi, trong tầm mắt.</h3><div className="setup-review"><span><Check size={17} /> Đã kết nối hai bảng tính</span><span><Check size={17} /> Quy tắc đồng bộ đã sẵn sàng</span><span><ShieldCheck size={17} /> Giữ bản gốc khi có xung đột</span></div><div className="setup-notice">Thông báo qua Telegram <b>Đã kết nối</b></div></>}
    </div>
    <div className="setup-bottom"><span>Minh họa cấu hình</span><span>{step === 2 ? 'Sẵn sàng đồng bộ' : 'Thay đổi bước để khám phá'} →</span></div>
  </div>;
}

export function SafetyPreview({ kind }: { kind: 'diff' | 'history' | 'workflows' }) {
  if (kind === 'diff') return <div className="safety-preview safety-diff"><div><span>Ô dữ liệu</span><span>Bản gốc</span><span>Từ Sale</span><span>Từ Kho</span></div><div><strong>SL (#DH-103)</strong><b>5</b><b>8</b><b>2</b></div><small><ShieldCheck size={12} /> Giữ bản gốc · Chờ bạn phê duyệt</small></div>;
  if (kind === 'history') return <div className="safety-preview safety-history"><strong>Lịch sử: #DH-103</strong>{[['10:27', 'Duyệt số của Sale: 8 chiếc', 'Quản lý'], ['10:24', 'Cập nhật từ Kho: 2 chiếc', 'Thủ kho'], ['10:12', 'Tạo đơn hàng: 5 chiếc', 'Sale']].map(([time, text, user], i) => <div key={time} style={{ '--row': i } as React.CSSProperties}><time>{time}</time><span>{text}</span><small>{user}</small></div>)}</div>;
  return <div className="safety-preview safety-workflows"><div><strong>Quy trình đồng bộ</strong><small>Trạng thái</small></div>{[['Đơn hàng ↔ Tồn kho', 'Đang chạy'], ['Học phí ↔ Kế toán', 'Đang chạy'], ['Thu chi ↔ Tổng hợp', 'Tạm dừng']].map(([name, state]) => <div key={name}><span><FileSpreadsheet size={15} />{name}</span><small className={state === 'Đang chạy' ? 'is-running' : ''}>{state}</small><MoreHorizontal size={15} /></div>)}</div>;
}
