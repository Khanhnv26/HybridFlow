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
import { googleService, syncService, workflowService, telegramService } from './services/api';
import { arrangeWorkflowNodes } from './services/workflowLayout';
import { connectedSheetSources, flowIdFor, workflowConfig } from './services/workflow';
import { historyLog } from './services/history';
import { useSheetReads } from './hooks/useSheetReads';
import { useWorkflowPolling } from './hooks/useWorkflowPolling';
import { useExecutionCompletion } from './hooks/useExecutionCompletion';
import { executionVisuals } from './services/executionVisuals';
import { ExecutionEdge } from './components/orchestration/ExecutionEdge';
import type { RunHistoryItem, OrchestrationNodeData, SyncConflictDto, ExecutionHistoryDto, NotificationOutboxItem } from './types';

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
const draftKey = 'hybridflow-workflow-v2';
function draft(): { nodes: Node<OrchestrationNodeData>[]; edges: Edge[] } {
  try {
    const value = JSON.parse(localStorage.getItem(draftKey) || 'null');
    if (Array.isArray(value?.nodes) && Array.isArray(value?.edges)) return value;
  } catch {
    /* A malformed local draft must not stop the editor from opening. */
  }
  return { nodes: initialNodes, edges: initialEdges };
}

export default function App() {
  const [startingDraft] = useState(draft);
  const [hadDraft] = useState(() => !!localStorage.getItem(draftKey));
  const [workflowId] = useState(() => {
    const existing = localStorage.getItem('hybridflow-workflow-id');
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem('hybridflow-workflow-id', id);
    return id;
  });
  const [nodes, setNodes, onNodesChange] = useNodesState(startingDraft.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(startingDraft.edges);
  const fitCanvas = useRef<(() => void) | null>(null);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
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
  const refreshRevision = useRef(0);
  const observedRunData = useRef<{ flowId: string; fingerprint: string } | null>(null);
  useEffect(() => {
    if (conflicts.length === 0) setIsConflictModalOpen(false);
  }, [conflicts.length]);
  const [flowId, setFlowId] = useState('');
  const [notificationItems, setNotificationItems] = useState<NotificationOutboxItem[]>([]);
  const [bootstrapRequired, setBootstrapRequired] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [connected, setConnected] = useState(() => !!localStorage.getItem('google_access_token')?.startsWith('gconn-'));
  const [connectionVersion, setConnectionVersion] = useState(0);
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
    nodeId: node.id,
    spreadsheetId: node.data.spreadsheetId || '',
    sheetName: node.data.sheetName || '',
    columnTypes,
  });
  const tableState = tableSource
    ? stateFor(sourceDescriptor(tableSource))
    : { status: 'idle' as const, data: null, error: undefined };
  const configuredFiles = JSON.stringify([
    ...new Set(sheetNodes.map((node) => node.data.spreadsheetId?.trim()).filter(Boolean)),
  ]);
  useEffect(() => {
    if (!connected) return;
    const controller = new AbortController();
    const files = JSON.parse(configuredFiles) as string[];
    for (const spreadsheetId of files) {
      const accessToken = localStorage.getItem('google_access_token');
      if (!accessToken) break;
      void googleService
        .getMetadata(accessToken, spreadsheetId, controller.signal)
        .then((metadata) => {
          if (!controller.signal.aborted)
            setNodes((items) =>
              items.map((node) =>
                node.type === 'sheetsTrigger' &&
                node.data.spreadsheetId?.trim() === spreadsheetId &&
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
  }, [configuredFiles, connected, connectionVersion, setNodes]);

  useEffect(() => {
    localStorage.setItem(draftKey, JSON.stringify({ nodes, edges }));
  }, [nodes, edges]);
  useEffect(() => {
    if (hadDraft) return;
    let live = true;
    workflowService
      .load(workflowId)
      .then((saved) => {
        if (live && Array.isArray(saved.nodes) && Array.isArray(saved.edges)) {
          setNodes(saved.nodes);
          setEdges(saved.edges);
        }
      })
      .catch((error) => {
        if (live) showToast(`Chưa tải được cấu hình đã lưu: ${message(error)}`);
      });
    return () => {
      live = false;
    };
  }, [hadDraft, workflowId, setNodes, setEdges, showToast]);
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
      syncService.getOpenConflicts(id, signal),
      syncService.getHistory(id, signal),
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
  }, []);
  const notificationKey = flowId && latestExecution?.id ? flowId + '|' + latestExecution.id : '';
  useEffect(() => { setNotificationItems([]); }, [notificationKey]);
  const refreshNotifications = async (_key: string, signal: AbortSignal) => {
    if (!latestExecution?.id) return;
    const items = await syncService.getNotifications(flowId, latestExecution.id, signal);
    if (!signal.aborted && currentFlow.current === flowId) setNotificationItems(items);
  };
  useWorkflowPolling(notificationKey, refreshNotifications, error => showToast(message(error)), 2000);
  const retryNotification = async (id: string) => {
    await syncService.retryNotification(id);
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
      await syncService.clearHistory(id);
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
  }, [conflicts, showToast]);
  const token = useCallback(() => {
    const value = localStorage.getItem('google_access_token');
    if (!value) throw new Error('Kết nối Google trước khi thao tác dữ liệu.');
    return value;
  }, []);
  const fetchData = useCallback(
    async (target: Node<OrchestrationNodeData>, signal?: AbortSignal) =>
      readSheetSource({
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
    await workflowService.save(workflowId, {
      nodes,
      edges,
      flowId: flowId || undefined,
      accessToken: localStorage.getItem('google_access_token') || undefined,
    });
  }, [workflowId, nodes, edges, flowId]);
  const runWorkflow = useCallback(
    async (bootstrapConfirmed = false) => {
      if (running.current || backendRunning.current) return;
      setManualBaseline(latestExecution?.id);
      running.current = true;
      setIsRunning(true);
      let id = '';
      try {
        token();
        if (!configState.config) throw new Error(configState.error);
        const config = configState.config;
        id = await flowIdFor(config);
        await saveWorkflow();
        const result = await workflowService.run(workflowId, bootstrapConfirmed);
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
          await refreshSources();
        }
      } finally {
        running.current = false;
        setIsRunning(false);
      }
    },
    [configState, token, saveWorkflow, refreshRunData, refreshSources, showToast, workflowId, latestExecution?.id],
  );
  useEffect(() => {
    if (!autoActive) return;
    const timer = setInterval(() => {
      void runWorkflow();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [autoActive, intervalMs, runWorkflow]);
  const testStep = useCallback(
    async (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) throw new Error('Không tìm thấy khối.');
      if (node.type === 'sheetsTrigger') return (await fetchData(node)).rows;
      if (node.type === 'diffEngine')
        return Promise.all(connectedSheetSources(nodes, edges, node.id).map(source =>
          googleService.readSheet(token(), source.spreadsheetId, source.sheetName, undefined, node.data.columnTypes)));
      if (!flowId) throw new Error(configState.error || 'Cấu hình luồng trước khi chạy thử.');
      if (node.type === 'storageAction') return syncService.getVault(flowId);
      if (node.type === 'telegramAction') {
        if (!conflicts[0]) throw new Error('Chưa có xung đột thật để gửi lại thông báo.');
        const chatId = node.data.chatId?.trim();
        if (!chatId) throw new Error('Điền Telegram Chat ID.');
        const result = await syncService.resendTelegramAlert(conflicts[0].id, chatId);
        if (!result.success) throw new Error(result.message);
        return result;
      }
      throw new Error('Khối này chưa được hỗ trợ thực thi.');
    },
    [nodes, edges, fetchData, flowId, configState.error, conflicts, token],
  );
  const resolveConflict = useCallback(
    async (value: string, conflict: SyncConflictDto) => {
      if (value === undefined) throw new Error('Xung đột thiếu giá trị. Tải lại danh sách.');
      await syncService.resolveConflict(conflict.id, value, token());
      refreshRevision.current++;
      setConflicts((items) => items.filter((item) => item.id !== conflict.id));
      await refreshSources();
      showToast('Đã đồng bộ giá trị đã chọn xuống tất cả các bảng và cập nhật snapshot.');
      await refreshRunData(conflict.flowId || flowId).catch((error) =>
        showToast(`Đã lưu quyết định; tải lại danh sách thất bại: ${message(error)}`),
      );
    },
    [token, flowId, refreshRunData, refreshSources, showToast],
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
        return syncService.resendTelegramAlert(conflictId, destination);
      }));
      const failed = results.filter(result => !result.success);
      if (failed.length) throw new Error(failed.map(result => result.message).join('; '));
      showToast('Đã gửi lại cảnh báo đến ' + targets.length + ' đích Telegram.');
      return;

    },
    [nodes, edges, showToast],
  );
  const updateCell = useCallback(
    async (range: string, value: string) => {
      if (!tableSource?.data.spreadsheetId) throw new Error('Chưa chọn nguồn dữ liệu.');
      const result = await googleService.updateCell({
        accessToken: token(),
        spreadsheetId: tableSource.data.spreadsheetId,
        range,
        value,
        valueType: (() => {
          const letters = range.match(/!([A-Z]+)[0-9]+$/)?.[1];
          const index = letters ? [...letters].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0) - 1 : -1;
          const column = tableState.data?.headers[index];
          return column ? nodes.find(node => node.type === 'diffEngine')?.data.columnTypes?.[column] || 'TEXT' : 'TEXT';
        })(),
      });
      if (!result.success) throw new Error(result.message);
      showToast('Đã cập nhật ô trên trang tính đang chọn. Chạy luồng để đồng bộ các nguồn.');
      await fetchData(tableSource).catch((error) =>
        showToast(`Đã ghi ô; tải lại bảng thất bại: ${message(error)}`),
      );
    },
    [tableSource, tableState.data, nodes, token, fetchData, showToast],
  );
  const onConnect = useCallback(
    (connection: Connection) => setEdges((items) => addEdge(connection, items)),
    [setEdges],
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
  const transformInputs = activeNode?.type === 'dataTransform'
    ? edges.filter(edge => edge.target === activeNode.id && edge.sourceHandle === 'out' && edge.targetHandle === 'in')
    : [];
  const transformSources = transformInputs
    .map(edge => nodes.find(node => node.type === 'sheetsTrigger' && node.id === edge.source))
    .filter((node): node is Node<OrchestrationNodeData> => !!node);
  const diffUpstreamSheets = useMemo(() => {
    if (!activeNode || !['diffEngine', 'routerCondition', 'telegramAction'].includes(activeNode.type || '')) return [];
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
    if (!activeNode || !['diffEngine', 'routerCondition', 'telegramAction'].includes(activeNode.type || '')) return [];
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
      await workflowService.save(workflowId, {
        nodes: updatedNodes,
        edges,
        flowId: updatedFlowId,
        accessToken: localStorage.getItem('google_access_token') || undefined,
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
    const recipient = await telegramService.checkRecipient(
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
    <div className="h-screen w-screen flex flex-col bg-[#0f131a] text-[#f1f5f9] overflow-hidden font-sans">
      <StudioHeader
        isRunning={isRunning}
        autoActive={autoActive}
        onAutoChange={setAutoActive}
        intervalMs={intervalMs}
        onIntervalChange={setIntervalMs}
        connected={connected}
        onRunWorkflow={() => void runWorkflow()}
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
      />
      {bootstrapRequired && (
        <div
          role="alert"
          className="px-5 py-3 bg-amber-950 text-amber-200 text-sm flex items-center gap-4"
        >
          Luồng mới chưa có snapshot. Khởi tạo sẽ sao chép dữ liệu Sheet hiện tại vào vùng lưu trữ
          đã chọn.
          <button
            disabled={isRunning}
            onClick={() => void runWorkflow(true)}
            className="px-3 py-2 bg-amber-600 rounded text-white disabled:opacity-50"
          >
            Xác nhận khởi tạo
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1 flex overflow-hidden relative">
        {isPaletteOpen && (
          <NodePalette
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
        )}
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
            <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} color="#2d3748" />
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
                className="flex items-center gap-2 rounded border border-gray-700 bg-gray-900 px-3 py-2 text-xs"
              >
                {isPaletteOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />} Thư
                viện
              </button>
              <button
                onClick={() => setIsMinimapOpen(!isMinimapOpen)}
                className="flex items-center gap-2 rounded border border-gray-700 bg-gray-900 px-3 py-2 text-xs"
              >
                <Map size={16} /> Bản đồ
              </button>
              <button aria-label="Sắp xếp canvas" disabled={isRunning} onClick={arrangeCanvas} className="flex items-center gap-2 rounded border border-gray-700 bg-gray-900 px-3 py-2 text-xs disabled:opacity-40"><LayoutGrid size={16} /> Sắp xếp</button>
            </Panel>
            <Controls style={{ bottom: 52 }} />
            {isMinimapOpen && <MiniMap style={{ bottom: 52, width: 140, height: 90 }} />}
          </ReactFlow>
          <RunHistoryDrawer
            flowId={flowId}
            loadNotifications={syncService.getNotificationPage}
            retryNotification={syncService.retryNotification}
            logs={logs}
            activeConflictIds={conflicts.map((conflict) => conflict.id)}
            isRunning={isRunning}
            onClearLogs={() => void clearLogs()}
            onOpenConflictModal={() => setIsConflictModalOpen(true)}
          />
        </div>
      </div>
      {toastMessage && (
        <div
          role="status"
          className="fixed bottom-16 right-4 max-w-xl px-4 py-3 rounded-xl bg-gray-900 border border-gray-700 text-white text-sm z-50"
        >
          {toastMessage}
        </div>
      )}
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
            .filter((node): node is Node<OrchestrationNodeData> => !!node && node.type === 'telegramAction')
            .map(node => node.data.telegramRecipientName || node.data.label || 'Telegram')}
          reading={configReading}
          readErrors={configReadErrors}
          onRetryRead={() => setConfigReadRetry(value => value + 1)}
          disabled={isRunning}
          onClose={() => setActiveNodeId(null)}
          onSave={settings => saveSource(activeNode.id, settings, 'Đã lưu cấu hình rẽ nhánh điều kiện.')}
        />
      )}
      <NaturalLanguageConfigModal
        workflowId={workflowId}
        key={`node-config:${activeNodeId}`}
        node={['dataTransform', 'routerCondition'].includes(activeNode?.type || '') || !activeNode ? null : { ...activeNode, data: { ...activeNode.data, notificationItems: notificationItems.filter(item => item.actionNodeId === activeNode.id) } }}
        onClose={() => setActiveNodeId(null)}
        onTestStep={testStep}
        connectionVersion={connectionVersion}
        onConnectGoogle={connectGoogle}
        onSaveSource={saveSource}
        onReadSource={(nodeId, spreadsheetId, sheetName, signal) =>
          readSheetSource({ nodeId, spreadsheetId, sheetName, columnTypes }, signal)
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
        onReadComparisonSource={(id, types, signal) => {
          const source = diffUpstreamSheets.find(item => item.id === id);
          if (!source) return Promise.reject(new Error('Bảng tính chưa được nối vào khối đồng bộ.'));
          return googleService.readSheet(token(), source.data.spreadsheetId || '', source.data.sheetName, signal, types);
        }}
        disabled={isRunning}
        connected={connected}
        onUpdateData={(id, data) =>
          setNodes((items) =>
            items.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...data } } : n)),
          )
        }
      />
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
    </div>
  );
}
