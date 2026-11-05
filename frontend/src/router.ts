export function syncOAuthRedirect(): boolean {
  try {
    const isOAuthPending = sessionStorage.getItem('hf_login_pending') === '1';
    const normalizedPath = window.location.pathname.replace(/\/+$/, '') || '/';
    if (isOAuthPending && (normalizedPath === '/' || normalizedPath === '')) {
      sessionStorage.removeItem('hf_login_pending');
      window.history.replaceState({}, '', '/app');
      return true;
    }
  } catch {}
  return false;
}

export function resolveRoute(pathname: string, search: string): 'workspace' | 'landing' {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/';
  const params = new URLSearchParams(search);
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
