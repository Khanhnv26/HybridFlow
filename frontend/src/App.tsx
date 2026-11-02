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
import { Map, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { StudioHeader } from './components/orchestration/StudioHeader';
import { NodePalette } from './components/orchestration/NodePalette';
import { NaturalLanguageConfigModal } from './components/orchestration/NaturalLanguageConfigModal';
import { RunHistoryDrawer } from './components/orchestration/RunHistoryDrawer';
import { ConflictModal } from './components/nocode/ConflictModal';
import { DataTableModal } from './components/nocode/DataTableModal';
import {
  SheetsTriggerNode,
  DiffEngineNode,
  StorageActionNode,
  TelegramActionNode,
  GenericOrchestrationNode,
} from './components/nodes/OrchestrationNodes';
import { googleService, syncService, workflowService, telegramService } from './services/api';
import { flowIdFor, workflowConfig } from './services/workflow';
import { historyLog } from './services/history';
import { useSheetReads } from './hooks/useSheetReads';
import type { RunHistoryItem, OrchestrationNodeData, SyncConflictDto } from './types';

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
      label: 'So Khớp 2 Chiều',
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
function message(error: unknown) {
  const err = error as { response?: { data?: { message?: string } }; message?: string };
  return err.response?.data?.message || err.message || 'Không thể kết nối máy chủ.';
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
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [isTableModalOpen, setIsTableModalOpen] = useState(false);
  const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const running = useRef(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState(true);
  const [isMinimapOpen, setIsMinimapOpen] = useState(false);
  const [tableNodeId, setTableNodeId] = useState('');
  const [logs, setLogs] = useState<RunHistoryItem[]>([]);
  const [conflicts, setConflicts] = useState<SyncConflictDto[]>([]);
  const refreshRevision = useRef(0);
  useEffect(() => {
    if (conflicts.length === 0) setIsConflictModalOpen(false);
  }, [conflicts.length]);
  const [flowId, setFlowId] = useState('');
  const [bootstrapRequired, setBootstrapRequired] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [connected, setConnected] = useState(() => !!localStorage.getItem('google_access_token'));
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
    );
    return data;
  });
  const sourceDescriptor = (node: Node<OrchestrationNodeData>) => ({
    nodeId: node.id,
    spreadsheetId: node.data.spreadsheetId || '',
    sheetName: node.data.sheetName || '',
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
    const revision = ++refreshRevision.current;
    setFlowId('');
    currentFlow.current = '';
    setConflicts([]);
    setLogs([]);
    setBootstrapRequired(false);
    if (configState.config)
      flowIdFor(configState.config)
        .then(async (id) => {
          if (!live) return;
          currentFlow.current = id;
          setFlowId(id);
          const [open, history] = await Promise.all([
            syncService.getOpenConflicts(id),
            syncService.getHistory(id),
          ]);
          if (live && revision === refreshRevision.current) {
            setConflicts(open);
            setLogs(history.map(historyLog));
          }
        })
        .catch((error) => {
          if (live) showToast(message(error));
        });
    return () => {
      live = false;
    };
  }, [configKey, showToast]);
  const refreshRunData = useCallback(async (id: string) => {
    const revision = ++refreshRevision.current;
    const [open, history] = await Promise.all([
      syncService.getOpenConflicts(id),
      syncService.getHistory(id),
    ]);
    if (currentFlow.current === id && revision === refreshRevision.current) {
      setConflicts(open);
      setLogs(history.map(historyLog));
    }
  }, []);
  const token = useCallback(() => {
    const value = localStorage.getItem('google_access_token');
    if (!value) throw new Error('Kết nối Google trước khi thao tác dữ liệu.');
    return value;
  }, []);
  const fetchData = useCallback(
    async (target: Node<OrchestrationNodeData>) =>
      readSheetSource({
        nodeId: target.id,
        spreadsheetId: target.data.spreadsheetId || '',
        sheetName: target.data.sheetName || '',
      }),
    [readSheetSource],
  );
  const refreshSources = useCallback(async () => {
    invalidateReads();
    await Promise.allSettled(sheetNodes.map((node) => fetchData(node)));
  }, [sheetNodes, fetchData, invalidateReads]);
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
    await workflowService.save(workflowId, { nodes, edges });
  }, [workflowId, nodes, edges]);
  const runWorkflow = useCallback(
    async (bootstrapConfirmed = false) => {
      if (running.current) return;
      running.current = true;
      setIsRunning(true);
      let id = '';
      try {
        const accessToken = token();
        if (!configState.config) throw new Error(configState.error);
        const config = configState.config;
        id = await flowIdFor(config);
        await saveWorkflow();
        const result = await syncService.runSync({
          ...config,
          flowId: id,
          accessToken,
          bootstrapConfirmed,
        });
        if (currentFlow.current !== id) return;
        setBootstrapRequired(result.bootstrapRequired);
        setConflicts(result.conflicts);
        if (result.bootstrapRequired) {
          setAutoActive(false);
          showToast('Chưa ghi dữ liệu. Xác nhận khởi tạo snapshot để bắt đầu đồng bộ.');
        } else
          showToast(
            `Đồng bộ ${result.cleanRecordIds.length} bản ghi, ${result.conflicts.length} xung đột. Telegram: gửi ${result.notificationsSent}, lỗi ${result.notificationsFailed}.`,
          );
        await refreshRunData(id);
        await refreshSources();
      } catch (error) {
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
    [configState, token, saveWorkflow, refreshRunData, refreshSources, showToast],
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
      if (!flowId) throw new Error(configState.error || 'Cấu hình luồng trước khi chạy thử.');
      if (node.type === 'storageAction') return syncService.getVault(flowId);
      if (node.type === 'diffEngine')
        return {
          conflicts: await syncService.getOpenConflicts(flowId),
          history: await syncService.getHistory(flowId),
        };
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
    [nodes, fetchData, flowId, configState.error, conflicts],
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
      const chatId = nodes.find((n) => n.type === 'telegramAction')?.data.chatId?.trim();
      if (!chatId) throw new Error('Điền Telegram Chat ID.');
      const result = await syncService.resendTelegramAlert(conflictId, chatId);
      if (!result.success) throw new Error(result.message);
      showToast(result.message);
    },
    [nodes, showToast],
  );
  const updateCell = useCallback(
    async (range: string, value: string) => {
      if (!tableSource?.data.spreadsheetId) throw new Error('Chưa chọn nguồn dữ liệu.');
      const result = await googleService.updateCell({
        accessToken: token(),
        spreadsheetId: tableSource.data.spreadsheetId,
        range,
        value,
      });
      if (!result.success) throw new Error(result.message);
      showToast('Đã cập nhật ô trên trang tính đang chọn. Chạy luồng để đồng bộ các nguồn.');
      await fetchData(tableSource).catch((error) =>
        showToast(`Đã ghi ô; tải lại bảng thất bại: ${message(error)}`),
      );
    },
    [tableSource, token, fetchData, showToast],
  );
  const onConnect = useCallback(
    (connection: Connection) => setEdges((items) => addEdge(connection, items)),
    [setEdges],
  );
  const enhancedNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          isRunning,
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
        },
      })),
    [nodes, sheetNodes, isRunning, connected, stateFor, openTable, conflicts.length],
  );
  const nodeTypes = useMemo(
    () => ({
      sheetsTrigger: SheetsTriggerNode,
      diffEngine: DiffEngineNode,
      storageAction: StorageActionNode,
      telegramAction: TelegramActionNode,
      scheduleTrigger: GenericOrchestrationNode,
      webhookTrigger: GenericOrchestrationNode,
      routerCondition: GenericOrchestrationNode,
      dataTransform: GenericOrchestrationNode,
      sheetWriteAction: GenericOrchestrationNode,
    }),
    [],
  );
  const enhancedEdges = useMemo(
    () =>
      edges.map((edge) => ({
        ...edge,
        animated: isRunning,
        label:
          edge.sourceHandle === 'conflict' && conflicts.length > 0
            ? `${conflicts.length} xung đột`
            : undefined,
      })),
    [edges, isRunning, conflicts.length],
  );
  const activeNode = nodes.find((n) => n.id === activeNodeId) || null;
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
    if (running.current)
      throw new Error('Chờ phiên đồng bộ hiện tại hoàn tất trước khi đổi nguồn.');
    running.current = true;
    setAutoActive(false);
    try {
      const updatedNodes = nodes.map((node) =>
        node.id === nodeId ? { ...node, data: { ...node.data, ...sourceData } } : node,
      );
      await workflowService.save(workflowId, { nodes: updatedNodes, edges });
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
        onResetLayout={() => {
          setNodes(initialNodes);
          setEdges(initialEdges);
          setAutoActive(false);
        }}
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
                  },
                },
              ]);
            }}
          />
        )}
        <div className="min-w-0 flex-1 relative h-full">
          <ReactFlow
            nodes={enhancedNodes}
            edges={enhancedEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_: React.MouseEvent, node: Node) => setActiveNodeId(node.id)}
            nodeTypes={nodeTypes}
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
            </Panel>
            <Controls style={{ bottom: 52 }} />
            {isMinimapOpen && <MiniMap style={{ bottom: 52, width: 140, height: 90 }} />}
          </ReactFlow>
          <RunHistoryDrawer
            logs={logs}
            activeConflictIds={conflicts.map((conflict) => conflict.id)}
            isRunning={isRunning}
            onClearLogs={() => setLogs([])}
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
      <NaturalLanguageConfigModal
        key={activeNodeId}
        node={activeNode}
        onClose={() => setActiveNodeId(null)}
        onTestStep={testStep}
        connectionVersion={connectionVersion}
        onConnectGoogle={connectGoogle}
        onSaveSource={saveSource}
        onReadSource={(nodeId, spreadsheetId, sheetName, signal) =>
          readSheetSource({ nodeId, spreadsheetId, sheetName }, signal)
        }
        onSaveTelegram={saveTelegram}
        notificationConnected={edges.some(
          (edge) =>
            edge.target === activeNodeId &&
            edge.sourceHandle === 'conflict' &&
            nodes.some((node) => node.id === edge.source && node.type === 'diffEngine'),
        )}
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
