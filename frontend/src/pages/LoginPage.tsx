import { useEffect } from 'react';
import { ArrowUpRight, ArrowLeft, ShieldCheck, Check } from 'lucide-react';
import { ThemeToggle } from '../components/ThemeToggle';
import { FlowIllustration, MarketingBackdrop } from '../components/marketing/FlowIllustration';

const failureMessages: Record<string, string> = {
  authorization_request_not_found: 'Không tìm thấy phiên đăng nhập Google. Hãy bắt đầu đăng nhập lại trong cùng trình duyệt.',
  invalid_state_parameter: 'Phiên đăng nhập Google không khớp. Hãy bắt đầu đăng nhập lại.',
  invalid_token_response: 'Backend không đổi được mã Google lấy token. Cần kiểm tra client ID/secret và kết nối từ backend đến Google.',
  invalid_id_token: 'Backend không xác minh được ID token Google. Cần kiểm tra thời gian hệ thống và kết nối đến Google.',
  invalid_user_info_response: 'Backend không lấy được thông tin tài khoản từ Google.',
  access_denied: 'Quyền đăng nhập Google đã bị từ chối hoặc hủy.',
  invalid_client: 'Google từ chối cấu hình OAuth client của backend.',
  invalid_grant: 'Mã đăng nhập Google không còn hợp lệ. Hãy bắt đầu đăng nhập lại.',
};

export function LoginPage() {
  const query = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
  const reason = query.get('reason') || 'authentication_failed';
  const knownReason = Object.prototype.hasOwnProperty.call(failureMessages, reason);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const previousOverflow = document.body.style.overflow;
    const previousTitle = document.title;
    document.body.style.overflow = 'auto';
    document.title = 'Đăng nhập · HybridFlow';
    return () => { document.body.style.overflow = previousOverflow; document.title = previousTitle; };
  }, []);

  return <main className="login-page marketing-surface">
    <MarketingBackdrop />
    <header className="login-header"><a href="/" className="marketing-brand" aria-label="HybridFlow · Trang chủ"><span className="flow-brand-mark"><ArrowUpRight size={25} /></span>HybridFlow</a><ThemeToggle /></header>
    <div className="login-layout">
      <section className="login-story">
        <div className="marketing-eyebrow"><span className="flow-live-dot" /> BẢNG TÍNH QUEN THUỘC. KHẢ NĂNG MỚI.</div>
        <h2>Dữ liệu khớp.<br /><span>Công việc trôi.</span></h2>
        <p>Kết nối bảng tính và tự động hóa quy trình của bạn. Để đội ngũ tập trung vào những việc quan trọng hơn.</p>
        <FlowIllustration compact />
        <div className="login-benefits"><span><Check size={15} /> Đồng bộ hai chiều</span><span><Check size={15} /> Bảo vệ dữ liệu gốc</span></div>
      </section>
      <section className="login-card" aria-labelledby="login-title">
        <span className="login-card-icon"><ArrowUpRight size={28} /></span>
        <div className="marketing-eyebrow">WORKSPACE CỦA BẠN</div>
        <h1 id="login-title">Chào mừng trở lại</h1>
        <p>Đăng nhập để vào Workspace và tiếp tục quy trình của bạn.</p>
        {query.get('login') === 'failed' && <div role="alert" className="login-error"><p>{knownReason ? failureMessages[reason] : 'Đăng nhập Google chưa thành công. Vui lòng thử lại.'}</p><small>Mã lỗi: {knownReason ? reason : 'authentication_failed'}</small></div>}
        <a className="google-login-button" href="/api/v1/auth/login/google" onClick={() => { try { sessionStorage.setItem('hf_login_pending', '1'); } catch {} }}>
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" /></svg>
          Tiếp tục với Google
        </a>
        <div className="login-assurance"><ShieldCheck size={16} /><span>Xác thực an toàn qua Google</span></div>
        <div className="login-card-divider" />
        <p className="login-note">Dùng tài khoản Google của bạn để kết nối Google Sheets và quản lý các quy trình trong cùng một nơi.</p>
        <a href="/" className="login-back"><ArrowLeft size={15} /> Về trang chủ</a>
      </section>
    </div>
    <footer className="login-footer"><span>© 2026 HybridFlow</span><span>Bảng tính kết nối. Đội ngũ đồng hành.</span></footer>
  </main>;
}

export function OpenWorkspace() {
  useEffect(() => { window.location.replace('/app'); }, []);
  return <p role="status">Đang mở Workspace…</p>;
}
