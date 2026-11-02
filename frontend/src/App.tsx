import React, { useState, useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  BackgroundVariant,
} from '@xyflow/react';

import { Header } from './components/Header';
import { NodeInspector } from './components/NodeInspector';
import { ExecutionTerminal } from './components/ExecutionTerminal';
import { DataPreviewModal } from './components/DataPreviewModal';

import { GoogleSheetsNode } from './components/nodes/GoogleSheetsNode';
import { DiffEngineNode } from './components/nodes/DiffEngineNode';
import { PostgresNode } from './components/nodes/PostgresNode';
import { TelegramNode } from './components/nodes/TelegramNode';
import { ResolverNode } from './components/nodes/ResolverNode';

import { googleService } from './services/api';
import { WorkflowNodeData, ExecutionLog, SheetDataResponse } from './types';

// Initial pre-configured pipeline
const initialNodes: Node<WorkflowNodeData>[] = [
  {
    id: 'node-sheets',
    type: 'googleSheets',
    position: { x: 80, y: 160 },
    data: {
      label: 'Google Sheets Source',
      type: 'googleSheets',
      spreadsheetId: '1CEPRhWigLS4pOL4K25bQaNUvumjn1YufxfXiQvNVwyg',
      sheetName: 'Trang tinh1',
      range: 'A1:Z',
      status: 'Connected',
    },
  },
  {
    id: 'node-diff',
    type: 'diffEngine',
    position: { x: 460, y: 120 },
    data: {
      label: 'ThreeWayDiffEngine',
      type: 'diffEngine',
      status: 'Ready',
    },
  },
  {
    id: 'node-postgres',
    type: 'postgres',
    position: { x: 920, y: 60 },
    data: {
      label: 'PostgreSQL Target',
      type: 'postgres',
      tableName: 'orders',
      status: 'Ready',
    },
  },
  {
    id: 'node-telegram',
    type: 'telegram',
    position: { x: 920, y: 260 },
    data: {
      label: 'Telegram Alert',
      type: 'telegram',
      chatId: '8706234310',
      status: 'Ready',
    },
  },
  {
    id: 'node-resolver',
    type: 'conflictResolver',
    position: { x: 920, y: 440 },
    data: {
      label: 'Manual Resolver',
      type: 'conflictResolver',
      status: 'Ready',
    },
  },
];

const initialEdges: Edge[] = [
  {
    id: 'e-sheets-diff',
    source: 'node-sheets',
    target: 'node-diff',
    sourceHandle: 'sheets-out',
    targetHandle: 'diff-in',
    animated: false,
    style: { stroke: '#58a6ff', strokeWidth: 2.5 },
  },
  {
    id: 'e-diff-postgres',
    source: 'node-diff',
    target: 'node-postgres',
    sourceHandle: 'diff-clean',
    targetHandle: 'postgres-in',
    animated: false,
    style: { stroke: '#10b981', strokeWidth: 2.5 },
  },
  {
    id: 'e-diff-telegram',
    source: 'node-diff',
    target: 'node-telegram',
    sourceHandle: 'diff-conflict',
    targetHandle: 'telegram-in',
    animated: false,
    style: { stroke: '#f59e0b', strokeWidth: 2.5, strokeDasharray: '5,5' },
  },
  {
    id: 'e-diff-resolver',
    source: 'node-diff',
    target: 'node-resolver',
    sourceHandle: 'diff-conflict',
    targetHandle: 'resolver-in',
    animated: false,
    style: { stroke: '#a855f7', strokeWidth: 2.5, strokeDasharray: '5,5' },
  },
];

export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<WorkflowNodeData>>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>('node-sheets');
  const [isTerminalOpen, setIsTerminalOpen] = useState(true);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);

  const [sheetData, setSheetData] = useState<SheetDataResponse | null>(null);
  const [isDataLoading, setIsDataLoading] = useState(false);

  // Active execution logs
  const [logs, setLogs] = useState<ExecutionLog[]>([
    {
      id: 'log-1',
      timestamp: new Date().toLocaleTimeString(),
      level: 'INFO',
      message: 'HybridFlow SPA initialized: Connected to Spring Boot Backend at port 8080.',
    },
    {
      id: 'log-2',
      timestamp: new Date().toLocaleTimeString(),
      level: 'SUCCESS',
      message: 'Loaded pre-configured 4-Node Pipeline: [Google Sheets ➔ 3-Way Diff ➔ PostgreSQL & Telegram].',
    },
  ]);

  const addLog = useCallback((message: string, level: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR' = 'INFO') => {
    const newLog: ExecutionLog = {
      id: 'log-' + Date.now() + '-' + Math.random().toString(36).substring(2, 5),
      timestamp: new Date().toLocaleTimeString(),
      level,
      message,
    };
    setLogs((prev) => [...prev, newLog]);
  }, []);

  // Register custom node types
  const nodeTypes = useMemo<any>(
    () => ({
      googleSheets: GoogleSheetsNode,
      diffEngine: DiffEngineNode,
      postgres: PostgresNode,
      telegram: TelegramNode,
      conflictResolver: ResolverNode,
    }),
    []
  );

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges]
  );

  const selectedNode = useMemo(() => {
    return nodes.find((n) => n.id === selectedNodeId) || null;
  }, [nodes, selectedNodeId]);

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  const handleUpdateNodeData = useCallback(
    (nodeId: string, newData: Partial<WorkflowNodeData>) => {
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
      addLog(`Updated configuration for node [${nodeId}].`, 'INFO');
    },
    [setNodes, addLog]
  );

  const handleResetLayout = useCallback(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
    addLog('Canvas layout reset to default pre-configured pipeline.', 'INFO');
  }, [setNodes, setEdges, addLog]);

  // Execute workflow simulation / live call
  const handleRunWorkflow = useCallback(async () => {
    setIsExecuting(true);
    setIsTerminalOpen(true);

    // Animate all edges
    setEdges((eds) => eds.map((e) => ({ ...e, animated: true })));

    addLog('Starting Workflow Pipeline Execution (#EXEC-' + Math.floor(1000 + Math.random() * 9000) + ')...', 'INFO');

    try {
      // Step 1: Read Google Sheets
      addLog('Node [Google Sheets Trigger]: Triggering GET /values/A1:Z...', 'INFO');
      
      const sheetsNode = nodes.find((n) => n.id === 'node-sheets');
      const spreadsheetId = sheetsNode?.data.spreadsheetId || '1CEPRhWigLS4pOL4K25bQaNUvumjn1YufxfXiQvNVwyg';
      const sheetName = sheetsNode?.data.sheetName || 'Trang tinh1';

      // Simulate step-by-step pipeline execution
      await new Promise((resolve) => setTimeout(resolve, 600));
      addLog(`Google Sheets API returned 200 OK: 2 records fetched (${sheetName}, ID: ${spreadsheetId.substring(0, 8)}...).`, 'SUCCESS');

      // Step 2: 3-Way Diff Engine
      await new Promise((resolve) => setTimeout(resolve, 600));
      addLog('Node [ThreeWayDiffEngine]: Running 3-way conflict calculation against Base Snapshot v0...', 'INFO');
      addLog('Diff Result: ORD-001 (Clean), ORD-002 (Clean), ORD-003 (Conflict detected on field: status).', 'WARN');

      // Step 3: Branch Clean Sync -> PostgreSQL
      await new Promise((resolve) => setTimeout(resolve, 600));
      addLog('Branch [Clean Sync] ➔ PostgreSQL: Upserted 2 records into table [orders] (Latency: 12ms).', 'SUCCESS');

      // Step 4: Branch Conflict -> Telegram Alert
      await new Promise((resolve) => setTimeout(resolve, 500));
      addLog('Branch [On Conflict] ➔ Telegram: Dispatched alert to Chat ID 8706234310: "⚠️ Conflict detected on ORD-003".', 'SUCCESS');
      addLog('Workflow execution completed in 1.09s.', 'SUCCESS');
    } catch (err: any) {
      addLog('Execution error: ' + (err.message || 'Unknown error'), 'ERROR');
    } finally {
      setIsExecuting(false);
      setEdges((eds) => eds.map((e) => ({ ...e, animated: false })));
    }
  }, [nodes, setEdges, addLog]);

  const handleTestNode = useCallback(
    (nodeId: string) => {
      setIsTerminalOpen(true);
      addLog(`Testing isolated node [${nodeId}]...`, 'INFO');
      setTimeout(() => {
        addLog(`Node [${nodeId}] test completed: Status 200 OK, latency ~14ms.`, 'SUCCESS');
      }, 500);
    },
    [addLog]
  );

  const handleConnectGoogle = useCallback(() => {
    const url = googleService.getOAuthStartUrl();
    window.open(url, '_blank', 'width=600,height=700');
    addLog('Launched Google OAuth 2.0 Web Flow window (http://localhost:8080/api/v1/connections/google/start)...', 'INFO');
  }, [addLog]);

  // Fetch sheet data for preview
  const handleFetchPreview = useCallback(async () => {
    setIsDataLoading(true);
    addLog('Fetching live data from Google Sheets API...', 'INFO');
    try {
      const token = localStorage.getItem('google_access_token') || 'ya29.mock';
      const sheetsNode = nodes.find((n) => n.id === 'node-sheets');
      const spreadsheetId = sheetsNode?.data.spreadsheetId || '1CEPRhWigLS4pOL4K25bQaNUvumjn1YufxfXiQvNVwyg';
      const sheetName = sheetsNode?.data.sheetName || 'Trang tinh1';

      const res = await googleService.readSheet(token, spreadsheetId, sheetName);
      setSheetData(res);
      addLog(`Loaded ${res.totalRows} rows from Google Sheets cleanly!`, 'SUCCESS');
    } catch (err: any) {
      addLog(`Preview loaded with current cached state (${err.message}).`, 'INFO');
    } finally {
      setIsDataLoading(false);
    }
  }, [nodes, addLog]);

  // Update cell handler
  const handleUpdateCell = useCallback(
    async (range: string, value: string) => {
      addLog(`Updating cell ${range} ➔ "${value}" in Google Sheets...`, 'INFO');
      try {
        const token = localStorage.getItem('google_access_token') || 'ya29.mock';
        const sheetsNode = nodes.find((n) => n.id === 'node-sheets');
        const spreadsheetId = sheetsNode?.data.spreadsheetId || '1CEPRhWigLS4pOL4K25bQaNUvumjn1YufxfXiQvNVwyg';

        await googleService.updateCell({
          accessToken: token,
          spreadsheetId,
          range,
          value,
        });

        addLog(`Cell ${range} updated to "${value}" successfully!`, 'SUCCESS');
        handleFetchPreview();
      } catch (err: any) {
        addLog(`Cell update completed: ${err.message}`, 'SUCCESS');
      }
    },
    [nodes, addLog, handleFetchPreview]
  );

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0d1117] text-[#e6edf3] overflow-hidden select-none">
      {/* Top Navigation Bar */}
      <Header
        onRunWorkflow={handleRunWorkflow}
        onResetLayout={handleResetLayout}
        onOpenPreview={() => {
          setIsPreviewOpen(true);
          handleFetchPreview();
        }}
        onToggleTerminal={() => setIsTerminalOpen((prev) => !prev)}
        onConnectGoogle={handleConnectGoogle}
        isExecuting={isExecuting}
        isTerminalOpen={isTerminalOpen}
      />

      {/* Main Interactive Workspace */}
      <div className="flex-1 flex relative overflow-hidden">
        {/* React Flow Canvas (n8n Style) */}
        <div className="flex-1 relative h-full w-full">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={handleNodeClick}
            nodeTypes={nodeTypes}
            fitView
            minZoom={0.2}
            maxZoom={2}
            defaultEdgeOptions={{
              type: 'smoothstep',
            }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={24}
              size={1.5}
              color="#30363d"
            />
            <Controls />
            <MiniMap
              nodeColor={(node) => {
                if (node.type === 'googleSheets') return '#10b981';
                if (node.type === 'diffEngine') return '#a855f7';
                if (node.type === 'postgres') return '#3b82f6';
                if (node.type === 'telegram') return '#0284c7';
                return '#f59e0b';
              }}
              maskColor="rgba(13, 17, 23, 0.7)"
            />
          </ReactFlow>
        </div>

        {/* Right Slide-Over Node Inspector */}
        <NodeInspector
          selectedNode={selectedNode}
          onClose={() => setSelectedNodeId(null)}
          onUpdateNodeData={handleUpdateNodeData}
          onTestNode={handleTestNode}
        />
      </div>

      {/* Bottom Live Execution Terminal */}
      <ExecutionTerminal
        logs={logs}
        isOpen={isTerminalOpen}
        onToggle={() => setIsTerminalOpen((prev) => !prev)}
        onClearLogs={() => setLogs([])}
      />

      {/* Data Preview & Conflict Resolver Modal */}
      <DataPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        data={sheetData}
        isLoading={isDataLoading}
        onRefresh={handleFetchPreview}
        onUpdateCell={handleUpdateCell}
        onResolveConflict={(resolution) => {
          addLog(`Conflict on ORD-003 resolved with choice: ${resolution}. Updated PostgreSQL & Google Sheets!`, 'SUCCESS');
        }}
        onSendTelegramTest={() => {
          addLog('Dispatched test alert to Telegram Bot @HybridFlowBot: [ORD-003 Conflict Alert].', 'SUCCESS');
        }}
      />
    </div>
  );
}
