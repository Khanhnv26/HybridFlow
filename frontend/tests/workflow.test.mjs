import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('../src/services/workflow.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { workflowConfig, flowIdFor, cellRange } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
function graph() {
  return {
    nodes: [
      { id: 'source', type: 'sheetsTrigger', data: { spreadsheetId: 'sheet-A', sheetName: 'Data' } },
      { id: 'diff', type: 'diffEngine', data: { uniqueKey: 'sku', conflictPolicy: 'ASK_TELEGRAM' } },
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
    spreadsheetId: 'sheet-A', sheetName: 'Data', idColumn: 'sku', storageName: 'products',
    conflictPolicy: 'ASK_TELEGRAM', notifyConflicts: false, chatId: 'target-chat',
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
  assert.throws(() => workflowConfig([...nodes, { id: 'timer', type: 'scheduleTrigger', data: {} }], edges), /chưa được hỗ trợ/);
  assert.throws(() => workflowConfig(nodes, [...edges, { source: 'source', target: 'storage', sourceHandle: 'out', targetHandle: 'in' }]), /dây nối/);
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
  const { nodes, edges } = graph(); nodes[0].data.spreadsheetId = '';
  assert.throws(() => workflowConfig(nodes, edges), /Điền/);
  nodes[0].data.spreadsheetId = 'sheet-A'; nodes[3].data.chatId = '';
  edges.push({ source: 'diff', target: 'telegram', sourceHandle: 'conflict', targetHandle: 'in' });
  assert.throws(() => workflowConfig(nodes, edges), /Chat ID/);
});
test('editing uses the actual column position and escapes tab names', () => {
  assert.equal(cellRange("O'Brien", 2, 5), "'O''Brien'!C7");
  assert.equal(cellRange('Data', 27, 0), "'Data'!AB2");
});
