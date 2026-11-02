import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { build } from 'esbuild';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const api = {};
globalThis.__sheetSourceApi = api;
globalThis.localStorage = { getItem: () => 'test-token' };
const bundle = await build({
  entryPoints: [
    fileURLToPath(
      new URL('../src/components/orchestration/SheetSourceConfig.tsx', import.meta.url),
    ),
  ],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  jsx: 'automatic',
  plugins: [
    {
      name: 'test-boundaries',
      setup(builder) {
        builder.onResolve({ filter: /services\/api$/ }, () => ({
          path: 'api',
          namespace: 'test-api',
        }));
        builder.onLoad({ filter: /.*/, namespace: 'test-api' }, () => ({
          contents: 'export const googleService = globalThis.__sheetSourceApi;',
        }));
        builder.onResolve({ filter: /^(?:react(?:\/.*)?|lucide-react)$/ }, (args) => ({
          path: import.meta.resolve(args.path),
          external: true,
        }));
      },
    },
  ],
});
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'hybridflow-component-test-'));
const bundlePath = join(temporaryDirectory, 'SheetSourceConfig.mjs');
await writeFile(bundlePath, bundle.outputFiles[0].text);
const { SheetSourceConfig } = await import(pathToFileURL(bundlePath).href);
await unlink(bundlePath);
await rmdir(temporaryDirectory);
let renderer;
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  renderer = null;
});
const metadata = (id, title = 'Orders', sheetId = 0) => ({
  spreadsheetId: id,
  title: 'Workbook',
  sheets: [{ sheetId, title }],
});
const data = {
  label: 'Google',
  type: 'sheetsTrigger',
  category: 'trigger',
  subtitle: '',
  spreadsheetId: 'old-file',
  sheetName: 'Orders',
};
function text(node) {
  return typeof node === 'string' ? node : (node.children || []).map(text).join('');
}
function button(label) {
  return renderer.root.findAllByType('button').find((node) => text(node).includes(label));
}
function props(overrides = {}) {
  return {
    data,
    disabled: false,
    connected: true,
    connectionVersion: 0,
    onClose: () => {},
    onConnectGoogle: async () => {},
    onSave: async () => {},
    ...overrides,
  };
}
async function mount(properties) {
  await act(async () => {
    renderer = create(React.createElement(SheetSourceConfig, properties));
  });
}
async function loaded() {
  await act(async () => {
    await delay(450);
  });
}
async function changeLink(value) {
  await act(async () => renderer.root.findByType('input').props.onChange({ target: { value } }));
}

test('draft source drives preview and only the save button commits it', async () => {
  const saved = [],
    reads = [];
  api.getMetadata = async (_token, id) =>
    metadata(id, id === 'old-file' ? 'Orders' : 'Products', id === 'old-file' ? 0 : 42);
  api.readSheet = async (...args) => {
    reads.push(args);
    return { sheetName: 'Products', headers: ['sku'], rows: [{ sku: 'P1' }], totalRows: 1 };
  };
  await mount(
    props({
      onSave: async (source) => {
        saved.push(source);
      },
    }),
  );
  await loaded();
  await changeLink('https://docs.google.com/spreadsheets/d/new-file/edit#gid=42');
  await loaded();
  assert.equal(renderer.root.findByType('select').props.value, 'Products');
  assert.equal(saved.length, 0);
  await act(async () => button('Xem trước dữ liệu').props.onClick());
  assert.deepEqual(reads[0].slice(0, 3), ['test-token', 'new-file', 'Products']);
  assert.equal(saved.length, 0);
  await act(async () => button('Lưu nguồn dữ liệu').props.onClick());
  assert.deepEqual(saved, [
    {
      spreadsheetId: 'new-file',
      spreadsheetTitle: 'Workbook',
      sheetName: 'Products',
      spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/new-file/edit#gid=42',
    },
  ]);
});

test('cancel discards the draft without saving it', async () => {
  let saves = 0,
    closes = 0;
  api.getMetadata = async (_token, id) => metadata(id);
  await mount(
    props({
      onSave: async () => {
        saves++;
      },
      onClose: () => {
        closes++;
      },
    }),
  );
  await changeLink('new-file');
  await act(async () => button('Hủy').props.onClick());
  assert.equal(saves, 0);
  assert.equal(closes, 1);
});

test('late metadata from the previous file cannot overwrite the current dropdown', async () => {
  let resolveOld;
  api.getMetadata = async (_token, id) =>
    id === 'old-file'
      ? new Promise((resolve) => {
          resolveOld = resolve;
        })
      : metadata(id, 'Current', 42);
  await mount(props());
  await loaded();
  await changeLink('https://docs.google.com/spreadsheets/d/new-file/edit#gid=42');
  await loaded();
  await act(async () => resolveOld(metadata('old-file', 'Stale')));
  assert.equal(renderer.root.findByType('select').props.value, 'Current');
  assert.equal(text(renderer.root).includes('Stale'), false);
});

test('a failed save keeps the draft open and displays the server error', async () => {
  api.getMetadata = async (_token, id) => metadata(id);
  await mount(
    props({
      onSave: async () => {
        throw new Error('Save failed');
      },
    }),
  );
  await loaded();
  await act(async () => button('Lưu nguồn dữ liệu').props.onClick());
  assert.equal(text(renderer.root).includes('Save failed'), true);
  assert.equal(renderer.root.findByType('select').props.value, 'Orders');
  assert.equal(button('Lưu nguồn dữ liệu').props.disabled, false);
});

test('connecting Google loads tabs automatically while keeping the entered link', async () => {
  let requests = 0,
    connects = 0;
  api.getMetadata = async (_token, id) => {
    requests++;
    return metadata(id);
  };
  const initial = props({
    connected: false,
    onConnectGoogle: async () => {
      connects++;
    },
  });
  await mount(initial);
  await loaded();
  assert.equal(requests, 0);
  await act(async () => button('Kết nối Google').props.onClick());
  assert.equal(connects, 1);
  await act(async () =>
    renderer.update(
      React.createElement(SheetSourceConfig, { ...initial, connected: true, connectionVersion: 1 }),
    ),
  );
  await loaded();
  assert.equal(requests, 1);
  assert.equal(renderer.root.findByType('select').props.value, 'Orders');
  assert.equal(
    renderer.root.findByType('input').props.value,
    'https://docs.google.com/spreadsheets/d/old-file/edit',
  );
});
