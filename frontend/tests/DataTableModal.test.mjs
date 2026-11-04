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
  entryPoints: [fileURLToPath(new URL('../src/components/nocode/DataTableModal.tsx', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic',
  plugins: [{ name: 'external-react', setup(builder) {
    builder.onResolve({ filter: /^(?:react(?:\/.*)?|lucide-react)$/ }, args => ({ path: import.meta.resolve(args.path), external: true }));
  } }],
});
const directory = await mkdtemp(join(tmpdir(), 'hybridflow-table-'));
const path = join(directory, 'Table.mjs');
await writeFile(path, bundle.outputFiles[0].text);
const { DataTableModal } = await import(pathToFileURL(path).href);
await unlink(path); await rmdir(directory);
let renderer;
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); renderer = undefined; });
const text = node => typeof node === 'string' ? node : (node.children || []).map(text).join('');
const control = label => renderer.root.findByProps({ 'aria-label': label });
const input = () => renderer.root.findByType('textarea');
const key = (value, extra = {}) => ({ key: value, preventDefault() {}, stopPropagation() {}, ...extra });
async function mount(overrides = {}) {
  const props = { isOpen: true, onClose() {}, data: { spreadsheetId: 'file-a', sheetName: "O'Brien", headers: ['id', 'status'], rows: [{ id: '01', status: 'OPEN' }, { id: '02', status: 'PENDING' }], totalRows: 2 }, isLoading: false,
    sources: [{ id: 'a', number: 1, spreadsheetId: 'file-a', sheetName: "O'Brien" }], selectedSourceId: 'a', onSelectSource() {}, onRefresh() {}, onUpdateCell: async () => {}, ...overrides };
  await act(async () => { renderer = create(React.createElement(DataTableModal, props)); });
  return props;
}
async function edit(value, row = 2) {
  await act(async () => control(`Sửa status dòng ${row}`).props.onClick());
  await act(async () => input().props.onChange({ target: { value } }));
}

test('inline edit waits for Enter, preserves literal text, and addresses the correct sheet, column and row', async () => {
  const writes = [];
  await mount({ onUpdateCell: async (...args) => writes.push(args) });
  await edit('  CANCELLED\nKiểm tra  ', 3);
  assert.equal(writes.length, 0);
  await act(async () => input().props.onKeyDown(key('Enter', { shiftKey: true })));
  assert.equal(writes.length, 0);
  await act(async () => input().props.onKeyDown(key('Enter')));
  assert.deepEqual(writes, [["'O''Brien'!B3", '  CANCELLED\nKiểm tra  ']]);
  assert.equal(renderer.root.findAllByType('textarea').length, 0);
  assert.ok(text(renderer.root.findByProps({ role: 'status' })).includes('Đã lưu status · dòng 3'));
});

test('empty strings can be saved; cancel and unchanged values never write', async () => {
  const writes = [];
  await mount({ onUpdateCell: async (...args) => writes.push(args) });
  await edit('CANCELLED');
  await act(async () => renderer.root.findByProps({ role: 'dialog' }).props.onKeyDown(key('Escape')));
  assert.equal(writes.length, 0);
  await edit('OPEN');
  await act(async () => control('Lưu status dòng 2').props.onClick());
  assert.equal(writes.length, 0);
  await edit('');
  await act(async () => control('Lưu status dòng 2').props.onClick());
  assert.deepEqual(writes, [["'O''Brien'!B2", '']]);
});

test('a failed save keeps the draft and allows retrying the same value', async () => {
  let attempts = 0;
  await mount({ onUpdateCell: async () => { if (++attempts === 1) throw Error('Không có quyền ghi'); } });
  await edit('CANCELLED');
  await act(async () => control('Lưu status dòng 2').props.onClick());
  assert.equal(input().props.value, 'CANCELLED');
  assert.ok(text(renderer.root.findByProps({ role: 'alert' })).includes('Không có quyền ghi'));
  assert.equal(control('Lưu status dòng 2').props.disabled, false);
  await act(async () => control('Lưu status dòng 2').props.onClick());
  assert.equal(attempts, 2);
  assert.equal(renderer.root.findAllByType('textarea').length, 0);
});

test('an in-flight write is submitted once and keeps the editor visible during the subsequent source refresh', async () => {
  let finish, writes = 0;
  const props = await mount({ onUpdateCell: () => { writes++; return new Promise(resolve => { finish = resolve; }); } });
  await edit('CANCELLED');
  await act(async () => { void input().props.onKeyDown(key('Enter')); void control('Lưu status dòng 2').props.onClick(); });
  assert.equal(writes, 1);
  assert.equal(control('Đóng').props.disabled, true);
  assert.equal(renderer.root.findByProps({ id: 'table-source' }).props.disabled, true);
  assert.equal(control('Hủy sửa status dòng 2').props.disabled, true);
  await act(async () => renderer.update(React.createElement(DataTableModal, { ...props, data: null, isLoading: true })));
  assert.equal(input().props.value, 'CANCELLED');
  assert.equal(input().props.disabled, true);
  await act(async () => finish());
});

test('switching sources discards the old unsaved draft', async () => {
  const props = await mount();
  await edit('CANCELLED');
  await act(async () => renderer.update(React.createElement(DataTableModal, { ...props, selectedSourceId: 'b', data: { ...props.data, spreadsheetId: 'file-b', sheetName: 'Other' } })));
  assert.equal(renderer.root.findAllByType('textarea').length, 0);
});
