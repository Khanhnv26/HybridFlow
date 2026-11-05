import { useExitMotion } from '../../hooks/useExitMotion';
import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Folder, Plus, Search, Workflow, X } from 'lucide-react';
import type { BusinessModule, StudioNavigation, TenantWorkflowSummary } from '../../types';
import { moduleService, tenantWorkflowService } from '../../services/api';
import { errorMessage } from '../../services/errors';

const normalize = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');

function CreateItem({ label, context, disabled, onCreate }: {
  label: string; context: string; disabled?: boolean; onCreate: (name: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!open) return <button type="button" className="switcher-create" aria-label={`Tạo ${label.toLowerCase()}`} disabled={disabled} onClick={() => setOpen(true)}><Plus size={15} aria-hidden="true" />{label}</button>;
  return <form className="switcher-create-form" onSubmit={async event => {
    event.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true); setError('');
    try { await onCreate(name.trim()); setName(''); setOpen(false); }
    catch (reason) { setError(errorMessage(reason)); }
    finally { setBusy(false); }
  }}>
    <p className="text-xs text-secondary break-words">{context}</p>
    <input autoFocus aria-label={`Tên ${label.toLowerCase()}`} placeholder="Nhập tên…" maxLength={120} value={name} disabled={busy} onChange={event => setName(event.target.value)} />
    {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    <div className="flex gap-2">
      <button type="submit" disabled={busy || !name.trim()} className="switcher-submit">{busy ? 'Đang tạo…' : 'Tạo mới'}</button>
      <button type="button" disabled={busy} className="toolbar-button" onClick={() => { setOpen(false); setError(''); }}>Hủy</button>
    </div>
  </form>;
}

export function WorkflowSwitcher({ navigation }: { navigation: StudioNavigation }) {
  const [open, setOpen] = useState(false);
  const motionRef = useExitMotion<HTMLElement>(open, 'popover');
  const [workspaceId, setWorkspaceId] = useState(navigation.selectedWorkspaceId);
  const [moduleId, setModuleId] = useState(navigation.selectedModuleId);
  const [modules, setModules] = useState<BusinessModule[]>([]);
  const [workflows, setWorkflows] = useState<TenantWorkflowSummary[]>([]);
  const [queries, setQueries] = useState(['', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const request = useRef(0);
  const browsing = useRef({ workspaceId, moduleId });
  browsing.current = { workspaceId, moduleId };
  const activeWs = navigation.workspaces.find(item => item.id === navigation.selectedWorkspaceId);
  const activeMod = navigation.modules.find(item => item.id === navigation.selectedModuleId);
  const activeWf = navigation.workflows.find(item => item.flowId === navigation.selectedWorkflowId);
  const workspace = navigation.workspaces.find(item => item.id === workspaceId);
  const module = modules.find(item => item.id === moduleId);
  const matchingWorkflows = moduleId ? workflows.filter(item => !item.moduleId || item.moduleId === moduleId) : [];

  function close() { setOpen(false); trigger.current?.focus(); }
  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as globalThis.Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    root.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const current = ++request.current;
    setLoading(true); setError('');
    const load = navigation.loadWorkspaceContent
      ? navigation.loadWorkspaceContent(workspaceId, controller.signal)
      : Promise.all([moduleService.list(workspaceId, controller.signal), tenantWorkflowService.list(workspaceId, controller.signal)]);
    load
      .then(([nextModules, nextWorkflows]) => {
        if (controller.signal.aborted || request.current !== current) return;
        setModules(nextModules); setWorkflows(nextWorkflows);
        setModuleId(previous => nextModules.some(item => item.id === previous) ? previous : nextModules[0]?.id || '');
      })
      .catch(reason => { if (!controller.signal.aborted) setError(errorMessage(reason)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open, workspaceId, revision]);

  function navigate(targetModuleId: string, workflowId: string) {
    close();
    if (navigation.onNavigate) navigation.onNavigate(workspaceId, targetModuleId, workflowId);
    else {
      navigation.onSelectWorkspace(workspaceId);
      navigation.onSelectModule(targetModuleId);
      navigation.onSelectWorkflow(workflowId);
    }
  }

  function search(index: number, label: string) {
    return <label className="hf-search-field switcher-search"><Search size={15} /><input type="search" aria-label={`Tìm ${label}`} placeholder={`Tìm ${label}…`} value={queries[index]} onChange={event => setQueries(previous => previous.map((value, i) => i === index ? event.target.value : value))} /></label>;
  }
  const matches = (name: string, index: number) => normalize(name).includes(normalize(queries[index].trim()));
  const noResults = <p className="switcher-empty">Không tìm thấy kết quả.</p>;

  return <div className="workflow-switcher min-w-0" ref={root} onKeyDown={event => {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(); }
  }}>
    <button ref={trigger} type="button" className="switcher-trigger" aria-haspopup="dialog" aria-expanded={open} aria-controls="workflow-switcher-panel" aria-label="Chọn workspace, module và workflow" onClick={() => {
      if (!open) {
        setWorkspaceId(navigation.selectedWorkspaceId); setModuleId(navigation.selectedModuleId);
        setModules(navigation.modules); setWorkflows(navigation.workflows); setQueries(['', '', '']);
      }
      setOpen(!open);
    }}>
      <span className="switcher-context truncate">{activeWs?.name || 'Workspace'}<span aria-hidden="true"> / </span>{activeMod?.name || 'Module'}</span>
      <span aria-hidden="true" className="text-muted">/</span>
      <Workflow size={15} className="shrink-0 text-success" />
      <span className="truncate font-semibold text-primary">{activeWf?.name || navigation.activeWorkflowName || 'Chọn workflow'}</span>
      <span className="text-xs text-muted shrink-0">v{activeWf?.definitionVersion ?? navigation.activeWorkflowVersion ?? 1}</span>
      <ChevronDown size={15} className="shrink-0 text-secondary" />
    </button>
    {open && <section ref={motionRef} id="workflow-switcher-panel" role="dialog" aria-label="Chọn luồng làm việc" className="switcher-panel">
      <div className="switcher-heading"><div><h2>Chọn luồng làm việc</h2><p>Chọn workspace, module rồi mở workflow bạn cần.</p></div><button type="button" aria-label="Đóng bảng chọn" className="toolbar-button" onClick={close}><X size={17} /></button></div>
      <div className="switcher-columns">
        <section className="switcher-column" aria-label="Danh sách workspace">
          <h3><span>01 · Workspace</span><span>{navigation.workspaces.length}</span></h3>
          {search(0, 'workspace')}
          <div className="switcher-list">{navigation.workspaces.filter(item => matches(item.name, 0)).map(item => <button type="button" key={item.id} aria-pressed={workspaceId === item.id} className="switcher-item" disabled={loading && workspaceId === item.id} onClick={() => {
            if (item.id === workspaceId) return;
            setWorkspaceId(item.id); setModuleId(''); setModules([]); setWorkflows([]); setQueries(previous => [previous[0], '', '']);
          }}><span className="min-w-0"><span className="block truncate">{item.name}</span><small>{item.role}</small></span>{workspaceId === item.id && <Check size={15} className="shrink-0" />}</button>)}
            {!navigation.workspaces.some(item => matches(item.name, 0)) && noResults}</div>
          <CreateItem label="Workspace" context="Tạo workspace mới" onCreate={navigation.onCreateWorkspace} />
        </section>
        <section className="switcher-column" aria-label="Danh sách module">
          <h3><span>02 · Module</span><span>{modules.length}</span></h3>
          <p className="switcher-parent" title={workspace?.name}>Trong {workspace?.name || 'workspace đã chọn'}</p>
          {search(1, 'module')}
          <div className="switcher-list" aria-busy={loading}>{loading ? <p role="status" className="switcher-empty">Đang tải…</p> : error ? <div className="switcher-empty"><p role="alert" className="text-danger">{error}</p><button className="toolbar-button mt-2" onClick={() => setRevision(value => value + 1)}>Thử lại</button></div> : modules.filter(item => matches(item.name, 1)).map(item => <button type="button" key={item.id} aria-pressed={moduleId === item.id} className="switcher-item" onClick={() => { setModuleId(item.id); setQueries(previous => [previous[0], previous[1], '']); }}><Folder size={15} className="shrink-0" /><span className="truncate flex-1">{item.name}{!item.enabled && ' (tắt)'}</span>{moduleId === item.id && <Check size={15} className="shrink-0" />}</button>)}
            {!loading && !error && !modules.some(item => matches(item.name, 1)) && noResults}</div>
          <CreateItem key={workspaceId} label="Module" context={`Tạo module trong workspace ${workspace?.name || ''}`} disabled={loading || !!error || !workspaceId} onCreate={async name => { const created = await (navigation.createModuleInWorkspace || moduleService.create)(workspaceId, name); if (browsing.current.workspaceId !== workspaceId) return; setModules(previous => [...previous, created]); setModuleId(created.id); setQueries(previous => [previous[0], '', '']); }} />
        </section>
        <section className="switcher-column" aria-label="Danh sách workflow">
          <h3><span>03 · Workflow</span><span>{matchingWorkflows.length}</span></h3>
          <p className="switcher-parent" title={module?.name}>Trong {module?.name || 'module đã chọn'}</p>
          {search(2, 'workflow')}
          <div className="switcher-list" aria-busy={loading}>{loading ? <p role="status" className="switcher-empty">Đang tải…</p> : !error && matchingWorkflows.filter(item => matches(item.name, 2)).map(item => <button type="button" key={item.flowId} className="switcher-item" aria-current={navigation.selectedWorkspaceId === workspaceId && navigation.selectedWorkflowId === item.flowId ? 'page' : undefined} onClick={() => navigate(item.moduleId || moduleId, item.flowId)}><Workflow size={15} className="shrink-0" /><span className="truncate flex-1">{item.name}</span><small>v{item.definitionVersion}</small>{navigation.selectedWorkflowId === item.flowId && <Check size={15} className="shrink-0" />}</button>)}
            {!loading && !error && !matchingWorkflows.some(item => matches(item.name, 2)) && noResults}</div>
          <CreateItem key={`${workspaceId}:${moduleId}`} label="Workflow" context={`Tạo workflow trong module ${module?.name || ''}`} disabled={loading || !!error || !moduleId} onCreate={async name => { const created = await (navigation.createWorkflowInModule || tenantWorkflowService.create)(workspaceId, moduleId, name); if (browsing.current.workspaceId !== workspaceId || browsing.current.moduleId !== moduleId) return; navigate(moduleId, created.flowId); }} />
        </section>
      </div>
      <div className="switcher-footer"><span>Chọn workflow để mở · Esc để đóng</span><span>Cuộn ngang để xem các cột trên màn hình nhỏ</span></div>
    </section>}
  </div>;
}
