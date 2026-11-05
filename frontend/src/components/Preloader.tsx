import { useEffect, useLayoutEffect, useState } from 'react';
import type { ReactNode } from 'react';

export function Preloader({ detail = 'Đang khởi tạo giao diện', leaving = false, onExit }: {
  detail?: string; leaving?: boolean; onExit?: () => void;
}) {
  const [percent, setPercent] = useState(leaving ? 100 : 0);

  useEffect(() => {
    if (leaving || typeof requestAnimationFrame !== 'function') {
      setPercent(100);
      return;
    }
    const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
    let frame: number;
    const step = (now: number) => {
      const p = Math.min(100, Math.round(((now - start) / 1000) * 100));
      setPercent(p);
      if (p < 100 && typeof requestAnimationFrame === 'function') frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      if (typeof cancelAnimationFrame === 'function' && frame) cancelAnimationFrame(frame);
    };
  }, [leaving]);

  return (
    <div
      className={`app-preloader${leaving ? ' app-preloader--leaving' : ''}`}
      role="status"
      aria-live="polite"
      aria-busy={!leaving}
      aria-hidden={leaving || undefined}
      onAnimationEnd={event => {
        if (leaving && event.target === event.currentTarget) onExit?.();
      }}
    >
      <div className="preloader-content">
        <div className="preloader-brand">
          <span className="preloader-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M6 18 18 6M6 6h12v12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span>HybridFlow</span>
        </div>
        <p className="preloader-message">Đang chuẩn bị trải nghiệm…</p>
        <div className="preloader-feedback">
          <div className="preloader-track" role="progressbar" aria-label="Đang tải HybridFlow" aria-hidden={leaving || undefined}>
            <span style={{ width: `${leaving ? 100 : percent}%` }} />
          </div>
          <span className="preloader-percent" aria-hidden="true">{leaving ? '100%' : `${percent}%`}</span>
          <svg className="preloader-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <path d="m5 12 4 4L19 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <p className="preloader-detail">{leaving ? 'Sẵn sàng' : detail}</p>
      </div>
      <small className="preloader-footer" aria-hidden="true">© 2026 HybridFlow · AI Powered Sync</small>
    </div>
  );
}

/** Content is available immediately; only the non-interactive overlay fades out. */
export function PreloadBoundary({ loading, detail, children }: { loading: boolean; detail: string; children: ReactNode }) {
  const [visible, setVisible] = useState(loading);
  useEffect(() => {
    if (loading) { setVisible(true); return; }
    if (typeof document === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setVisible(false);
      return;
    }
    // Fallback if the 280ms fade is interrupted.
    const timer = setTimeout(() => setVisible(false), 320);
    return () => clearTimeout(timer);
  }, [loading]);
  return <>{children}{(loading || visible) && <Preloader detail={detail} leaving={!loading} onExit={() => setVisible(false)} />}</>;
}

/** Keep the opening screen visible for one animation cycle, including bundle loading. */
export function BootstrapPreloader() {
  useLayoutEffect(() => {
    const shell = document.getElementById('app-preloader');
    if (!shell) return;
    const now = performance.now();
    const startedAt = Number(shell.dataset.startedAt ?? now);
    const remaining = Math.max(0, 1200 - (now - startedAt));
    const remove = () => shell.remove();
    const onEnd = (event: AnimationEvent) => { if (event.target === shell) remove(); };
    let exitTimer: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => {
      if (document.getElementById('root')?.querySelector('.app-preloader') || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        remove();
        return;
      }
      shell.classList.add('app-preloader--leaving');
      shell.setAttribute('aria-hidden', 'true');
      shell.setAttribute('aria-busy', 'false');
      const detail = shell.querySelector('.preloader-detail');
      if (detail) detail.textContent = 'Sẵn sàng';
      shell.addEventListener('animationend', onEnd);
      // Remove after the fade even if its animation event is interrupted.
      exitTimer = setTimeout(remove, 320);
    }, remaining);
    return () => { clearTimeout(timer); clearTimeout(exitTimer); shell.removeEventListener('animationend', onEnd); shell.remove(); };
  }, []);
  return null;
}
