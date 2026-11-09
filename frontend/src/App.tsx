import { errorDetails, errorMessage as message } from './services/errors';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Edge,
  type Node,
  BackgroundVariant,
} from '@xyflow/react';
import { Map, LayoutGrid, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { StudioHeader } from './components/orchestration/StudioHeader';
import { NodePalette } from './components/orchestration/NodePalette';
import { DataTransformConfigModal } from './components/orchestration/DataTransformConfigModal';
import { RouterConditionConfigModal } from './components/orchestration/RouterConditionConfigModal';
import { NaturalLanguageConfigModal } from './components/orchestration/NaturalLanguageConfigModal';
import { WorkspaceConnectionsModal } from './components/workspace/WorkspaceConnectionsModal';
import { RunHistoryDrawer } from './components/orchestration/RunHistoryDrawer';
import { ConflictModal } from './components/nocode/ConflictModal';
import { DataTableModal } from './components/nocode/DataTableModal';
import {
  DataTransformNode,
  SheetsTriggerNode,
  DiffEngineNode,
  StorageActionNode,
  TelegramActionNode,
  ScheduleTriggerNode,
  GenericOrchestrationNode,
  RouterConditionNode,
} from './components/nodes/OrchestrationNodes';
import { apiClient, googleService, syncService, workflowService, telegramService, workspaceConnectionService, workspaceTelegramApi, webhookService } from './services/api';
import { createTenantEditorApi } from './services/tenantEditor';
import { arrangeWorkflowNodes } from './services/workflowLayout';
import { connectedSheetSources, flowIdFor, workflowConfig } from './services/workflow';
import { historyLog } from './services/history';
import { useSheetReads } from './hooks/useSheetReads';
import { useWorkflowPolling } from './hooks/useWorkflowPolling';
import { useExecutionCompletion } from './hooks/useExecutionCompletion';
import { executionVisuals } from './services/executionVisuals';
import { ExecutionEdge } from './components/orchestration/ExecutionEdge';
import type { Me, RunHistoryItem, OrchestrationNodeData, SyncConflictDto, ExecutionHistoryDto, NotificationOutboxItem, WorkspaceRole, StudioNavigation } from './types';

const initialNodes: Node<OrchestrationNodeData>[] = [
  {
    id: 'node-sheets',
    type: 'sheetsTrigger',
    position: { x: 80, y: 190 },
    data: {
      label: 'Google Trang Tính',
      type: 'sheetsTrigger',
      category: 'trigger',
      subtitle: 'Đọc dữ liệu khi chạy luồng',
      sheetName: '',
      spreadsheetId: '',
    },
  },
  {
    id: 'node-diff',
    type: 'diffEngine',
    position: { x: 520, y: 180 },
    data: {
      label: 'Điều phối & Đồng bộ',
      type: 'diffEngine',
      category: 'logic',
      subtitle: '3-Way Diff chống ghi đè',
      uniqueKey: 'id',
      conflictPolicy: 'ASK_TELEGRAM',
    },
  },
  {
    id: 'node-storage',
    type: 'storageAction',
    position: { x: 980, y: 80 },
    data: {
      label: 'Kho Lưu Trữ',
      type: 'storageAction',
      category: 'action',
      subtitle: 'Lưu dữ liệu và snapshot',
      tableName: 'vault',
    },
  },
  {
    id: 'node-telegram',
    type: 'telegramAction',
    position: { x: 980, y: 340 },
    data: {
      label: 'Telegram',
      type: 'telegramAction',
      category: 'action',
      subtitle: 'Gửi cảnh báo xung đột',
      chatId: '',
    },
  },
];
const initialEdges: Edge[] = [
  {
    id: 'e-sheets-diff',
    source: 'node-sheets',
    target: 'node-diff',
    sourceHandle: 'out',
    targetHandle: 'in',
  },
  {
    id: 'e-diff-storage',
    source: 'node-diff',
    target: 'node-storage',
    sourceHandle: 'clean',
    targetHandle: 'in',
  },
];
interface EditorProps {
  user?: Me;
  workspaceRole?: WorkspaceRole;
  userId?: string;
  workspaceId?: string;
  workflowId?: string;
  navigation?: StudioNavigation;
}

function readDraft(key: string): { nodes: Node<OrchestrationNodeData>[]; edges: Edge[] } {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    if (Array.isArray(value?.nodes) && Array.isArray(value?.edges)) return value;
  } catch {
  }
  return { nodes: initialNodes, edges: initialEdges };
}

export default function App({ user, userId, workspaceId, workspaceRole, workflowId: propWorkflowId, navigation }: EditorProps = {}) {
  const effectiveDraftKey = userId && workspaceId && propWorkflowId
    ? `hybridflow:draft:${userId}:${workspaceId}:${propWorkflowId}`
    : 'hybridflow-workflow-v2';

  const [startingDraft] = useState(() => readDraft(effectiveDraftKey));
  const [hadDraft] = useState(() => !!localStorage.getItem(effectiveDraftKey));
  const [workflowId] = useState(() => {
    if (propWorkflowId) return propWorkflowId;
    const existing = localStorage.getItem('hybridflow-workflow-id');
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem('hybridflow-workflow-id', id);
    return id;
  });
  const tenant = useMemo(() => workspaceId ? createTenantEditorApi(apiClient, workspaceId, workflowId) : null, [workspaceId, workflowId]);
  const syncApi = tenant?.sync || syncService;
  const workflowApi = tenant?.workflow || workflowService;
  const [nodes, setNodes, onNodesChange] = useNodesState(startingDraft.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(startingDraft.edges);
  const fitCanvas = useRef<(() => void) | null>(null);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const inspectorOpen = !!activeNodeId;
  useEffect(() => {
    if (typeof window.requestAnimationFrame !== 'function') return;
    let nextFrame: number | undefined;
    const frame = window.requestAnimationFrame(() => {
      nextFrame = window.requestAnimationFrame(() => fitCanvas.current?.());
    });
    return () => { window.cancelAnimationFrame(frame); if (nextFrame !== undefined) window.cancelAnimationFrame(nextFrame); };
  }, [inspectorOpen]);
  const [isTableModalOpen, setIsTableModalOpen] = useState(false);
  const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);
  const [manualRunning, setIsRunning] = useState(false);
  const [latestExecution, setLatestExecution] = useState<ExecutionHistoryDto | null>(null);
  const [manualBaseline, setManualBaseline] = useState<string | undefined>();
  const isRunning = manualRunning || latestExecution?.status === 'RUNNING';
  const backendRunning = useRef(false);
  backendRunning.current = latestExecution?.status === 'RUNNING';
  const running = useRef(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState(true);
  const [isMinimapOpen, setIsMinimapOpen] = useState(false);
  const [tableNodeId, setTableNodeId] = useState('');
  const [logs, setLogs] = useState<RunHistoryItem[]>([]);
  const [conflicts, setConflicts] = useState<SyncConflictDto[]>([]);
  const [workflowEnabled, setWorkflowEnabled] = useState(true);
  const [isTogglingWorkflow, setIsTogglingWorkflow] = useState(false);
  const refreshRevision = useRef(0);
  const observedRunData = useRef<{ flowId: string; fingerprint: string } | null>(null);
  useEffect(() => {
    if (conflicts.length === 0) setIsConflictModalOpen(false);
  }, [conflicts.length]);
  const [flowId, setFlowId] = useState('');
  const [notificationItems, setNotificationItems] = useState<NotificationOutboxItem[]>([]);
  const [bootstrapRequired, setBootstrapRequired] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [legacyConnected, setConnected] = useState(() => !workspaceId && !!localStorage.getItem('google_access_token')?.startsWith('gconn-'));
  const connected = workspaceId ? nodes.some(node => node.type === 'sheetsTrigger' && node.data.connectionId) : legacyConnected;
  const [connectionVersion, setConnectionVersion] = useState(0);
  const [isConnectionsModalOpen, setIsConnectionsModalOpen] = useState(false);
  const [autoActive, setAutoActive] = useState(false);
  const [intervalMs, setIntervalMs] = useState(300000);
  const popup = useRef<Window | null>(null);
  const oauthOrigin = useRef('');
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMessage(null), 6000);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  const configState = useMemo(() => {
    try {
      return { config: workflowConfig(nodes, edges), error: '' };
    } catch (error) {
      return { config: null, error: message(error) };
    }
  }, [nodes, edges]);
  const configKey = JSON.stringify(configState.config, (key, value) =>
    ['label', 'nodeId', 'spreadsheetTitle'].includes(key) ? undefined : value,
  );
  const currentFlow = useRef('');
  const sheetNodes = useMemo(() => nodes.filter((node) => node.type === 'sheetsTrigger'), [nodes]);
  const tableSource = sheetNodes.find((node) => node.id === tableNodeId) || sheetNodes[0];
  const columnTypes = nodes.find(node => node.type === 'diffEngine')?.data.columnTypes;
  const {
    read: readSheetSource,
    stateFor,
    invalidate: invalidateReads,
  } = useSheetReads(async (target, signal) => {
    if (!target.spreadsheetId.trim() || !target.sheetName.trim())
      throw new Error('Chọn file và trang tính trước khi đọc dữ liệu.');
    if (workspaceId) {
      if (!target.connectionId) throw new Error('Chọn kết nối Google của workspace cho nguồn này.');
      return workspaceConnectionService.readSheet(workspaceId, target.connectionId, target.spreadsheetId.trim(),
        target.sheetName.trim(), signal, target.columnTypes);
    }
    const accessToken = localStorage.getItem('google_access_token');
    if (!accessToken) throw new Error('Kết nối Google trước khi đọc dữ liệu.');
    const data = await googleService.readSheet(
      accessToken,
      target.spreadsheetId.trim(),
      target.sheetName.trim(),
      signal,
      target.columnTypes,
    );
    return data;
  });
  const sourceDescriptor = (node: Node<OrchestrationNodeData>) => ({
    connectionId: node.data.connectionId,
    nodeId: node.id,
    spreadsheetId: node.data.spreadsheetId || '',
    sheetName: node.data.sheetName || '',
    columnTypes,
  });
  const tableState = tableSource
    ? stateFor(sourceDescriptor(tableSource))
    : { status: 'idle' as const, data: null, error: undefined };
  const configuredFiles = JSON.stringify(sheetNodes.filter(node => node.data.spreadsheetId?.trim())
    .map(node => ({ spreadsheetId: node.data.spreadsheetId!.trim(), connectionId: node.data.connectionId })));
  useEffect(() => {
    if (!connected) return;
    const controller = new AbortController();
    const files = JSON.parse(configuredFiles) as { spreadsheetId: string; connectionId?: string }[];
    for (const { spreadsheetId, connectionId } of files) {
      if (workspaceId && !connectionId) continue;
      const accessToken = workspaceId ? null : localStorage.getItem('google_access_token');
      if (!workspaceId && !accessToken) break;
      const metadata = workspaceId
        ? workspaceConnectionService.getSheetMetadata(workspaceId, connectionId!, spreadsheetId, controller.signal)
        : googleService.getMetadata(accessToken!, spreadsheetId, controller.signal);
      void metadata
        .then((metadata) => {
          if (!controller.signal.aborted)
            setNodes((items) =>
              items.map((node) =>
                node.type === 'sheetsTrigger' &&
                node.data.spreadsheetId?.trim() === spreadsheetId && (!workspaceId || node.data.connectionId === connectionId) &&
                node.data.spreadsheetTitle !== metadata.title
                  ? { ...node, data: { ...node.data, spreadsheetTitle: metadata.title } }
                  : node,
              ),
            );
        })
        .catch(() => {
          /* A metadata failure is not a data-read result. */
        });
    }
    return () => controller.abort();
  }, [configuredFiles, connected, connectionVersion, workspaceId, setNodes]);

  useEffect(() => {
    localStorage.setItem(effectiveDraftKey, JSON.stringify({ nodes, edges }));
  }, [nodes, edges, effectiveDraftKey]);
  useEffect(() => {
    let live = true;
    workflowApi
      .load(workflowId)
      .then((saved) => {
        if (!live) return;
        const record = saved as { nodes?: unknown[]; edges?: unknown[]; enabled?: boolean } | null;
        if (typeof record?.enabled === 'boolean') {
          setWorkflowEnabled(record.enabled);
        }
        if (!hadDraft && Array.isArray(record?.nodes) && Array.isArray(record?.edges)) {
          setNodes(record.nodes as any);
          setEdges(record.edges as any);
        }
      })
      .catch((error) => {
        if (live && !hadDraft) showToast(`Chưa tải được cấu hình đã lưu: ${message(error)}`);
      });
    return () => {
      live = false;
    };
  }, [hadDraft, workflowId, workflowApi, setNodes, setEdges, showToast]);
  useEffect(() => {
    const target = navigation?.workflows.find((w) => w.flowId === workflowId);
    if (target && typeof target.enabled === 'boolean') {
      setWorkflowEnabled(target.enabled);
    }
  }, [navigation?.workflows, workflowId]);
  useEffect(() => {
    const handle = (event: MessageEvent) => {
      if (event.origin !== oauthOrigin.current || event.source !== popup.current || !popup.current)
        return;
      if (event.data?.type === 'GOOGLE_OAUTH_ERROR') {
        showToast(message({ response: { data: event.data } }));
        popup.current = null;
        return;
      }
      if (
        event.data?.type === 'GOOGLE_OAUTH_SUCCESS' &&
        typeof event.data.accessToken === 'string'
      ) {
        localStorage.setItem('google_access_token', event.data.accessToken);
        setConnected(true);
        setConnectionVersion((version) => version + 1);
        showToast('Đã kết nối Google.');
        popup.current = null;
      }
    };
    window.addEventListener('message', handle);
    return () => window.removeEventListener('message', handle);
  }, [showToast]);
  useEffect(() => {
    let live = true;
    ++refreshRevision.current;
    observedRunData.current = null;
    setLatestExecution(null);
    setNotificationItems([]);
    setFlowId('');
    currentFlow.current = '';
    setConflicts([]);
    setLogs([]);
    setBootstrapRequired(false);
    if (configState.config)
      flowIdFor(configState.config)
        .then((id) => {
          if (!live) return;
          currentFlow.current = id;
          setFlowId(id);
        })
        .catch((error) => {
          if (live) showToast(message(error));
        });
    return () => {
      live = false;
    };
  }, [configKey, showToast]);
  const refreshRunData = useCallback(async (id: string, signal?: AbortSignal) => {
    const revision = ++refreshRevision.current;
    const [open, history] = await Promise.all([
      syncApi.getOpenConflicts(id, signal),
      syncApi.getHistory(id, signal),
    ]);
    if (!signal?.aborted && currentFlow.current === id && revision === refreshRevision.current) {
      const fingerprint = JSON.stringify([open, history.filter((run) => run.status !== 'RUNNING')]);
      const changed = observedRunData.current?.flowId === id && observedRunData.current.fingerprint !== fingerprint;
      observedRunData.current = { flowId: id, fingerprint };
      setConflicts(open);
      setLogs(history.map(historyLog));
      setLatestExecution(history[0] || null);
      setBootstrapRequired(history.find((run) => run.status !== 'RUNNING')?.status === 'AWAITING_CONFIRMATION');
      return changed;
    }
    return false;
  }, [syncApi]);
  const notificationKey = flowId && latestExecution?.id ? flowId + '|' + latestExecution.id : '';
  useEffect(() => { setNotificationItems([]); }, [notificationKey]);
  const refreshNotifications = async (_key: string, signal: AbortSignal) => {
    if (!latestExecution?.id) return;
    const items = await syncApi.getNotifications(flowId, latestExecution.id, signal);
    if (!signal.aborted && currentFlow.current === flowId) setNotificationItems(items);
  };
  useWorkflowPolling(notificationKey, refreshNotifications, error => showToast(message(error)), 2000);
  const retryNotification = async (id: string) => {
    await syncApi.retryNotification(id);
    await refreshNotifications(notificationKey, new AbortController().signal);
  };
  const clearLogs = useCallback(async () => {
    const id = currentFlow.current;
    if (!id) {
      setLogs([]);
      setLatestExecution(null);
      return;
    }
    try {
      await syncApi.clearHistory(id);
      if (currentFlow.current !== id) return;
      ++refreshRevision.current;
      observedRunData.current = { flowId: id, fingerprint: JSON.stringify([conflicts, []]) };
      setLogs([]);
      setLatestExecution(null);
      setBootstrapRequired(false);
      showToast('Đã xóa nhật ký điều phối.');
    } catch (error) {
      if (currentFlow.current === id) showToast(`Không thể xóa nhật ký: ${message(error)}`);
    }
  }, [conflicts, syncApi, showToast]);
  const token = useCallback(() => {
    const value = localStorage.getItem('google_access_token');
    if (!value) throw new Error('Kết nối Google trước khi thao tác dữ liệu.');
    return value;
  }, []);
  const fetchData = useCallback(
    async (target: Node<OrchestrationNodeData>, signal?: AbortSignal) =>
      readSheetSource({
        connectionId: target.data.connectionId,
        nodeId: target.id,
        spreadsheetId: target.data.spreadsheetId || '',
        sheetName: target.data.sheetName || '',
        columnTypes,
      }, signal),
    [readSheetSource, columnTypes],
  );
  const refreshSources = useCallback(async (signal?: AbortSignal) => {
    invalidateReads();
    await Promise.allSettled(sheetNodes.map((node) => fetchData(node, signal)));
  }, [sheetNodes, fetchData, invalidateReads]);
  useWorkflowPolling(flowId, async (id, signal) => {
    if (await refreshRunData(id, signal)) {
      if (!signal.aborted && currentFlow.current === id && !running.current) await refreshSources(signal);
    }
  }, (error) => showToast(`Chưa cập nhật được kết quả đồng bộ: ${message(error)}`), isRunning ? 500 : 1000);
  const openTable = useCallback(
    (nodeId?: string) => {
      const target = sheetNodes.find((node) => node.id === nodeId) || sheetNodes[0];
      setTableNodeId(target?.id || '');
      setIsTableModalOpen(true);
      if (target) void fetchData(target).catch((error) => showToast(message(error)));
    },
    [sheetNodes, fetchData, showToast],
  );
  const saveWorkflow = useCallback(async () => {
    await workflowApi.save(workflowId, {
      nodes,
      edges,
      flowId: flowId || undefined,
      ...(!workspaceId ? { accessToken: localStorage.getItem('google_access_token') || undefined } : {}),
    });
  }, [workflowId, workflowApi, nodes, edges, flowId, workspaceId]);
  const handleToggleWorkflow = useCallback(async () => {
    if (isTogglingWorkflow) return;
    const next = !workflowEnabled;
    setIsTogglingWorkflow(true);
    try {
      if (typeof (workflowApi as any).updateStatus === 'function') {
        await (workflowApi as any).updateStatus(workflowId, next);
      }
      setWorkflowEnabled(next);
      if (navigation?.workflows) {
        const target = navigation.workflows.find((w) => w.flowId === workflowId);
        if (target) target.enabled = next;
      }
      showToast(next ? 'Đã bật workflow.' : 'Đã tắt workflow.');
    } catch (error) {
      showToast(`Không thể đổi trạng thái workflow: ${message(error)}`);
    } finally {
      setIsTogglingWorkflow(false);
    }
  }, [workflowEnabled, isTogglingWorkflow, workflowApi, workflowId, navigation, showToast]);
  const sheetWriteNodeId = workspaceId ? nodes.find(node => node.type === 'sheetWriteAction')?.id : undefined;
  const runWorkflow = useCallback(
    async (bootstrapConfirmed = false, previewToken?: string) => {
      if (running.current || backendRunning.current) {
        if (previewToken) throw new Error('Chờ phiên đồng bộ hiện tại hoàn tất trước khi áp dụng.');
        return;
      }
      setManualBaseline(latestExecution?.id);
      running.current = true;
      setIsRunning(true);
      let id = '';
      try {
        if (!workspaceId) token();
        if (!configState.config) throw new Error(configState.error);
        const config = configState.config;
        id = await flowIdFor(config);
        if (!previewToken) await saveWorkflow();
        const result = await workflowApi.run(workflowId, bootstrapConfirmed, previewToken);
        if (currentFlow.current !== id) return;
        setBootstrapRequired(result.bootstrapRequired);
        setConflicts(result.conflicts);
        if (result.bootstrapRequired) {
          setAutoActive(false);
          showToast('Chưa ghi dữ liệu. Xác nhận khởi tạo snapshot để bắt đầu đồng bộ.');
        } else
          showToast(
            `Đồng bộ ${result.cleanRecordIds.length} bản ghi, ${result.conflicts.length} xung đột. Đã xếp hàng ${result.notificationsQueued ?? 0} thông báo.`,
          );
        await refreshRunData(id);
        await refreshSources();
      } catch (error) {
        if (errorDetails(error).code === 'CONNECTION_REQUIRED') setConnected(false);
        showToast(message(error));
        if (id) {
          await refreshRunData(id).catch(() => {});
          await refreshSources().catch(() => {});
        }
        if (previewToken) throw error;
      } finally {
        running.current = false;
        setIsRunning(false);
      }
    },
    [configState, token, saveWorkflow, refreshRunData, refreshSources, showToast, workflowId, workflowApi, workspaceId, latestExecution?.id],
  );
  useEffect(() => {
    if (!autoActive || sheetWriteNodeId) return;
    const timer = setInterval(() => {
      void runWorkflow();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [autoActive, intervalMs, runWorkflow, sheetWriteNodeId]);
  const testStep = useCallback(
    async (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) throw new Error('Không tìm thấy khối.');
      if (node.type === 'sheetsTrigger') return (await fetchData(node)).rows;
      if (node.type === 'diffEngine')
        return Promise.all(connectedSheetSources(nodes, edges, node.id).map(source =>
          readSheetSource({ ...source, connectionId: sheetNodes.find(sheet => sheet.id === source.nodeId)?.data.connectionId, columnTypes: node.data.columnTypes })));
      if (!flowId) throw new Error(configState.error || 'Cấu hình luồng trước khi chạy thử.');
      if (node.type === 'storageAction') return syncApi.getVault(flowId);
      if (node.type === 'telegramAction') {
        if (!conflicts[0]) throw new Error('Chưa có xung đột thật để gửi lại thông báo.');
        const chatId = node.data.chatId?.trim();
        if (!chatId) throw new Error('Điền Telegram Chat ID.');
        const result = await syncApi.resendTelegramAlert(conflicts[0].id, chatId);
        if (!result.success) throw new Error(result.message);
        return result;
      }
      throw new Error('Khối này chưa được hỗ trợ thực thi.');
    },
    [nodes, edges, sheetNodes, readSheetSource, fetchData, flowId, configState.error, conflicts, token, syncApi],
  );
  const resolveConflict = useCallback(
    async (value: string, conflict: SyncConflictDto) => {
      if (value === undefined) throw new Error('Xung đột thiếu giá trị. Tải lại danh sách.');
      await syncApi.resolveConflict(conflict.id, value, workspaceId ? '' : token());
      refreshRevision.current++;
      setConflicts((items) => items.filter((item) => item.id !== conflict.id));
      await refreshSources();
      showToast('Đã đồng bộ giá trị đã chọn xuống tất cả các bảng và cập nhật snapshot.');
      await refreshRunData(tenant ? currentFlow.current : conflict.flowId || flowId).catch((error) =>
        showToast(`Đã lưu quyết định; tải lại danh sách thất bại: ${message(error)}`),
      );
    },
    [token, flowId, tenant, syncApi, workspaceId, refreshRunData, refreshSources, showToast],
  );
  const sendTelegram = useCallback(
    async (conflictId: number) => {
      const diff = nodes.find(node => node.type === 'diffEngine');
      const targets = nodes.filter(node => node.type === 'telegramAction' && edges.some(edge =>
        edge.source === diff?.id && edge.sourceHandle === 'conflict' && edge.target === node.id));
      if (!targets.length) throw new Error('Nối khối Telegram vào nhánh xung đột trước khi gửi lại.');
      const results = await Promise.all(targets.map(async node => {
        const destination = node.data.chatId?.trim();
        if (!destination) throw new Error('Điền Telegram Chat ID.');
        return syncApi.resendTelegramAlert(conflictId, destination);
      }));
      const failed = results.filter(result => !result.success);
      if (failed.length) throw new Error(failed.map(result => result.message).join('; '));
      showToast('Đã gửi lại cảnh báo đến ' + targets.length + ' đích Telegram.');
      return;

    },
    [nodes, edges, syncApi, showToast],
  );
  const updateCell = useCallback(
    async (range: string, value: string) => {
      if (!tableSource?.data.spreadsheetId) throw new Error('Chưa chọn nguồn dữ liệu.');
      const payload = {
        spreadsheetId: tableSource.data.spreadsheetId,
        range,
        value,
        valueType: (() => {
          const letters = range.match(/!([A-Z]+)[0-9]+$/)?.[1];
          const index = letters ? [...letters].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0) - 1 : -1;
          const column = tableState.data?.headers[index];
          return column ? nodes.find(node => node.type === 'diffEngine')?.data.columnTypes?.[column] || 'TEXT' : 'TEXT';
        })(),
      };
      if (workspaceId && !tableSource.data.connectionId) throw new Error('Chọn kết nối Google của workspace cho nguồn này.');
      const result = workspaceId
        ? await workspaceConnectionService.updateCell(workspaceId, tableSource.data.connectionId!, payload)
        : await googleService.updateCell({ ...payload, accessToken: token() });
      if (!result.success) throw new Error(result.message);
      showToast('Đã cập nhật ô trên trang tính đang chọn. Chạy luồng để đồng bộ các nguồn.');
      await fetchData(tableSource).catch((error) =>
        showToast(`Đã ghi ô; tải lại bảng thất bại: ${message(error)}`),
      );
    },
    [tableSource, tableState.data, nodes, token, workspaceId, fetchData, showToast],
  );
  const onConnect = useCallback(
    (connection: Connection) => {
      if (nodes.some(node => node.id === connection.target && node.type === 'sheetWriteAction')) {
        const sourceType = nodes.find(node => node.id === connection.source)?.type;
        const fromDiff = sourceType === 'diffEngine' && connection.sourceHandle === 'clean';
        const fromRouter = sourceType === 'routerCondition' && connection.sourceHandle === 'out';
        if (connection.targetHandle !== 'in' || (!fromDiff && !fromRouter)) {
          showToast('Nối cổng Hành động của So khớp hoặc đầu ra Rẽ nhánh vào khối Ghi về bảng tính.');
          return;
        }
        if (edges.some(edge => edge.target === connection.target)) {
          showToast('Khối Ghi về bảng tính chỉ nhận một dây vào. Hãy gỡ dây cũ để đổi nhánh.');
          return;
        }
      }
      setEdges(items => addEdge(connection, items));
    },
    [edges, nodes, setEdges, showToast],
  );
  const pendingExecution = manualRunning && latestExecution?.id === manualBaseline;
  const recentlyCompleted = useExecutionCompletion(flowId, latestExecution, observedRunData.current?.flowId === flowId);
  const executionView = useMemo(() => executionVisuals(nodes, edges, pendingExecution ? null : latestExecution, pendingExecution, notificationItems),
    [nodes, edges, latestExecution, pendingExecution, notificationItems]);
  const enhancedNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          isRunning,
          executionState: executionView.nodeStates[node.id],
          incomingSourcesCount: edges.filter(edge => edge.target === node.id).length,
          hasLegacySheetConnection: edges.some(edge => edge.source === node.id && edge.sourceHandle === 'clean' && nodes.some(target => target.id === edge.target && target.type === 'sheetsTrigger')),
          notificationItems: notificationItems.filter(item => item.actionNodeId === node.id),
          userAccount: node.type === 'sheetsTrigger' && connected ? 'Google OAuth' : undefined,
          spreadsheetTitle:
            node.type === 'sheetsTrigger'
              ? stateFor(sourceDescriptor(node)).data?.spreadsheetTitle ||
                node.data.spreadsheetTitle
              : node.data.spreadsheetTitle,
          sourceNumber: sheetNodes.findIndex((source) => source.id === node.id) + 1,
          recordsCount:
            node.type === 'sheetsTrigger'
              ? stateFor(sourceDescriptor(node)).data?.totalRows
              : undefined,
          readStatus:
            node.type === 'sheetsTrigger' ? stateFor(sourceDescriptor(node)).status : undefined,
          readError:
            node.type === 'sheetsTrigger' ? stateFor(sourceDescriptor(node)).error : undefined,
          readAt:
            node.type === 'sheetsTrigger' ? stateFor(sourceDescriptor(node)).readAt : undefined,
          onOpenData: () => openTable(node.id),
          hasConflict: node.type === 'diffEngine' && conflicts.length > 0,
          conflictCount: node.type === 'diffEngine' ? conflicts.length : undefined,
          onOpenConflict: () => setIsConflictModalOpen(true),
          connectedSheets:
            node.type === 'diffEngine'
              ? connectedSheetSources(nodes, edges, node.id).map((source) => ({
                  ...source,
                  spreadsheetTitle:
                    stateFor({
                      nodeId: source.nodeId,
                      spreadsheetId: source.spreadsheetId,
                      sheetName: source.sheetName,
                    }).data?.spreadsheetTitle || source.spreadsheetTitle,
                }))
              : undefined,
          transformSourceCount: node.type === 'dataTransform' ? new Set(edges.filter(edge => edge.target === node.id && edge.sourceHandle === 'out' && edge.targetHandle === 'in' && sheetNodes.some(source => source.id === edge.source)).map(edge => edge.source)).size : undefined,
          transformWriteBackCount: node.type === 'dataTransform' ? sheetNodes.filter(source => edges.some(edge => edge.target === node.id && edge.source === source.id && edge.sourceHandle === 'out' && edge.targetHandle === 'in') && (node.data.writeBackBySource?.[source.id] ?? !!node.data.writeBackCleanData)).length : undefined,
          hasLegacyStorageConnection:
            node.type === 'diffEngine' &&
            edges.some(
              (edge) =>
                edge.source === node.id &&
                edge.sourceHandle === 'clean' &&
                edge.targetHandle === 'in' &&
                nodes.some(
                  (target) => target.id === edge.target && target.type === 'storageAction',
                ),
            ),
        },
      })),
    [nodes, edges, sheetNodes, isRunning, connected, stateFor, openTable, conflicts.length, executionView, notificationItems],
  );
  const nodeTypes = useMemo(
    () => ({
      sheetsTrigger: SheetsTriggerNode,
      diffEngine: DiffEngineNode,
      storageAction: StorageActionNode,
      telegramAction: TelegramActionNode,
      scheduleTrigger: ScheduleTriggerNode,
      webhookTrigger: GenericOrchestrationNode,
      routerCondition: RouterConditionNode,
      dataTransform: DataTransformNode,
      sheetWriteAction: GenericOrchestrationNode,
    }),
    [],
  );
  const enhancedEdges = useMemo(
    () =>
      edges.map((edge) => ({
        ...edge,
        type: 'execution',
        animated: false,
        data: { ...edge.data, ...executionView.edgeStates[edge.id],
          recentlyCompleted: recentlyCompleted && !executionView.running && ['success', 'warning'].includes(executionView.edgeStates[edge.id]?.state) },
        label:
          edge.sourceHandle === 'conflict' && conflicts.length > 0
            ? `${conflicts.length} xung đột`
            : undefined,
      })),
    [edges, executionView, conflicts.length, recentlyCompleted],
  );
  const edgeTypes = useMemo(() => ({ execution: ExecutionEdge }), []);
  const arrangeCanvas = () => {
    if (isRunning) return;
    setNodes(items => arrangeWorkflowNodes(items, edges));
    if (fitCanvas.current) requestAnimationFrame(() => requestAnimationFrame(() => fitCanvas.current?.()));
  };
  const activeNode = nodes.find((n) => n.id === activeNodeId) || null;
  const sheetWriteInputs = activeNode?.type === 'sheetWriteAction'
    ? edges.filter(edge => edge.target === activeNode.id)
    : [];
  const sheetWriteEdge = sheetWriteInputs.length === 1 ? sheetWriteInputs[0] : undefined;
  const sheetWriteInput = sheetWriteEdge?.targetHandle === 'in'
    ? nodes.find(node => node.id === sheetWriteEdge.source &&
        ((node.type === 'diffEngine' && sheetWriteEdge.sourceHandle === 'clean') ||
         (node.type === 'routerCondition' && sheetWriteEdge.sourceHandle === 'out') ||
         (node.type === 'webhookTrigger' && sheetWriteEdge.sourceHandle === 'out')))
    : undefined;
  const transformInputs = activeNode?.type === 'dataTransform'
    ? edges.filter(edge => edge.target === activeNode.id && edge.sourceHandle === 'out' && edge.targetHandle === 'in')
    : [];
  const transformSources = transformInputs
    .map(edge => nodes.find(node => node.type === 'sheetsTrigger' && node.id === edge.source))
    .filter((node): node is Node<OrchestrationNodeData> => !!node);
  const diffUpstreamSheets = useMemo(() => {
    if (!activeNode || !['diffEngine', 'routerCondition', 'telegramAction', 'sheetWriteAction'].includes(activeNode.type || '')) return [];
    const diffId = activeNode.type === 'diffEngine' ? activeNode.id : nodes.find(node => node.type === 'diffEngine')?.id;
    const direct = edges
      .filter(e => e.target === diffId)
      .map(e => nodes.find(n => n.id === e.source))
      .filter((n): n is Node<OrchestrationNodeData> => n?.type === 'sheetsTrigger');
    const viaTransform = edges
      .filter(e => e.target === diffId)
      .flatMap(e => {
        const transNode = nodes.find(n => n.id === e.source && n.type === 'dataTransform');
        if (!transNode) return [];
        return edges
          .filter(te => te.target === transNode.id)
          .map(te => nodes.find(n => n.id === te.source && n.type === 'sheetsTrigger'))
          .filter((n): n is Node<OrchestrationNodeData> => !!n);
      });
    const seen = new Set<string>();
    const unique: Node<OrchestrationNodeData>[] = [];
    for (const s of [...direct, ...viaTransform]) {
      if (s && !seen.has(s.id)) {
        seen.add(s.id);
        unique.push(s);
      }
    }
    return unique;
  }, [activeNode, edges, nodes]);
  const diffAvailableColumns = useMemo(() => {
    if (!activeNode || !['diffEngine', 'routerCondition', 'telegramAction', 'sheetWriteAction'].includes(activeNode.type || '')) return [];
    const headers = diffUpstreamSheets.map(source => stateFor(sourceDescriptor(source)).data?.headers).filter((value): value is string[] => !!value);
    const common = headers.length ? headers[0].filter(column => headers.every(list => list.includes(column))) : [];
    const diffNode = nodes.find(node => node.type === 'diffEngine');
    if (activeNode.type === 'diffEngine') return common;
    const key = diffNode?.data.uniqueKey?.trim() || 'id';
    const configured = diffNode?.data.syncColumns || diffNode?.data.sharedColumns?.split(',').map(value => value.trim()).filter(Boolean);
    return [...new Set([key, ...(configured?.length ? configured : common)])];
  }, [activeNode, diffUpstreamSheets, nodes, stateFor]);
  const previewRows = diffUpstreamSheets.flatMap(source => stateFor(sourceDescriptor(source)).data?.rows || []);
  const comparisonSources = diffUpstreamSheets.map(source => ({
    id: source.id,
    name: source.data.spreadsheetTitle || stateFor(sourceDescriptor(source)).data?.spreadsheetTitle || source.data.label || 'Bảng tính',
    sheetName: source.data.sheetName || '',
    data: stateFor(sourceDescriptor(source)).data || undefined,
  }));
  const previewConflict = conflicts[0] ? {
    recordId: conflicts[0].recordId, id: conflicts[0].recordId,
    columnName: conflicts[0].columnName, column: conflicts[0].columnName,
    baseValue: conflicts[0].baseValue || '', valueA: conflicts[0].valueA || '', valueB: conflicts[0].valueB || '',
  } : undefined;

  const configReadSourcesKey = JSON.stringify(diffUpstreamSheets.map(sourceDescriptor));
  const [configReadRetry, setConfigReadRetry] = useState(0);
  const configReadErrors = diffUpstreamSheets.flatMap(source => {
    const state = stateFor(sourceDescriptor(source));
    return state.status === 'error' ? [`${source.data.spreadsheetTitle || source.data.sheetName}: ${state.error}`] : [];
  });
  const configReading = diffUpstreamSheets.some(source => stateFor(sourceDescriptor(source)).status === 'loading');

  useEffect(() => {
    const controller = new AbortController();
    if (activeNode && ['diffEngine', 'routerCondition', 'telegramAction'].includes(activeNode.type || '') && connected && !isRunning) {
      const sources = JSON.parse(configReadSourcesKey) as ReturnType<typeof sourceDescriptor>[];
      sources.forEach(desc => {
        const state = stateFor(desc);
        if (desc.spreadsheetId && desc.sheetName && !state.data && state.status !== 'loading') {
          // The read hook records errors; keep a rejected source read out of the global error overlay.
          void readSheetSource(desc, controller.signal).catch(() => {});
        }
      });
    }
    return () => controller.abort();
  }, [activeNode?.id, activeNode?.type, connected, configReadSourcesKey, configReadRetry, isRunning, readSheetSource]);
  const connectGoogle = async () => {
    if (workspaceId) {
      setIsConnectionsModalOpen(true);
      return;
    }
    const opened = window.open('about:blank', 'hybridflow-google', 'width=600,height=700');
    if (!opened) throw new Error('Trình duyệt đã chặn cửa sổ đăng nhập Google.');
    popup.current = opened;
    try {
      const config = await googleService.getOAuthConfig();
      oauthOrigin.current = new URL(config.callbackOrigin).origin;
      opened.location.href = googleService.getOAuthStartUrl();
    } catch (error) {
      opened.close();
      popup.current = null;
      throw error;
    }
  };
  const saveSource = async (
    nodeId: string,
    sourceData: Partial<OrchestrationNodeData>,
    successMessage = 'Đã lưu nguồn dữ liệu.',
  ) => {
    if (running.current || backendRunning.current)
      throw new Error('Chờ phiên đồng bộ hiện tại hoàn tất trước khi đổi cấu hình.');
    running.current = true;
    setAutoActive(false);
    try {
      const updatedNodes = nodes.map((node) =>
        node.id === nodeId ? { ...node, data: { ...node.data, ...sourceData } } : node,
      );
      let updatedFlowId: string | undefined;
      try { updatedFlowId = await flowIdFor(workflowConfig(updatedNodes, edges)); }
      catch { /* Incomplete graphs may still be saved as drafts when no schedule is active. */ }
      await workflowApi.save(workflowId, {
        nodes: updatedNodes,
        edges,
        flowId: updatedFlowId,
        ...(!workspaceId ? { accessToken: localStorage.getItem('google_access_token') || undefined } : {}),
      });
      setNodes(updatedNodes);
      setActiveNodeId(null);
      showToast(successMessage);
    } finally {
      running.current = false;
    }
  };
  const saveTelegram = async (nodeId: string, settings: Partial<OrchestrationNodeData>) => {
    if (!settings.chatId || !settings.telegramRecipientType)
      throw new Error('Kết nối nơi nhận trước khi lưu.');
    if (workspaceId && !settings.connectionId) throw new Error('Chọn bot Telegram của workspace.');
    const setup = workspaceId ? workspaceTelegramApi(workspaceId, settings.connectionId!) : telegramService;
    const recipient = await setup.checkRecipient(
      settings.chatId,
      settings.telegramRecipientType,
    );
    await saveSource(
      nodeId,
      { ...settings, chatId: recipient.chatId, telegramRecipientName: recipient.name },
      'Đã lưu nơi nhận Telegram.',
    );
  };

  return (
    <div className="studio-shell h-full min-h-0 w-full flex flex-col bg-canvas text-primary overflow-hidden font-sans">
      <StudioHeader
        user={user}
        workspaceRole={workspaceRole}
        navigation={navigation}
        isRunning={isRunning}
        autoActive={autoActive && !sheetWriteNodeId}
        requiresPreview={!!sheetWriteNodeId}
        onAutoChange={setAutoActive}
        intervalMs={intervalMs}
        onIntervalChange={setIntervalMs}
        connected={connected}
        onRunWorkflow={() => {
          if (sheetWriteNodeId) setActiveNodeId(sheetWriteNodeId);
          else void runWorkflow();
        }}
        onSaveWorkflow={() => {
          void saveWorkflow()
            .then(() => showToast('Đã lưu cấu hình lên máy chủ.'))
            .catch((e) => showToast(message(e)));
        }}
        onResetLayout={arrangeCanvas}
        onOpenTable={() => openTable(tableNodeId)}
        onConnectGoogle={() => {
          void connectGoogle().catch((error) => showToast(message(error)));
        }}
        onManageConnections={workspaceId ? () => setIsConnectionsModalOpen(true) : undefined}
        workflowEnabled={workflowEnabled}
        onToggleWorkflowEnabled={workspaceId ? handleToggleWorkflow : undefined}
        isTogglingWorkflow={isTogglingWorkflow}
      />
      {workspaceId && !workflowEnabled && (
        <div
          role="alert"
          className="px-5 py-2.5 bg-warning-soft border-b border-warning/20 text-warning text-xs sm:text-sm flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-2">
            <span aria-hidden="true">⚠️</span>
            <span>Workflow này đang bị tắt. Hãy bật workflow để có thể chạy thử hoặc kích hoạt đồng bộ.</span>
          </div>
          <button
            type="button"
            disabled={isTogglingWorkflow}
            onClick={() => void handleToggleWorkflow()}
            className="px-3 py-1 bg-amber-600 hover:bg-amber-500 rounded text-xs font-semibold text-on-accent disabled:opacity-50 shrink-0 transition"
          >
            {isTogglingWorkflow ? 'Đang bật…' : 'Bật workflow ngay'}
          </button>
        </div>
      )}
      {bootstrapRequired && (
        <div
          role="alert"
          className="px-5 py-3 bg-warning-soft text-warning text-sm flex items-center gap-4"
        >
          Luồng mới chưa có snapshot. Khởi tạo sẽ sao chép dữ liệu Sheet hiện tại vào vùng lưu trữ
          đã chọn.
          <button
            disabled={isRunning}
            onClick={() => void runWorkflow(true)}
            className="px-3 py-2 bg-amber-600 rounded text-on-accent disabled:opacity-50"
          >
            Xác nhận khởi tạo
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1 flex overflow-hidden relative">
        <NodePalette
            open={isPaletteOpen}
            disabled={isRunning}
            onAddNode={(item) => {
              setNodes((items) => [
                ...items,
                {
                  id: crypto.randomUUID(),
                  type: item.type,
                  position: { x: 300, y: 300 },
                  data: {
                    label: item.label,
                    type: item.type,
                    category: item.category,
                    subtitle: item.subtitle,
                    sheetName: '',
                    spreadsheetId: '',
                    uniqueKey: 'id',
                    conflictPolicy: 'ASK_TELEGRAM',
                    tableName: 'vault',
                    chatId: '',
                    scheduleIntervalMinutes: 5,
                    scheduleType: 'interval',
                    scheduleEnabled: true,
                    scheduleTime: '08:00',
                    ...(item.type === 'dataTransform' ? { transforms: [], writeBackCleanData: false } : {}),
                  },
                },
              ]);
            }}
          />
        <div className="min-w-0 flex-1 relative h-full">
          <ReactFlow
            onInit={instance => { fitCanvas.current = () => { void instance.fitView({ padding: 0.18, maxZoom: 1, duration: 250 }); }; }}
            nodes={enhancedNodes}
            edges={enhancedEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_: React.MouseEvent, node: Node) => setActiveNodeId(node.id)}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            nodesDraggable={!isRunning}
            nodesConnectable={!isRunning}
            deleteKeyCode={isRunning ? null : ['Backspace', 'Delete']}
            fitView
            fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
            minZoom={0.2}
            maxZoom={2}
            defaultEdgeOptions={{ type: 'smoothstep' }}
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--grid-dot)" />
            {executionView.label && <Panel position="top-right">
              <div role="status" aria-live="polite" className={`workflow-run-summary workflow-run-summary--${executionView.running ? 'running' : latestExecution?.status === 'ERROR' ? 'error' : ['CONFLICT', 'AWAITING_CONFIRMATION'].includes(latestExecution?.status || '') ? 'warning' : 'success'}`}>
                <span className="workflow-run-indicator" />
                <div><strong>{executionView.label}</strong>
                  <span>{pendingExecution ? 'Đang chờ backend nhận yêu cầu' : executionView.running ? 'Trạng thái từ lượt chạy hiện tại' : recentlyCompleted ? 'Lượt vừa hoàn tất · dây sáng xác nhận kết quả' : 'Kết quả lượt gần nhất · giữ đến lượt tiếp theo'}</span>
                </div>
              </div>
            </Panel>}
            <Panel position="top-left" className="flex gap-2">
              <button
                onClick={() => setIsPaletteOpen(!isPaletteOpen)}
                aria-expanded={isPaletteOpen}
                className="flex items-center gap-2 rounded border border-line bg-surface px-3 py-2 text-xs"
              >
                {isPaletteOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />} Thư
                viện
              </button>
              <button
                onClick={() => setIsMinimapOpen(!isMinimapOpen)}
                className="flex items-center gap-2 rounded border border-line bg-surface px-3 py-2 text-xs"
              >
                <Map size={16} /> Bản đồ
              </button>
              <button aria-label="Sắp xếp canvas" disabled={isRunning} onClick={arrangeCanvas} className="flex items-center gap-2 rounded border border-line bg-surface px-3 py-2 text-xs disabled:opacity-40"><LayoutGrid size={16} /> Sắp xếp</button>
            </Panel>
            <Controls style={{ bottom: 52 }} />
            {isMinimapOpen && <MiniMap style={{ bottom: 52, width: 140, height: 90 }} />}
          </ReactFlow>
          <RunHistoryDrawer
            flowId={flowId}
            loadNotifications={syncApi.getNotificationPage}
            retryNotification={syncApi.retryNotification}
            logs={logs}
            activeConflictIds={conflicts.map((conflict) => conflict.id)}
            isRunning={isRunning}
            onClearLogs={() => void clearLogs()}
            onOpenConflictModal={() => setIsConflictModalOpen(true)}
          />
        </div>
        {activeNode && <aside className="studio-inspector" aria-label="Cấu hình khối">
          <div className="studio-inspector-eyebrow">CẤU HÌNH KHỐI</div>
      {activeNode?.type === 'dataTransform' && <DataTransformConfigModal
        key={JSON.stringify([activeNode.id, transformSources.map(sourceDescriptor)])}
        data={activeNode.data}
        sources={transformSources.map(source => ({
          nodeId: source.id,
          name: (source.data.spreadsheetTitle || source.data.label) + ' · ' + (source.data.sheetName || 'Chưa chọn tab'),
          data: stateFor(sourceDescriptor(source)).data || undefined,
          read: signal => readSheetSource(sourceDescriptor(source), signal),
        }))}
        connected={connected}
        connectionVersion={connectionVersion}
        onConnectGoogle={connectGoogle}
        onClose={() => setActiveNodeId(null)}
        disabled={isRunning}
        onSave={settings => saveSource(activeNode.id, settings, 'Đã lưu cấu hình chuẩn hóa vào hệ thống.')}
      />}
      {activeNode?.type === 'routerCondition' && (
        <RouterConditionConfigModal
          key={`router-config:${activeNode.id}`}
          data={activeNode.data}
          availableColumns={diffAvailableColumns}
          columnTypes={nodes.find(node => node.type === 'diffEngine')?.data.columnTypes}
          previewRows={previewRows}
          previewSources={comparisonSources.map(source => ({
            id: source.id, name: source.name + ' · ' + source.sheetName, rows: source.data?.rows || [],
            error: stateFor(sourceDescriptor(diffUpstreamSheets.find(item => item.id === source.id)!)).error,
          }))}
          idColumn={nodes.find(node => node.type === 'diffEngine')?.data.uniqueKey || 'id'}
          actionNames={edges.filter(edge => edge.source === activeNode.id && edge.sourceHandle === 'out')
            .map(edge => nodes.find(node => node.id === edge.target))
            .filter((node): node is Node<OrchestrationNodeData> => !!node && ['telegramAction', 'sheetWriteAction'].includes(node.type || ''))
            .map(node => node.type === 'sheetWriteAction'
              ? node.data.targetSheetName ? `Ghi về bảng tính · ${node.data.targetSheetName}` : 'Ghi về bảng tính'
              : node.data.telegramRecipientName || node.data.label || 'Telegram')}
          reading={configReading}
          readErrors={configReadErrors}
          onRetryRead={() => setConfigReadRetry(value => value + 1)}
          disabled={isRunning}
          onClose={() => setActiveNodeId(null)}
          onSave={settings => saveSource(activeNode.id, settings, 'Đã lưu cấu hình rẽ nhánh điều kiện.')}
        />
      )}
      <NaturalLanguageConfigModal
        workspaceId={workspaceId}
        workflowId={workflowId}
        key={`node-config:${activeNodeId}`}
        node={['dataTransform', 'routerCondition'].includes(activeNode?.type || '') || !activeNode ? null : { ...activeNode, data: { ...activeNode.data, notificationItems: notificationItems.filter(item => item.actionNodeId === activeNode.id) } }}
        onClose={() => setActiveNodeId(null)}
        onTestStep={testStep}
        connectionVersion={connectionVersion}
        onConnectGoogle={connectGoogle}
        onSaveSource={saveSource}
        onReadSource={(nodeId, spreadsheetId, sheetName, signal) =>
          readSheetSource({ nodeId, spreadsheetId, sheetName, columnTypes,
            connectionId: nodes.find(node => node.id === nodeId)?.data.connectionId }, signal)
        }
        onSaveTelegram={saveTelegram}
        notificationConnected={edges.some(
          (edge) =>
            edge.target === activeNodeId &&
            ((edge.sourceHandle === 'conflict' &&
              nodes.some((node) => node.id === edge.source && node.type === 'diffEngine')) ||
             (edge.sourceHandle === 'out' &&
              nodes.some((node) => node.id === edge.source && node.type === 'routerCondition'))),
        )}
        availableColumns={diffAvailableColumns}
        previewRow={previewRows[0]}
        previewConflict={previewConflict}
        onRetryNotification={retryNotification}
        upstreamSheets={diffUpstreamSheets.map(s => s.data.spreadsheetTitle || s.data.label || 'Sheet')}
        comparisonSources={comparisonSources}
        sourceSpreadsheetId={diffUpstreamSheets[0]?.data.spreadsheetId}
        sourceSheetName={diffUpstreamSheets[0]?.data.sheetName}
        sourceConnectionId={diffUpstreamSheets[0]?.data.connectionId}
        sheetWriteInput={sheetWriteInput && {
          id: sheetWriteInput.id,
          type: sheetWriteInput.type,
          label: sheetWriteInput.data.label || (
            sheetWriteInput.type === 'routerCondition' ? 'Rẽ nhánh điều kiện' :
            sheetWriteInput.type === 'webhookTrigger' ? 'Webhook' : 'So khớp'
          ),
          sampleFields: sheetWriteInput.data.webhookSampleFields || [],
        }}
        defaultKeyColumn={nodes.find(node => node.type === 'diffEngine')?.data.uniqueKey || 'id'}
        onPreviewSheetWrite={async (request, signal) => {
          if (sheetWriteInput?.type === 'webhookTrigger' || request.writeMode === 'WEBHOOK_APPEND') {
            if (!workspaceId) throw new Error('Cần chọn workspace để xem trước Webhook.');
            return tenant ? tenant.webhook.previewAppend(request, signal) : webhookService.previewAppend(workspaceId, workflowId, request, signal);
          }
          if (tenant) return tenant.sync.previewSheetWrite(request, signal);
          throw new Error('Chưa hỗ trợ xem trước cho luồng này.');
        }}
        onApplySheetWrite={tenant ? previewToken => runWorkflow(true, previewToken) : undefined}
        onReadComparisonSource={(id, types, signal) => {
          const source = diffUpstreamSheets.find(item => item.id === id);
          if (!source) return Promise.reject(new Error('Bảng tính chưa được nối vào khối đồng bộ.'));
          return readSheetSource({ ...sourceDescriptor(source), columnTypes: types }, signal);
        }}
        disabled={isRunning}
        connected={connected}
        onUpdateData={(id, data) =>
          setNodes((items) =>
            items.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...data } } : n)),
          )
        }
      />
        </aside>}
      </div>
      {toastMessage && (
        <div
          role="status"
          className="fixed bottom-16 right-4 max-w-xl px-4 py-3 rounded-xl bg-surface border border-line text-primary text-sm z-50"
        >
          {toastMessage}
        </div>
      )}
      <ConflictModal
        key={conflicts[0]?.id || 'empty'}
        isOpen={isConflictModalOpen}
        onClose={() => setIsConflictModalOpen(false)}
        conflict={conflicts[0] || null}
        remainingCount={conflicts.length}
        sources={sheetNodes.map((node) => node.data)}
        onResolve={resolveConflict}
        onSendTelegramTest={sendTelegram}
      />
      <DataTableModal
        isOpen={isTableModalOpen}
        onClose={() => setIsTableModalOpen(false)}
        key={tableSource ? JSON.stringify(sourceDescriptor(tableSource)) : 'empty-table'}
        data={tableState.data}
        isLoading={tableState.status === 'loading'}
        readError={tableState.error}
        selectedSourceId={tableSource?.id || ''}
        sources={sheetNodes.map((node, index) => ({
          id: node.id,
          number: index + 1,
          spreadsheetId: node.data.spreadsheetId || '',
          spreadsheetTitle: node.data.spreadsheetTitle,
          sheetName: node.data.sheetName || '',
        }))}
        onSelectSource={openTable}
        onRefresh={() => {
          if (tableSource) void fetchData(tableSource).catch((error) => showToast(message(error)));
        }}
        onUpdateCell={updateCell}
      />
      {isConnectionsModalOpen && workspaceId && (
        <WorkspaceConnectionsModal
          workspaceId={workspaceId}
          userRole={workspaceRole}
          onClose={() => setIsConnectionsModalOpen(false)}
          onConnectionsChanged={() => {
            setConnectionVersion((v) => v + 1);
          }}
        />
      )}
    </div>
  );
}
