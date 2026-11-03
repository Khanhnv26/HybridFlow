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
  entryPoints: [fileURLToPath(new URL('../src/hooks/useExecutionCompletion.ts', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{ name: 'react', setup(builder) {
    builder.onResolve({ filter: /^react$/ }, args => ({ path: import.meta.resolve(args.path), external: true }));
  } }],
});
const directory = await mkdtemp(join(tmpdir(), 'hybridflow-completion-test-'));
const file = join(directory, 'completion.mjs');
await writeFile(file, bundle.outputFiles[0].text);
const { useExecutionCompletion } = await import(pathToFileURL(file).href);
await unlink(file); await rmdir(directory);
let renderer, visible;
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); renderer = null; });
function Probe({ flowId = 'one', run = null, initialized = true }) { visible = useExecutionCompletion(flowId, run, initialized); return null; }
async function update(props) { await act(async () => renderer.update(React.createElement(Probe, props))); }
async function mount(context, props) {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  globalThis.document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  await act(async () => { renderer = create(React.createElement(Probe, props)); });
}

test('old history is not replayed, new fast completions remain visible for two seconds without restarting every poll', async context => {
  await mount(context, { run: { id: 'old', status: 'SUCCESS' } });
  assert.equal(visible, false);
  await update({ run: { id: 'new', status: 'SUCCESS' } });
  assert.equal(visible, true);
  await act(async () => context.mock.timers.tick(1000));
  await update({ run: { id: 'new', status: 'SUCCESS' } });
  await act(async () => context.mock.timers.tick(1000));
  assert.equal(visible, false);
});

test('completion after RUNNING is acknowledged and changing flows cancels the previous effect', async context => {
  await mount(context, { run: { id: 'running', status: 'RUNNING' } });
  assert.equal(visible, false);
  await update({ run: { id: 'running', status: 'CONFLICT' } });
  assert.equal(visible, true);
  await update({ flowId: 'two', run: { id: 'other-old', status: 'SUCCESS' } });
  assert.equal(visible, false);
});

test('a completion received while hidden is acknowledged when the tab becomes visible', async context => {
  await mount(context, {});
  document.visibilityState = 'hidden';
  await update({ run: { id: 'fast', status: 'SUCCESS' } });
  await act(async () => context.mock.timers.tick(10000));
  assert.equal(visible, false);
  document.visibilityState = 'visible';
  await act(async () => document.dispatchEvent(new Event('visibilitychange')));
  assert.equal(visible, true);
  await act(async () => context.mock.timers.tick(2000));
  assert.equal(visible, false);
});
