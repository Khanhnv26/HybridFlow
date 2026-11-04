import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Layers } from 'lucide-react';
import type { Workspace, WorkspaceRole } from '../../types';
import { workspaceService, authService } from '../../services/api';
import { errorMessage } from '../../services/errors';

export interface WorkspaceNavigationProps {
  navigationTarget?: { moduleId: string; workflowId: string };
  onNavigate: (workspaceId: string, moduleId: string, workflowId: string) => void;
  workspaces: Workspace[];
  selectedWorkspaceId: string;
  onSelectWorkspace: (id: string) => void;
  onCreateWorkspace: (name: string) => Promise<void>;
  onLogout: () => void;
  workspaceRole: WorkspaceRole;
}

export function WorkspacePicker({
  children,
}: {
  children: (workspace: Workspace, nav: WorkspaceNavigationProps) => ReactNode;
}) {
  const [items, setItems] = useState<Workspace[]>([]);
  const [selected, setSelected] = useState('');
  const [navigationTarget, setNavigationTarget] = useState<{ moduleId: string; workflowId: string }>();
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

  async function createWorkspaceDirect(targetName?: string) {
    const val = (targetName ?? name).trim();
    if (busy || !val) return;
    setBusy(true);
    setError('');
    try {
      const created = await workspaceService.create(val);
      setItems(current => [...current, created]);
      setSelected(created.id);
      setName('');
    } catch (reason) {
      setError(errorMessage(reason));
      throw reason;
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
    <div className="h-dvh min-h-0 flex flex-col bg-canvas text-primary overflow-hidden">
      {loading && (
        <div role="status" className="h-dvh flex items-center justify-center p-6 text-sm text-secondary">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-ping" />
            <span>Đang tải workspace…</span>
          </div>
        </div>
      )}

      {error && (
        <div role="alert" className="p-4 bg-danger-soft border-b border-red-800 text-danger text-sm flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => setRevision(value => value + 1)}
            className="px-3 py-1 bg-red-800 rounded text-xs text-white hover:bg-red-700 font-medium"
          >
            Tải lại
          </button>
        </div>
      )}

      {!loading && !error && active && (
        <section key={active.id} className="flex-1 flex flex-col min-h-0">
          {children(active, {
            workspaces: items,
            selectedWorkspaceId: selected,
            onSelectWorkspace: id => { setNavigationTarget(undefined); setSelected(id); },
            navigationTarget,
            onNavigate: (workspaceId, moduleId, workflowId) => {
              setNavigationTarget({ moduleId, workflowId });
              setSelected(workspaceId);
            },
            onCreateWorkspace: createWorkspaceDirect,
            onLogout: handleLogout,
            workspaceRole: active.role,
          })}
        </section>
      )}

      {!loading && !error && !active && items.length === 0 && (
        <div className="h-dvh flex flex-col items-center justify-center p-6 bg-canvas text-primary">
          <div className="w-full max-w-md p-6 rounded-xl border border-line bg-surface shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-600 text-white flex items-center justify-center mx-auto shadow-lg shadow-indigo-500/20">
              <Layers size={24} />
            </div>
            <h2 className="text-lg font-bold">Chào mừng đến với HybridFlow</h2>
            <p className="text-xs text-secondary leading-relaxed">
              Hãy tạo Workspace đầu tiên để bắt đầu thiết kế luồng điều phối và đồng bộ dữ liệu.
            </p>
            <div className="space-y-3 pt-2">
              <input
                aria-label="Tên workspace mới"
                placeholder="Ví dụ: Team Vận Hành / Chi Nhánh 1"
                value={name}
                maxLength={120}
                onChange={event => setName(event.target.value)}
                className="w-full bg-elevated border border-line rounded-lg px-3 py-2 text-sm text-primary placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                disabled={busy || !name.trim()}
                onClick={() => void createWorkspaceDirect()}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors shadow-md"
              >
                {busy ? 'Đang tạo...' : 'Tạo workspace đầu tiên'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
