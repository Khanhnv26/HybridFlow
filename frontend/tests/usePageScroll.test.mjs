import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { build } from 'esbuild';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const bundle = await build({
  entryPoints: [fileURLToPath(new URL('../src/hooks/usePageScroll.ts', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{ name: 'scroll-boundaries', setup(builder) {
    builder.onResolve({ filter: /^react$/ }, args => ({ path: import.meta.resolve(args.path), external: true }));
    builder.onResolve({ filter: /^lenis$/ }, () => ({ path: 'lenis', namespace: 'scroll-test' }));
    builder.onLoad({ filter: /.*/, namespace: 'scroll-test' }, () => ({ contents: `export default class Lenis {
      constructor(options) { this.options = options; this.destroyed = 0; globalThis.__scrollProbe.instances.push(this); }
      destroy() { this.destroyed++; }
    }` }));
  } }],
});
const directory = await mkdtemp(join(tmpdir(), 'hybridflow-scroll-'));
const file = join(directory, 'usePageScroll.mjs');
await writeFile(file, bundle.outputFiles[0].text);
const { usePageScroll } = await import(pathToFileURL(file).href);
await rm(directory, { recursive: true });

async function withPage({ reduced = false, height = 1200, overflowOnly = false }, check) {
  const previous = { window: globalThis.window, document: globalThis.document, ResizeObserver: globalThis.ResizeObserver };
  const motion = Object.assign(new EventTarget(), { matches: reduced });
  const win = Object.assign(new EventTarget(), { requestAnimationFrame() {}, matchMedia: () => motion, innerHeight: 800 });
  const doc = { documentElement: { scrollHeight: height } };
  const probe = { instances: [], disconnected: false };
  globalThis.__scrollProbe = probe;
  globalThis.window = win;
  globalThis.document = doc;
  globalThis.ResizeObserver = class { observe() {} disconnect() { probe.disconnected = true; } };
  const page = { current: {} };
  function Harness() { usePageScroll(page, overflowOnly); return null; }
  let renderer;
  try {
    await act(async () => { renderer = create(React.createElement(Harness)); });
    await check({ motion, win, doc, probe, unmount: async () => { await act(async () => renderer.unmount()); renderer = null; } });
  } finally {
    if (renderer) await act(async () => renderer.unmount());
    Object.assign(globalThis, previous);
    delete globalThis.__scrollProbe;
  }
}

test('smooth scrolling follows reduced-motion changes and preserves nested table scroll', async () => {
  await withPage({ reduced: true }, async ({ motion, probe }) => {
    assert.equal(probe.instances.length, 0);
    motion.matches = false;
    motion.dispatchEvent(new Event('change'));
    assert.equal(probe.instances.length, 1);
    const options = probe.instances[0].options;
    assert.equal(options.autoRaf, true);
    assert.equal(options.lerp, .1);
    assert.equal(options.anchors.offset, -96);
    assert.equal(options.prevent({ closest: () => ({}) }), true);
    assert.equal(options.prevent({ closest: () => null }), false);
    motion.matches = true;
    motion.dispatchEvent(new Event('change'));
    assert.equal(probe.instances[0].destroyed, 1);
  });
});

test('login only smooths when content overflows and cleans up when it fits again', async () => {
  await withPage({ height: 700, overflowOnly: true }, async ({ doc, win, probe }) => {
    assert.equal(probe.instances.length, 0);
    doc.documentElement.scrollHeight = 1000;
    win.dispatchEvent(new Event('resize'));
    assert.equal(probe.instances.length, 1);
    doc.documentElement.scrollHeight = 700;
    win.dispatchEvent(new Event('resize'));
    assert.equal(probe.instances[0].destroyed, 1);
  });
});

test('unmount destroys the Lenis loop and removes observers and event listeners', async () => {
  await withPage({}, async ({ probe, motion, win, unmount }) => {
    assert.equal(probe.instances.length, 1);
    await unmount();
    assert.equal(probe.instances[0].destroyed, 1);
    assert.equal(probe.disconnected, true);
    motion.dispatchEvent(new Event('change'));
    win.dispatchEvent(new Event('resize'));
    assert.equal(probe.instances.length, 1);
  });
});
