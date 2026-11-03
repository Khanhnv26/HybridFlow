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

test('single-sheet shared columns change scope and identity while timer changes do not', async () => {
  const { nodes, edges } = graph();
  const before = await flowIdFor(workflowConfig(nodes, edges));
  nodes.find(node => node.id === 'diff').data.sharedColumns = 'status, sku, status';
  const config = workflowConfig(nodes, edges);
  assert.deepEqual(config.syncColumns, ['status']);
  assert.notEqual(await flowIdFor(config), before);
  nodes.push({ id: 'timer', type: 'scheduleTrigger', data: { scheduleIntervalMinutes: 5 } });
  edges.push({ source: 'timer', sourceHandle: 'out', target: 'diff', targetHandle: 'trigger' });
  assert.equal(await flowIdFor(workflowConfig(nodes, edges)), await flowIdFor(config));
  nodes.push({ id: 'timer2', type: 'scheduleTrigger', data: {} });
  assert.throws(() => workflowConfig(nodes, edges), /một khối hẹn giờ/);
});

test('flow identity matches the backend canonical fixture', async () => {
  assert.equal(await flowIdFor({ spreadsheetId: 'sheet', sheetName: 'Data', idColumn: 'id', storageName: 'vault', syncColumns: ['status'] }),
    'flow-985d2076bff98552d3637ea2b5f4678c6861575eb9f169e9bf2d6bb3ad92b15e');
});
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

function withTransform() {
  const g = graph();
  g.nodes[1].data.sharedColumns = 'status';
  g.nodes.push({ id: 'second', type: 'sheetsTrigger', data: { spreadsheetId: 'sheet-B', sheetName: 'Data' } },
    { id: 'transform', type: 'dataTransform', data: { transforms: [{ columnName: 'sku', rules: ['TRIM', 'UPPERCASE'] }], writeBackCleanData: true } });
  g.nodes = g.nodes.filter(n => n.type !== 'storageAction');
  g.edges = [
    { source: 'source', target: 'transform', sourceHandle: 'out', targetHandle: 'in' },
    { source: 'transform', target: 'diff', sourceHandle: 'out', targetHandle: 'in' },
    { source: 'second', target: 'diff', sourceHandle: 'out', targetHandle: 'in' },
  ];
  return g;
}
test('transforms bind only to the upstream Sheet and are visible to comparison UI', async () => {
  const { nodes, edges } = withTransform();
  const config = workflowConfig(nodes, edges);
  assert.deepEqual(config.sheets[0].transforms, [{ columnName: 'sku', rules: ['TRIM', 'UPPERCASE'] }]);
  assert.equal(config.sheets[0].writeBackCleanData, true);
  assert.equal(config.sheets[1].transforms, undefined);
  assert.deepEqual(connectedSheetSources(nodes, edges, 'diff').map(s => s.nodeId), ['source', 'second']);
  const before = await flowIdFor(config);
  nodes.at(-1).data.transforms[0].rules.reverse();
  assert.notEqual(await flowIdFor(workflowConfig(nodes, edges)), before);
});
test('transform identity includes defaults and write-back and matches backend fixture', async () => {
  const { nodes, edges } = withTransform();
  const config = workflowConfig(nodes, edges);
  assert.equal(await flowIdFor(config), 'flow-2e49963d24cbf2beab372defc7aa1e405b80480c7109e4a289a1ab13d9ef9daa');
  for (const patch of [{ defaultValue: 'unknown' }, { rules: ['TRIM'] }]) {
    const changed = structuredClone(config);
    Object.assign(changed.sheets[0].transforms[0], patch);
    assert.notEqual(await flowIdFor(changed), await flowIdFor(config));
  }
  const changed = structuredClone(config); changed.sheets[0].writeBackCleanData = false;
  assert.notEqual(await flowIdFor(changed), await flowIdFor(config));
});
test('orphan, parallel, reversed and chained transforms fail validation', () => {
  for (const mutate of [
    g => g.edges.pop(),
    g => g.edges.push({ source: 'source', target: 'diff', sourceHandle: 'out', targetHandle: 'in' }),
    g => g.edges[0].targetHandle = 'out',
    g => { g.nodes.push({ id: 't2', type: 'dataTransform', data: {} }); g.edges[1].target = 't2'; },
  ]) {
    const g = withTransform(); mutate(g);
    assert.throws(() => workflowConfig(g.nodes, g.edges));
  }
});
test('Sheet to Vault also supports transformation and rule changes reset identity', async () => {
  const { nodes, edges } = graph();
  nodes.push({ id: 't', type: 'dataTransform', data: { transforms: [{ columnName: 'sku', rules: ['TRIM'] }] } });
  edges[0].target = 't'; edges.push({ source: 't', target: 'diff', sourceHandle: 'out', targetHandle: 'in' });
  const config = workflowConfig(nodes, edges);
  assert.equal(config.transforms[0].columnName, 'sku');
  assert.notEqual(await flowIdFor(config), await flowIdFor({ ...config, transforms: [] }));
});

test('multiple sheets can connect to a single transform node and inherit its rules', () => {
  const g = withTransform();
  g.edges = g.edges.filter(e => !(e.source === 'second' && e.target === 'diff'));
  g.edges.push({ source: 'second', target: 'transform', sourceHandle: 'out', targetHandle: 'in' });
  const config = workflowConfig(g.nodes, g.edges);
  assert.equal(config.sheets?.length, 2);
  assert.deepEqual(config.sheets[0].transforms, [{ columnName: 'sku', rules: ['TRIM', 'UPPERCASE'] }]);
  assert.deepEqual(config.sheets[1].transforms, [{ columnName: 'sku', rules: ['TRIM', 'UPPERCASE'] }]);
  assert.equal(config.sheets[0].writeBackCleanData, true);
  assert.equal(config.sheets[1].writeBackCleanData, true);
});

test('ambiguous node identities are rejected before resolving transform paths', () => {
  const g = withTransform();
  g.nodes.push({ id: 'transform', type: 'dataTransform', data: {} });
  assert.throws(() => workflowConfig(g.nodes, g.edges), /bị trùng/);
});


test('three Sheets share one rule set with independent write-back and canonical identity', async () => {
  const g = withTransform();
  g.nodes.push({ id: 'third', type: 'sheetsTrigger', data: { spreadsheetId: 'sheet-C', sheetName: 'Data' } });
  g.edges = g.edges.filter(e => e.source !== 'second');
  for (const source of ['second', 'third']) g.edges.push({ source, target: 'transform', sourceHandle: 'out', targetHandle: 'in' });
  g.nodes.find(n => n.id === 'transform').data.writeBackBySource = { source: true, second: false, third: true };
  const config = workflowConfig(g.nodes, g.edges);
  assert.deepEqual(config.sheets.map(s => s.writeBackCleanData), [true, false, true]);
  assert.equal(config.sheets.length, 3);
  assert.deepEqual(connectedSheetSources(g.nodes, g.edges, 'diff').map(s => s.nodeId), ['source', 'second', 'third']);
  assert.equal(await flowIdFor(config), 'flow-3de00f0e45057f912e6f975f793d7e82f1921d90fa09e3094c2e18d359226d54');
  g.edges.push({ source: 'second', target: 'transform', sourceHandle: 'out', targetHandle: 'in' });
  assert.throws(() => workflowConfig(g.nodes, g.edges), /nối trùng/);
});
