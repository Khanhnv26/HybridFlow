import { useEffect, useRef, useState } from 'react';
import type { ExecutionHistoryDto } from '../types';

// A completion acknowledgement is separate from the backend's RUNNING state.
export function useExecutionCompletion(flowId: string, run: ExecutionHistoryDto | null, initialized: boolean) {
  const observed = useRef<{ flowId: string; id?: string; status?: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const [completed, setCompleted] = useState<{ flowId: string; id: string } | null>(null);

  useEffect(() => {
    clearTimeout(timer.current);
    setCompleted(null);
    if (!flowId || !initialized) {
      observed.current = null;
      return;
    }
    const previous = observed.current;
    observed.current = { flowId, id: run?.id, status: run?.status };
    // Opening the page must not replay old history as a new completion.
    if (!previous || previous.flowId !== flowId || !run) return;
    if ((previous.id !== run.id || previous.status !== run.status) && ['SUCCESS', 'CONFLICT'].includes(run.status)) {
      const page = typeof document === 'undefined' ? undefined : document;
      const acknowledge = () => {
        if (page?.visibilityState === 'hidden') return;
        page?.removeEventListener('visibilitychange', acknowledge);
        setCompleted({ flowId, id: run.id });
        timer.current = setTimeout(() => setCompleted(null), 2000);
      };
      page?.addEventListener('visibilitychange', acknowledge);
      acknowledge();
      return () => {
        page?.removeEventListener('visibilitychange', acknowledge);
        clearTimeout(timer.current);
      };
    }
  }, [flowId, initialized, run?.id, run?.status]);
  useEffect(() => () => clearTimeout(timer.current), []);

  return completed?.flowId === flowId && completed?.id === run?.id;
}
