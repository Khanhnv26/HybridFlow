import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Me } from '../../types';
import { authService } from '../../services/api';
import { errorMessage } from '../../services/errors';
import axios from 'axios';
import { LoginPage } from '../../pages/LoginPage';

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
  if (state.kind === 'anonymous') return <LoginPage />;
  return <>{children(state.user)}</>;
}
