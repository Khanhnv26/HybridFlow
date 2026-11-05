import { useEffect } from 'react';
import type { RefObject } from 'react';
import Lenis from 'lenis';

/** Page scrolling only; nested tables retain their native scroll behavior. */
export function usePageScroll(page: RefObject<HTMLElement>, overflowOnly = false) {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let lenis: Lenis | undefined;
    const refresh = () => {
      const needsScroll = !overflowOnly || document.documentElement.scrollHeight > window.innerHeight + 1;
      if (motion.matches || !needsScroll) {
        lenis?.destroy();
        lenis = undefined;
      } else if (!lenis) {
        lenis = new Lenis({
          autoRaf: true, lerp: 0.1, smoothWheel: true, syncTouch: false,
          anchors: { offset: -96 },
          prevent: node => !!node.closest('[data-lenis-prevent]'),
        });
      }
    };
    refresh();
    motion.addEventListener('change', refresh);
    window.addEventListener('resize', refresh);
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(refresh);
    if (page.current) observer?.observe(page.current);
    return () => {
      observer?.disconnect();
      motion.removeEventListener('change', refresh);
      window.removeEventListener('resize', refresh);
      lenis?.destroy();
    };
  }, [page, overflowOnly]);
}
