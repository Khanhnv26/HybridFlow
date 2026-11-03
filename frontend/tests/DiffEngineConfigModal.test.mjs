import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { build } from 'esbuild';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const bundle = await build({ entryPoints: [fileURLToPath(new URL('../src/components/orchestration/DiffEngineConfigModal.tsx', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic',
  plugins: [{ name: 'externals', setup(builder) {
    builder.onResolve({ filter: /^(?:react(?:\/.*)?|lucide-react)$/ }, args => ({ path: import.meta.resolve(args.path), external: true }));
  } }],
});
const directory = await mkdtemp(join(tmpdir(), 'hybridflow-diff-ui-'));
const path = join(directory, 'Diff.mjs');
await writeFile(path, bundle.outputFiles[0].text);
const { DiffEngineConfigModal } = await import(pathToFileURL(path).href);
await unlink(path); await rmdir(directory);
const text = node => typeof node === 'string' ? node : (node.children || []).map(text).join('');
const button = (ui, label) => ui.root.findAllByType('button').find(node => text(node).includes(label));
const data = { uniqueKey: 'id', sharedColumns: 'status, price', conflictPolicy: 'ASK_TELEGRAM' };
const sheet = price => ({ headers: ['id', 'status', 'price'], rows: [{ id: '00123', status: 'SHIPPING', price }], totalRows: 1 });
const sources = [{ id: 'a', name: 'Kho Hà Nội', sheetName: 'Orders', data: sheet('10') }, { id: 'b', name: 'Kho Đà Nẵng', sheetName: 'Orders', data: sheet('20') }];
const props = overrides => ({ data: structuredClone(data), sources, availableColumns: ['id', 'status', 'price'], disabled: false,
  onSave: async () => {}, onClose() {}, onReadSource: async id => sheet(id === 'a' ? '10' : '20'), ...overrides });

test('comparison edits remain a draft and Cancel does not mutate configuration', async () => {
  let ui, saved = 0, closed = 0;
  const original = structuredClone(data);
  try {
    await act(async () => { ui = create(React.createElement(DiffEngineConfigModal, props({ data: original, onSave: async () => saved++, onClose: () => closed++ }))); });
    await act(async () => ui.root.findByProps({ 'aria-label': 'Kiểu cột price' }).props.onChange({ target: { value: 'NUMBER' } }));
    await act(async () => ui.root.findByProps({ 'aria-label': 'Cách xử lý khi dữ liệu khác nhau' }).props.onChange({ target: { value: 'SOURCE_WINS' } }));
    assert.deepEqual(original, data);
    assert.equal(saved, 0);
    assert.match(text(ui.root), /Lần chạy tiếp theo sẽ yêu cầu xác nhận/);
    await act(async () => button(ui, 'Hủy').props.onClick());
    assert.equal(closed, 1); assert.equal(saved, 0);
  } finally { if (ui) await act(async () => ui.unmount()); }
});

test('failed saves retain the draft and retry submits the same numeric column', async () => {
  let ui, attempts = 0, closed = 0;
  const saves = [];
  try {
    await act(async () => { ui = create(React.createElement(DiffEngineConfigModal, props({ onClose: () => closed++, onSave: async value => {
      saves.push(value); if (++attempts === 1) throw new Error('Mất kết nối');
    } }))); });
    await act(async () => ui.root.findByProps({ 'aria-label': 'Kiểu cột price' }).props.onChange({ target: { value: 'NUMBER' } }));
    await act(async () => button(ui, 'Lưu cấu hình').props.onClick());
    assert.match(text(ui.root), /Mất kết nối/); assert.equal(closed, 0);
    assert.equal(ui.root.findByProps({ 'aria-label': 'Kiểu cột price' }).props.value, 'NUMBER');
    await act(async () => button(ui, 'Lưu cấu hình').props.onClick());
    assert.equal(closed, 1); assert.deepEqual(saves[0], saves[1]);
    assert.deepEqual(saves[1].columnTypes, { price: 'NUMBER' });
  } finally { if (ui) await act(async () => ui.unmount()); }
});

test('preview reads actual sources with draft types and displays one source at a time', async () => {
  let ui, saves = 0; const reads = [];
  try {
    await act(async () => { ui = create(React.createElement(DiffEngineConfigModal, props({ onSave: async () => saves++, onReadSource: async (id, types, signal) => {
      reads.push({ id, types, signal }); return sheet(id === 'a' ? '100' : '200');
    } }))); });
    await act(async () => ui.root.findByProps({ 'aria-label': 'Kiểu cột price' }).props.onChange({ target: { value: 'NUMBER' } }));
    await act(async () => button(ui, 'Xem dữ liệu mẫu').props.onClick());
    assert.equal(saves, 0); assert.equal(reads.length, 2);
    assert.deepEqual(reads[0].types, { price: 'NUMBER' });
    assert.match(text(ui.root), /Kho Hà Nội: đã đọc 1 dòng/);
    await act(async () => ui.root.findByProps({ 'aria-label': 'Bảng tính xem mẫu' }).props.onChange({ target: { value: 'b' } }));
    assert.match(text(ui.root), /Kho Đà Nẵng: đã đọc 1 dòng/);
    assert.equal(text(ui.root).includes('Khớp dữ liệu'), false);
  } finally { if (ui) await act(async () => ui.unmount()); }
});

test('a missing column identifies the source before saving and close aborts a pending preview', async () => {
  let ui, saves = 0, closed = 0, signal, finish;
  try {
    await act(async () => { ui = create(React.createElement(DiffEngineConfigModal, props({
      sources: [{ ...sources[0], data: { ...sheet('10'), headers: ['id', 'status'] } }],
      onSave: async () => saves++, onClose: () => closed++, onReadSource: async (_id, _types, nextSignal) => { signal = nextSignal; return new Promise(resolve => { finish = resolve; }); },
    }))); });
    await act(async () => button(ui, 'Lưu cấu hình').props.onClick());
    assert.match(text(ui.root), /Kho Hà Nội chưa có cột: price/); assert.equal(saves, 0);
    await act(async () => button(ui, 'Xem dữ liệu mẫu').props.onClick());
    await act(async () => ui.root.findByProps({ 'aria-label': 'Đóng' }).props.onClick());
    assert.equal(closed, 1); assert.equal(signal.aborted, true);
    await act(async () => finish(sheet('10')));
  } finally { if (ui) await act(async () => ui.unmount()); }
});
