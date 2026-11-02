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
  entryPoints: [fileURLToPath(new URL('../src/hooks/useSheetReads.ts', import.meta.url))],
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
const bundlePath = join(temporaryDirectory, 'useSheetReads.mjs');
await writeFile(bundlePath, bundle.outputFiles[0].text);
const { useSheetReads } = await import(pathToFileURL(bundlePath).href);
await unlink(bundlePath);
await rmdir(temporaryDirectory);
let renderer, reads;
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  renderer = null;
});
function Probe({ reader }) {
  reads = useSheetReads(reader);
  return null;
}
async function mount(reader) {
  await act(async () => {
    renderer = create(React.createElement(Probe, { reader }));
  });
}
const a = { nodeId: 'a', spreadsheetId: 'file-a', sheetName: 'Data' };
const b = { nodeId: 'b', spreadsheetId: 'file-b', sheetName: 'Data' };
const result = (id, count = 1) => ({
  spreadsheetId: id,
  sheetName: 'Data',
  headers: ['id'],
  rows: [],
  totalRows: count,
});
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

test('a read error is distinct from never read and does not replace another sources data', async () => {
  await mount(async (source) => {
    if (source.nodeId === 'b') throw new Error('Không có quyền đọc file');
    return result('file-a', 7);
  });
  assert.equal(reads.stateFor(a).status, 'idle');
  await act(async () => {
    await reads.read(a);
  });
  await act(async () => {
    await assert.rejects(reads.read(b));
  });
  assert.equal(reads.stateFor(a).data.totalRows, 7);
  assert.equal(reads.stateFor(b).status, 'error');
  assert.equal(reads.stateFor(b).error, 'Không có quyền đọc file');
  assert.equal(reads.stateFor(b).data, null);
});
test('loading is per source and a late previous request cannot replace the newest result', async () => {
  const old = deferred(),
    latest = deferred();
  let call = 0;
  await mount(() => (++call === 1 ? old.promise : latest.promise));
  let first, second;
  await act(async () => {
    first = reads.read(a);
  });
  assert.equal(reads.stateFor(a).status, 'loading');
  assert.equal(reads.stateFor(b).status, 'idle');
  await act(async () => {
    second = reads.read(a);
    latest.resolve(result('file-a', 9));
    await second;
  });
  await act(async () => {
    old.resolve(result('file-a', 2));
    await first;
  });
  assert.equal(reads.stateFor(a).data.totalRows, 9);
});
test('changing file or tab uses a separate state even for the same canvas node', async () => {
  await mount(async (source) => result(source.spreadsheetId));
  await act(async () => {
    await reads.read(a);
  });
  assert.equal(reads.stateFor({ ...a, spreadsheetId: 'another-file' }).status, 'idle');
  assert.equal(reads.stateFor({ ...a, sheetName: 'Another tab' }).status, 'idle');
});
test('a failed refresh removes editable old data but retains the last successful timestamp', async () => {
  let fail = false;
  await mount(async () => {
    if (fail) throw new Error('Hết phiên Google');
    return result('file-a', 0);
  });
  await act(async () => {
    await reads.read(a);
  });
  const timestamp = reads.stateFor(a).readAt;
  assert.equal(reads.stateFor(a).status, 'success');
  fail = true;
  await act(async () => {
    await assert.rejects(reads.read(a));
  });
  assert.equal(reads.stateFor(a).status, 'error');
  assert.equal(reads.stateFor(a).data, null);
  assert.equal(reads.stateFor(a).readAt, timestamp);
});
test('invalidating after sync prevents in-flight reads from restoring stale data', async () => {
  const pending = deferred();
  await mount(() => pending.promise);
  let promise;
  await act(async () => {
    promise = reads.read(a);
    reads.invalidate();
  });
  await act(async () => {
    pending.resolve(result('file-a'));
    await promise;
  });
  assert.equal(reads.stateFor(a).status, 'idle');
});
