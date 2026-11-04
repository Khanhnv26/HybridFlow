import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { build } from 'esbuild';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const bundle = await build({
  entryPoints: [fileURLToPath(new URL('../src/hooks/useExitMotion.ts', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{ name: 'external-react', setup(builder) {
    builder.onResolve({ filter: /^react$/ }, args => ({ path: import.meta.resolve(args.path), external: true }));
  } }],
});
const directory = await mkdtemp(join(tmpdir(), 'hybridflow-motion-'));
const path = join(directory, 'Motion.mjs');
await writeFile(path, bundle.outputFiles[0].text);
const { useExitMotion } = await import(pathToFileURL(path).href);
await unlink(path); await rmdir(directory);

async function scenario({ reduced = false, stillConnected = false }, check) {
  const oldWindow = globalThis.window, oldDocument = globalThis.document;
  const frames = [], snapshots = [], changes = new Set();
  let finish;
  const media = { matches: reduced, addEventListener: (_name, callback) => changes.add(callback), removeEventListener: (_name, callback) => changes.delete(callback) };
  const snapshot = { id: 'original-dialog', style: {}, classList: { add() {} }, setAttribute(name, value) { this[name] = value; }, removeAttribute(name) { delete this[name]; }, querySelectorAll: () => [], querySelector: () => null,
    remove() { this.removed = true; }, animate() { return { finished: new Promise(resolve => { finish = resolve; }) }; } };
  const element = { isConnected: true, animate() {}, getBoundingClientRect: () => ({ left: 10, top: 20, width: 400, height: 300 }), cloneNode: () => snapshot, querySelectorAll: () => [] };
  globalThis.window = { matchMedia: () => media, getComputedStyle: () => ({ transform: 'none' }), addEventListener() {}, removeEventListener() {}, requestAnimationFrame: callback => frames.push(callback), setTimeout, clearTimeout };
  globalThis.document = { hidden: false, body: { appendChild: node => snapshots.push(node) } };
  function Surface() { return React.createElement('div', { ref: useExitMotion(true, 'popover') }); }
  let renderer;
  try {
    await act(async () => { renderer = create(React.createElement(Surface), { createNodeMock: () => element }); });
    element.isConnected = stillConnected;
    await act(async () => renderer.unmount()); renderer = undefined;
    frames.forEach(callback => callback());
    await check({ frames, snapshots, snapshot, changes, finish: () => finish?.(), media });
  } finally {
    if (finish) { finish(); await Promise.resolve(); }
    if (renderer) await act(async () => renderer.unmount());
    globalThis.window = oldWindow; globalThis.document = oldDocument;
  }
}

test('closing removes the live component immediately and the visual copy cannot receive input or keep IDs', async () => {
  await scenario({}, async ({ snapshots, snapshot, finish, changes }) => {
    assert.equal(snapshots.length, 1);
    assert.equal(snapshot.inert, true);
    assert.equal(snapshot['aria-hidden'], 'true');
    assert.equal(snapshot.id, undefined);
    assert.equal(snapshot.style.left, '10px');
    finish(); await Promise.resolve();
    assert.equal(snapshot.removed, true);
    assert.equal(changes.size, 0);
  });
});

test('reduced motion closes immediately without creating visual copies or scheduling animation frames', async () => {
  await scenario({ reduced: true }, ({ snapshots, frames }) => {
    assert.equal(snapshots.length, 0);
    assert.equal(frames.length, 0);
  });
});

test('effect replay while the original element remains mounted never creates a duplicate overlay', async () => {
  await scenario({ stillConnected: true }, ({ snapshots }) => assert.equal(snapshots.length, 0));
});
