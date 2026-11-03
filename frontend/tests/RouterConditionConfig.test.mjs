import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { build } from 'esbuild';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const bundle = await build({
  entryPoints: [fileURLToPath(new URL('../src/components/orchestration/RouterConditionConfigModal.tsx', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic',
  plugins: [{ name: 'external-react', setup(builder) {
    builder.onResolve({ filter: /^(?:react(?:\/.*)?|lucide-react)$/ }, args => ({ path: import.meta.resolve(args.path), external: true }));
  } }],
});
const directory = await mkdtemp(join(tmpdir(), 'hybridflow-router-test-'));
const path = join(directory, 'router.mjs');
await writeFile(path, bundle.outputFiles[0].text);
const { RouterConditionConfigModal } = await import(pathToFileURL(path).href);
await unlink(path); await rmdir(directory);

test('saving a router uses the execution contract and preserves exact comparison values', async () => {
  let saved, ui;
  try {
    await act(async () => { ui = create(React.createElement(RouterConditionConfigModal, {
      data: { routerTriggerOn: 'UPDATED', routerMatchMode: 'ANY', routerConditions: [{ columnName: 'status', operator: 'EQUALS', value: ' READY ' }] },
      availableColumns: ['id', 'status'], disabled: false, onClose() {}, onSave: async value => { saved = value; },
    })); });
    await act(async () => { ui.root.findAllByType('button').at(-1).props.onClick(); });
    assert.equal(saved.routerTriggerOn, 'UPDATED');
    assert.equal(saved.routerMatchMode, 'ANY');
    assert.deepEqual(saved.routerConditions, [{ columnName: 'status', operator: 'EQUALS', value: ' READY ' }]);
  } finally { if (ui) await act(async () => ui.unmount()); }
});
