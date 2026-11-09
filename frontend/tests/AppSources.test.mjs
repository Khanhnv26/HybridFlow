import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { build } from 'esbuild';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const api = {};
globalThis.__sourceAppApi = api;
const bundle = await build({
  entryPoints: [fileURLToPath(new URL('../src/App.tsx', import.meta.url))],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  jsx: 'automatic',
  plugins: [
    {
      name: 'boundaries',
      setup(builder) {
        builder.onResolve({ filter: /services\/api$/ }, () => ({
          path: 'api',
          namespace: 'test-api',
        }));
        builder.onLoad({ filter: /.*/, namespace: 'test-api' }, () => ({
          contents: ['apiClient', 'googleService', 'syncService', 'workflowService', 'telegramService', 'workspaceConnectionService', 'moduleService', 'tenantWorkflowService', 'webhookService']
            .map(
              (name) =>
                'export const ' +
                name +
                ' = new Proxy({}, { get(_target, key) { return globalThis.__sourceAppApi.' +
                name +
                '[key]; } });',
            )
            .join('\n') + '\nexport const workspaceTelegramApi = (...args) => globalThis.__sourceAppApi.workspaceTelegramApi(...args);',
        }));
        builder.onResolve({ filter: /^@xyflow\/react$/ }, () => ({
          path: 'flow',
          namespace: 'test-flow',
        }));
        builder.onLoad({ filter: /.*/, namespace: 'test-flow' }, () => ({
          contents: `
      import React, { useState } from 'react';
      export function useNodesState(initial) { const [nodes, setNodes] = useState(initial); return [nodes, setNodes, () => {}]; }
      export const useEdgesState = useNodesState;
      const refreshNode = () => {};
      export function useUpdateNodeInternals() { return refreshNode; }
      export function ReactFlow({ nodes, edges, nodeTypes, children, onNodeClick }) { return React.createElement('div', { 'data-execution-edges': JSON.stringify(edges) },
        nodes.map(node => React.createElement('div', { key: node.id, 'data-workflow-node': node.id, onClick: () => onNodeClick?.({}, node) }, React.createElement(nodeTypes[node.type], { id: node.id, data: node.data }))), children); }
      export const Background = () => null, Controls = () => null, MiniMap = () => null, Handle = () => null;
      export const Panel = ({ children }) => React.createElement('div', null, children);
      export const Position = { Left: 'left', Right: 'right' }, BackgroundVariant = { Dots: 'dots' };
      export const BaseEdge = () => null, getSmoothStepPath = () => ['M0 0L100 100', 50, 50];
      export function addEdge(edge, edges) { return [...edges, edge]; }
    `,
        }));
        builder.onResolve({ filter: /^(?:react(?:\/.*)?|lucide-react)$/ }, (args) => ({
          path: import.meta.resolve(args.path),
          external: true,
        }));
      },
    },
  ],
});
const directory = await mkdtemp(join(tmpdir(), 'hybridflow-source-app-'));
const path = join(directory, 'App.mjs');
await writeFile(path, bundle.outputFiles[0].text);
const { default: App } = await import(pathToFileURL(path).href);
await unlink(path);
await rmdir(directory);
let renderer;
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  renderer = null;
});
const source = (id, file, tab) => ({
  id,
  type: 'sheetsTrigger',
  position: { x: 0, y: 0 },
  data: {
    type: 'sheetsTrigger',
    category: 'trigger',
    label: 'Google',
    subtitle: '',
    spreadsheetId: file,
    sheetName: tab,
  },
});
function text(node) {
  return typeof node === 'string' ? node : (node.children || []).map(text).join('');
}
async function mount(options = {}) {
  const storage = new Map([
    ['google_access_token', options.token || 'test-token'],
    ['hybridflow-workflow-id', 'test-editor'],
    [
      'hybridflow-workflow-v2',
      JSON.stringify(options.draft || {
        nodes: [source('a', 'file-a', 'Tab A'), source('b', 'file-b', 'Tab B')],
        edges: [],
      }),
    ],
  ]);
  if (options.noLegacyToken) storage.delete('google_access_token');
  if (options.editorProps) {
    const { userId, workspaceId, workflowId } = options.editorProps;
    storage.set(`hybridflow:draft:${userId}:${workspaceId}:${workflowId}`, JSON.stringify(options.draft));
  }
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  };
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  api.googleService.getMetadata = async (_token, id) => ({
    spreadsheetId: id,
    title: id === 'file-a' ? 'Kho Hà Nội' : 'Kho Sài Gòn',
    sheets: [],
  });
  api.workflowService = { load: async () => ({}), save: async () => ({}) };
  api.syncService = { getNotifications: async () => [], ...options.syncService };
  api.telegramService = {};
  api.apiClient = options.apiClient || {};
  api.workspaceConnectionService = options.workspaceConnectionService || {};
  await act(async () => {
    renderer = create(React.createElement(App, options.editorProps));
  });
}

test('fresh workspace runs and reads sources without a legacy Google token', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const calls = [], reads = [];
  const first = source('a', 'file-a', 'Tab A');
  first.data.connectionId = 'workspace-google';
  const draft = { nodes: [first,
    { id: 'diff', type: 'diffEngine', position: { x: 0, y: 0 }, data: { uniqueKey: 'id', conflictPolicy: 'SOURCE_WINS' } },
    { id: 'vault', type: 'storageAction', position: { x: 0, y: 0 }, data: { tableName: 'vault' } }],
    edges: [{ source: 'a', sourceHandle: 'out', target: 'diff', targetHandle: 'in' },
      { source: 'diff', sourceHandle: 'clean', target: 'vault', targetHandle: 'in' }] };
  api.googleService = { readSheet: async () => { throw new Error('Legacy reader must not be used'); } };
  await mount({ noLegacyToken: true, editorProps: { userId: 'user', workspaceId: 'workspace', workflowId: 'workflow', workspaceRole: 'OWNER' }, draft,
    workspaceConnectionService: {
      getSheetMetadata: async () => ({ spreadsheetId: 'file-a', title: 'Workspace file', sheets: [] }),
      readSheet: async (...args) => { reads.push(args); return rows('file-a', 'Tab A', 1); },
    },
    apiClient: {
      get: async url => ({ data: url.endsWith('/history') || url.endsWith('/conflicts') ? []
        : { definition: draft, definitionVersion: 1, connectionBindings: [{ nodeId: 'a', connectionId: 'workspace-google' }] } }),
      put: async (url, body) => { calls.push(['save', url, body]); return { data: { definitionVersion: 2, connectionBindings: body.connectionBindings } }; },
      post: async url => { calls.push(['run', url]); return { data: { flowId: 'context', executionId: 'run', status: 'SUCCESS', cleanRecordIds: [], conflicts: [], notificationsQueued: 0 } }; },
    },
  });
  for (let attempt = 0; attempt < 6; attempt++) await act(async () => new Promise(setImmediate));
  const run = renderer.root.findAllByType('button').find(node => text(node).includes('Chạy thử luồng'));
  await act(async () => run.props.onClick());
  assert.ok(calls.some(call => call[0] === 'run'), text(renderer.root));
  assert.ok(reads.length > 0);
  assert.ok(reads.every(args => args[0] === 'workspace' && args[1] === 'workspace-google'));
  assert.equal(localStorage.getItem('google_access_token'), null);
  assert.equal(JSON.stringify(calls[0][2]).includes('accessToken'), false);
});

test('workspace editor opens historical outbox through the execution context and never calls legacy workflow APIs', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const requests = [];
  const history = ['new', 'old'].map(id => ({ id, flow_id: 'context-' + id, status: 'SUCCESS',
    started_at: '2026-11-04T03:00:00Z', result: JSON.stringify({ cleanRecordIds: [], conflicts: [], notificationsQueued: 0 }) }));
  api.googleService = { readSheet: async (_token, file, tab) => rows(file, tab, 1) };
  await mount({ editorProps: { userId: 'user', workspaceId: 'workspace', workflowId: 'workflow' },
    draft: { nodes: [source('a', 'file-a', 'Tab A'),
      { id: 'diff', type: 'diffEngine', position: { x: 0, y: 0 }, data: { uniqueKey: 'id', conflictPolicy: 'ASK_TELEGRAM' } },
      { id: 'vault', type: 'storageAction', position: { x: 0, y: 0 }, data: { tableName: 'vault' } }],
      edges: [{ source: 'a', sourceHandle: 'out', target: 'diff', targetHandle: 'in' },
        { source: 'diff', sourceHandle: 'clean', target: 'vault', targetHandle: 'in' }] },
    apiClient: { get: async url => {
      requests.push(url);
      return { data: url.endsWith('/history') ? history : url.endsWith('/conflicts') ? []
        : url.includes('/contexts/context-old/notifications') ? [{ id: 'old-notice', state: 'SENT', channel: 'TELEGRAM',
          message: 'Old run message', actionNodeId: 'telegram', destination: '123', sourceType: 'RECORD',
          attempts: 1, createdAt: '2026-11-04T03:00:00Z', availableAt: '2026-11-04T03:00:00Z' }] : [] };
    } },
  });
  for (let attempt = 0; attempt < 6; attempt++) await act(async () => new Promise(setImmediate));
  const buttons = label => renderer.root.findAllByType('button').filter(node => text(node).includes(label));
  await act(async () => buttons('Lịch sử')[0].props.onClick());
  assert.equal(buttons('Xem thông báo').length, 2, JSON.stringify({ requests, ui: text(renderer.root).slice(-1800) }));
  await act(async () => buttons('Xem thông báo')[1].props.onClick());
  assert.match(text(renderer.root), /Old run message/);
  assert.ok(requests.includes('/workspaces/workspace/workflows/workflow/contexts/context-old/notifications'));
  assert.ok(requests.every(url => url.startsWith('/workspaces/workspace/workflows/workflow')));
});

test('scheduled completions update history and source data without reloading the page', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let history = [];
  const reads = [];
  api.googleService = {
    readSheet: async (_token, file, tab) => { reads.push([file, tab]); return rows(file, tab, 3); },
  };
  await mount({
    draft: {
      nodes: [source('a', 'file-a', 'Tab A'),
        { id: 'diff', type: 'diffEngine', position: { x: 0, y: 0 }, data: { uniqueKey: 'id', conflictPolicy: 'SOURCE_WINS' } },
        { id: 'vault', type: 'storageAction', position: { x: 0, y: 0 }, data: { tableName: 'vault' } }],
      edges: [
        { source: 'a', sourceHandle: 'out', target: 'diff', targetHandle: 'in' },
        { source: 'diff', sourceHandle: 'clean', target: 'vault', targetHandle: 'in' },
      ],
    },
    syncService: { getOpenConflicts: async () => [], getHistory: async () => history },
  });
  // Drain the real asynchronous crypto digest used to derive the flow identity.
  for (let attempt = 0; attempt < 5; attempt++) await act(async () => new Promise(setImmediate));
  assert.match(text(renderer.root), /Lịch sử \(0\)/);
  history = [{ id: 'scheduled-run', status: 'SUCCESS', started_at: '2026-11-03T03:00:00Z',
    progress: JSON.stringify([{ nodes: ['a'], stage: 'READ', label: 'Đang đọc' }, { nodes: ['diff'], stage: 'COMPARE', label: 'Đang so khớp' }, { nodes: ['vault'], stage: 'WRITE', label: 'Đang ghi' }]),
    result: JSON.stringify({ cleanRecordIds: ['1'], conflicts: [], totalRowsProcessed: 1, notificationsSent: 0, notificationsFailed: 0 }) }];
  await act(async () => context.mock.timers.tick(1000));
  assert.match(text(renderer.root), /Lịch sử \(1\)/);
  assert.match(text(renderer.root), /Đồng bộ 1 bản ghi/);
  assert.deepEqual(reads, [['file-a', 'Tab A']]);
  const paintedEdges = () => JSON.parse(renderer.root.find(node => node.props['data-execution-edges'] !== undefined).props['data-execution-edges']);
  assert.equal(paintedEdges().some(edge => edge.data.recentlyCompleted), true, 'A scheduled run missed between polls still needs visible completion feedback');
  assert.match(text(renderer.root), /vừa hoàn tất/);
  await act(async () => context.mock.timers.tick(2000));
  assert.equal(paintedEdges().some(edge => edge.data.recentlyCompleted), false);
  await act(async () => context.mock.timers.tick(5000));
  assert.equal(reads.length, 1, 'Unchanged history must not trigger another Google Sheets read');
});
function rows(file, tab, count) {
  return {
    spreadsheetId: file,
    sheetName: tab,
    headers: ['status'],
    rows: [{ status: 'OLD' }],
    totalRows: count,
  };
}

test('Telegram states follow the latest execution outbox without changing successful sync steps', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let state = 'PENDING';
  const queried = [];
  api.googleService = { readSheet: async (_token, file, tab) => rows(file, tab, 1) };
  await mount({ draft: {
    nodes: [source('a', 'file-a', 'Tab A'),
      { id: 'diff', type: 'diffEngine', position: { x: 0, y: 0 }, data: { uniqueKey: 'id', conflictPolicy: 'ASK_TELEGRAM' } },
      { id: 'vault', type: 'storageAction', position: { x: 0, y: 0 }, data: { tableName: 'vault' } },
      { id: 't', type: 'telegramAction', position: { x: 0, y: 0 }, data: { chatId: '123' } }],
    edges: [{ source: 'a', sourceHandle: 'out', target: 'diff', targetHandle: 'in' },
      { source: 'diff', sourceHandle: 'clean', target: 'vault', targetHandle: 'in' },
      { source: 'diff', sourceHandle: 'conflict', target: 't', targetHandle: 'in' }],
  }, syncService: {
    getOpenConflicts: async () => [],
    getHistory: async () => [{ id: 'outbox-run', status: 'SUCCESS', started_at: '2026-11-03T03:00:00Z',
      progress: JSON.stringify([{ stage: 'WRITE', nodes: ['vault'], label: 'Lưu dữ liệu' }, { stage: 'NOTIFY', nodes: ['t'], label: 'Đã xếp hàng' }]),
      result: JSON.stringify({ cleanRecordIds: [], conflicts: [], notificationsQueued: 1, notificationsSent: 0, notificationsFailed: 0 }) }],
    getNotifications: async (flow, execution) => { queried.push([flow, execution]); return [{ id: 'notice', actionNodeId: 't', executionId: 'outbox-run', state, message: 'Test' }]; },
  } });
  for (let attempt = 0; attempt < 6; attempt++) await act(async () => new Promise(setImmediate));
  assert.match(text(renderer.root), /Đang chờ gửi/);
  assert.equal(queried[0][1], 'outbox-run');
  state = 'DEAD';
  await act(async () => context.mock.timers.tick(2000));
  assert.match(text(renderer.root), /Gửi thông báo lỗi/);
  state = 'SENT';
  await act(async () => context.mock.timers.tick(2000));
  assert.match(text(renderer.root), /Đã gửi 1 thông báo/);
});

test('closing the router cancels its outstanding source read', async () => {
  const reads = [];
  let rejectRead;
  api.googleService = { readSheet: (_token, _file, _tab, signal) => {
    reads.push(signal);
    return new Promise((_resolve, reject) => { rejectRead = reject; });
  } };
  await mount({ token: 'gconn-test', draft: {
    nodes: [source('a', 'file-a', 'Tab A'),
      { id: 'diff', type: 'diffEngine', position: { x: 0, y: 0 }, data: { uniqueKey: 'id', sharedColumns: 'status', conflictPolicy: 'ASK_TELEGRAM' } },
      { id: 'router', type: 'routerCondition', position: { x: 0, y: 0 }, data: {} }],
    edges: [{ source: 'a', sourceHandle: 'out', target: 'diff', targetHandle: 'in' },
      { source: 'diff', sourceHandle: 'clean', target: 'router', targetHandle: 'in' }],
  } });
  await act(async () => renderer.root.find(node => node.props['data-workflow-node'] === 'router').props.onClick());
  const inspector = renderer.root.findByProps({ 'aria-label': 'Cấu hình khối' });
  assert.equal(inspector.type, 'aside');
  assert.equal(inspector.findByProps({ role: 'dialog' }).props['aria-modal'], 'false');
  assert.equal(reads.length, 1);
  await act(async () => renderer.root.findByProps({ 'aria-label': 'Đóng' }).props.onClick());
  assert.equal(reads[0]?.aborted, true, 'Closing must cancel the dialog source read');
  await act(async () => rejectRead(new Error('read cancelled')));
  assert.equal(renderer.root.findAllByProps({ role: 'dialog' }).length, 0);
  assert.equal(renderer.root.findAllByProps({ 'aria-label': 'Cấu hình khối' }).length, 0);
});

test('a failed router preview read is shown once and can be retried without trapping the dialog', async () => {
  let reads = 0;
  let rejectRead;
  api.googleService = { readSheet: async () => {
    reads++;
    if (reads === 1) return new Promise((_resolve, reject) => { rejectRead = reject; });
    return { spreadsheetId: 'file-a', sheetName: 'Tab A', headers: ['id', 'status'], rows: [{ id: '1', status: 'READY' }], totalRows: 1 };
  } };
  await mount({ token: 'gconn-test', draft: {
    nodes: [source('a', 'file-a', 'Tab A'),
      { id: 'diff', type: 'diffEngine', position: { x: 0, y: 0 }, data: { uniqueKey: 'id', sharedColumns: 'status', conflictPolicy: 'ASK_TELEGRAM' } },
      { id: 'router', type: 'routerCondition', position: { x: 0, y: 0 }, data: {} }],
    edges: [{ source: 'a', sourceHandle: 'out', target: 'diff', targetHandle: 'in' },
      { source: 'diff', sourceHandle: 'clean', target: 'router', targetHandle: 'in' }],
  } });
  await act(async () => renderer.root.find(node => node.props['data-workflow-node'] === 'router').props.onClick());
  await act(async () => rejectRead(new Error('Sheet temporarily unavailable')));
  assert.match(text(renderer.root), /Sheet temporarily unavailable/);
  assert.equal(reads, 1);
  await act(async () => renderer.root.findAllByType('button').find(node => text(node).includes('Đọc lại dữ liệu')).props.onClick());
  assert.equal(reads, 2);
  assert.equal(renderer.root.findAllByProps({ role: 'dialog' }).length, 1);
  await act(async () => renderer.root.findByProps({ 'aria-label': 'Đóng' }).props.onClick());
  assert.equal(renderer.root.findAllByProps({ role: 'dialog' }).length, 0);
});

test('the comparison dialog persists a numeric price column and keeps the key as text', async () => {
  const reads = [];
  api.googleService = { readSheet: async (...args) => {
    reads.push(args);
    return { spreadsheetId: 'file-a', sheetName: 'Tab A', headers: ['id', 'price', 'phone'], rows: [{ id: '00123', price: '20000', phone: '0901234567' }], totalRows: 1 };
  } };
  await mount({ draft: {
    nodes: [source('a', 'file-a', 'Tab A'),
      { id: 'diff', type: 'diffEngine', position: { x: 0, y: 0 }, data: { uniqueKey: 'id', sharedColumns: 'price,phone', conflictPolicy: 'ASK_TELEGRAM' } },
      { id: 'vault', type: 'storageAction', position: { x: 0, y: 0 }, data: { tableName: 'vault' } }],
    edges: [{ source: 'a', sourceHandle: 'out', target: 'diff', targetHandle: 'in' },
      { source: 'diff', sourceHandle: 'clean', target: 'vault', targetHandle: 'in' }],
  } });
  let saved;
  api.workflowService.save = async (_id, definition) => { saved = definition; };
  await act(async () => renderer.root.find(node => node.props['data-workflow-node'] === 'diff').props.onClick());
  assert.equal(renderer.root.findAllByProps({ 'aria-label': 'Kiểu cột id' }).length, 0);
  assert.match(text(renderer.root), /Mã dòng luôn giữ dạng văn bản/);
  await act(async () => renderer.root.findByProps({ 'aria-label': 'Kiểu cột price' }).props.onChange({ target: { value: 'NUMBER' } }));
  assert.equal(JSON.parse(localStorage.getItem('hybridflow-workflow-v2')).nodes.find(node => node.id === 'diff').data.columnTypes, undefined,
    'Editing the modal must not update the running workflow or persisted browser draft before Save');
  const dialog = renderer.root.findByProps({ role: 'dialog' });
  await act(async () => dialog.findAllByType('button').find(node => text(node).includes('Lưu cấu hình')).props.onClick());
  assert.deepEqual(saved.nodes.find(node => node.id === 'diff').data.columnTypes, { price: 'NUMBER' });
  await act(async () => renderer.root.find(node => node.props['data-workflow-node'] === 'a')
    .findAllByType('button').find(node => text(node).includes('Xem dữ liệu')).props.onClick({ stopPropagation() {} }));
  assert.deepEqual(reads.at(-1)[4], { price: 'NUMBER' }, 'The data viewer must read using the saved numeric-column configuration');
  assert.match(text(renderer.root), /00123/);
});

test('opening and closing a router across parent updates never reuses another modal key', async context => {
  const warnings = [];
  context.mock.method(console, 'error', (...args) => warnings.push(args.join(' ')));
  api.googleService = {};
  await mount({ draft: {
    nodes: [{ id: 'r', type: 'routerCondition', position: { x: 0, y: 0 }, data: {} }], edges: [],
  } });
  for (let cycle = 0; cycle < 3; cycle++) {
    await act(async () => renderer.root.find(node => node.props['data-workflow-node'] === 'r').props.onClick());
    assert.equal(renderer.root.findAllByProps({ role: 'dialog' }).length, 1);
    await act(async () => renderer.root.findAllByType('input').find(node => node.props.type === 'text').props.onChange({ target: { value: 'READY' } }));
    await act(async () => renderer.root.findByProps({ 'aria-label': 'Đóng' }).props.onClick());
    assert.equal(renderer.root.findAllByProps({ role: 'dialog' }).length, 0);
  }
  assert.equal(warnings.some(line => line.includes('same key')), false, 'Sibling configuration modals must have different React keys');
});

test('scheduled backend phases animate the actual node and retain completion without manual execution', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let phases = [{ nodes: ['timer'], stage: 'TRIGGER', label: 'Kích hoạt theo lịch' }, { nodes: ['a'], stage: 'READ', label: 'Đang đọc trang tính' }];
  let status = 'RUNNING';
  const reads = [];
  api.googleService = { readSheet: async (_token, file, tab) => { reads.push(file); return rows(file, tab, 3); } };
  await mount({ draft: {
    nodes: [source('a', 'file-a', 'Tab A'),
      { id: 'diff', type: 'diffEngine', position: { x: 0, y: 0 }, data: { uniqueKey: 'id', conflictPolicy: 'SOURCE_WINS' } },
      { id: 'vault', type: 'storageAction', position: { x: 0, y: 0 }, data: { tableName: 'vault' } },
      { id: 'timer', type: 'scheduleTrigger', position: { x: 0, y: 0 }, data: {} }],
    edges: [
      { id: 'read', source: 'a', sourceHandle: 'out', target: 'diff', targetHandle: 'in' },
      { id: 'write', source: 'diff', sourceHandle: 'clean', target: 'vault', targetHandle: 'in' },
      { id: 'trigger', source: 'timer', sourceHandle: 'out', target: 'diff', targetHandle: 'trigger' }],
  }, syncService: { getOpenConflicts: async () => [], getHistory: async () => [{ id: 'backend-run', status, started_at: '2026-11-03T03:00:00Z', result: null, progress: JSON.stringify(phases) }] } });
  for (let attempt = 0; attempt < 5; attempt++) await act(async () => new Promise(setImmediate));
  const activeCards = () => renderer.root.findAllByType('div').filter(node => node.props.className?.includes('workflow-node--running'));
  assert.equal(activeCards().length, 1);
  assert.match(text(activeCards()[0]), /Sheet · Nguồn 1/);
  assert.match(text(renderer.root), /Đang đọc trang tính/);
  phases = [...phases, { nodes: ['diff'], stage: 'COMPARE', label: 'Đang so khớp dữ liệu' }];
  await act(async () => context.mock.timers.tick(1000));
  assert.equal(activeCards().length, 1);
  assert.match(text(activeCards()[0]), /Điều phối & Đồng bộ/);
  status = 'SUCCESS';
  phases = [...phases, { nodes: ['vault'], stage: 'WRITE', label: 'Đang lưu Vault' }];
  await act(async () => context.mock.timers.tick(1000));
  assert.equal(activeCards().length, 0);
  assert.match(text(renderer.root), /Đồng bộ hoàn tất/);
  assert.equal(renderer.root.findAllByType('div').filter(node => node.props.className?.includes('workflow-node--success')).length, 4);
  assert.deepEqual(reads, ['file-a']);
});
test('selecting the second source reads and edits its own file and tab while counts stay independent', async () => {
  const calls = [],
    writes = [];
  api.googleService = {
    readSheet: async (_token, file, tab) => {
      calls.push([file, tab]);
      return rows(file, tab, file === 'file-a' ? 3 : 8);
    },
    updateCell: async (request) => {
      writes.push(request);
      return { success: true };
    },
  };
  await mount();
  const openButtons = () =>
    renderer.root.findAllByType('button').filter((button) => text(button) === 'Xem dữ liệu');
  await act(async () => openButtons()[0].props.onClick({ stopPropagation() {} }));
  assert.deepEqual(calls[0], ['file-a', 'Tab A']);
  await act(async () =>
    renderer.root.findByProps({ id: 'table-source' }).props.onChange({ target: { value: 'b' } }),
  );
  assert.deepEqual(calls[1], ['file-b', 'Tab B']);
  assert.match(text(renderer.root), /Đã đọc 3 dòng/);
  assert.match(text(renderer.root), /Đã đọc 8 dòng/);
  await act(async () =>
    renderer.root.findByProps({ 'aria-label': 'Sửa status dòng 2' }).props.onClick(),
  );
  assert.equal(writes.length, 0);
  await act(async () => renderer.root.findByType('textarea').props.onChange({ target: { value: 'UPDATED' } }));
  await act(async () => renderer.root.findByProps({ 'aria-label': 'Lưu status dòng 2' }).props.onClick());
  assert.equal(writes.length, 1);
  assert.equal(writes[0].spreadsheetId, 'file-b');
  assert.equal(writes[0].range, "'Tab B'!A2");
  assert.deepEqual(calls.at(-1), ['file-b', 'Tab B']);
});
test('a failed read shows the actual error on that source and in the viewer instead of a green unread state', async () => {
  api.googleService = {
    readSheet: async (_token, file, tab) => {
      if (file === 'file-b') throw new Error('Tài khoản chưa có quyền đọc file này');
      return rows(file, tab, 3);
    },
  };
  await mount();
  const openButtons = () =>
    renderer.root.findAllByType('button').filter((button) => text(button) === 'Xem dữ liệu');
  await act(async () => openButtons()[0].props.onClick({ stopPropagation() {} }));
  await act(async () =>
    renderer.root.findByProps({ id: 'table-source' }).props.onChange({ target: { value: 'b' } }),
  );
  assert.match(text(renderer.root), /Đã đọc 3 dòng/);
  assert.match(text(renderer.root), /Đọc thất bại/);
  assert.match(text(renderer.root), /Tài khoản chưa có quyền đọc file này/);
  assert.equal(renderer.root.findAllByProps({ 'aria-label': 'Sửa status dòng 2' }).length, 0);
});
test('clearing history deletes backend history and keeps logs empty across polling', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let history = [{
    id: 'run-1',
    status: 'SUCCESS',
    started_at: '2026-11-03T03:00:00Z',
    result: JSON.stringify({ cleanRecordIds: ['1'], conflicts: [], totalRowsProcessed: 1, notificationsSent: 0, notificationsFailed: 0 }),
  }];
  const clearedFlows = [];
  await mount({
    draft: {
      nodes: [
        source('a', 'file-a', 'Tab A'),
        { id: 'diff', type: 'diffEngine', position: { x: 0, y: 0 }, data: { uniqueKey: 'id', conflictPolicy: 'SOURCE_WINS' } },
        { id: 'vault', type: 'storageAction', position: { x: 0, y: 0 }, data: { tableName: 'vault' } },
      ],
      edges: [
        { source: 'a', sourceHandle: 'out', target: 'diff', targetHandle: 'in' },
        { source: 'diff', sourceHandle: 'clean', target: 'vault', targetHandle: 'in' },
      ],
    },
    syncService: {
      getOpenConflicts: async () => [],
      getHistory: async () => history,
      clearHistory: async (flowId) => {
        clearedFlows.push(flowId);
        history = [];
      },
    },
  });
  for (let attempt = 0; attempt < 5; attempt++) await act(async () => new Promise(setImmediate));
  assert.match(text(renderer.root), /Lịch sử \(1\)/);

  const historyToggle = renderer.root.findAllByType('button').find((button) => text(button).includes('Lịch sử (1)'));
  await act(async () => historyToggle.props.onClick());
  const clearButton = renderer.root.findAllByType('button').find((button) => text(button).includes('Xóa nhật ký'));
  await act(async () => clearButton.props.onClick());

  assert.equal(clearedFlows.length, 1);
  assert.match(text(renderer.root), /Lịch sử \(0\)/);
  assert.match(text(renderer.root), /Đã xóa nhật ký điều phối/);

  await act(async () => context.mock.timers.tick(2000));
  assert.match(text(renderer.root), /Lịch sử \(0\)/);
});


test('transform configuration is persisted to the workflow backend and failure keeps the previous draft intact', async () => {
  api.googleService = { readSheet: async () => ({ spreadsheetId: 'file-a', sheetName: 'Tab A', headers: ['id', 'status'], rows: [{ id: ' sp01 ', status: 'new' }], totalRows: 1 }) };
  await mount({
    token: 'gconn-test',
    draft: {
      nodes: [source('a', 'file-a', 'Tab A'),
        { id: 'transform', type: 'dataTransform', position: { x: 0, y: 0 }, data: { label: 'Chuẩn Hóa Dữ Liệu', type: 'dataTransform', category: 'logic', transforms: [{ columnName: 'id', rules: ['TRIM'] }] } },
        { id: 'diff', type: 'diffEngine', position: { x: 0, y: 0 }, data: { uniqueKey: 'id', sharedColumns: 'status', conflictPolicy: 'SOURCE_WINS' } },
        { id: 'vault', type: 'storageAction', position: { x: 0, y: 0 }, data: { tableName: 'vault' } }],
      edges: [
        { source: 'a', sourceHandle: 'out', target: 'transform', targetHandle: 'in' },
        { source: 'transform', sourceHandle: 'out', target: 'diff', targetHandle: 'in' },
        { source: 'diff', sourceHandle: 'clean', target: 'vault', targetHandle: 'in' },
      ],
    },
    syncService: { getOpenConflicts: async () => [], getHistory: async () => [] },
  });
  let saved;
  let fail = true;
  api.workflowService.save = async (id, definition) => {
    if (fail) throw { response: { data: { message: 'Chưa lưu được quy tắc' } } };
    saved = { id, definition };
  };
  await act(async () => renderer.root.findByProps({ 'data-workflow-node': 'transform' }).props.onClick());
  const field = renderer.root.findAllByType('fieldset').find(node => text(node).startsWith('id'));
  const upper = field.findAllByType('label').find(node => text(node).startsWith('IN HOA')).findByType('input');
  await act(async () => upper.props.onChange({ target: { checked: true } }));
  assert.equal(renderer.root.findAllByType('fieldset').find(node => text(node).startsWith('id')).findAllByType('label').find(node => text(node).startsWith('IN HOA')).findByType('input').props.checked, true);
  const saveButton = () => renderer.root.findByProps({ role: 'dialog' }).findAllByType('button').find(node => text(node) === 'Lưu cấu hình');
  await act(async () => saveButton().props.onClick());
  for (let attempt = 0; attempt < 5; attempt++) await act(async () => new Promise(setImmediate));
  assert.match(text(renderer.root), /Chưa lưu được quy tắc/);
  let draft = JSON.parse(localStorage.getItem('hybridflow-workflow-v2'));
  assert.deepEqual(draft.nodes.find(node => node.id === 'transform').data.transforms[0].rules, ['TRIM']);
  assert.equal(renderer.root.findAllByType('fieldset').find(node => text(node).startsWith('id')).findAllByType('label').find(node => text(node).startsWith('IN HOA')).findByType('input').props.checked, true, 'Server failure must keep the selected rule');
  fail = false;
  await act(async () => saveButton().props.onClick());
  for (let attempt = 0; attempt < 5; attempt++) await act(async () => new Promise(setImmediate));
  assert.equal(saved.id, 'test-editor');
  assert.deepEqual(saved.definition.nodes.find(node => node.id === 'transform').data.transforms[0].rules, ['TRIM', 'UPPERCASE']);
  assert.match(saved.definition.flowId, /^flow-/);
  assert.equal(saved.definition.accessToken, 'gconn-test');
  draft = JSON.parse(localStorage.getItem('hybridflow-workflow-v2'));
  assert.deepEqual(draft.nodes.find(node => node.id === 'transform').data.transforms[0].rules, ['TRIM', 'UPPERCASE']);
  assert.equal(renderer.root.findAllByProps({ role: 'dialog' }).length, 0);
});

test('arranging the canvas keeps the current nodes, connections and settings', async () => {
  api.googleService = {};
  await mount();
  const before = JSON.parse(localStorage.getItem('hybridflow-workflow-v2'));
  await act(async () => renderer.root.findByProps({ 'aria-label': 'Sắp xếp canvas' }).props.onClick());
  const after = JSON.parse(localStorage.getItem('hybridflow-workflow-v2'));
  assert.deepEqual(after.edges, before.edges);
  assert.deepEqual(after.nodes.map(node => node.data), before.nodes.map(node => node.data));
  assert.deepEqual(after.nodes.map(node => node.id), ['a', 'b']);
  assert.ok(after.nodes[1].position.y > after.nodes[0].position.y);
});
