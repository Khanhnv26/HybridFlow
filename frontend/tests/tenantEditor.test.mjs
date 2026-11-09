import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const bundle = await build({ entryPoints: [fileURLToPath(new URL('../src/services/tenantEditor.ts', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'esm' });
const { createTenantEditorApi } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const base = '/workspaces/workspace-a/workflows/workflow-a';
function fixture(respond) {
  const calls = [];
  const client = Object.fromEntries(['get', 'post', 'put', 'delete'].map(method => [method, async (...args) => {
    calls.push([method, ...args]); return { data: await respond(method, ...args) };
  }]));
  return { calls, editor: createTenantEditorApi(client, 'workspace-a', 'workflow-a') };
}

test('historical notifications and retry use the original execution context', async () => {
  const { editor, calls } = fixture((_method, url) => {
    if (url.endsWith('/history')) return [{ id: 'new', flow_id: 'context-new' }, { id: 'old', flow_id: 'context-old' }];
    if (url.endsWith('/notifications')) return [{ id: 'notice-old' }];
    return {};
  });
  await editor.sync.getHistory('browser-fingerprint');
  await editor.sync.getNotificationPage('browser-fingerprint', 'old', undefined, 50);
  assert.equal(calls[1][1], base + '/contexts/context-old/notifications');
  assert.deepEqual(calls[1][2].params, { executionId: 'old', offset: 50, limit: 50 });
  await editor.sync.retryNotification('notice-old');
  assert.equal(calls[2][1], base + '/contexts/context-old/notifications/notice-old/retry');
  await assert.rejects(editor.sync.retryNotification('foreign-notice'));
  await assert.rejects(editor.sync.getNotifications('foreign-context', 'foreign-run'));
});

test('saving keeps workspace bindings and version without persisting browser credentials', async () => {
  const { editor, calls } = fixture((method) => method === 'get'
    ? { definitionVersion: 7, definition: { nodes: [], edges: [] }, connectionBindings: [{ nodeId: 'sheet', connectionId: 'owned' }] }
    : { definitionVersion: 8, connectionBindings: [{ nodeId: 'sheet', connectionId: 'owned' }] });
  const nodes = [{ id: 'sheet', data: { connectionId: 'owned' } }];
  await editor.workflow.save('ignored-client-id', { nodes, edges: [], accessToken: 'must-not-save', flowId: 'untrusted' });
  assert.deepEqual(calls[1][2], { expectedVersion: 7, definition: { nodes, edges: [] },
    connectionBindings: [{ nodeId: 'sheet', connectionId: 'owned' }] });
  await editor.workflow.save('ignored-client-id', { nodes: [], edges: [] });
  assert.equal(calls[2][2].expectedVersion, 8);
  assert.deepEqual(calls[2][2].connectionBindings, []);
});

test('version conflict is returned to the editor without retrying or overwriting', async () => {
  const failure = new Error('version conflict');
  const { editor, calls } = fixture(method => {
    if (method === 'get') return { definitionVersion: 1, definition: { nodes: [], edges: [] } };
    throw failure;
  });
  await assert.rejects(editor.workflow.save('id', { nodes: [], edges: [] }), error => error === failure);
  assert.equal(calls.filter(call => call[0] === 'put').length, 1);
});

test('Sheet Write saves only the source binding and forwards its preview token to Run', async () => {
  const { editor, calls } = fixture((method, url) => {
    if (method === 'get') return { definitionVersion: 3, definition: { nodes: [], edges: [] } };
    if (url.endsWith('/sheet-write/preview')) return { valid: true, previewToken: 'expected-plan' };
    return {};
  });
  const nodes = [
    { id: 'source', type: 'sheetsTrigger', data: { connectionId: 'google-source' } },
    { id: 'target', type: 'sheetWriteAction', data: { connectionId: 'obsolete-binding' } },
  ];
  await editor.workflow.save('ignored', { nodes, edges: [] });
  assert.deepEqual(calls[1][2].connectionBindings, [{ nodeId: 'source', connectionId: 'google-source' }]);
  const request = { targetSpreadSheetId: 'target-file' };
  const preview = await editor.sync.previewSheetWrite(request);
  await editor.workflow.run('ignored', true, preview.previewToken);
  assert.deepEqual(calls[2].slice(0, 3), ['post', base + '/sheet-write/preview', request]);
  assert.equal(calls[3][1], base + '/run');
  assert.deepEqual(calls[3][3].headers, { 'X-Sheet-Write-Preview': 'expected-plan' });
});

test('conflict resolution uses server context and never sends a caller credential', async () => {
  const { editor, calls } = fixture((_method, url) => url.endsWith('/conflicts') ? [{ id: 42, flowId: 'context-old' }] : {});
  await editor.sync.getOpenConflicts('browser-fingerprint');
  await editor.sync.resolveConflict(42, 'READY', 'must-not-send');
  assert.equal(calls[1][1], base + '/contexts/context-old/conflicts/42/resolve');
  assert.deepEqual(calls[1][2], { resolvedValue: 'READY' });
});

test('bootstrap confirmation, history deletion and vault remain in the selected workspace', async () => {
  const { editor, calls } = fixture((_method, url) => url.endsWith('/run') ? { executionId: 'run', flowId: 'context' } : []);
  await editor.workflow.run('ignored', true);
  assert.deepEqual(calls[0][3].params, { bootstrapConfirmed: true });
  await editor.sync.getVault('browser-fingerprint');
  assert.equal(calls[1][1], base + '/contexts/context/vault');
  await editor.sync.clearHistory('browser-fingerprint');
  assert.equal(calls[2][1], base + '/history');
  assert.ok(calls.every(call => call[1].startsWith(base)));
});

test('loading preserves workflow enabled state and updateStatus updates it via dedicated endpoint', async () => {
  const { editor, calls } = fixture((method, url, data) => {
    if (method === 'get') return { definitionVersion: 1, enabled: false, definition: { nodes: [], edges: [] } };
    if (url.endsWith('/status')) return { flowId: 'workflow-a', enabled: data.enabled };
    return {};
  });
  const def = await editor.workflow.load('ignored');
  assert.equal(def.enabled, false);
  assert.equal(editor.workflow.isEnabled(), false);

  const updated = await editor.workflow.updateStatus('ignored', true);
  assert.equal(updated.enabled, true);
  assert.equal(editor.workflow.isEnabled(), true);
  assert.equal(calls[1][1], base + '/status');
  assert.deepEqual(calls[1][2], { enabled: true });
});
