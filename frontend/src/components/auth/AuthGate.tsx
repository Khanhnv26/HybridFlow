import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Me } from '../../types';
import { authService } from '../../services/api';
import { errorMessage } from '../../services/errors';
import axios from 'axios';

type State =
  | { kind: 'loading' }
  | { kind: 'anonymous' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; user: Me };

export function AuthGate({ children }: { children: (user: Me) => ReactNode }) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    function onExpired() {
      setState({ kind: 'anonymous' });
    }
    window.addEventListener('auth-expired', onExpired);
    return () => window.removeEventListener('auth-expired', onExpired);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: 'loading' });
    authService.me(controller.signal)
      .then(user => {
        if (!controller.signal.aborted) {
          setState({ kind: 'ready', user });
        }
      })
      .catch(error => {
        if (controller.signal.aborted) return;
        if (axios.isAxiosError(error) && error.response?.status === 401) {
          setState({ kind: 'anonymous' });
        } else {
          setState({ kind: 'error', message: errorMessage(error) });
        }
      });
    return () => controller.abort();
  }, [revision]);

  if (state.kind === 'loading') {
    return <p role="status">Đang kiểm tra phiên…</p>;
  }
  if (state.kind === 'error') {
    return (
      <div role="alert" className="min-h-screen flex items-center justify-center p-6 text-danger">
        <div>
          <p>{state.message}</p>
          <button
            className="mt-4 px-4 py-2 bg-subtle text-primary rounded"
            onClick={() => setRevision(value => value + 1)}
          >
            Thử lại
          </button>
        </div>
      </div>
    );
  }
  if (state.kind === 'anonymous') {
    const query = new URLSearchParams(window.location.search);
    const failureMessages: Record<string, string> = {
      authorization_request_not_found: 'Không tìm thấy phiên đăng nhập Google. Hãy mở ứng dụng bằng localhost:3000 và bắt đầu đăng nhập lại trong cùng trình duyệt.',
      invalid_state_parameter: 'Phiên đăng nhập Google không khớp. Hãy bắt đầu đăng nhập lại.',
      invalid_token_response: 'Backend không đổi được mã Google lấy token. Cần kiểm tra client ID/secret và kết nối từ backend đến Google.',
      invalid_id_token: 'Backend không xác minh được ID token Google. Cần kiểm tra thời gian hệ thống và kết nối đến Google.',
      invalid_user_info_response: 'Backend không lấy được thông tin tài khoản từ Google.',
      access_denied: 'Quyền đăng nhập Google đã bị từ chối hoặc hủy.',
      invalid_client: 'Google từ chối cấu hình OAuth client của backend.',
      invalid_grant: 'Mã đăng nhập Google không còn hợp lệ. Hãy bắt đầu đăng nhập lại.',
    };
    const reason = query.get('reason') || 'authentication_failed';
    const knownReason = Object.prototype.hasOwnProperty.call(failureMessages, reason);
    return (
      <main className="min-h-screen flex items-center justify-center bg-surface text-primary p-6">
        <div className="bg-elevated p-8 rounded-xl shadow-xl max-w-md w-full text-center space-y-6">
          <h1 className="text-2xl font-bold tracking-tight">Đăng nhập HybridFlow</h1>
          <p className="text-secondary text-sm">Vui lòng đăng nhập bằng tài khoản Google để tiếp tục.</p>
          {query.get('login') === 'failed' && (
            <div role="alert" className="text-sm text-danger space-y-2">
              <p>{knownReason ? failureMessages[reason] : 'Đăng nhập Google chưa thành công. Kiểm tra log backend ở dòng Google login failed để xác định nguyên nhân.'}</p>
              <p>Mã lỗi: {knownReason ? reason : 'authentication_failed'}</p>
            </div>
          )}
          <a
            href="/api/v1/auth/login/google"
            className="inline-block w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 text-on-accent font-medium rounded-lg transition-colors shadow-sm"
          >
            Tiếp tục với Google
          </a>
        </div>
      </main>
    );
  }
  return <>{children(state.user)}</>;
}
