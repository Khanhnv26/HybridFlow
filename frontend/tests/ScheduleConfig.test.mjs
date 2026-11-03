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
globalThis.__scheduleApi = api;
const bundle = await build({
  entryPoints: [fileURLToPath(new URL('../src/components/orchestration/ScheduleConfig.tsx', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic',
  plugins: [{ name: 'test-boundaries', setup(builder) {
    builder.onResolve({ filter: /services\/api$/ }, () => ({ path: 'api', namespace: 'test-api' }));
    builder.onLoad({ filter: /.*/, namespace: 'test-api' }, () => ({ contents: 'export const workflowService = globalThis.__scheduleApi;' }));
    builder.onResolve({ filter: /^(?:react(?:\/.*)?|lucide-react)$/ }, args => ({ path: import.meta.resolve(args.path), external: true }));
  } }],
});
const directory = await mkdtemp(join(tmpdir(), 'hybridflow-schedule-test-'));
const file = join(directory, 'ScheduleConfig.mjs');
await writeFile(file, bundle.outputFiles[0].text);
const { ScheduleConfig } = await import(pathToFileURL(file).href);
await unlink(file); await rmdir(directory);
let renderer;
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); renderer = null; });
function text(node) { return typeof node === 'string' ? node : (node.children || []).map(text).join(''); }
function save() { return renderer.root.findAllByType('button').find(node => text(node).includes('Lưu cấu hình')); }
async function mount(overrides = {}) {
  await act(async () => { renderer = create(React.createElement(ScheduleConfig, {
    data: {}, disabled: false, onClose: () => {}, onSave: async () => {}, ...overrides,
  })); });
}

test('fractional and excessive intervals are rejected before saving', async () => {
  const saves = [];
  await mount({ onSave: async settings => saves.push(settings) });
  const input = renderer.root.findAllByType('input').find(node => node.props.type === 'number');
  for (const value of ['1.5', '2000']) {
    await act(async () => input.props.onChange({ target: { value } }));
    await act(async () => save().props.onClick());
    assert.match(text(renderer.root), /số nguyên từ 1 đến 1440/);
  }
  assert.equal(saves.length, 0);
});

test('ninety minutes is described accurately and timezone is saved explicitly', async () => {
  const saves = [];
  await mount({ data: { scheduleIntervalMinutes: 90 }, onSave: async settings => saves.push(settings) });
  assert.match(text(renderer.root), /90 phút/);
  await act(async () => save().props.onClick());
  assert.equal(saves[0].scheduleTimezone, 'Asia/Ho_Chi_Minh');
  assert.equal(saves[0].scheduleIntervalMinutes, 90);
});

test('revoked Google connection displays recovery guidance and aborts status requests on close', async () => {
  let signal;
  api.scheduleStatus = async (id, requestSignal) => {
    assert.equal(id, 'editor'); signal = requestSignal;
    return { enabled: true, state: 'NEEDS_CONNECTION', error: 'Cần kết nối lại Google.', next_run_at: '2026-11-03T02:05:00Z' };
  };
  await mount({ workflowId: 'editor' });
  assert.match(text(renderer.root), /Cần kết nối lại Google/);
  assert.doesNotMatch(text(renderer.root), /Lượt kế tiếp/);
  await act(async () => renderer.unmount()); renderer = null;
  assert.equal(signal.aborted, true);
});
