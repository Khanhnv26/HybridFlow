export function syncOAuthRedirect(): boolean {
  try {
    const isOAuthPending = sessionStorage.getItem('hf_login_pending') === '1';
    const normalizedPath = window.location.pathname.replace(/\/+$/, '') || '/';
    if (isOAuthPending && (normalizedPath === '/' || normalizedPath === '')) {
      sessionStorage.removeItem('hf_login_pending');
      const search = window.location.search || '';
      window.history.replaceState({}, '', new URLSearchParams(search).get('login') === 'failed' ? `/login${search}` : '/app');
      return true;
    }
  } catch {}
  return false;
}

export function resolveRoute(pathname: string, search: string): 'workspace' | 'landing' | 'login' {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/';
  const params = new URLSearchParams(search);
  if (normalizedPath === '/login' || params.get('login') === 'failed') return 'login';
  if (
    normalizedPath === '/app' ||
    normalizedPath === '/workspace' ||
    params.get('page') === 'app' ||
    params.get('page') === 'workspace' ||
    params.get('view') === 'app' ||
    params.get('view') === 'workspace'
  ) {
    return 'workspace';
  }
  return 'landing';
}
