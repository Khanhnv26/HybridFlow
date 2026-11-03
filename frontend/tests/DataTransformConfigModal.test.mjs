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
  stdin: {
    contents: `export { DataTransformConfigModal } from './src/components/orchestration/DataTransformConfigModal';
      export { NodePalette } from './src/components/orchestration/NodePalette';`,
    resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'tsx',
  },
  bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic',
  plugins: [{ name: 'external-react', setup(builder) {
    builder.onResolve({ filter: /^(?:react(?:\/.*)?|lucide-react)$/ }, args => ({ path: import.meta.resolve(args.path), external: true }));
  } }],
});
const directory = await mkdtemp(join(tmpdir(), 'hybridflow-transform-ui-'));
const path = join(directory, 'Transform.mjs');
await writeFile(path, bundle.outputFiles[0].text);
const { DataTransformConfigModal, NodePalette } = await import(pathToFileURL(path).href);
await unlink(path); await rmdir(directory);
let renderer;
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); renderer = null; });
const text = node => typeof node === 'string' ? node : (node.children || []).map(text).join('');
const button = label => renderer.root.findAllByType('button').find(node => text(node) === label);
const checkbox = label => renderer.root.findAllByType('label').find(node => text(node).startsWith(label)).findByType('input');
const sheet = { spreadsheetId: 'sheet', sheetName: 'Data', headers: ['sku'], rows: [{ sku: ' sp01 ' }], totalRows: 1 };
async function mount(overrides = {}) {
  const props = { data: { transforms: [] }, source: sheet, sourceName: 'Kho Hà Nội · Data', connected: true,
    connectionVersion: 0, onConnectGoogle: async () => {}, onRead: async () => sheet, onClose() {}, onSave: async () => {}, disabled: false, ...overrides };
  await act(async () => { renderer = create(React.createElement(DataTransformConfigModal, props)); });
  return props;
}

test('palette enables transformation and keeps unsupported blocks disabled', async () => {
  const added = [];
  await act(async () => { renderer = create(React.createElement(NodePalette, { onAddNode: item => added.push(item) })); });
  const transform = renderer.root.findAllByType('button').find(node => text(node).includes('Chuẩn Hóa Dữ Liệu'));
  assert.equal(transform.props.disabled, false);
  await act(async () => transform.props.onClick());
  assert.equal(added[0].type, 'dataTransform');
  assert.equal(renderer.root.findAllByType('button').find(node => text(node).includes('Webhook')).props.disabled, true);
});
test('draft choices update preview immediately and save in the displayed rule order', async () => {
  let saved;
  await mount({ onSave: async value => { saved = value; } });
  await act(async () => checkbox('Gọn khoảng trắng').props.onChange({ target: { checked: true } }));
  await act(async () => checkbox('IN HOA').props.onChange({ target: { checked: true } }));
  assert.match(text(renderer.root), /"SP01"/);
  await act(async () => renderer.root.findByProps({ 'aria-label': 'Đưa IN HOA lên trong sku' }).props.onClick());
  await act(async () => checkbox('Ghi đè làm sạch').props.onChange({ target: { checked: true } }));
  await act(async () => button('Lưu cấu hình').props.onClick());
  assert.deepEqual(saved, { transforms: [{ columnName: 'sku', rules: ['UPPERCASE', 'TRIM'] }], writeBackCleanData: true });
});
test('failed server save preserves draft and allows retry without closing', async () => {
  let reject, calls = 0, closed = 0;
  await mount({ data: { transforms: [{ columnName: 'sku', rules: ['TRIM'] }] },
    onClose: () => closed++, onSave: () => { calls++; return calls === 1 ? new Promise((_, fail) => { reject = fail; }) : Promise.resolve(); } });
  await act(async () => button('Lưu cấu hình').props.onClick());
  assert.equal(button('Đang lưu…').props.disabled, true);
  assert.equal(button('Hủy').props.disabled, true);
  await act(async () => reject({ response: { data: { message: 'Máy chủ chưa lưu được cấu hình' } } }));
  assert.match(text(renderer.root), /Máy chủ chưa lưu được cấu hình/);
  assert.equal(closed, 0);
  assert.equal(checkbox('Gọn khoảng trắng').props.checked, true);
  await act(async () => button('Lưu cấu hình').props.onClick());
  assert.equal(calls, 2); assert.equal(closed, 1);
});
test('cancel does not modify saved settings and missing columns block save until removed', async () => {
  const data = { transforms: [{ columnName: 'old', rules: ['TRIM'] }] };
  let saves = 0, closes = 0;
  await mount({ data, onSave: async () => { saves++; }, onClose: () => { closes++; } });
  assert.equal(button('Lưu cấu hình').props.disabled, true);
  assert.match(text(renderer.root), /Cột không còn trong Sheet: old/);
  await act(async () => checkbox('Gọn khoảng trắng').props.onChange({ target: { checked: true } }));
  await act(async () => button('Hủy').props.onClick());
  assert.equal(saves, 0); assert.equal(closes, 1);
  assert.deepEqual(data.transforms[0].rules, ['TRIM']);
});
test('opening reads the connected source automatically and cancels the read on close', async () => {
  let signal;
  await mount({ source: undefined, onRead: active => { signal = active; return new Promise(() => {}); } });
  assert.equal(signal.aborted, false);
  assert.match(text(renderer.root), /Đang đọc Sheet/);
  await act(async () => renderer.unmount()); renderer = null;
  assert.equal(signal.aborted, true);
});
test('read errors show the backend message and can be retried', async () => {
  let attempts = 0;
  await mount({ source: undefined, onRead: async () => {
    attempts++; if (attempts === 1) throw { response: { data: { message: 'Không có quyền đọc trang tính' } } }; return sheet;
  } });
  assert.match(text(renderer.root), /Không có quyền đọc trang tính/);
  await act(async () => button('Đọc lại dữ liệu mẫu').props.onClick());
  assert.equal(attempts, 2); assert.equal(checkbox('Gọn khoảng trắng').props.checked, false);
});

test('a refreshed source replaces old preview while keeping the selected rules', async () => {
  const props = await mount({ data: { transforms: [{ columnName: 'sku', rules: ['TRIM'] }] } });
  assert.match(text(renderer.root), /"sp01"/);
  const refreshed = { ...sheet, rows: [{ sku: ' sp02 ' }] };
  await act(async () => renderer.update(React.createElement(DataTransformConfigModal, { ...props, source: refreshed })));
  assert.match(text(renderer.root), /"sp02"/);
  assert.doesNotMatch(text(renderer.root), /"sp01"/);
  assert.equal(checkbox('Gọn khoảng trắng').props.checked, true);
});
