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
      <div role="alert" className="min-h-screen flex items-center justify-center p-6 text-red-400">
        <div>
          <p>{state.message}</p>
          <button
            className="mt-4 px-4 py-2 bg-slate-700 text-white rounded"
            onClick={() => setRevision(value => value + 1)}
          >
            Thử lại
          </button>
        </div>
      </div>
    );
  }
  if (state.kind === 'anonymous') {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-900 text-white p-6">
        <div className="bg-slate-800 p-8 rounded-xl shadow-xl max-w-md w-full text-center space-y-6">
          <h1 className="text-2xl font-bold tracking-tight">Đăng nhập HybridFlow</h1>
          <p className="text-slate-400 text-sm">Vui lòng đăng nhập bằng tài khoản Google để tiếp tục.</p>
          <a
            href="/api/v1/auth/login/google"
            className="inline-block w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors shadow-sm"
          >
            Tiếp tục với Google
          </a>
        </div>
      </main>
    );
  }
  return <>{children(state.user)}</>;
}
