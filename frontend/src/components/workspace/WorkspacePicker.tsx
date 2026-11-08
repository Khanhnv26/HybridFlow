import { useEffect, useState, type ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { Me, StudioNavigation, WorkflowSelection, Workspace } from '../../types';
import { authService, workspaceService } from '../../services/api';
import { errorMessage } from '../../services/errors';
import { AccountMenu } from '../orchestration/AccountMenu';
import { ThemeToggle } from '../ThemeToggle';
import { WorkflowColumns } from './WorkflowColumns';

export function WorkspacePicker({ user, children }: {
  user: Me;
  children: (navigation: StudioNavigation) => ReactNode;
}) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selection, setSelection] = useState<WorkflowSelection>();
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [logoutError, setLogoutError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    workspaceService.list(controller.signal)
      .then(items => { if (!controller.signal.aborted) setWorkspaces(items); })
      .catch(reason => { if (!controller.signal.aborted) setListError(errorMessage(reason)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);

  async function createWorkspace(name: string) {
    const created = await workspaceService.create(name);
    setWorkspaces(items => [...items.filter(item => item.id !== created.id), created]);
    return created;
  }

  async function logout() {
    setLogoutError('');
    try {
      await authService.logout();
      window.location.reload();
    } catch (reason) {
      setLogoutError(errorMessage(reason));
    }
  }

  if (selection) {
    return (
      <div className="workspace-studio h-dvh flex flex-col bg-canvas text-primary">
        {logoutError && <p role="alert" className="p-3 bg-danger-soft text-danger">{logoutError}</p>}
        <div className="flex-1 min-h-0">
          {children({
            workspaces,
            selectedWorkspaceId: selection.workspace.id,
            selectedModuleId: selection.moduleId,
            selectedWorkflowId: selection.workflowId,
            workspaceRole: selection.workspace.role,
            modules: selection.modules,
            workflows: selection.workflows,
            onNavigate: setSelection,
            onCreateWorkspace: createWorkspace,
            onLogout: logout,
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="studio-shell workspace-entry h-dvh overflow-y-auto bg-canvas text-primary">
      <header className="workspace-entry-bar bg-surface">
        <div className="flex items-center gap-2.5 font-bold text-sm">
          <span className="studio-brand-mark flex h-8 w-8 items-center justify-center rounded-lg"><ArrowUpRight size={20} aria-hidden="true" /></span>
          HybridFlow
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle className="toolbar-button" />
          <AccountMenu user={user} onLogout={logout} />
        </div>
      </header>
      <main className="workspace-entry-main">
        <section className="workspace-entry-panel bg-surface" aria-labelledby="workspace-entry-title">
          <div className="switcher-heading">
            <div>
              <h1 id="workspace-entry-title">Mở luồng làm việc</h1>
              <p>Chọn hoặc tạo workspace, module và workflow để vào Studio.</p>
            </div>
          </div>
          {logoutError && <p role="alert" className="p-3 bg-danger-soft text-danger">{logoutError}</p>}
          {loading ? <p role="status" className="switcher-empty p-5">Đang tải workspace…</p> : listError ? (
            <div className="p-5">
              <p role="alert" className="text-danger">{listError}</p>
              <button type="button" className="toolbar-button mt-2" onClick={() => {
                setListError('');
                setLoading(true);
                setRevision(value => value + 1);
              }}>Thử lại</button>
            </div>
          ) : <WorkflowColumns workspaces={workspaces} onCreateWorkspace={createWorkspace} onNavigate={setSelection} />}
          <p className="workspace-entry-footer">Chọn workflow để mở Studio.</p>
        </section>
      </main>
    </div>
  );
}
