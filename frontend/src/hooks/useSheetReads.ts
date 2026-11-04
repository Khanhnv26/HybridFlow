import { errorMessage } from '../services/errors';
import { useCallback, useRef, useState } from 'react';
import type { SheetDataResponse, SheetReadState } from '../types';

export interface ReadSource {
  connectionId?: string;
  columnTypes?: Record<string, 'TEXT' | 'NUMBER'>;
  nodeId: string;
  spreadsheetId: string;
  sheetName: string;
}
export function readSourceKey(source: ReadSource) {
  const types = Object.entries(source.columnTypes || {}).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  return JSON.stringify([source.nodeId, source.spreadsheetId.trim(), source.sheetName.trim(),
    ...(source.connectionId ? [{ connectionId: source.connectionId }] : []), ...(types.length ? [types] : [])]);
}
const idle: SheetReadState = { status: 'idle', data: null };
type Reader = (source: ReadSource, signal?: AbortSignal) => Promise<SheetDataResponse>;

export function useSheetReads(reader: Reader) {
  const [states, setStates] = useState<{ [key: string]: SheetReadState }>({});
  const readerRef = useRef(reader);
  readerRef.current = reader;
  const revisions = useRef(new Map<string, number>());
  const epoch = useRef(0);
  const read = useCallback(async (source: ReadSource, signal?: AbortSignal) => {
    const key = readSourceKey(source);
    const revision = (revisions.current.get(key) || 0) + 1;
    revisions.current.set(key, revision);
    const generation = epoch.current;
    const current = () => epoch.current === generation && revisions.current.get(key) === revision;
    setStates((previous) => ({
      ...previous,
      [key]: { ...previous[key], status: 'loading', data: null, error: undefined },
    }));
    try {
      const data = await readerRef.current(source, signal);
      if (current() && !signal?.aborted)
        setStates((previous) => ({
          ...previous,
          [key]: { status: 'success', data, readAt: new Date().toISOString() },
        }));
      return data;
    } catch (error) {
      if (current() && !signal?.aborted)
        setStates((previous) => ({
          ...previous,
          [key]: {
            status: 'error',
            data: null,
            readAt: previous[key]?.readAt,
            error:
              errorMessage(error, 'Không đọc được dữ liệu. Vui lòng thử lại.'),
          },
        }));
      throw error;
    } finally {
      if (current() && signal?.aborted)
        setStates((previous) => ({
          ...previous,
          [key]: { status: 'idle', data: null, readAt: previous[key]?.readAt },
        }));
    }
  }, []);
  const invalidate = useCallback(() => {
    epoch.current++;
    setStates({});
  }, []);
  const stateFor = useCallback(
    (source: ReadSource) => states[readSourceKey(source)] || idle,
    [states],
  );
  return { read, stateFor, invalidate };
}
