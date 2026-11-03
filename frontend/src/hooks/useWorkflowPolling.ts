import { errorFingerprint } from '../services/errors';
import { useEffect, useRef } from 'react';

export function useWorkflowPolling(
  flowId: string,
  refresh: (flowId: string, signal: AbortSignal) => Promise<void>,
  onError: (error: unknown) => void,
  intervalMs = 5000,
) {
  const callbacks = useRef({ refresh, onError, intervalMs });
  callbacks.current = { refresh, onError, intervalMs };

  useEffect(() => {
    if (!flowId) return;
    const controller = new AbortController();
    const page = typeof document === 'undefined' ? undefined : document;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;
    let previousError = '';

    const update = async () => {
      if (controller.signal.aborted || inFlight || page?.visibilityState === 'hidden') return;
      clearTimeout(timer);
      inFlight = true;
      try {
        await callbacks.current.refresh(flowId, controller.signal);
        previousError = '';
      } catch (error) {
        const message = errorFingerprint(error);
        if (!controller.signal.aborted && message && message !== previousError) {
          previousError = message;
          callbacks.current.onError(error);
        }
      } finally {
        inFlight = false;
        if (!controller.signal.aborted) timer = setTimeout(() => void update(), callbacks.current.intervalMs);
      }
    };
    const wake = () => void update();
    window.addEventListener('focus', wake);
    page?.addEventListener('visibilitychange', wake);
    wake();
    return () => {
      controller.abort();
      clearTimeout(timer);
      window.removeEventListener('focus', wake);
      page?.removeEventListener('visibilitychange', wake);
    };
  }, [flowId]);
}
