import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlow, Background, BackgroundVariant, Controls, MiniMap, Panel, useNodesState, useEdgesState, addEdge, type Node } from '@xyflow/react';
import { PanelLeftClose, PanelLeftOpen, Map, X } from 'lucide-react';
import { ThemeToggle } from './components/ThemeToggle';
import { StudioHeader } from './components/orchestration/StudioHeader';
import { NodePalette } from './components/orchestration/NodePalette';
import { SheetsTriggerNode, DiffEngineNode, StorageActionNode, TelegramActionNode, ScheduleTriggerNode, DataTransformNode, RouterConditionNode, GenericOrchestrationNode } from './components/nodes/OrchestrationNodes';
import { ExecutionEdge } from './components/orchestration/ExecutionEdge';
import { RunHistoryDrawer } from './components/orchestration/RunHistoryDrawer';
import type { OrchestrationNodeData } from './types';
import { connectedSheetSources } from './services/workflow';
import './index.css';

// Isolated visual preview: no authentication, API calls, writes, or notifications.
const nodeTypes = { sheetsTrigger: SheetsTriggerNode, diffEngine: DiffEngineNode, storageAction: StorageActionNode, telegramAction: TelegramActionNode, scheduleTrigger: ScheduleTriggerNode, dataTransform: DataTransformNode, routerCondition: RouterConditionNode, webhookTrigger: GenericOrchestrationNode, sheetWriteAction: GenericOrchestrationNode };
const edgeTypes = { execution: ExecutionEdge };
const previewNodes: Node<OrchestrationNodeData>[] = [
  { id: 'sheet', type: 'sheetsTrigger', position: { x: 40, y: 80 }, data: { subtitle: 'Dữ liệu minh họa', label: 'Đơn hàng', type: 'sheetsTrigger', category: 'trigger', spreadsheetTitle: 'Đơn hàng · Kinh doanh', spreadsheetId: 'demo-orders', sheetName: 'Tháng 11', readStatus: 'success', recordsCount: 1420, sourceNumber: 1 } },
  { id: 'diff', type: 'diffEngine', position: { x: 430, y: 80 }, data: { subtitle: 'Dữ liệu minh họa', label: 'Điều phối & Đồng bộ', type: 'diffEngine', category: 'logic', uniqueKey: 'order_code', conflictPolicy: 'ASK_TELEGRAM' } },
  { id: 'vault', type: 'storageAction', position: { x: 820, y: 20 }, data: { subtitle: 'Dữ liệu minh họa', label: 'Kho lưu trữ', type: 'storageAction', category: 'action', tableName: 'orders' } },
  { id: 'telegram', type: 'telegramAction', position: { x: 820, y: 360 }, data: { subtitle: 'Dữ liệu minh họa', label: 'Thông báo Telegram', type: 'telegramAction', category: 'action', chatId: 'demo-operations' } },
];
const previewEdges = [
  { id: 'a', source: 'sheet', sourceHandle: 'out', target: 'diff', targetHandle: 'in', type: 'execution' },
  { id: 'b', source: 'diff', sourceHandle: 'clean', target: 'vault', targetHandle: 'in', type: 'execution' },
  { id: 'c', source: 'diff', sourceHandle: 'conflict', target: 'telegram', targetHandle: 'in', type: 'execution' },
];

function StudioPreview() {
  const [nodes, setNodes, onNodesChange] = useNodesState(previewNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(previewEdges);
  const [palette, setPalette] = useState(true);
  const [map, setMap] = useState(false);
  const [auto, setAuto] = useState(false);
  const [interval, setInterval] = useState(300000);
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<Node<OrchestrationNodeData> | null>(null);
  const explain = () => setNotice('Đây là bản xem trước với dữ liệu minh họa. Mở ứng dụng chính để kết nối và chạy đồng bộ.');
  return <div className="h-dvh flex flex-col min-h-0 bg-canvas text-primary">
    <ThemeToggle />
    <header className="shrink-0 border-b border-line bg-surface pl-4 pr-16 py-4 flex flex-wrap gap-2 items-center text-sm">
      <strong className="mr-4">HybridFlow</strong><span className="text-secondary">Demo Workspace</span><span className="text-muted">/</span><span className="text-secondary">Vận hành</span><span className="text-muted">/</span><span className="font-medium">Đồng bộ đơn hàng</span><span className="text-xs text-muted ml-auto">Xem trước · Dữ liệu minh họa</span>
    </header>
    <StudioHeader isRunning={false} connected={true} autoActive={auto} onAutoChange={setAuto} intervalMs={interval} onIntervalChange={setInterval} onRunWorkflow={explain} onSaveWorkflow={explain} onResetLayout={() => { setNodes(previewNodes); setEdges(previewEdges); }} onOpenTable={explain} onConnectGoogle={explain} onManageConnections={explain} />
    <div className="relative flex flex-1 min-h-0 overflow-hidden">
      {palette && <NodePalette onAddNode={item => setNodes(current => [...current, { id: crypto.randomUUID(), type: item.type, position: { x: 250, y: 400 }, data: { subtitle: 'Dữ liệu minh họa', label: item.label, type: item.type, category: item.category } }])} />}
      <main className="relative flex-1 min-w-0">
        <ReactFlow nodes={nodes.map(node => ({ ...node, data: { ...node.data, incomingSourcesCount: edges.filter(edge => edge.target === node.id).length, connectedSheets: connectedSheetSources(nodes, edges, node.id), onOpenData: explain } }))} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={connection => setEdges(current => addEdge({ ...connection, type: 'execution' }, current))} onNodeClick={(_, node) => setSelected(node)} fitView fitViewOptions={{ padding: .2, maxZoom: .9 }} minZoom={.2}>
          <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} color="var(--grid-dot)" />
          <Panel position="top-left" className="flex gap-2"><button className="toolbar-button" onClick={() => setPalette(!palette)}>{palette ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}Thư viện</button><button className="toolbar-button" onClick={() => setMap(!map)}><Map size={16} />Bản đồ</button></Panel>
          <Controls style={{ bottom: 52 }} />{map && <MiniMap style={{ bottom: 52 }} />}
        </ReactFlow>
        <RunHistoryDrawer logs={[]} activeConflictIds={[]} isRunning={false} onClearLogs={() => {}} onOpenConflictModal={explain} />
      </main>
      {selected && <aside className="absolute right-0 top-0 bottom-10 z-40 w-[min(340px,90vw)] border-l border-line bg-surface p-5">
        <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-semibold">{selected.data.label}</h2><button className="toolbar-button" aria-label="Đóng thông tin khối" onClick={() => setSelected(null)}><X size={16} /></button></div>
        <p className="mt-4 text-sm text-secondary">Thông tin minh họa. Cấu hình thực tế có trong ứng dụng chính.</p>
        <dl className="mt-5 space-y-4 text-sm">{Object.entries(selected.data).filter(([key, value]) => typeof value === 'string' && !['type', 'category', 'label', 'spreadsheetId'].includes(key)).map(([key, value]) => <div key={key}><dt className="text-xs text-muted">{key}</dt><dd className="mt-1 break-words">{String(value)}</dd></div>)}</dl>
      </aside>}
    </div>
    {notice && <div role="status" className="fixed z-50 bottom-14 right-4 left-4 sm:left-auto sm:max-w-md rounded-xl border border-line bg-surface p-4 text-sm flex gap-3">{notice}<button aria-label="Đóng thông báo" className="shrink-0" onClick={() => setNotice('')}><X size={16} /></button></div>}
  </div>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><StudioPreview /></React.StrictMode>);
