import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Workspace, BusinessModule, TenantWorkflowSummary } from '../../types';
import { moduleService, tenantWorkflowService } from '../../services/api';
import { errorMessage } from '../../services/errors';

interface ModuleWorkflowPickerProps {
  workspace: Workspace;
  children: (workflow: { id: string; name: string; moduleId: string }) => ReactNode;
}

export function ModuleWorkflowPicker({ workspace, children }: ModuleWorkflowPickerProps) {
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

  useEffect(() => {
    const controller = new AbortController();
    setLoadingModules(true);
    setError('');
    moduleService.list(workspace.id, controller.signal)
      .then(items => {
        if (controller.signal.aborted) return;
        setModules(items);
        setSelectedModuleId(old => items.some(m => m.id === old) ? old : items[0]?.id || '');
      })
      .catch(reason => {
        if (!controller.signal.aborted) setError(errorMessage(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingModules(false);
      });
    return () => controller.abort();
  }, [workspace.id, moduleRevision]);

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
        setSelectedWorkflowId(old => matching.some(w => w.flowId === old) ? old : matching[0]?.flowId || '');
      })
      .catch(reason => {
        if (!controller.signal.aborted) setError(errorMessage(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingWorkflows(false);
      });
    return () => controller.abort();
  }, [workspace.id, selectedModuleId, workflowRevision]);

  async function handleCreateModule() {
    if (busy || !newModuleName.trim()) return;
    setBusy(true);
    setError('');
    try {
      const created = await moduleService.create(workspace.id, newModuleName.trim());
      setModules(prev => [...prev, created]);
      setSelectedModuleId(created.id);
      setNewModuleName('');
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateWorkflow() {
    if (busy || !selectedModuleId || !newWorkflowName.trim()) return;
    setBusy(true);
    setError('');
    try {
      const created = await tenantWorkflowService.create(workspace.id, selectedModuleId, newWorkflowName.trim());
      setWorkflows(prev => [...prev, created]);
      setSelectedWorkflowId(created.flowId);
      setNewWorkflowName('');
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  const activeWorkflow = workflows.find(wf => wf.flowId === selectedWorkflowId);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-2.5 flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-slate-300 font-medium">
            Module
            <select
              value={selectedModuleId}
              disabled={loadingModules || busy}
              onChange={event => setSelectedModuleId(event.target.value)}
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Chọn module</option>
              {modules.map(module => (
                <option key={module.id} value={module.id}>
                  {module.name} {!module.enabled ? '(tắt)' : ''}
                </option>
              ))}
            </select>
          </label>

          {selectedModuleId && (
            <label className="flex items-center gap-2 text-slate-300 font-medium">
              Workflow
              <select
                value={selectedWorkflowId}
                disabled={loadingWorkflows || busy}
                onChange={event => setSelectedWorkflowId(event.target.value)}
                className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Chọn workflow</option>
                {workflows.map(wf => (
                  <option key={wf.flowId} value={wf.flowId}>
                    {wf.name} (v{wf.definitionVersion})
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <input
              placeholder="Module mới"
              value={newModuleName}
              maxLength={120}
              onChange={event => setNewModuleName(event.target.value)}
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              disabled={loadingModules || busy || !newModuleName.trim()}
              onClick={() => void handleCreateModule()}
              className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 px-2 py-1 rounded text-xs text-white"
            >
              + Module
            </button>
          </div>

          {selectedModuleId && (
            <div className="flex items-center gap-1.5">
              <input
                placeholder="Workflow mới"
                value={newWorkflowName}
                maxLength={120}
                onChange={event => setNewWorkflowName(event.target.value)}
                className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                disabled={loadingWorkflows || busy || !newWorkflowName.trim()}
                onClick={() => void handleCreateWorkflow()}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-2 py-1 rounded text-xs text-white font-medium"
              >
                + Workflow
              </button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div role="alert" className="p-3 bg-red-950/40 border-b border-red-800 text-red-300 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => {
              setModuleRevision(r => r + 1);
              setWorkflowRevision(r => r + 1);
            }}
            className="px-2 py-0.5 bg-red-800 rounded text-xs"
          >
            Thử lại
          </button>
        </div>
      )}

      {loadingModules && (
        <div className="p-6 text-slate-400 text-sm">Đang tải modules…</div>
      )}

      {!loadingModules && modules.length === 0 && (
        <div className="p-12 text-center text-slate-400">
          <p>Workspace này chưa có module nào. Hãy nhập tên và bấm "+ Module" ở trên để tạo module đầu tiên.</p>
        </div>
      )}

      {!loadingModules && modules.length > 0 && selectedModuleId && workflows.length === 0 && !loadingWorkflows && (
        <div className="p-12 text-center text-slate-400">
          <p>Module này chưa có workflow nào. Hãy nhập tên và bấm "+ Workflow" ở trên để thiết kế luồng.</p>
        </div>
      )}

      {activeWorkflow && (
        <div className="flex-1 flex flex-col min-h-0">
          {children({
            id: activeWorkflow.flowId,
            name: activeWorkflow.name,
            moduleId: activeWorkflow.moduleId || selectedModuleId,
          })}
        </div>
      )}
    </div>
  );
}
