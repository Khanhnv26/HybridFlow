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
  entryPoints: [fileURLToPath(new URL('../src/hooks/useWorkflowPolling.ts', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{ name: 'react', setup(builder) {
    builder.onResolve({ filter: /^react$/ }, args => ({ path: import.meta.resolve(args.path), external: true }));
  } }],
});
const directory = await mkdtemp(join(tmpdir(), 'hybridflow-polling-test-'));
const file = join(directory, 'polling.mjs');
await writeFile(file, bundle.outputFiles[0].text);
const { useWorkflowPolling } = await import(pathToFileURL(file).href);
await unlink(file); await rmdir(directory);
let renderer;
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); renderer = null; });
function Probe({ id = 'one', refresh, onError = () => {} }) { useWorkflowPolling(id, refresh, onError); return null; }
async function mount(context, props) {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  globalThis.window = new EventTarget();
  globalThis.document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  await act(async () => { renderer = create(React.createElement(Probe, props)); });
}

test('slow requests never overlap and polling is cancelled when unmounted', async (context) => {
  const requests = [];
  let release;
  await mount(context, { refresh: async (_id, signal) => {
    requests.push(signal);
    if (requests.length === 1) await new Promise(resolve => { release = resolve; });
  } });
  await act(async () => { context.mock.timers.tick(10000); window.dispatchEvent(new Event('focus')); });
  assert.equal(requests.length, 1);
  await act(async () => release());
  await act(async () => context.mock.timers.tick(5000));
  assert.equal(requests.length, 2);
  await act(async () => renderer.unmount()); renderer = null;
  assert.equal(requests[1].aborted, true);
  await act(async () => context.mock.timers.tick(5000));
  assert.equal(requests.length, 2);
});

test('changing flow aborts old requests and their completion cannot restart old polling', async (context) => {
  const calls = [];
  let release;
  const refresh = async (id, signal) => {
    calls.push({ id, signal });
    if (id === 'one') await new Promise(resolve => { release = resolve; });
  };
  await mount(context, { id: 'one', refresh });
  await act(async () => renderer.update(React.createElement(Probe, { id: 'two', refresh })));
  assert.equal(calls[0].signal.aborted, true);
  await act(async () => release());
  await act(async () => context.mock.timers.tick(5000));
  assert.deepEqual(calls.map(call => call.id), ['one', 'two', 'two']);
});

test('hidden tabs pause polling, returning refreshes immediately, repeated errors are reported once', async (context) => {
  let calls = 0;
  const errors = [];
  await mount(context, { refresh: async () => { calls++; throw new Error('Backend unavailable'); }, onError: error => errors.push(error) });
  await act(async () => context.mock.timers.tick(5000));
  assert.equal(calls, 2); assert.equal(errors.length, 1);
  document.visibilityState = 'hidden';
  await act(async () => context.mock.timers.tick(5000));
  assert.equal(calls, 2);
  document.visibilityState = 'visible';
  await act(async () => document.dispatchEvent(new Event('visibilitychange')));
  assert.equal(calls, 3); assert.equal(errors.length, 1);
});
