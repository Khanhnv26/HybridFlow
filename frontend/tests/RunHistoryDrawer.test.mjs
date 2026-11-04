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

const notification = (id, state = 'DEAD') => ({
  id, executionId: 'run-old', flowId: 'flow', actionNodeId: 'telegram', channel: 'TELEGRAM',
  destination: '123', sourceType: 'RECORD', sourceKey: id, message: 'Nội dung ' + id,
  state, attempts: 5, availableAt: '2026-11-04T01:00:00Z', createdAt: '2026-11-04T00:00:00Z',
  lastError: state === 'DEAD' ? 'Bot bị chặn' : undefined, errorCode: state === 'DEAD' ? 'ACCESS_DENIED' : undefined,
  correlationId: 'trace-123',
});
async function mountOutbox(context, overrides = {}) {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  globalThis.window = new EventTarget();
  globalThis.document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  const properties = { ...props([]), flowId: 'flow',
    logs: [{ ...logs[0], id: 'run-new' }, { ...logs[0], id: 'run-old' }],
    loadNotifications: async () => [], retryNotification: async () => {}, ...overrides };
  await act(async () => { renderer = create(React.createElement(RunHistoryDrawer, properties)); });
  await expand();
  await act(async () => buttons('Xem thông báo')[1].props.onClick());
  return properties;
}

test('historical execution loads its own live outbox and retries only the failed notification', async context => {
  const requests = [], retries = [];
  let retried = false;
  await mountOutbox(context, {
    loadNotifications: async (flow, execution, _signal, offset) => {
      requests.push([flow, execution, offset]);
      return [notification('failed', retried ? 'PENDING' : 'DEAD'), notification('sent', 'SENT')];
    },
    retryNotification: async id => { retries.push(id); retried = true; },
  });
  assert.deepEqual(requests[0], ['flow', 'run-old', 0]);
  assert.equal(buttons('Thử gửi lại').length, 1);
  for (const value of ['Nội dung failed', '123', 'Bot bị chặn', 'ACCESS_DENIED', 'trace-123', '5'])
    assert.ok(text(renderer.root).includes(value), value);
  await act(async () => buttons('Thử gửi lại')[0].props.onClick());
  assert.deepEqual(retries, ['failed']);
  assert.equal(buttons('Thử gửi lại').length, 0);
  await act(async () => context.mock.timers.tick(2000));
  assert.ok(requests.length >= 3);
  assert.ok(requests.every(([, execution]) => execution === 'run-old'));
});

test('switching executions aborts stale responses and collapsing history stops polling', async context => {
  let completeOld;
  const signals = [];
  await mountOutbox(context, { loadNotifications: async (_flow, execution, signal) => {
    signals.push(signal);
    if (execution === 'run-old') return new Promise(resolve => { completeOld = resolve; });
    return [notification('new-message', 'SENT')];
  } });
  await act(async () => buttons('Xem thông báo')[0].props.onClick());
  assert.equal(signals[0].aborted, true);
  await act(async () => completeOld([notification('stale-message')]));
  assert.ok(text(renderer.root).includes('new-message'));
  assert.equal(text(renderer.root).includes('stale-message'), false);
  await expand();
  assert.equal(signals.at(-1).aborted, true);
});

test('outbox load failures remain errors and recover on the next poll', async context => {
  let failed = true;
  await mountOutbox(context, { loadNotifications: async () => {
    if (failed) throw new Error('Mất kết nối');
    return [];
  } });
  assert.equal(renderer.root.findAllByProps({ role: 'alert' }).length, 1);
  assert.equal(text(renderer.root).includes('Không có thông báo'), false);
  failed = false;
  await act(async () => context.mock.timers.tick(2000));
  assert.equal(renderer.root.findAllByProps({ role: 'alert' }).length, 0);
  assert.ok(text(renderer.root).includes('Không có thông báo'));
});

test('pagination requests the next execution page and duplicate retry clicks are suppressed', async context => {
  const offsets = [], retries = [];
  let finish;
  await mountOutbox(context, {
    loadNotifications: async (_flow, _execution, _signal, offset) => {
      offsets.push(offset);
      return offset === 0 ? Array.from({ length: 50 }, (_, index) => notification('first-' + index)) : [notification('second-page')];
    },
    retryNotification: id => { retries.push(id); return new Promise(resolve => { finish = resolve; }); },
  });
  await act(async () => buttons('Trang sau')[0].props.onClick());
  assert.equal(offsets.at(-1), 50);
  assert.equal(text(renderer.root).includes('Nội dung first-'), false);
  const retry = buttons('Thử gửi lại')[0];
  await act(async () => { retry.props.onClick(); retry.props.onClick(); });
  assert.deepEqual(retries, ['second-page']);
  assert.equal(buttons('Trang trước')[0].props.disabled, true);
  await act(async () => finish());
});

test('retry failure is visible and preserves the failed message', async context => {
  await mountOutbox(context, { loadNotifications: async () => [notification('failed')],
    retryNotification: async () => { throw new Error('Không thể gửi lại'); } });
  await act(async () => buttons('Thử gửi lại')[0].props.onClick());
  assert.ok(text(renderer.root).includes('Không thể gửi lại'));
  assert.equal(buttons('Thử gửi lại').length, 1);
});
