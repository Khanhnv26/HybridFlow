import type { ExecutionHistoryDto, ExecutionPhase, NodeExecutionState } from '../types';

type Node = { id: string; type?: string };
type Edge = { id: string; source: string; target: string; sourceHandle?: string | null };

export function executionVisuals(nodes: Node[], edges: Edge[], run: ExecutionHistoryDto | null, pending = false) {
  const nodeStates: Record<string, NodeExecutionState> = {};
  let phases: ExecutionPhase[] = [];
  let result: { notificationsFailed?: number } = {};
  try {
    const parsed = typeof run?.progress === 'string' ? JSON.parse(run.progress) : run?.progress;
    if (Array.isArray(parsed)) phases = parsed.filter((phase) => Array.isArray(phase?.nodes) && typeof phase.stage === 'string' && typeof phase.label === 'string');
    result = run?.result ? JSON.parse(run.result) || {} : {};
  } catch { /* Older runs can still show their overall status. */ }
  for (const node of nodes) nodeStates[node.id] = { state: phases.length ? 'skipped' : 'idle', label: phases.length ? 'Không thực hiện' : '' };
  for (const phase of phases) for (const id of phase.nodes) {
    if (nodeStates[id]) nodeStates[id] = { state: 'success', label: 'Hoàn tất bước' };
  }
  const current = phases[phases.length - 1];
  const running = pending || run?.status === 'RUNNING';
  if (pending || running && !current) {
    const diff = nodes.find((node) => node.type === 'diffEngine');
    if (diff) nodeStates[diff.id] = { state: 'running', label: pending ? 'Đang gửi yêu cầu' : 'Đang đồng bộ' };
  } else if (current) {
    for (const id of current.nodes) if (nodeStates[id]) nodeStates[id] = {
      state: running ? 'running' : run?.status === 'ERROR' ? 'error' : 'success',
      label: running ? current.label : run?.status === 'ERROR' ? run.error || 'Bước bị lỗi' : 'Hoàn tất bước',
    };
  }
  if (run?.status === 'ERROR') for (const phase of phases.filter((phase) => phase.stage === 'WRITE')) {
    for (const id of phase.nodes) if (nodeStates[id]?.state === 'success')
      nodeStates[id] = { state: 'warning', label: 'Phiên thất bại · cần đối soát' };
  }
  for (const node of nodes) {
    if (node.type === 'diffEngine' && phases.length && ['CONFLICT', 'AWAITING_CONFIRMATION'].includes(run?.status || ''))
      nodeStates[node.id] = { state: 'warning', label: run?.status === 'CONFLICT' ? 'Có xung đột cần xem' : 'Chờ xác nhận khởi tạo' };
    if (node.type === 'telegramAction' && nodeStates[node.id].state === 'success' && result.notificationsFailed)
      nodeStates[node.id] = { state: 'error', label: 'Gửi cảnh báo thất bại' };
  }
  const edgeStates: Record<string, { state: NodeExecutionState['state']; reverse: boolean }> = {};
  for (const edge of edges) {
    const from = nodes.find((node) => node.id === edge.source);
    const to = nodes.find((node) => node.id === edge.target);
    const active = (id: string) => nodeStates[id]?.state === 'running';
    const sheetEdge = from?.type === 'sheetsTrigger' && to?.type === 'diffEngine' || from?.type === 'diffEngine' && to?.type === 'sheetsTrigger';
    const moving = running && !pending && current && (
      current.stage === 'READ' && sheetEdge && (active(edge.source) || active(edge.target)) ||
      current.stage === 'WRITE' && (sheetEdge && (active(edge.source) || active(edge.target)) || to?.type === 'storageAction' && active(edge.target)) ||
      current.stage === 'TRIGGER' && from?.type === 'scheduleTrigger' && active(edge.source) ||
      current.stage === 'NOTIFY' && to?.type === 'telegramAction' && active(edge.target));
    const participated = [edge.source, edge.target].every((id) => ['running', 'success', 'warning', 'error'].includes(nodeStates[id]?.state));
    edgeStates[edge.id] = {
      state: moving ? 'running' : !participated ? 'idle' : [edge.source, edge.target].some((id) => nodeStates[id]?.state === 'error') ? 'error'
        : edge.sourceHandle === 'conflict' && nodeStates[edge.source]?.state === 'warning' ? 'warning' : 'success',
      reverse: !!sheetEdge && (current?.stage === 'READ' ? from?.type === 'diffEngine' : to?.type === 'diffEngine'),
    };
  }
  const label = pending ? 'Đang gửi yêu cầu chạy' : running ? current?.label || 'Đang đồng bộ' : run?.status === 'ERROR' ? 'Đồng bộ thất bại'
    : run?.status === 'CONFLICT' ? 'Hoàn tất · có xung đột' : run?.status === 'AWAITING_CONFIRMATION' ? 'Chờ xác nhận khởi tạo' : run ? 'Đồng bộ hoàn tất' : '';
  return { nodeStates, edgeStates, running, label };
}
