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
          contents: ['googleService', 'syncService', 'workflowService', 'telegramService']
            .map(
              (name) =>
                'export const ' +
                name +
                ' = new Proxy({}, { get(_target, key) { return globalThis.__sourceAppApi.' +
                name +
                '[key]; } });',
            )
            .join('\n'),
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
      export function ReactFlow({ nodes, edges, nodeTypes, children }) { return React.createElement('div', { 'data-execution-edges': JSON.stringify(edges) },
        nodes.map(node => React.createElement(nodeTypes[node.type], { key: node.id, id: node.id, data: node.data })), children); }
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
    ['google_access_token', 'test-token'],
    ['hybridflow-workflow-id', 'test-editor'],
    [
      'hybridflow-workflow-v2',
      JSON.stringify(options.draft || {
        nodes: [source('a', 'file-a', 'Tab A'), source('b', 'file-b', 'Tab B')],
        edges: [],
      }),
    ],
  ]);
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
  api.syncService = options.syncService || {};
  api.telegramService = {};
  await act(async () => {
    renderer = create(React.createElement(App));
  });
}

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
  await act(async () => context.mock.timers.tick(5000));
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
  globalThis.prompt = () => 'UPDATED';
  await act(async () =>
    renderer.root.findByProps({ 'aria-label': 'Sửa status dòng 2' }).props.onClick(),
  );
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
