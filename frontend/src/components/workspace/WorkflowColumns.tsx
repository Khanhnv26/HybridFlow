import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Folder, Layers, Plus, Search, Workflow } from 'lucide-react';
import type { BusinessModule, StudioNavigation, TenantWorkflowSummary } from '../../types';
import { moduleService, tenantWorkflowService } from '../../services/api';
import { errorMessage } from '../../services/errors';

const roleNames = { OWNER: 'Chủ sở hữu', ADMIN: 'Quản trị viên', EDITOR: 'Người chỉnh sửa', VIEWER: 'Người xem' };
const normalize = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').trim();
const loadContent = (workspaceId: string, signal: AbortSignal) =>
  Promise.all([moduleService.list(workspaceId, signal), tenantWorkflowService.list(workspaceId, signal)]);

function CreateItem({ label, context, disabled, inline = false, submitLabel = 'Tạo mới', onCreate }: {
  label: string;
  context: string;
  disabled?: boolean;
  inline?: boolean;
  submitLabel?: string;
  onCreate: (name: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!inline && !open) return (
    <button type="button" className="switcher-create" aria-label={`Tạo ${label.toLowerCase()}`} disabled={disabled} onClick={() => setOpen(true)}>
      <Plus size={15} aria-hidden="true" />{label}
    </button>
  );
  return (
    <form className="switcher-create-form" onSubmit={async event => {
      event.preventDefault();
      if (disabled || busy || !name.trim()) return;
      setBusy(true);
      setError('');
      try {
        await onCreate(name.trim());
        setName('');
        setOpen(false);
      } catch (reason) {
        setError(errorMessage(reason));
      } finally {
        setBusy(false);
      }
    }}>
      <p className="text-xs text-secondary break-words">{context}</p>
      <input autoFocus={open} aria-label={`Tên ${label.toLowerCase()}`} placeholder="Nhập tên…" maxLength={120}
        value={name} disabled={busy || disabled} onChange={event => setName(event.target.value)} />
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy || disabled || !name.trim()} className="switcher-submit">{busy ? 'Đang tạo…' : submitLabel}</button>
        {open && <button type="button" disabled={busy} className="toolbar-button" onClick={() => { setOpen(false); setError(''); }}>Hủy</button>}
      </div>
    </form>
  );
}

type Props = Pick<StudioNavigation, 'workspaces' | 'onCreateWorkspace' | 'onNavigate' |
  'loadWorkspaceContent' | 'createModuleInWorkspace' | 'createWorkflowInModule'> & {
  initial?: { workspaceId: string; moduleId: string; workflowId: string };
};

export function WorkflowColumns({
  workspaces, onCreateWorkspace, onNavigate, initial,
  loadWorkspaceContent = loadContent,
  createModuleInWorkspace = moduleService.create,
  createWorkflowInModule = tenantWorkflowService.create,
}: Props) {
  const onboarding = !initial;
  const [workspaceId, setWorkspaceId] = useState(initial?.workspaceId || '');
  const [moduleId, setModuleId] = useState(initial?.moduleId || '');
  const [modules, setModules] = useState<BusinessModule[]>([]);
  const [workflows, setWorkflows] = useState<TenantWorkflowSummary[]>([]);
  const [queries, setQueries] = useState(['', '', '']);
  const [loading, setLoading] = useState(Boolean(workspaceId));
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const mounted = useRef(false);
  const browsing = useRef({ workspaceId, moduleId });
  const moduleColumn = useRef<HTMLElement>(null);
  const workflowColumn = useRef<HTMLElement>(null);
  const workspace = workspaces.find(item => item.id === workspaceId);
  const module = modules.find(item => item.id === moduleId);
  const canCreate = workspace?.role === 'OWNER' || workspace?.role === 'ADMIN';
  const matchingWorkflows = module ? workflows.filter(item => !item.moduleId || item.moduleId === module.id) : [];

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!onboarding || !workspaceId || typeof window === 'undefined' || !window.matchMedia?.('(max-width: 700px)').matches) return;
    const column = moduleId ? workflowColumn.current : moduleColumn.current;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    column?.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'start' });
  }, [onboarding, workspaceId, moduleId]);

  useEffect(() => {
    if (!workspaceId) return;
    const controller = new AbortController();
    const isCurrent = () => !controller.signal.aborted && browsing.current.workspaceId === workspaceId;
    loadWorkspaceContent(workspaceId, controller.signal)
      .then(([nextModules, nextWorkflows]) => {
        if (!isCurrent()) return;
        setModules(nextModules);
        setWorkflows(nextWorkflows);
        const current = browsing.current.moduleId;
        const next = nextModules.some(item => item.id === current) ? current : onboarding ? '' : nextModules[0]?.id || '';
        browsing.current.moduleId = next;
        setModuleId(next);
      })
      .catch(reason => { if (isCurrent()) setError(errorMessage(reason)); })
      .finally(() => { if (isCurrent()) setLoading(false); });
    return () => controller.abort();
  }, [workspaceId, revision, onboarding, loadWorkspaceContent]);

  function chooseWorkspace(id: string) {
    if (id === workspaceId) return;
    browsing.current = { workspaceId: id, moduleId: '' };
    setWorkspaceId(id);
    setModuleId('');
    setModules([]);
    setWorkflows([]);
    setError('');
    setLoading(true);
    setQueries(previous => [previous[0], '', '']);
  }

  function chooseModule(id: string) {
    browsing.current.moduleId = id;
    setModuleId(id);
    setQueries(previous => [previous[0], previous[1], '']);
  }

  function openWorkflow(workflow: TenantWorkflowSummary, items = workflows) {
    if (!workspace || !module) return;
    onNavigate({
      workspace, moduleId: workflow.moduleId || module.id, workflowId: workflow.flowId,
      modules, workflows: items,
    });
  }

  async function createWorkspace(name: string) {
    const created = await onCreateWorkspace(name);
    if (!created || !mounted.current || browsing.current.workspaceId !== workspaceId) return;
    setQueries(['', '', '']);
    chooseWorkspace(created.id);
  }

  async function createModule(name: string) {
    const created = await createModuleInWorkspace(workspaceId, name);
    if (!mounted.current || browsing.current.workspaceId !== workspaceId) return;
    setModules(previous => [...previous.filter(item => item.id !== created.id), created]);
    if (browsing.current.moduleId !== moduleId) return;
    chooseModule(created.id);
    setQueries(previous => [previous[0], '', '']);
  }

  async function createWorkflow(name: string) {
    const created = await createWorkflowInModule(workspaceId, moduleId, name);
    if (!mounted.current || browsing.current.workspaceId !== workspaceId) return;
    setWorkflows(previous => [...previous.filter(item => item.flowId !== created.flowId), created]);
    if (browsing.current.moduleId === moduleId) {
      openWorkflow(created, [...workflows.filter(item => item.flowId !== created.flowId), created]);
    }
  }

  function search(index: number, label: string) {
    return (
      <label className="hf-search-field switcher-search">
        <Search size={15} aria-hidden="true" />
        <input type="search" aria-label={`Tìm ${label}`} placeholder={`Tìm ${label}…`} value={queries[index]}
          onChange={event => {
            const value = event.target.value;
            setQueries(previous => previous.map((query, i) => i === index ? value : query));
          }} />
      </label>
    );
  }

  const visibleWorkspaces = workspaces.filter(item => normalize(item.name).includes(normalize(queries[0])));
  const visibleModules = modules.filter(item => normalize(item.name).includes(normalize(queries[1])));
  const visibleWorkflows = matchingWorkflows.filter(item => normalize(item.name).includes(normalize(queries[2])));
  const noResults = <p role="status" className="switcher-empty">Không tìm thấy kết quả.</p>;
  const loadingStatus = <p role="status" className="switcher-empty">Đang tải…</p>;

  return (
    <div className="switcher-columns">
      <section className="switcher-column" aria-label="Danh sách workspace" data-active={onboarding && !workspace}>
        <h3><span>01 · Workspace</span><span>{workspaces.length}</span></h3>
        {onboarding && <p className="switcher-parent">Nơi làm việc của bạn</p>}
        {workspaces.length > 0 && search(0, 'workspace')}
        <div className="switcher-list">
          {visibleWorkspaces.map(item => (
            <button type="button" key={item.id} aria-pressed={workspaceId === item.id} className="switcher-item"
              onClick={() => chooseWorkspace(item.id)}>
              <Layers size={15} className="shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1"><span className="block truncate">{item.name}</span><small>{roleNames[item.role]}</small></span>
              {workspaceId === item.id && <Check size={15} className="shrink-0" aria-hidden="true" />}
            </button>
          ))}
          {workspaces.length === 0 ? <p className="switcher-empty">Bạn chưa có workspace.</p> : visibleWorkspaces.length === 0 && noResults}
        </div>
        <CreateItem label="Workspace" context="Tạo workspace mới" inline={onboarding && workspaces.length === 0}
          submitLabel={onboarding ? 'Tạo workspace' : undefined} onCreate={createWorkspace} />
      </section>
      <section ref={moduleColumn} className="switcher-column" aria-label="Danh sách module" data-active={onboarding && !!workspace && !module}>
        <h3><span>02 · Module</span><span>{modules.length}</span></h3>
        <p className="switcher-parent" title={workspace?.name}>{workspace ? `Trong ${workspace.name}` : 'Chọn workspace để tiếp tục'}</p>
        {modules.length > 0 && search(1, 'module')}
        <div className="switcher-list" aria-busy={loading} key={workspaceId}>
          {loading ? loadingStatus : error ? (
            <div className="switcher-empty">
              <p role="alert" className="text-danger">{error}</p>
              <button type="button" className="toolbar-button mt-2" onClick={() => {
                setError('');
                setLoading(true);
                setRevision(value => value + 1);
              }}>Thử lại</button>
            </div>
          ) : visibleModules.map(item => (
            <button type="button" key={item.id} aria-pressed={moduleId === item.id} className="switcher-item" onClick={() => chooseModule(item.id)}>
              <Folder size={15} className="shrink-0" aria-hidden="true" />
              <span className="truncate flex-1">{item.name}{!item.enabled && ' (tắt)'}</span>
              {moduleId === item.id && <Check size={15} className="shrink-0" aria-hidden="true" />}
            </button>
          ))}
          {workspace && !loading && !error && (modules.length === 0
            ? <p className="switcher-empty">Workspace này chưa có module.</p>
            : visibleModules.length === 0 && noResults)}
        </div>
        {canCreate && !loading && !error && (
          <CreateItem key={workspaceId} label="Module" context={`Tạo module trong workspace ${workspace.name}`}
            inline={onboarding && modules.length === 0} submitLabel={onboarding ? 'Tạo module' : undefined} onCreate={createModule} />
        )}
      </section>
      <section ref={workflowColumn} className="switcher-column" aria-label="Danh sách workflow" data-active={onboarding && !!module}>
        <h3><span>03 · Workflow</span><span>{matchingWorkflows.length}</span></h3>
        <p className="switcher-parent" title={module?.name}>{module ? `Trong ${module.name}` : 'Chọn module để tiếp tục'}</p>
        {matchingWorkflows.length > 0 && search(2, 'workflow')}
        <div className="switcher-list" aria-busy={loading} key={`${workspaceId}:${moduleId}`}>
          {module && !loading && !error && visibleWorkflows.map(item => {
            const active = initial?.workspaceId === workspaceId && initial.workflowId === item.flowId;
            return (
              <button type="button" key={item.flowId} className="switcher-item" aria-current={active ? 'page' : undefined} onClick={() => openWorkflow(item)}>
                <Workflow size={15} className="shrink-0" aria-hidden="true" />
                <span className="truncate flex-1">{item.name}{!item.enabled && ' (tắt)'}</span>
                <small>v{item.definitionVersion}</small>
                {active ? <Check size={15} className="shrink-0" aria-hidden="true" /> :
                  onboarding && <ArrowRight size={15} className="switcher-open-icon shrink-0" aria-hidden="true" />}
              </button>
            );
          })}
          {module && !loading && !error && (matchingWorkflows.length === 0
            ? <p className="switcher-empty">Module này chưa có workflow.</p>
            : visibleWorkflows.length === 0 && noResults)}
        </div>
        {canCreate && module && !loading && !error && (
          <CreateItem key={`${workspaceId}:${moduleId}`} label="Workflow" context={`Tạo workflow trong module ${module.name}`}
            inline={onboarding && matchingWorkflows.length === 0} submitLabel={onboarding ? 'Tạo và mở Studio' : undefined} onCreate={createWorkflow} />
        )}
      </section>
    </div>
  );
}
