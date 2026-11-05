import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight, Check, FileSpreadsheet, Menu, RotateCcw, Send, ShieldCheck, X } from 'lucide-react';
import { ThemeToggle } from '../components/ThemeToggle';
import { usePageScroll } from '../hooks/usePageScroll';
import { FaqItem } from '../components/marketing/FaqItem';
import { INDUSTRIES } from '../components/marketing/landingData';
import { HeroProduct, ProductSheet, SafetyPreview, SetupPreview, workflowSteps } from '../components/marketing/ProductPreview';
import './landing.css';

type Industry = keyof typeof INDUSTRIES;
type Scenario = 'idle' | 'syncing' | 'synced' | 'conflict' | 'resolve_1' | 'resolve_2';

export interface LandingPageProps { loginFailed?: boolean; failureReason?: string | null }

const questions = [
  ['Tôi có cần biết lập trình không?', 'Không. Bạn chỉ cần kết nối các bảng Google Sheets, chọn cột và đặt quy tắc đồng bộ. Mọi thao tác được thực hiện ngay trên giao diện.'],
  ['Dữ liệu có được an toàn không?', 'HybridFlow dùng xác thực Google OAuth. Khi có xung đột, dữ liệu gốc được giữ lại để bạn kiểm tra và quyết định cách xử lý. Bạn có thể thu hồi quyền kết nối trong tài khoản Google.'],
  ['Khi hai người sửa cùng lúc thì sao?', 'Thuật toán 3-Way Diff so sánh bản gốc, bảng nguồn và bảng đích. Nếu cùng một ô có thay đổi khác nhau, hệ thống gửi yêu cầu duyệt qua Telegram.'],
  ['Có thể xem lại dữ liệu cũ không?', 'Lịch sử thay đổi lưu các phiên bản trước và sau để bạn đối chiếu, biết ô nào thay đổi và kiểm tra kết quả đồng bộ.'],
];

export function LandingPage({ loginFailed }: LandingPageProps) {
  const [industry, setIndustry] = useState<Industry>('retail');
  const [scenario, setScenario] = useState<Scenario>('conflict');
  const [step, setStep] = useState(0);
  const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const page = useRef<HTMLDivElement>(null);
  usePageScroll(page);
  const scenarioTimer = useRef<ReturnType<typeof setTimeout>>();
  const data = INDUSTRIES[industry];
  const destination = currentUser ? '/app' : '/login';

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const overflow = document.body.style.overflow;
    const title = document.title;
    document.body.style.overflow = 'auto';
    document.title = 'HybridFlow · Hai bảng tính. Một nguồn dữ liệu đúng.';
    const controller = new AbortController();
    fetch('/api/v1/auth/me', { signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(user => { if (!controller.signal.aborted && user?.id) setCurrentUser(user); })
      .catch(() => {});
    const elements = page.current?.querySelectorAll('.ed-reveal');
    const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const animations = new Set<Animation>();
    const cancelAnimations = () => { animations.forEach(animation => animation.cancel()); animations.clear(); };
    const onMotionChange = () => { if (motion?.matches) cancelAnimations(); };
    motion?.addEventListener('change', onMotionChange);
    let observer: IntersectionObserver | undefined;
    let steps: IntersectionObserver | undefined;
    if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('ed-visible');
            if (!motion?.matches) {
              const children = Array.from(entry.target.children);
              children.forEach((child, index) => {
                if (typeof child.animate !== 'function') return;
                const animation = child.animate(
                  [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0)' }],
                  { duration: 460, delay: Math.min(index * 65, 260), easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' },
                );
                animations.add(animation);
                animation.onfinish = () => animations.delete(animation);
              });
            }
            observer?.unobserve(entry.target);
          }
        });
      }, { threshold: .12 });
      elements?.forEach(element => observer!.observe(element));
      steps = new IntersectionObserver(entries => {
        if (window.innerWidth <= 820) return;
        entries.forEach(entry => { if (entry.isIntersecting) setStep(Number((entry.target as HTMLElement).dataset.step)); });
      }, { rootMargin: '-25% 0px -50% 0px', threshold: 0 });
      page.current?.querySelectorAll('[data-step]').forEach(element => steps!.observe(element));
    } else elements?.forEach(element => element.classList.add('ed-visible'));
    return () => {
      controller.abort();
      observer?.disconnect();
      steps?.disconnect();
      motion?.removeEventListener('change', onMotionChange);
      cancelAnimations();
      document.body.style.overflow = overflow;
      document.title = title;
    };
  }, []);

  useEffect(() => () => clearTimeout(scenarioTimer.current), []);

  function changeIndustry(next: Industry) {
    clearTimeout(scenarioTimer.current);
    setIndustry(next);
    setScenario('idle');
  }
  function changeScenario(next: Scenario) {
    clearTimeout(scenarioTimer.current);
    setScenario(next);
    if (next === 'syncing') scenarioTimer.current = setTimeout(() => setScenario('synced'), 700);
  }

  const resolved = scenario === 'resolve_1' || scenario === 'resolve_2';
  const complete = scenario === 'synced' || resolved;
  const conflict = scenario === 'conflict';
  const selected = scenario === 'resolve_2' ? 'resolve2' : 'resolve1';
  const sourceRows = data.sheet1.rows.map((row, i) => [row.c1, row.c2,
    i === 2 && conflict ? data.tg.conflictStatusSale : i === 2 && resolved ? data.tg[`${selected}SaleQty`] : i === 2 && complete ? data.tg.syncedSaleQty : row.c3,
    i === 2 && conflict ? data.tg.conflictSaleTag : i === 2 && resolved ? data.tg[`${selected}SaleStatus`] : i === 2 && complete ? data.tg.syncedSaleStatus : row.c4 || '',
  ]);
  const targetRows = data.sheet2.rows.map((row, i) => [row.c1,
    i === 2 && conflict ? data.tg.conflictStatusStock : i === 2 && resolved ? data.tg[`${selected}StockCount`] : i === 2 && complete ? data.tg.syncedStockCount : row.c2,
    i === 2 && conflict ? data.tg.conflictStockTag : i === 2 && resolved ? data.tg[`${selected}StockStatus`] : i === 2 && complete ? data.tg.syncedStockStatus : row.c3,
  ]);
  const formula1 = resolved ? data.tg[`${selected}Formula1`] : complete ? data.tg.syncedFormula1 : data.sheet1.formula;
  const formula2 = resolved ? data.tg[`${selected}Formula2`] : complete ? data.tg.syncedFormula2 : data.sheet2.formula;

  return <div className="editorial-landing marketing-surface" ref={page}>
    <header className="ed-header"><div className="ed-container ed-header-inner">
      <a className="ed-brand" href="/" aria-label="HybridFlow · Trang chủ"><span className="flow-brand-mark"><ArrowUpRight size={24} /></span>HybridFlow</a>
      <nav aria-label="Điều hướng chính" className={menuOpen ? 'ed-nav is-open' : 'ed-nav'}>
        {[['#product', 'Sản phẩm'], ['#how-it-works', 'Cách hoạt động'], ['#sandbox', 'Trải nghiệm'], ['#faq', 'Hỏi đáp']].map(([href, text]) => <a key={href} href={href} onClick={() => setMenuOpen(false)}>{text}</a>)}
      </nav>
      <div className="ed-header-actions"><ThemeToggle /><a className="ed-button ed-button-small" href={destination}>{currentUser ? 'Workspace' : 'Đăng nhập'}<ArrowRight size={14} /></a><button className="ed-menu" type="button" aria-label={menuOpen ? 'Đóng menu' : 'Mở menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)}>{menuOpen ? <X size={21} /> : <Menu size={21} />}</button></div>
    </div></header>

    {loginFailed && <div className="ed-container ed-login-notice" role="alert">Đăng nhập Google chưa thành công. <a href="/login">Thử đăng nhập lại →</a></div>}

    <main>
      <section className="ed-hero ed-container" id="product">
        <div className="ed-hero-main">
        <div className="ed-hero-copy ed-reveal"><p className="ed-kicker">DÀNH CHO ĐỘI NGŨ VẬN HÀNH</p><h1>Hai bảng tính.<br />Một nguồn{' '}<br />dữ liệu <em>đúng.</em></h1><p className="ed-intro">Đồng bộ Google Sheets hai chiều.<br />Phát hiện xung đột trước khi dữ liệu bị ghi đè.</p><div className="ed-hero-actions"><a className="ed-button" href={destination}>{currentUser ? 'Vào Workspace' : 'Bắt đầu miễn phí'}<ArrowRight size={17} /></a><a className="ed-text-link" href="#how-it-works">Xem cách hoạt động <ArrowDown size={16} /></a></div></div>
        <HeroProduct />
        </div>
        <div className="ed-capabilities ed-reveal"><span><FileSpreadsheet size={22} /> Google Sheets</span><span><span aria-hidden="true">⇄</span> Đồng bộ hai chiều</span><span><Send size={21} /> Duyệt qua Telegram</span></div>
      </section>

      <section className="ed-comparison ed-container ed-reveal" id="comparison">
        <p className="ed-kicker">ÍT ĐỐI SOÁT HƠN. NHIỀU THỜI GIAN HƠN.</p><h2>Một lần sửa.<br className="ed-mobile-break" /> Không còn ba lần đối soát.</h2>
        <div className="ed-comparison-layout"><div className="ed-comparison-story"><span className="ed-number">01</span><h3>Dữ liệu thường bị lệch vì phải cập nhật ở nhiều nơi.</h3><p>Sửa ở bảng của Sale, rồi lại phải báo Kho, nhắn tin xác nhận, và cuối ngày vẫn phải dò soát lại từng dòng.</p><a className="ed-text-link" href="#sandbox">Thử một cách khác <ArrowRight size={16} /></a></div>
        <div className="ed-comparison-table"><table><caption className="sr-only">So sánh quản lý thủ công và HybridFlow</caption><thead><tr><th /><th>Trước đây</th><th>Với HybridFlow</th></tr></thead><tbody>{[['Cập nhật dữ liệu', 'Copy / paste thủ công', 'Tự đồng bộ hai chiều'], ['Xử lý khác biệt', 'Hỏi lại số liệu qua chat', 'Cảnh báo trước khi ghi đè'], ['Đảm bảo chính xác', 'Dò lỗi, đối soát cuối ngày', 'Giữ dữ liệu gốc và lịch sử']].map(([title, before, after], index) => <tr key={title} style={{ '--row': index } as React.CSSProperties}><th scope="row">{title}</th><td><span>{before}</span></td><td><Check size={16} /><span>{after}</span></td></tr>)}</tbody></table></div></div>
      </section>

      <section className="ed-dark ed-how" id="how-it-works"><div className="ed-container">
        <div className="ed-section-heading ed-reveal"><p className="ed-kicker">KẾT NỐI MỘT LẦN. DÙNG TRONG CÔNG VIỆC MỖI NGÀY.</p><h2>Từ thay đổi nhỏ đến<br />quy trình liền mạch.</h2></div>
        <div className="ed-how-layout"><div className="ed-step-list">{workflowSteps.map((item, index) => <div className={`ed-step ${index === step ? 'is-active' : ''}`} data-step={index} key={item.title}><button type="button" aria-pressed={index === step} onClick={() => setStep(index)}><span>0{index + 1}</span><strong>{item.title}</strong></button><p>{item.description}</p></div>)}</div><div className="ed-setup-sticky"><SetupPreview step={step} /><p className="ed-setup-caption">Cuộn hoặc chọn từng bước để xem cách HybridFlow hoạt động.</p></div></div>
      </div></section>

      <section className="ed-demo ed-container" id="sandbox">
        <div className="ed-section-heading ed-reveal"><p className="ed-kicker">KHÔNG CẦN ĐĂNG NHẬP ĐỂ TRẢI NGHIỆM</p><h2>Thử sửa một ô.<br />Xem cả quy trình chạy.</h2><p>Chọn lĩnh vực, tạo một thay đổi và xem cách hai bảng tính giữ dữ liệu khớp nhau.</p></div>
        <div className="ed-industry-tabs" style={{ '--active-tab': Object.keys(INDUSTRIES).indexOf(industry) } as React.CSSProperties} role="group" aria-label="Lĩnh vực trải nghiệm">{(Object.keys(INDUSTRIES) as Industry[]).map(key => <button type="button" key={key} aria-pressed={industry === key} onClick={() => changeIndustry(key)}>{INDUSTRIES[key].name}</button>)}</div>
        <div className="ed-demo-toolbar"><span>Kịch bản:</span><button type="button" aria-pressed={scenario === 'syncing' || scenario === 'synced'} disabled={scenario === 'syncing'} onClick={() => changeScenario('syncing')}>{data.btnNormal}</button><button type="button" aria-pressed={conflict || resolved} onClick={() => changeScenario('conflict')}>{data.btnConflict}</button><button type="button" className="ed-reset" onClick={() => changeScenario('idle')} aria-label="Đặt lại"><RotateCcw size={14} /><span>Đặt lại</span></button></div>
        <div key={industry} className={`ed-demo-layout ed-pane-enter ${conflict ? 'has-conflict' : ''} ${complete ? 'is-complete' : ''}`}>
          <div className="ed-demo-sheets" key={industry}>
            <ProductSheet title={data.sheet1.filename} headers={[...data.sheet1.headers]} rows={sourceRows} formula={formula1} tone={conflict ? 'amber' : 'green'} label="01 · Bảng nguồn" />
            <div className={`ed-sync-label ${scenario === 'syncing' ? 'is-syncing' : ''}`} role="status"><span>⇄</span>{scenario === 'syncing' ? 'Đang đồng bộ thay đổi…' : complete ? 'Hai bảng đã khớp dữ liệu' : conflict ? 'Giữ nguyên dữ liệu gốc · Chờ bạn duyệt' : 'HybridFlow · Đồng bộ hai chiều'}</div>
            <ProductSheet title={data.sheet2.filename} headers={[...data.sheet2.headers]} rows={targetRows} formula={formula2} tone={conflict ? 'amber' : 'green'} label="02 · Bảng đích" />
          </div>
          <div className="ed-telegram"><div className="ed-telegram-header"><span><Send size={18} /></span><strong>Telegram</strong><small>Bản mô phỏng</small></div><div className="ed-chat-thread" aria-live="polite"><div className="ed-chat-identity"><span>⇄</span><div><strong>HybridFlow</strong><small>{data.tg.botSubtitle}</small></div></div>
            <div className="ed-chat-message"><ShieldCheck size={16} /><p>{data.tg.defaultMsg}</p></div>
            {scenario === 'syncing' && <div className="ed-chat-message ed-chat-enter"><p>{data.tg.syncingMsg}</p><span className="ed-typing">•••</span></div>}
            {(conflict || resolved) && <div className="ed-chat-message ed-chat-message--warning ed-chat-enter"><div><strong>⚠ Cảnh báo xung đột số liệu!</strong><p>{data.tg.conflictPrompt}</p>{conflict && <div className="ed-approval-buttons"><button type="button" onClick={() => changeScenario('resolve_1')}>{data.tg.opt1Btn}</button><button type="button" onClick={() => changeScenario('resolve_2')}>{data.tg.opt2Btn}</button></div>}</div></div>}
            {complete && <div className="ed-chat-message ed-chat-message--success ed-chat-enter" key={scenario}><Check size={17} /><div><strong>{resolved ? 'Đã giải quyết tranh chấp an toàn' : 'Đã đồng bộ thành công'}</strong><p>{resolved ? data.tg[`${selected}Desc`] : data.tg.syncedTgMsg}</p></div></div>}
            {scenario === 'idle' && <div className="ed-chat-hint"><ArrowRight size={16} /><p>Chọn một kịch bản bên trên để xem thông báo và thử duyệt thay đổi.</p></div>}
          </div><div className="ed-chat-footer">Dữ liệu minh họa · Không thay đổi bảng tính của bạn</div></div>
        </div>
      </section>

      <section className="ed-dark ed-safety" id="features"><div className="ed-container"><div className="ed-section-heading ed-reveal"><p className="ed-kicker">TỰ ĐỘNG PHẦN LẶP LẠI. GIỮ QUYỀN QUYẾT ĐỊNH.</p><h2>Tự động hóa, vẫn trong<br />tầm kiểm soát.</h2></div>{[
        { kind: 'diff' as const, title: 'Không ghi đè khi chưa rõ', text: 'Thuật toán 3-Way Diff phát hiện khác biệt và yêu cầu duyệt trước khi cập nhật. Dữ liệu gốc được giữ để đối chiếu.' },
        { kind: 'history' as const, title: 'Mọi thay đổi đều có dấu vết', text: 'Theo dõi các phiên bản trước và sau. Xem dữ liệu đã thay đổi thế nào, thay vì phải đoán số nào mới đúng.' },
        { kind: 'workflows' as const, title: 'Nhiều quy trình, một nơi quản lý', text: 'Quản lý từng quy trình đồng bộ, theo dõi trạng thái và phát hiện vấn đề trong cùng một Workspace.' },
      ].map((feature, index) => <div className="ed-safety-row ed-reveal" key={feature.kind}><div className="ed-safety-copy"><span className="ed-number">0{index + 1}</span><div><h3>{feature.title}</h3><p>{feature.text}</p></div></div><SafetyPreview kind={feature.kind} /></div>)}</div></section>

      <section className="ed-faq ed-container" id="faq"><div className="ed-reveal"><p className="ed-kicker">RÕ RÀNG TRƯỚC KHI BẮT ĐẦU</p><h2>Những điều bạn{' '}<br />muốn biết.</h2><a className="ed-text-link" href="#sandbox">Tự trải nghiệm trước <ArrowRight size={16} /></a></div><div className="ed-questions ed-reveal">{questions.map(([question, answer], index) => <FaqItem key={question} question={question} answer={answer} index={index} />)}</div></section>

      <section className="ed-final"><div className="ed-container ed-reveal"><p className="ed-kicker">BẮT ĐẦU TỪ NHỮNG BẢNG TÍNH BẠN ĐANG CÓ</p><h2>Để bảng tính<br className="ed-mobile-break" /> làm việc cùng bạn.</h2><p>Đồng bộ dữ liệu, kiểm soát thay đổi và giảm thời gian đối soát mỗi ngày.</p><a href={destination} className="ed-button">{currentUser ? 'Mở Workspace' : 'Kết nối Google Sheets'}<ArrowRight size={17} /></a></div></section>
    </main>
    <footer className="ed-footer"><div className="ed-container"><a href="/" className="ed-brand"><span className="flow-brand-mark"><ArrowUpRight size={24} /></span>HybridFlow</a><p>Tự động hóa bắt đầu từ dữ liệu đúng.</p><small>© 2026 HybridFlow</small><a href="#product">Lên đầu trang ↑</a></div></footer>
  </div>;
}

export default LandingPage;
