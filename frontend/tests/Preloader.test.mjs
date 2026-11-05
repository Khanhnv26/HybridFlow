import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const bundle = await build({
  entryPoints: [fileURLToPath(new URL('../src/components/Preloader.tsx', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic',
  plugins: [{ name: 'react-external', setup(builder) {
    builder.onResolve({ filter: /^react(?:\/.*)?$/ }, args => ({ path: import.meta.resolve(args.path), external: true }));
  } }],
});
const { BootstrapPreloader } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

for (const reduced of [false, true]) {
  test(`opening screen stays visible for 1200ms, reduced motion=${reduced}`, t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const previous = { document: globalThis.document, window: globalThis.window, performance: globalThis.performance };
    const classes = new Set();
    let removed = false;
    const shell = {
      dataset: { startedAt: '100' },
      classList: { add: value => classes.add(value) },
      remove: () => { removed = true; },
      setAttribute() {}, querySelector: () => ({ textContent: '' }),
      addEventListener() {}, removeEventListener() {},
    };
    globalThis.document = { getElementById: id => id === 'app-preloader' ? shell : { querySelector: () => null } };
    globalThis.window = { matchMedia: () => ({ matches: reduced }) };
    globalThis.performance = { now: () => 100 };
    let renderer;
    try {
      act(() => { renderer = create(React.createElement(BootstrapPreloader)); });
      act(() => t.mock.timers.tick(1199));
      assert.equal(removed, false);
      assert.equal(classes.has('app-preloader--leaving'), false);
      act(() => t.mock.timers.tick(1));
      assert.equal(removed, reduced);
      if (!reduced) {
        assert.equal(classes.has('app-preloader--leaving'), true);
        act(() => t.mock.timers.tick(240));
        assert.equal(removed, true);
      }
    } finally {
      if (renderer) act(() => renderer.unmount());
      Object.assign(globalThis, previous);
    }
  });
}
