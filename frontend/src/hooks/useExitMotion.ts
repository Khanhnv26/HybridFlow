import { useLayoutEffect, useRef } from 'react';

/** Animate a non-interactive visual copy; the live component and its requests close immediately. */
export function useExitMotion<T extends HTMLElement = HTMLDivElement>(visible = true, kind: 'modal' | 'popover' = 'modal') {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!visible || !element || typeof window === 'undefined') return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      const transform = window.getComputedStyle(element).transform;
      const offset = transform && transform !== 'none' ? new DOMMatrixReadOnly(transform) : null;
      return { left: rect.left - (offset?.m41 || 0), top: rect.top - (offset?.m42 || 0), width: rect.width, height: rect.height };
    };
    let bounds = measure();
    const resize = () => { bounds = measure(); };
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
      if (reduced.matches || document.hidden || !element.animate) return;
      // The next frame distinguishes a real removal from StrictMode's effect replay.
      window.requestAnimationFrame(() => {
        if (element.isConnected || reduced.matches || document.hidden || !bounds.width || !bounds.height) return;
        const snapshot = element.cloneNode(true) as HTMLElement;
        snapshot.classList.add('motion-exit-snapshot');
        snapshot.setAttribute('aria-hidden', 'true');
        snapshot.inert = true;
        snapshot.removeAttribute('id');
        snapshot.querySelectorAll('[id], [autofocus]').forEach(node => { node.removeAttribute('id'); node.removeAttribute('autofocus'); });
        const originalFields = element.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select');
        snapshot.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select').forEach((field, index) => {
          field.value = originalFields[index]?.value || '';
        });
        Object.assign(snapshot.style, {
          position: 'fixed', inset: 'auto', left: `${bounds.left}px`, top: `${bounds.top}px`,
          width: `${bounds.width}px`, height: `${bounds.height}px`, margin: '0', zIndex: '1000',
        });
        document.body.appendChild(snapshot);
        const originalNodes = [element, ...element.querySelectorAll<HTMLElement>('*')];
        [snapshot, ...snapshot.querySelectorAll<HTMLElement>('*')].forEach((node, index) => {
          node.scrollTop = originalNodes[index]?.scrollTop || 0;
          node.scrollLeft = originalNodes[index]?.scrollLeft || 0;
        });
        const duration = 160;
        const options = { duration, easing: 'cubic-bezier(.4, 0, 1, 1)', fill: 'forwards' as const };
        const animation = snapshot.animate(kind === 'popover'
          ? [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-5px)' }]
          : [{ opacity: 1 }, { opacity: 0 }], options);
        snapshot.querySelector<HTMLElement>('.hf-modal')?.animate([
          { transform: 'translateY(0) scale(1)' }, { transform: 'translateY(8px) scale(.99)' },
        ], options);
        const remove = () => { snapshot.remove(); reduced.removeEventListener('change', remove); window.clearTimeout(timer); };
        const timer = window.setTimeout(remove, duration + 100);
        reduced.addEventListener('change', remove, { once: true });
        void animation.finished.then(remove, remove);
      });
    };
  }, [visible, kind]);
  return ref;
}
