import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { FolderPlus, GitBranch } from 'lucide-react';
import type { Workspace, BusinessModule, TenantWorkflowSummary, StudioNavigation } from '../../types';
import type { WorkspaceNavigationProps } from './WorkspacePicker';
import { moduleService, tenantWorkflowService } from '../../services/api';
import { errorMessage } from '../../services/errors';

interface ModuleWorkflowPickerProps {
  workspace: Workspace;
  workspaceNavigation?: WorkspaceNavigationProps;
  children: (
    workflow: { id: string; name: string; moduleId: string },
    navigation?: StudioNavigation
  ) => ReactNode;
}

export function ModuleWorkflowPicker({ workspace, workspaceNavigation, children }: ModuleWorkflowPickerProps) {
  const [modules, setModules] = useState<BusinessModule[]>([]);
  const [selectedModuleId, setSelectedModuleId] = useState('');
  const [newModuleName, setNewModuleName] = useState('');
  const [workflows, setWorkflows] = useState<TenantWorkflowSummary[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('');
  const [newWorkflowName, setNewWorkflowName] = useState('');
  const [loadingModules, setLoadingModules] = useState(true);
  const [loadingWorkflows, setLoadingWorkflows] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [moduleRevision, setModuleRevision] = useState(0);
  const [workflowRevision, setWorkflowRevision] = useState(0);
  const navigationTarget = workspaceNavigation?.navigationTarget;

  useEffect(() => {
    const controller = new AbortController();
    setLoadingModules(true);
    setError('');
    moduleService.list(workspace.id, controller.signal)
      .then(items => {
        if (controller.signal.aborted) return;
        setModules(items);
        setSelectedModuleId(old => items.some(m => m.id === navigationTarget?.moduleId)
          ? navigationTarget!.moduleId : items.some(m => m.id === old) ? old : items[0]?.id || '');
      })
      .catch(reason => {
        if (!controller.signal.aborted) setError(errorMessage(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingModules(false);
      });
    return () => controller.abort();
  }, [workspace.id, moduleRevision, navigationTarget]);

  useEffect(() => {
    if (!selectedModuleId) {
      setWorkflows([]);
      setSelectedWorkflowId('');
      return;
    }
    const controller = new AbortController();
    setLoadingWorkflows(true);
    setError('');
    tenantWorkflowService.list(workspace.id, controller.signal)
      .then(items => {
        if (controller.signal.aborted) return;
        const matching = items.filter(wf => !wf.moduleId || wf.moduleId === selectedModuleId);
        setWorkflows(matching);
        setSelectedWorkflowId(old => matching.some(w => w.flowId === navigationTarget?.workflowId)
          ? navigationTarget!.workflowId : matching.some(w => w.flowId === old) ? old : matching[0]?.flowId || '');
      })
      .catch(reason => {
        if (!controller.signal.aborted) setError(errorMessage(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingWorkflows(false);
      });
    return () => controller.abort();
  }, [workspace.id, selectedModuleId, workflowRevision, navigationTarget]);

  async function handleCreateModule(moduleName?: string) {
    const val = (moduleName ?? newModuleName).trim();
    if (busy || !val) return;
    setBusy(true);
    setError('');
    try {
      const created = await moduleService.create(workspace.id, val);
      setModules(prev => [...prev, created]);
      setSelectedModuleId(created.id);
      setNewModuleName('');
    } catch (reason) {
      setError(errorMessage(reason));
      throw reason;
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateWorkflow(workflowName?: string) {
    const val = (workflowName ?? newWorkflowName).trim();
    if (busy || !selectedModuleId || !val) return;
    setBusy(true);
    setError('');
    try {
      const created = await tenantWorkflowService.create(workspace.id, selectedModuleId, val);
      setWorkflows(prev => [...prev, created]);
      setSelectedWorkflowId(created.flowId);
      setNewWorkflowName('');
    } catch (reason) {
      setError(errorMessage(reason));
      throw reason;
    } finally {
      setBusy(false);
    }
  }

  const activeWorkflow = workflows.find(wf => wf.flowId === selectedWorkflowId);
  const activeModule = modules.find(m => m.id === selectedModuleId);

  const fullNavigation: StudioNavigation | undefined = workspaceNavigation ? {
    ...workspaceNavigation,
    modules,
    selectedModuleId,
    onSelectModule: setSelectedModuleId,
    onCreateModule: handleCreateModule,
    workflows,
    selectedWorkflowId,
    onSelectWorkflow: setSelectedWorkflowId,
    onCreateWorkflow: handleCreateWorkflow,
    activeWorkflowName: activeWorkflow?.name,
    activeWorkflowVersion: activeWorkflow?.definitionVersion,
  } : undefined;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {error && (
        <div role="alert" className="p-3 bg-danger-soft border-b border-red-800 text-danger text-xs flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => {
              setModuleRevision(r => r + 1);
              setWorkflowRevision(r => r + 1);
            }}
            className="px-2 py-0.5 bg-red-800 rounded text-xs text-white"
          >
            Thử lại
          </button>
        </div>
      )}

      {loadingModules && (
        <div className="flex-1 flex items-center justify-center p-6 text-secondary text-sm">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-ping" />
            <span>Đang tải modules…</span>
          </div>
        </div>
      )}

      {!loadingModules && modules.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 bg-canvas text-primary">
          <div className="w-full max-w-md p-6 rounded-xl border border-line bg-surface shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center mx-auto border border-indigo-500/30">
              <FolderPlus size={24} />
            </div>
            <h2 className="text-base font-bold text-primary">Tạo Module Đầu Tiên</h2>
            <p className="text-xs text-secondary leading-relaxed">
              Workspace <strong className="text-primary font-semibold">{workspace.name}</strong> chưa có module nào.
              Hãy tạo module đầu tiên để gom nhóm các luồng xử lý.
            </p>
            <div className="space-y-3 pt-2">
              <input
                aria-label="Tên module mới"
                placeholder="Ví dụ: Đơn Hàng, Kho Vận, Kế Toán..."
                value={newModuleName}
                maxLength={120}
                onChange={event => setNewModuleName(event.target.value)}
                className="w-full bg-elevated border border-line rounded-lg px-3 py-2 text-sm text-primary placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                disabled={busy || !newModuleName.trim()}
                onClick={() => void handleCreateModule()}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors shadow-md"
              >
                {busy ? 'Đang tạo...' : '+ Tạo module'}
              </button>
            </div>
          </div>
        </div>
      )}

      {!loadingModules && modules.length > 0 && selectedModuleId && workflows.length === 0 && !loadingWorkflows && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 bg-canvas text-primary">
          <div className="w-full max-w-md p-6 rounded-xl border border-line bg-surface shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/30">
              <GitBranch size={24} />
            </div>
            <h2 className="text-base font-bold text-primary">Tạo Workflow Đầu Tiên</h2>
            <p className="text-xs text-secondary leading-relaxed">
              Module <strong className="text-primary font-semibold">{activeModule?.name || 'này'}</strong> chưa có workflow nào.
              Hãy đặt tên để bắt đầu vẽ sơ đồ điều phối.
            </p>
            <div className="space-y-3 pt-2">
              <input
                aria-label="Tên workflow mới"
                placeholder="Ví dụ: Đồng bộ đơn hàng Sheets ↔ Vault"
                value={newWorkflowName}
                maxLength={120}
                onChange={event => setNewWorkflowName(event.target.value)}
                className="w-full bg-elevated border border-line rounded-lg px-3 py-2 text-sm text-primary placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                disabled={busy || !newWorkflowName.trim()}
                onClick={() => void handleCreateWorkflow()}
                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors shadow-md"
              >
                {busy ? 'Đang tạo...' : '+ Tạo workflow'}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeWorkflow && (
        <div className="flex-1 flex flex-col min-h-0">
          {children(
            {
              id: activeWorkflow.flowId,
              name: activeWorkflow.name,
              moduleId: activeWorkflow.moduleId || selectedModuleId,
            },
            fullNavigation
          )}
        </div>
      )}
    </div>
  );
}
