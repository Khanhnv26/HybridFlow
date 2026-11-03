import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { build } from 'esbuild';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const bundle = await build({
  entryPoints: [fileURLToPath(new URL('../src/components/orchestration/RunHistoryDrawer.tsx', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic',
  plugins: [{ name: 'external-react', setup(builder) {
    builder.onResolve({ filter: /^(?:react(?:\/.*)?|lucide-react)$/ }, args => ({ path: import.meta.resolve(args.path), external: true }));
  } }],
});
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'hybridflow-history-test-'));
const bundlePath = join(temporaryDirectory, 'RunHistoryDrawer.mjs');
await writeFile(bundlePath, bundle.outputFiles[0].text);
const { RunHistoryDrawer } = await import(pathToFileURL(bundlePath).href);
await unlink(bundlePath); await rmdir(temporaryDirectory);
let renderer;
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); renderer = null; });
const logs = [{ id: 'run-1', time: '10:00', type: 'conflict', message: 'Đồng bộ 2 bản ghi; 1 xung đột.', conflictIds: [9] }];
function text(node) { return typeof node === 'string' ? node : (node.children || []).map(text).join(''); }
function buttons(label) { return renderer.root.findAllByType('button').filter(node => text(node).includes(label)); }
function props(activeConflictIds) { return { logs, activeConflictIds, isRunning: false, onClearLogs: () => {}, onOpenConflictModal: () => {} }; }
async function mount(openIds) { await act(async () => { renderer = create(React.createElement(RunHistoryDrawer, props(openIds))); }); }
async function expand() { await act(async () => buttons('Lịch sử')[0].props.onClick()); }

test('resolved conflicts no longer show warning actions, while the run remains in history', async () => {
  await mount([]); await expand();
  assert.equal(buttons('Xem xung đột').length, 0);
  assert.equal(buttons('Xử lý ngay').length, 0);
  assert.equal(text(renderer.root).includes('Đã xử lý'), true);
  assert.equal(text(renderer.root).includes('Đồng bộ 2 bản ghi'), true);
});
test('resolving the last conflict immediately removes actions without deleting old history', async () => {
  await mount([9]); await expand();
  assert.equal(buttons('Xử lý ngay').length, 1);
  await act(async () => renderer.update(React.createElement(RunHistoryDrawer, props([]))));
  assert.equal(buttons('Xử lý ngay').length, 0);
  assert.equal(buttons('Xem xung đột').length, 0);
});
test('an unrelated open conflict does not make a resolved historical run actionable', async () => {
  await mount([12]); await expand();
  assert.equal(buttons('Xem xung đột').length, 1);
  assert.equal(buttons('Xử lý ngay').length, 0);
});
test('partially resolved runs remain actionable only while associated conflicts are open', async () => {
  const properties = { ...props([10]), logs: [{ ...logs[0], conflictIds: [9, 10] }] };
  await act(async () => { renderer = create(React.createElement(RunHistoryDrawer, properties)); });
  await expand();
  assert.equal(buttons('Xử lý ngay').length, 1);
  await act(async () => renderer.update(React.createElement(RunHistoryDrawer, { ...properties, activeConflictIds: [] })));
  assert.equal(buttons('Xử lý ngay').length, 0);
});
test('a bootstrap history entry does not offer conflict resolution', async () => {
  const properties = { ...props([]), logs: [{ id: 'bootstrap', time: '09:00', type: 'info', message: 'Phiên yêu cầu xác nhận khởi tạo.' }] };
  await act(async () => { renderer = create(React.createElement(RunHistoryDrawer, properties)); });
  await expand();
  assert.equal(buttons('Xử lý ngay').length, 0);
  assert.equal(buttons('Xem xung đột').length, 0);
});
test('clear logs button invokes callback and disables when empty or running', async () => {
  let cleared = 0;
  await act(async () => {
    renderer = create(React.createElement(RunHistoryDrawer, { ...props([]), onClearLogs: () => { cleared++; } }));
  });
  await expand();
  const clearBtn = () => buttons('Xóa nhật ký')[0];
  assert.equal(clearBtn().props.disabled, false);
  await act(async () => clearBtn().props.onClick());
  assert.equal(cleared, 1);

  await act(async () => renderer.update(React.createElement(RunHistoryDrawer, { ...props([]), logs: [] })));
  assert.equal(clearBtn().props.disabled, true);

  await act(async () => renderer.update(React.createElement(RunHistoryDrawer, { ...props([]), isRunning: true })));
  assert.equal(clearBtn().props.disabled, true);
});
