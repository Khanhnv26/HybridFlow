import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('../src/services/workflow.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { workflowConfig, flowIdFor, cellRange, connectedSheetSources } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);
function graph() {
  return {
    nodes: [
      {
        id: 'source',
        type: 'sheetsTrigger',
        data: { spreadsheetId: 'sheet-A', sheetName: 'Data' },
      },
      {
        id: 'diff',
        type: 'diffEngine',
        data: { uniqueKey: 'sku', conflictPolicy: 'ASK_TELEGRAM' },
      },
      { id: 'storage', type: 'storageAction', data: { tableName: 'products' } },
      { id: 'telegram', type: 'telegramAction', data: { chatId: 'target-chat' } },
    ],
    edges: [
      { source: 'source', target: 'diff', sourceHandle: 'out', targetHandle: 'in' },
      { source: 'diff', target: 'storage', sourceHandle: 'clean', targetHandle: 'in' },
    ],
  };
}
test('request uses node configuration and connected notification path', () => {
  const { nodes, edges } = graph();
  assert.deepEqual(workflowConfig(nodes, edges), {
    spreadsheetId: 'sheet-A',
    sheetName: 'Data',
    idColumn: 'sku',
    storageName: 'products',
    conflictPolicy: 'ASK_TELEGRAM',
    notifyConflicts: false,
    chatId: 'target-chat',
  });
  edges.push({ source: 'diff', target: 'telegram', sourceHandle: 'conflict', targetHandle: 'in' });
  assert.equal(workflowConfig(nodes, edges).notifyConflicts, true);
});
test('disconnecting core nodes prevents execution', () => {
  const { nodes, edges } = graph();
  assert.throws(() => workflowConfig(nodes, edges.slice(1)), /Nối Google/);
});
test('unsupported nodes and edges cannot pretend to execute', () => {
  const { nodes, edges } = graph();
  assert.throws(
    () => workflowConfig([...nodes, { id: 'timer', type: 'scheduleTrigger', data: {} }], edges),
    /chưa được hỗ trợ/,
  );
  assert.throws(
    () =>
      workflowConfig(nodes, [
        ...edges,
        { source: 'source', target: 'storage', sourceHandle: 'out', targetHandle: 'in' },
      ]),
    /dây nối/,
  );
});
test('flow identity separates sheets, tabs, keys and storage but survives policy changes', async () => {
  const { nodes, edges } = graph();
  const config = workflowConfig(nodes, edges);
  const id = await flowIdFor(config);
  assert.equal(id, await flowIdFor({ ...config, conflictPolicy: 'SOURCE_WINS' }));
  for (const field of ['spreadsheetId', 'sheetName', 'idColumn', 'storageName']) {
    assert.notEqual(id, await flowIdFor({ ...config, [field]: 'another-value' }));
  }
});
test('empty source or a connected Telegram node without a chat fails validation', () => {
  const { nodes, edges } = graph();
  nodes[0].data.spreadsheetId = '';
  assert.throws(() => workflowConfig(nodes, edges), /Điền/);
  nodes[0].data.spreadsheetId = 'sheet-A';
  nodes[3].data.chatId = '';
  edges.push({ source: 'diff', target: 'telegram', sourceHandle: 'conflict', targetHandle: 'in' });
  assert.throws(() => workflowConfig(nodes, edges), /Chat ID/);
});
test('editing uses the actual column position and escapes tab names', () => {
  assert.equal(cellRange("O'Brien", 2, 5), "'O''Brien'!C7");
  assert.equal(cellRange('Data', 27, 0), "'Data'!AB2");
});

test('multi-sheet configuration binds two or more sheets without storage', async () => {
  const nodes = [
    {
      id: 'sheet1',
      type: 'sheetsTrigger',
      data: { label: 'Bảng A', spreadsheetId: 'sheet-1', sheetName: 'Tab1' },
    },
    {
      id: 'sheet2',
      type: 'sheetsTrigger',
      data: { label: 'Bảng B', spreadsheetId: 'sheet-2', sheetName: 'Tab2' },
    },
    {
      id: 'diff',
      type: 'diffEngine',
      data: {
        uniqueKey: 'code',
        sharedColumns: 'status, quantity',
        conflictPolicy: 'ASK_TELEGRAM',
      },
    },
  ];
  const edges = [
    { source: 'sheet1', target: 'diff', sourceHandle: 'out', targetHandle: 'in' },
    { source: 'diff', target: 'sheet2', sourceHandle: 'clean', targetHandle: 'in' },
  ];
  const config = workflowConfig(nodes, edges);
  assert.equal(config.storageName, 'multi_sheet');
  assert.equal(config.idColumn, 'code');
  assert.equal(config.sheets?.length, 2);
  assert.equal(config.sheets[0].spreadsheetId, 'sheet-1');
  assert.equal(config.sheets[1].spreadsheetId, 'sheet-2');

  const flowId = await flowIdFor(config);
  assert.ok(flowId.startsWith('flow-'));

  const differentNodes = [
    {
      id: 'sheet1',
      type: 'sheetsTrigger',
      data: { label: 'Bảng A', spreadsheetId: 'sheet-1', sheetName: 'Tab1' },
    },
    {
      id: 'sheet2',
      type: 'sheetsTrigger',
      data: { label: 'Bảng B', spreadsheetId: 'sheet-3', sheetName: 'Tab2' },
    },
    {
      id: 'diff',
      type: 'diffEngine',
      data: {
        uniqueKey: 'code',
        sharedColumns: 'status, quantity',
        conflictPolicy: 'ASK_TELEGRAM',
      },
    },
  ];
  const diffConfig = workflowConfig(differentNodes, edges);
  const diffFlowId = await flowIdFor(diffConfig);
  assert.notEqual(flowId, diffFlowId);
});

test('multi-sheet requires all sheet nodes to be connected to the diff engine', () => {
  const nodes = [
    { id: 'sheet1', type: 'sheetsTrigger', data: { spreadsheetId: 'sheet-1', sheetName: 'Tab1' } },
    { id: 'sheet2', type: 'sheetsTrigger', data: { spreadsheetId: 'sheet-2', sheetName: 'Tab2' } },
    {
      id: 'diff',
      type: 'diffEngine',
      data: {
        uniqueKey: 'code',
        sharedColumns: 'status, quantity',
        conflictPolicy: 'ASK_TELEGRAM',
      },
    },
  ];
  const edges = [{ source: 'sheet1', target: 'diff', sourceHandle: 'out', targetHandle: 'in' }];
  assert.throws(() => workflowConfig(nodes, edges), /Hãy nối khối/);
});

test('multi-sheet requires an explicit shared-column selection and binds it to flow identity', async () => {
  const nodes = [
    { id: 'a', type: 'sheetsTrigger', data: { spreadsheetId: 'a', sheetName: 'Data' } },
    { id: 'b', type: 'sheetsTrigger', data: { spreadsheetId: 'b', sheetName: 'Data' } },
    { id: 'diff', type: 'diffEngine', data: { uniqueKey: 'id', conflictPolicy: 'ASK_TELEGRAM' } },
  ];
  const edges = ['a', 'b'].map((source) => ({
    source,
    target: 'diff',
    sourceHandle: 'out',
    targetHandle: 'in',
  }));
  assert.throws(() => workflowConfig(nodes, edges), /cột được phép chia sẻ/);
  nodes[2].data.sharedColumns = 'status, status, id';
  const config = workflowConfig(nodes, edges);
  assert.deepEqual(config.syncColumns, ['status']);
  assert.notEqual(
    await flowIdFor(config),
    await flowIdFor({ ...config, syncColumns: ['private'] }),
  );
});

test('connected sheet list follows both supported ports and excludes unrelated or invalid edges', () => {
  const nodes = [
    {
      id: 'a',
      type: 'sheetsTrigger',
      data: { spreadsheetId: 'file-a', spreadsheetTitle: 'Kho Hà Nội', sheetName: 'Orders' },
    },
    {
      id: 'b',
      type: 'sheetsTrigger',
      data: { spreadsheetId: 'file-b', spreadsheetTitle: 'Kho Sài Gòn', sheetName: 'Orders' },
    },
    { id: 'c', type: 'sheetsTrigger', data: { spreadsheetId: 'file-c', sheetName: 'Private' } },
    { id: 'd', type: 'sheetsTrigger', data: { spreadsheetId: '', sheetName: '' } },
    { id: 'telegram', type: 'telegramAction', data: {} },
  ];
  const edges = [
    { source: 'a', sourceHandle: 'out', target: 'brain', targetHandle: 'in' },
    { source: 'brain', sourceHandle: 'clean', target: 'b', targetHandle: 'in' },
    { source: 'brain', sourceHandle: 'conflict', target: 'telegram', targetHandle: 'in' },
    { source: 'brain', sourceHandle: 'conflict', target: 'c', targetHandle: 'in' },
    { source: 'd', sourceHandle: 'out', target: 'brain', targetHandle: 'in' },
  ];
  const connected = connectedSheetSources(nodes, edges, 'brain');
  assert.deepEqual(
    connected.map((source) => source.nodeId),
    ['a', 'b', 'd'],
  );
  assert.equal(connected[0].spreadsheetTitle, 'Kho Hà Nội');
  assert.equal(connected[1].sheetName, 'Orders');
  assert.equal(connected[2].spreadsheetId, '');
  assert.deepEqual(
    connectedSheetSources(nodes, edges.slice(1), 'brain').map((source) => source.nodeId),
    ['b', 'd'],
  );
});

test('a sheet wired through both comparison ports is listed only once', () => {
  const nodes = [
    { id: 'a', type: 'sheetsTrigger', data: { spreadsheetId: 'file-a', sheetName: 'Orders' } },
  ];
  const edges = [
    { source: 'a', sourceHandle: 'out', target: 'brain', targetHandle: 'in' },
    { source: 'brain', sourceHandle: 'clean', target: 'a', targetHandle: 'in' },
  ];
  assert.equal(connectedSheetSources(nodes, edges, 'brain').length, 1);
});
