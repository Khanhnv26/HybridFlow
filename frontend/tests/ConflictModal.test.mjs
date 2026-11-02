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
  entryPoints: [
    fileURLToPath(new URL('../src/components/nocode/ConflictModal.tsx', import.meta.url)),
  ],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  jsx: 'automatic',
  plugins: [
    {
      name: 'external-react',
      setup(builder) {
        builder.onResolve({ filter: /^(?:react(?:\/.*)?|lucide-react)$/ }, (args) => ({
          path: import.meta.resolve(args.path),
          external: true,
        }));
      },
    },
  ],
});
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'hybridflow-history-test-'));
const bundlePath = join(temporaryDirectory, 'ConflictModal.mjs');
await writeFile(bundlePath, bundle.outputFiles[0].text);
const { ConflictModal } = await import(pathToFileURL(bundlePath).href);
await unlink(bundlePath);
await rmdir(temporaryDirectory);
let renderer;
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  renderer = null;
});
function text(node) {
  return typeof node === 'string' ? node : (node.children || []).map(text).join('');
}
test('literal SOURCE and DESTINATION are submitted as values, not interpreted as actions', async () => {
  const received = [];
  const conflict = {
    id: 1,
    recordId: '1',
    columnName: 'status',
    valueA: 'OTHER',
    valueB: 'OTHER2',
    candidatesJson: JSON.stringify({
      'Same [a / Data]': 'SOURCE',
      'Same [b / Data]': 'DESTINATION',
    }),
  };
  await act(async () => {
    renderer = create(
      React.createElement(ConflictModal, {
        isOpen: true,
        conflict,
        remainingCount: 1,
        onClose: () => {},
        onSendTelegramTest: async () => {},
        onResolve: async (value) => received.push(value),
      }),
    );
  });
  const choices = renderer.root
    .findAllByType('button')
    .filter((button) => text(button).startsWith('Giữ theo'));
  assert.equal(choices.length, 2);
  await act(async () => choices[0].props.onClick());
  await act(async () => choices[1].props.onClick());
  assert.deepEqual(received, ['SOURCE', 'DESTINATION']);
});
