import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const bundle = await build({
  entryPoints: [fileURLToPath(new URL('../src/services/workflow.ts', import.meta.url))],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});

const { workflowConfig, flowIdFor } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);

function baseGraph() {
  return {
    nodes: [
      {
        id: 'source-1',
        type: 'sheetsTrigger',
        data: { spreadsheetId: 'src-sheet-id', sheetName: 'Orders' },
      },
      {
        id: 'diff-1',
        type: 'diffEngine',
        data: { uniqueKey: 'order_id', conflictPolicy: 'ASK_TELEGRAM' },
      },
      {
        id: 'storage-1',
        type: 'storageAction',
        data: { tableName: 'orders_vault' },
      },
    ],
    edges: [
      { source: 'source-1', target: 'diff-1', sourceHandle: 'out', targetHandle: 'in' },
      { source: 'diff-1', target: 'storage-1', sourceHandle: 'clean', targetHandle: 'in' },
    ],
  };
}

test('sheetWriteAction connected to diff clean validates and builds sheetWriteTargetPlan', () => {
  const { nodes, edges } = baseGraph();

  const sheetWriteNode = {
    id: 'write-1',
    type: 'sheetWriteAction',
    data: {
      targetSpreadsheetId: 'tgt-sheet-id',
      targetSheetName: 'Destination',
      sourceKeyColumn: 'order_id',
      targetKeyColumn: 'TargetOrderId',
      columnMappings: [
        { sourceColumn: 'status', targetColumn: 'TrangThai' },
        { sourceColumn: 'total_amount', targetColumn: 'ThanhTien' },
      ],
    },
  };

  nodes.push(sheetWriteNode);
  edges.push({
    source: 'diff-1',
    target: 'write-1',
    sourceHandle: 'clean',
    targetHandle: 'in',
  });

  const payload = workflowConfig(nodes, edges);
  assert.ok(payload.sheetWriteTargetPlan);
  assert.equal(payload.sheetWriteTargetPlan.nodeId, 'write-1');
  assert.equal(payload.sheetWriteTargetPlan.targetSpreadSheetId, 'tgt-sheet-id');
  assert.equal(payload.sheetWriteTargetPlan.targetSheetName, 'Destination');
  assert.equal(payload.sheetWriteTargetPlan.sourceKeyColumn, 'order_id');
  assert.equal(payload.sheetWriteTargetPlan.targetKeyColumn, 'TargetOrderId');
  assert.deepEqual(payload.sheetWriteTargetPlan.columnMappings, [
    { sourceColumn: 'status', targetColumn: 'TrangThai' },
    { sourceColumn: 'total_amount', targetColumn: 'ThanhTien' },
  ]);
});

test('sheetWriteAction defaults sourceKeyColumn to diffEngine uniqueKey when not explicitly set', () => {
  const { nodes, edges } = baseGraph();

  nodes.push({
    id: 'write-1',
    type: 'sheetWriteAction',
    data: {
      targetSpreadsheetId: 'tgt-sheet-id',
      targetSheetName: 'Destination',
      targetKeyColumn: 'id_dest',
      columnMappings: [{ sourceColumn: 'status', targetColumn: 'Status' }],
    },
  });
  edges.push({
    source: 'diff-1',
    target: 'write-1',
    sourceHandle: 'clean',
    targetHandle: 'in',
  });

  const payload = workflowConfig(nodes, edges);
  assert.equal(payload.sheetWriteTargetPlan.sourceKeyColumn, 'order_id');
});

test('sheetWriteAction validates required configuration fields', () => {
  const { nodes, edges } = baseGraph();

  const writeNode = {
    id: 'write-1',
    type: 'sheetWriteAction',
    data: {},
  };
  nodes.push(writeNode);
  edges.push({
    source: 'diff-1',
    target: 'write-1',
    sourceHandle: 'clean',
    targetHandle: 'in',
  });

  // Missing required fields
  assert.throws(
    () => workflowConfig(nodes, edges),
    /chưa được cấu hình đầy đủ/
  );

  writeNode.data.targetSpreadsheetId = 'sheet-id';
  assert.throws(
    () => workflowConfig(nodes, edges),
    /chưa được cấu hình đầy đủ/
  );

  writeNode.data.targetSheetName = 'Tab1';
  assert.throws(
    () => workflowConfig(nodes, edges),
    /chưa được cấu hình đầy đủ/
  );

  writeNode.data.targetKeyColumn = 'id';
  assert.throws(
    () => workflowConfig(nodes, edges),
    /chưa được cấu hình đầy đủ/
  );

  writeNode.data.columnMappings = [{ sourceColumn: 'a', targetColumn: 'b' }];
  const valid = workflowConfig(nodes, edges);
  assert.ok(valid.sheetWriteTargetPlan);
});

test('only one sheetWriteAction node is allowed in workflow', () => {
  const { nodes, edges } = baseGraph();

  nodes.push(
    {
      id: 'write-1',
      type: 'sheetWriteAction',
      data: {
        targetSpreadsheetId: 'id1',
        targetSheetName: 'Tab1',
        targetKeyColumn: 'k1',
        columnMappings: [{ sourceColumn: 'a', targetColumn: 'b' }],
      },
    },
    {
      id: 'write-2',
      type: 'sheetWriteAction',
      data: {
        targetSpreadsheetId: 'id2',
        targetSheetName: 'Tab2',
        targetKeyColumn: 'k2',
        columnMappings: [{ sourceColumn: 'c', targetColumn: 'd' }],
      },
    }
  );

  edges.push(
    { source: 'diff-1', target: 'write-1', sourceHandle: 'clean', targetHandle: 'in' },
    { source: 'diff-1', target: 'write-2', sourceHandle: 'clean', targetHandle: 'in' }
  );

  assert.throws(
    () => workflowConfig(nodes, edges),
    /Chỉ hỗ trợ một khối Ghi Sheet trong mỗi luồng/
  );
});

test('sheetWriteAction must connect to clean handle of diffEngine', () => {
  const { nodes, edges } = baseGraph();

  nodes.push({
    id: 'write-1',
    type: 'sheetWriteAction',
    data: {
      targetSpreadsheetId: 'id1',
      targetSheetName: 'Tab1',
      targetKeyColumn: 'k1',
      columnMappings: [{ sourceColumn: 'a', targetColumn: 'b' }],
    },
  });

  // Connect to conflict handle instead of clean
  edges.push({
    source: 'diff-1',
    target: 'write-1',
    sourceHandle: 'conflict',
    targetHandle: 'in',
  });

  assert.throws(
    () => workflowConfig(nodes, edges),
    /phải được nối từ cổng Hành động của khối So khớp/
  );
});

test('sheetWriteAction does not alter flowId so Vault snapshots remain stable', async () => {
  const base = baseGraph();
  const flowIdBefore = await flowIdFor(workflowConfig(base.nodes, base.edges));

  const withWrite = baseGraph();
  withWrite.nodes.push({
    id: 'write-1',
    type: 'sheetWriteAction',
    data: {
      targetSpreadsheetId: 'tgt-sheet',
      targetSheetName: 'Out',
      targetKeyColumn: 'order_id',
      columnMappings: [{ sourceColumn: 'status', targetColumn: 'Status' }],
    },
  });
  withWrite.edges.push({
    source: 'diff-1',
    target: 'write-1',
    sourceHandle: 'clean',
    targetHandle: 'in',
  });

  const flowIdAfter = await flowIdFor(workflowConfig(withWrite.nodes, withWrite.edges));
  assert.equal(flowIdAfter, flowIdBefore, 'Flow ID must be preserved when adding sheet write action');
});
