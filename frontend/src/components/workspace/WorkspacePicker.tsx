import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Workspace } from '../../types';
import { workspaceService, authService } from '../../services/api';
import { errorMessage } from '../../services/errors';

export function WorkspacePicker({ children }: { children: (workspace: Workspace) => ReactNode }) {
  const [items, setItems] = useState<Workspace[]>([]);
  const [selected, setSelected] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    workspaceService.list(controller.signal)
      .then(result => {
        if (controller.signal.aborted) return;
        setItems(result);
        setSelected(old => result.some(item => item.id === old) ? old : result[0]?.id || '');
      })
      .catch(reason => {
        if (!controller.signal.aborted) setError(errorMessage(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [revision]);

  async function createWorkspace() {
    if (busy || !name.trim()) return;
    setBusy(true);
    setError('');
    try {
      const created = await workspaceService.create(name.trim());
      setItems(current => [...current, created]);
      setSelected(created.id);
      setName('');
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    try {
      await authService.logout();
      window.location.reload();
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  const active = items.find(item => item.id === selected);
  return (
    <div className="h-dvh min-h-0 flex flex-col bg-canvas text-primary">
      <header className="relative z-50 shrink-0 border-b border-line bg-surface pl-4 pr-16 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex flex-wrap items-center gap-3">
          <span className="font-bold text-lg text-info">HybridFlow</span>
          <label className="flex items-center gap-2 text-sm text-secondary">
            Workspace
            <select
              value={selected}
              disabled={loading || busy}
              onChange={event => setSelected(event.target.value)}
              className="max-w-[min(40vw,260px)] bg-elevated border border-line rounded px-2 py-1 text-sm text-primary focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Chọn workspace</option>
              {items.map(item => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.role}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex items-center gap-3">
          <details className="relative">
            <summary className="toolbar-button cursor-pointer list-none [&::-webkit-details-marker]:hidden">+ Workspace</summary>
            <div className="toolbar-popover flex flex-col gap-3">
            <input
              aria-label="Tên workspace mới"
              placeholder="Tên workspace mới"
              value={name}
              maxLength={120}
              onChange={event => setName(event.target.value)}
              className="bg-elevated border border-line rounded px-3 py-1 text-sm text-primary placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              disabled={loading || busy || !name.trim()}
              onClick={() => void createWorkspace()}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-3 py-1 rounded text-sm font-medium transition-colors"
            >
              Tạo workspace
            </button>
            </div>
          </details>
          <button
            onClick={() => void handleLogout()}
            className="text-secondary hover:text-danger text-sm px-2 py-1 transition-colors"
          >
            Đăng xuất
          </button>
        </div>
      </header>

      {loading && <p role="status" className="p-6 text-sm text-secondary">Đang tải workspace…</p>}
      {error && (
        <div role="alert" className="p-4 bg-danger-soft border border-red-800 text-danger text-sm flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => setRevision(value => value + 1)}
            className="px-2 py-1 bg-red-800 rounded text-xs hover:bg-red-700"
          >
            Tải lại
          </button>
        </div>
      )}

      {!loading && !error && active && (
        <section key={active.id} className="flex-1 flex flex-col min-h-0">
          {children(active)}
        </section>
      )}

      {!loading && !error && !active && items.length === 0 && (
        <div className="p-12 text-center text-secondary">
          <p>Chưa có workspace nào. Hãy nhập tên và bấm "Tạo workspace" ở trên để bắt đầu.</p>
        </div>
      )}
    </div>
  );
}
