import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Workflow, X } from 'lucide-react';
import { useExitMotion } from '../../hooks/useExitMotion';
import type { StudioNavigation } from '../../types';
import { WorkflowColumns } from './WorkflowColumns';

export function WorkflowSwitcher({ navigation }: { navigation: StudioNavigation }) {
  const [open, setOpen] = useState(false);
  const motionRef = useExitMotion<HTMLElement>(open, 'popover');
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const activeWs = navigation.workspaces.find(item => item.id === navigation.selectedWorkspaceId);
  const activeMod = navigation.modules.find(item => item.id === navigation.selectedModuleId);
  const activeWf = navigation.workflows.find(item => item.flowId === navigation.selectedWorkflowId);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    root.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  return (
    <div className="workflow-switcher min-w-0" ref={root} onKeyDown={event => {
      if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(); }
    }}>
      <button ref={trigger} type="button" className="switcher-trigger" aria-haspopup="dialog" aria-expanded={open}
        aria-controls="workflow-switcher-panel" aria-label="Chọn workspace, module và workflow" onClick={() => setOpen(value => !value)}>
        <span className="switcher-context truncate">{activeWs?.name || 'Workspace'}<span aria-hidden="true"> / </span>{activeMod?.name || 'Module'}</span>
        <span aria-hidden="true" className="text-muted">/</span>
        <Workflow size={15} className="shrink-0 text-success" aria-hidden="true" />
        <span className="truncate font-semibold text-primary">{activeWf?.name || 'Chọn workflow'}</span>
        <span className="text-xs text-muted shrink-0">v{activeWf?.definitionVersion ?? 1}</span>
        <ChevronDown size={15} className="shrink-0 text-secondary" aria-hidden="true" />
      </button>
      {open && (
        <section ref={motionRef} id="workflow-switcher-panel" role="dialog" aria-label="Chọn luồng làm việc" className="switcher-panel">
          <div className="switcher-heading">
            <div><h2>Chọn luồng làm việc</h2><p>Chọn workspace, module rồi mở workflow bạn cần.</p></div>
            <button type="button" aria-label="Đóng bảng chọn" className="toolbar-button" onClick={close}><X size={17} /></button>
          </div>
          <WorkflowColumns
            workspaces={navigation.workspaces}
            initial={{ workspaceId: navigation.selectedWorkspaceId, moduleId: navigation.selectedModuleId, workflowId: navigation.selectedWorkflowId }}
            onCreateWorkspace={navigation.onCreateWorkspace}
            loadWorkspaceContent={navigation.loadWorkspaceContent}
            createModuleInWorkspace={navigation.createModuleInWorkspace}
            createWorkflowInModule={navigation.createWorkflowInModule}
            onNavigate={selection => { close(); navigation.onNavigate(selection); }}
          />
          <div className="switcher-footer"><span>Chọn workflow để mở · Esc để đóng</span><span>Cuộn ngang để xem các cột trên màn hình nhỏ</span></div>
        </section>
      )}
    </div>
  );
}
