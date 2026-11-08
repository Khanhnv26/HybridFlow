import { useEffect, useState, type ReactNode } from 'react';
import { ArrowUpRight, Database, GitBranch, Send, Sheet, Workflow } from 'lucide-react';
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
          <span className="workspace-entry-location">Studio</span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle className="toolbar-button" />
          <AccountMenu user={user} onLogout={logout} />
        </div>
      </header>
      <main className="workspace-entry-main">
        <div className="workspace-entry-hero">
          <div>
            <span className="workspace-entry-eyebrow"><Workflow size={15} aria-hidden="true" />HybridFlow Studio</span>
            <h1>Mở luồng làm việc</h1>
            <p>Chọn workspace, nhóm nghiệp vụ và workflow bạn muốn mở trong Studio.</p>
          </div>
          <div className="workspace-entry-map" aria-hidden="true">
            <span className="workspace-entry-node"><Sheet size={16} />Google Sheets</span>
            <span className="workspace-entry-wire" />
            <span className="workspace-entry-node workspace-entry-node--logic"><GitBranch size={16} />Xử lý</span>
            <span className="workspace-entry-wire" />
            <div className="workspace-entry-outputs">
              <span className="workspace-entry-node"><Database size={16} />Vault</span>
              <span className="workspace-entry-node"><Send size={16} />Telegram</span>
            </div>
          </div>
        </div>
        {logoutError && <p role="alert" className="workspace-entry-notice text-danger">{logoutError}</p>}
        {loading ? <p role="status" className="workspace-entry-notice text-secondary">Đang tải workspace…</p> : listError ? (
          <div className="workspace-entry-notice">
            <p role="alert" className="text-danger">{listError}</p>
            <button type="button" className="toolbar-button mt-2" onClick={() => {
              setListError('');
              setLoading(true);
              setRevision(value => value + 1);
            }}>Thử lại</button>
          </div>
        ) : <WorkflowColumns workspaces={workspaces} onCreateWorkspace={createWorkspace} onNavigate={setSelection} />}
      </main>
    </div>
  );
}
