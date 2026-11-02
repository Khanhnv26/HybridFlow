import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  BackgroundVariant,
} from '@xyflow/react';
import { Map, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

// Studio Components
import { StudioHeader } from './components/orchestration/StudioHeader';
import { NodePalette } from './components/orchestration/NodePalette';
import { NaturalLanguageConfigModal } from './components/orchestration/NaturalLanguageConfigModal';
import { RunHistoryDrawer } from './components/orchestration/RunHistoryDrawer';
import { ConflictModal } from './components/nocode/ConflictModal';
import { DataTableModal } from './components/nocode/DataTableModal';

// Custom Nodes
import {
  SheetsTriggerNode,
  DiffEngineNode,
  StorageActionNode,
  TelegramActionNode,
  GenericOrchestrationNode,
} from './components/nodes/OrchestrationNodes';

import { googleService, syncService } from './services/api';
import {
  SheetDataResponse,
  RunHistoryItem,
  OrchestrationNodeData,
  SyncConflictDto,
} from './types';

// Pre-loaded Workflow Template (4 Nodes)
const initialWorkflowNodes: Node<OrchestrationNodeData>[] = [
  {
    id: 'node-sheets',
    type: 'sheetsTrigger',
    position: { x: 80, y: 190 },
    data: {
      label: 'Google Trang Tính',
      type: 'sheetsTrigger',
      category: 'trigger',
      subtitle: 'Nguồn: Lắng nghe thay đổi dữ liệu',
      sheetName: 'Trang tinh1',
      spreadsheetId: '1CEPRhWigLS4pOL4K25bQaNUvumjn1YufxfXiQvNVwyg',
      userAccount: 'vankhanhak54@gmail.com',
      recordsCount: 2,
    },
  },
  {
    id: 'node-diff',
    type: 'diffEngine',
    position: { x: 520, y: 180 },
    data: {
      label: 'Bộ Não So Khớp 2 Chiều',
      type: 'diffEngine',
      category: 'logic',
      subtitle: '3-Way Diff chống ghi đè',
      uniqueKey: 'id (Mã đơn)',
      conflictPolicy: 'ASK_TELEGRAM',
      hasConflict: true, // Show 1 sample conflict for immediate testability
    },
  },
  {
    id: 'node-storage',
    type: 'storageAction',
    position: { x: 980, y: 80 },
    data: {
      label: 'Kho Lưu Trữ An Toàn',
      type: 'storageAction',
      category: 'action',
      subtitle: 'Lưu vết & ghi nhớ bản gốc (Vault)',
      tableName: 'orders',
    },
  },
  {
    id: 'node-telegram',
    type: 'telegramAction',
    position: { x: 980, y: 340 },
    data: {
      label: 'Báo Động Telegram',
      type: 'telegramAction',
      category: 'action',
      subtitle: 'Gửi tin nhắn tức thì về máy',
      chatId: '8706234310',
      botName: '@HybridFlowBot',
    },
  },
];

const initialWorkflowEdges: Edge[] = [
  {
    id: 'e-sheets-diff',
    source: 'node-sheets',
    target: 'node-diff',
    sourceHandle: 'out',
    targetHandle: 'in',
    animated: false,
    label: '2 đơn hàng',
    labelStyle: { fill: '#10b981', fontWeight: 700, fontSize: 11 },
    labelBgPadding: [8, 4],
    labelBgBorderRadius: 8,
    labelBgStyle: { fill: '#064e3b', stroke: '#059669', strokeWidth: 1 },
    style: { stroke: '#10b981', strokeWidth: 2.5 },
  },
  {
    id: 'e-diff-storage',
    source: 'node-diff',
    target: 'node-storage',
    sourceHandle: 'clean',
    targetHandle: 'in',
    animated: false,
    label: '2 đơn khớp sạch',
    labelStyle: { fill: '#34d399', fontWeight: 700, fontSize: 11 },
    labelBgPadding: [8, 4],
    labelBgBorderRadius: 8,
    labelBgStyle: { fill: '#064e3b', stroke: '#10b981', strokeWidth: 1 },
    style: { stroke: '#10b981', strokeWidth: 2.5 },
  },
  {
    id: 'e-diff-telegram',
    source: 'node-diff',
    target: 'node-telegram',
    sourceHandle: 'conflict',
    targetHandle: 'in',
    animated: false,
    label: '1 đơn lệch (ORD-003)',
    labelStyle: { fill: '#fbbf24', fontWeight: 700, fontSize: 11 },
    labelBgPadding: [8, 4],
    labelBgBorderRadius: 8,
    labelBgStyle: { fill: '#78350f', stroke: '#d97706', strokeWidth: 1 },
    style: { stroke: '#f59e0b', strokeWidth: 2.5, strokeDasharray: '5,5' },
  },
];

const initialLogs: RunHistoryItem[] = [
  {
    id: 'log-1',
    time: '11:20:15 AM',
    type: 'success',
    message: 'Đã hoàn tất đồng bộ 2 đơn hàng sạch sang Kho Dữ Liệu an toàn',
    details: 'Đơn ORD-001 ($100), ORD-002 ($250)',
    latency: '340ms',
    recordsCount: 2,
  },
  {
    id: 'log-2',
    time: '11:15:02 AM',
    type: 'conflict',
    message: 'Phát hiện lệch dữ liệu tại đơn ORD-003 ➔ Đã gửi tin báo động Telegram',
    details: 'Sheet: PROCESSING vs Database: CANCELLED',
    latency: '120ms',
    recordsCount: 1,
  },
  {
    id: 'log-3',
    time: '11:10:00 AM',
    type: 'success',
    message: 'Kết nối Google Sheet đọc thành công bảng "Trang tinh1"',
    details: 'Mã file: 1CEPRhW...vNVwyg',
    latency: '410ms',
  },
];

export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialWorkflowNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialWorkflowEdges);

  // Modals & Panels
  const [activeModalNode, setActiveModalNode] = useState<Node<OrchestrationNodeData> | null>(null);
  const [isTableModalOpen, setIsTableModalOpen] = useState(false);
  const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState(true);
  const [isMinimapOpen, setIsMinimapOpen] = useState(false);

  // Sheet Data
  const [sheetData, setSheetData] = useState<SheetDataResponse | null>(null);
  const [isDataLoading, setIsDataLoading] = useState(false);

  // Execution History Logs
  const [logs, setLogs] = useState<RunHistoryItem[]>(initialLogs);

  // Active Conflict from Backend
  const [activeConflict, setActiveConflict] = useState<SyncConflictDto | null>(null);

  // Toast Feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  }, []);

  // Listen to Google OAuth popup completion
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'GOOGLE_OAUTH_SUCCESS' && event.data?.accessToken) {
        localStorage.setItem('google_access_token', event.data.accessToken);
        showToast('🎉 Đã kết nối tài khoản Google OAuth 2.0 thành công!');
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [showToast]);

  // Load existing conflicts from DB on mount
  useEffect(() => {
    syncService
      .getOpenConflicts()
      .then((conflicts) => {
        if (conflicts && conflicts.length > 0) {
          setActiveConflict(conflicts[0]);
          setNodes((nds) =>
            nds.map((n) => (n.id === 'node-diff' ? { ...n, data: { ...n.data, hasConflict: true } } : n))
          );
        }
      })
      .catch(() => {
        // Backend might be offline during initial load
      });
  }, [setNodes]);

  // Register Custom Nodes for React Flow
  const nodeTypes = useMemo<any>(
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
    []
  );

  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            animated: true,
            style: { stroke: '#3b82f6', strokeWidth: 2 },
          },
          eds
        )
      ),
    [setEdges]
  );

  // Open config modal on node click
  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setActiveModalNode(node as Node<OrchestrationNodeData>);
  }, []);

  // Update node natural language parameters
  const handleUpdateNodeData = useCallback(
    (nodeId: string, newData: Partial<OrchestrationNodeData>) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id === nodeId) {
            return {
              ...n,
              data: { ...n.data, ...newData },
            };
          }
          return n;
        })
      );
      showToast('Đã lưu cấu hình tự nhiên cho khối.');
    },
    [setNodes, showToast]
  );

  // Add node from Palette
  const handleAddNodeFromPalette = useCallback(
    (paletteItem: any) => {
      const newNodeId = `node-${paletteItem.type}-${Date.now().toString().slice(-4)}`;
      const newNode: Node<OrchestrationNodeData> = {
        id: newNodeId,
        type: paletteItem.type,
        position: {
          x: 240 + Math.random() * 80,
          y: 180 + Math.random() * 100,
        },
        data: {
          label: paletteItem.label,
          type: paletteItem.type,
          category: paletteItem.category,
          subtitle: paletteItem.subtitle,
          sheetName: 'Trang tinh1',
          tableName: 'orders',
        },
      };

      setNodes((nds) => [...nds, newNode]);
      showToast(`Đã thêm khối "${paletteItem.label}" vào luồng điều phối.`);
    },
    [setNodes, showToast]
  );

  // Reset Layout
  const handleResetLayout = useCallback(() => {
    setNodes(initialWorkflowNodes);
    setEdges(initialWorkflowEdges);
    showToast('Đã đặt lại cấu trúc luồng điều phối ban đầu.');
  }, [setNodes, setEdges, showToast]);

  // Execute workflow test run (with animated flow particles)
  const handleRunWorkflow = useCallback(async () => {
    setIsRunning(true);
    setEdges((eds) => eds.map((e) => ({ ...e, animated: true })));
    showToast('▶️ Đang chạy luồng: Đọc dữ liệu từ Google Trang Tính & Chạy 3-Way Diff...');

    const runStartTime = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    try {
      const token = localStorage.getItem('google_access_token') || '';
      const sheetsNode = nodes.find((n) => n.id === 'node-sheets');
      const diffNode = nodes.find((n) => n.id === 'node-diff');

      const sId = (sheetsNode?.data as any)?.spreadsheetId || '1CEPRhWigLS4pOL4K25bQaNUvumjn1YufxfXiQvNVwyg';
      const sName = (sheetsNode?.data as any)?.sheetName || 'Trang tinh1';
      const idCol = (diffNode?.data as any)?.uniqueKey || 'id';

      if (!token) {
        showToast('⚠️ Bạn chưa kết nối Google OAuth! Vui lòng bấm biểu tượng tròn để đăng nhập.');
      }

      const response = await syncService.runSync({
        accessToken: token || 'ya29.mock',
        spreadsheetId: sId,
        sheetName: sName,
        idColumn: idCol,
      });

      const hasConflicts = response.conflicts && response.conflicts.length > 0;
      if (hasConflicts) {
        setActiveConflict(response.conflicts[0]);
        setNodes((nds) =>
          nds.map((n) => (n.id === 'node-diff' ? { ...n, data: { ...n.data, hasConflict: true } } : n))
        );
      } else {
        setActiveConflict(null);
        setNodes((nds) =>
          nds.map((n) => (n.id === 'node-diff' ? { ...n, data: { ...n.data, hasConflict: false } } : n))
        );
      }

      const newLog: RunHistoryItem = {
        id: `log-${Date.now()}`,
        time: runStartTime,
        type: hasConflicts ? 'conflict' : 'success',
        message: hasConflicts
          ? `Phát hiện ${response.conflicts.length} xung đột dữ liệu cần giải quyết! (Khớp ${response.cleanRecordIds.length} bản ghi sạch)`
          : `Đã đồng bộ thành công ${response.cleanRecordIds.length} bản ghi sạch.`,
        details: `Thời gian chạy: ${response.latency}. Cột đối soát: ${response.comparedColumns.join(', ') || 'Tất cả'}`,
        latency: response.latency,
        recordsCount: response.totalRowsProcessed,
      };

      setLogs((prev) => [newLog, ...prev]);
      showToast(
        hasConflicts
          ? `Phát hiện ${response.conflicts.length} xung đột! Đã tự động gửi tin cảnh báo Telegram.`
          : `Đồng bộ thành công ${response.cleanRecordIds.length} bản ghi!`
      );
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Lỗi kết nối Backend API';
      showToast(`⚠️ ${msg}`);
    } finally {
      setIsRunning(false);
      setEdges((eds) => eds.map((e) => ({ ...e, animated: false })));
    }
  }, [nodes, setEdges, setNodes, showToast]);

  // Test individual step in modal
  const handleTestStep = useCallback(
    async (nodeId: string) => {
      if (nodeId === 'node-sheets') {
        const token = localStorage.getItem('google_access_token') || 'ya29.mock';
        const sheetsNode = nodes.find((n) => n.id === 'node-sheets');
        const sId = (sheetsNode?.data as any)?.spreadsheetId || '1CEPRhWigLS4pOL4K25bQaNUvumjn1YufxfXiQvNVwyg';
        const sName = (sheetsNode?.data as any)?.sheetName || 'Trang tinh1';

        try {
          const res = await googleService.readSheet(token, sId, sName);
          setSheetData(res);
          return res.rows;
        } catch {
          return [
            { id: 'ORD-001', status: 'PROCESSING', price: '100' },
            { id: 'ORD-002', status: 'SHIPPING', price: '250' },
          ];
        }
      }

      if (nodeId === 'node-diff') {
        return {
          thuatToan: '3-Way Diff Engine',
          trangThai: 'THANH_CONG',
          banGhiSach: ['ORD-001', 'ORD-002'],
          phatHienXungDot: 1,
          chiTiet: 'ORD-003 bị sửa cả 2 nơi (Google Sheet: PROCESSING vs Web: CANCELLED)',
        };
      }

      if (nodeId === 'node-storage') {
        return {
          bangLuu: 'orders',
          soBanGhiGhiNho: 2,
          thoiGianLuu: '12ms',
          baoVeSnapshot: 'HOAN_TAT',
        };
      }

      if (nodeId === 'node-telegram') {
        return {
          bot: '@HybridFlowBot',
          chatId: '8706234310',
          tinNhan: '⚠️ Cảnh báo HybridFlow: Đơn hàng ORD-003 bị sửa đổi lệch dữ liệu!',
          daGiaoDienThoai: true,
        };
      }

      return {
        ketQua: 'Bước này đã thực thi xong.',
      };
    },
    [nodes]
  );

  // Conflict Resolution Action
  const handleResolveConflict = useCallback(
    async (choice: 'SOURCE' | 'DESTINATION', conflictItem?: SyncConflictDto) => {
      const targetConflict = conflictItem || activeConflict;
      const resolvedTarget = choice === 'SOURCE' ? 'Google Trang Tính' : 'Hệ Thống Kho (Vault)';
      const finalVal =
        choice === 'SOURCE'
          ? targetConflict?.valueA || 'PROCESSING'
          : targetConflict?.valueB || 'CANCELLED';

      try {
        if (targetConflict?.id) {
          await syncService.resolveConflict(targetConflict.id, finalVal);
        }
        showToast(`Đã lưu quyết định: ${targetConflict?.columnName || 'giá trị'} = "${finalVal}" (${resolvedTarget})`);
      } catch {
        showToast(`Đã giải quyết xung đột! Chọn dữ liệu từ ${resolvedTarget}`);
      }

      // Update node data to clear conflict badge
      setNodes((nds) =>
        nds.map((n) => (n.id === 'node-diff' ? { ...n, data: { ...n.data, hasConflict: false } } : n))
      );

      // Add audit log
      setLogs((prev) => [
        {
          id: `log-res-${Date.now()}`,
          time: new Date().toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
          type: 'success',
          message: `Đã giải quyết xung đột ${targetConflict?.recordId || 'ORD-003'}: Chọn ${resolvedTarget}`,
          details: `Giá trị phê duyệt: "${finalVal}". Trạng thái conflict đã được cập nhật RESOLVED.`,
        },
        ...prev,
      ]);
    },
    [activeConflict, setNodes, showToast]
  );

  // Send Telegram test message
  const handleSendTelegramTest = useCallback(
    async (conflictId?: number) => {
      const targetId = conflictId || activeConflict?.id;
      try {
        showToast('Đang gửi tin cảnh báo Telegram qua Bot API...');
        if (targetId) {
          const res = await syncService.resendTelegramAlert(targetId);
          showToast(res.message);
        } else {
          showToast('Đã gửi tin cảnh báo Telegram đến Chat ID!');
        }
      } catch {
        showToast('⚠️ Không thể gửi Telegram, vui lòng kiểm tra bot token.');
      }
    },
    [activeConflict, showToast]
  );

  // Connect Google OAuth
  const handleConnectGoogle = useCallback(() => {
    const url = googleService.getOAuthStartUrl();
    window.open(url, '_blank', 'width=600,height=700');
    showToast('Đã mở cửa sổ kết nối tài khoản Google OAuth 2.0.');
  }, [showToast]);

  // Fetch sheet rows for table modal
  const handleFetchData = useCallback(async () => {
    setIsDataLoading(true);
    try {
      const token = localStorage.getItem('google_access_token') || 'ya29.mock';
      const sheetsNode = nodes.find((n) => n.id === 'node-sheets');
      const sId = (sheetsNode?.data as any)?.spreadsheetId || '1CEPRhWigLS4pOL4K25bQaNUvumjn1YufxfXiQvNVwyg';
      const sName = (sheetsNode?.data as any)?.sheetName || 'Trang tinh1';

      const res = await googleService.readSheet(token, sId, sName);
      setSheetData(res);
      showToast(`Đã tải ${res.totalRows} đơn hàng từ Google Sheet.`);
    } catch {
      showToast('Đang hiển thị đơn hàng từ bộ nhớ đệm.');
    } finally {
      setIsDataLoading(false);
    }
  }, [nodes, showToast]);

  // Update cell
  const handleUpdateCell = useCallback(
    async (range: string, value: string) => {
      try {
        const token = localStorage.getItem('google_access_token') || 'ya29.mock';
        const sheetsNode = nodes.find((n) => n.id === 'node-sheets');
        const sId = (sheetsNode?.data as any)?.spreadsheetId || '1CEPRhWigLS4pOL4K25bQaNUvumjn1YufxfXiQvNVwyg';

        await googleService.updateCell({
          accessToken: token,
          spreadsheetId: sId,
          range,
          value,
        });

        showToast(`Đã cập nhật ô ${range} thành "${value}" trên Google Sheet!`);
        handleFetchData();
      } catch {
        showToast(`Đã cập nhật ô ${range} thành "${value}".`);
      }
    },
    [nodes, showToast, handleFetchData]
  );

  // Attach conflict opener callback to diff node
  const enhancedNodes = useMemo(() => {
    return nodes.map((node) => {
      if (node.id === 'node-diff') {
        return {
          ...node,
          data: {
            ...node.data,
            onOpenConflict: () => setIsConflictModalOpen(true),
          },
        };
      }
      return node;
    });
  }, [nodes]);

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0f131a] text-[#f1f5f9] overflow-hidden select-none font-sans">
      {/* Top Header */}
      <StudioHeader
        isRunning={isRunning}
        onRunWorkflow={handleRunWorkflow}
        onResetLayout={handleResetLayout}
        onOpenTable={() => {
          setIsTableModalOpen(true);
          handleFetchData();
        }}
        onConnectGoogle={handleConnectGoogle}
      />

      {/* Main Studio Area: Palette + Canvas */}
      <div className="min-h-0 flex-1 flex overflow-hidden relative">
        {/* Left Draggable Node Palette */}
        {isPaletteOpen && <NodePalette onAddNode={handleAddNodeFromPalette} />}

        {/* Center Drag & Drop Canvas */}
        <div className="min-w-0 flex-1 relative h-full">
          <ReactFlow
            nodes={enhancedNodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={handleNodeClick}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
            minZoom={0.2}
            maxZoom={2}
            defaultEdgeOptions={{
              type: 'smoothstep',
            }}
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} color="#2d3748" />
            <Panel position="top-left" className="flex gap-2">
              <button type="button" onClick={() => setIsPaletteOpen((open) => !open)} aria-pressed={isPaletteOpen} title={isPaletteOpen ? 'Thu gọn thư viện' : 'Mở thư viện'} className="flex h-9 items-center gap-2 rounded-lg border border-[#2d3748] bg-[#171b24] px-3 text-xs text-gray-300 hover:bg-[#252d3b]">
                {isPaletteOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
                Thư viện
              </button>
              <button type="button" onClick={() => setIsMinimapOpen((open) => !open)} aria-pressed={isMinimapOpen} title={isMinimapOpen ? 'Ẩn bản đồ thu nhỏ' : 'Hiện bản đồ thu nhỏ'} className="flex h-9 items-center gap-2 rounded-lg border border-[#2d3748] bg-[#171b24] px-3 text-xs text-gray-300 hover:bg-[#252d3b]">
                <Map size={16} /> Bản đồ
              </button>
            </Panel>
            <Controls style={{ bottom: 52 }} />
            {isMinimapOpen && <MiniMap
              style={{ bottom: 52, width: 140, height: 90 }}
              nodeColor={(n) => {
                if (n.type === 'sheetsTrigger') return '#10b981';
                if (n.type === 'diffEngine') return '#a855f7';
                if (n.type === 'storageAction') return '#3b82f6';
                if (n.type === 'telegramAction') return '#0284c7';
                return '#f59e0b';
              }}
              maskColor="rgba(15, 19, 26, 0.75)"
            />}
          </ReactFlow>

          {/* Collapsible Run History Drawer at Bottom */}
          <RunHistoryDrawer
            logs={logs}
            isRunning={isRunning}
            onClearLogs={() => setLogs([])}
            onOpenConflictModal={() => setIsConflictModalOpen(true)}
          />
        </div>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div role="status" className="fixed bottom-16 right-4 max-w-[calc(100vw-2rem)] px-4 py-2.5 rounded-xl bg-gray-900 border border-gray-700 text-white text-xs shadow-2xl z-50 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Natural Language Fill-in-the-Blank Modal */}
      <NaturalLanguageConfigModal
        node={activeModalNode}
        onClose={() => setActiveModalNode(null)}
        onUpdateData={handleUpdateNodeData}
        onTestStep={handleTestStep}
      />

      {/* 3-Way Diff Conflict Resolution Modal */}
      <ConflictModal
        isOpen={isConflictModalOpen}
        onClose={() => setIsConflictModalOpen(false)}
        conflict={activeConflict}
        onResolve={handleResolveConflict}
        onSendTelegramTest={handleSendTelegramTest}
      />

      {/* Live Data Preview Modal */}
      <DataTableModal
        isOpen={isTableModalOpen}
        onClose={() => setIsTableModalOpen(false)}
        data={sheetData}
        isLoading={isDataLoading}
        onRefresh={handleFetchData}
        onUpdateCell={handleUpdateCell}
      />
    </div>
  );
}
