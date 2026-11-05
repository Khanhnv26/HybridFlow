import { useEffect } from 'react';
import type { RefObject } from 'react';
import Lenis from 'lenis';

/** Smooth scroll to top helper using active Lenis instance or fallback */
export function scrollToTop() {
  if (typeof window === 'undefined') return;
  const lenis = (window as unknown as { __hybridflowLenis?: Lenis }).__hybridflowLenis;
  if (lenis && typeof lenis.scrollTo === 'function') {
    lenis.scrollTo(0, { duration: 1.2 });
  } else {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

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
        if (typeof window !== 'undefined') {
          delete (window as unknown as { __hybridflowLenis?: Lenis }).__hybridflowLenis;
        }
      } else if (!lenis) {
        lenis = new Lenis({
          autoRaf: true,
          lerp: 0.1,
          smoothWheel: true,
          syncTouch: false,
          anchors: { offset: -96 },
          prevent: node => !!node.closest('[data-lenis-prevent]'),
        });
        (window as unknown as { __hybridflowLenis?: Lenis }).__hybridflowLenis = lenis;
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
      if (typeof window !== 'undefined') {
        delete (window as unknown as { __hybridflowLenis?: Lenis }).__hybridflowLenis;
      }
    };
  }, [page, overflowOnly]);
}
