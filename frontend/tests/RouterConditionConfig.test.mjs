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

const text = node => typeof node === 'string' ? node : (node.children || []).map(text).join('');
test('router preview counts only the selected Sheet and explains the actual destinations', async () => {
  let ui;
  const rows = Array.from({ length: 4 }, (_, index) => ({ id: 'ORD-00' + (index + 1), status: 'SHIPPING' }));
  try {
    await act(async () => { ui = create(React.createElement(RouterConditionConfigModal, {
      data: { routerConditions: [{ columnName: 'status', operator: 'EQUALS', value: 'SHIPPING' }] },
      availableColumns: ['id', 'status'], disabled: false, onClose() {}, onSave: async () => {}, actionNames: ['Vận hành', 'Quản lý'],
      previewRows: [...rows, ...rows, ...rows],
      previewSources: [{ id: 'a', name: 'Kho Hà Nội', rows }, { id: 'b', name: 'Kho Đà Nẵng', rows: rows.map((row, index) => index ? row : { ...row, status: 'CANCELLED' }) }, { id: 'c', name: 'Kho Sài Gòn', rows }],
    })); });
    assert.match(text(ui.root), /Kho Hà Nội: 4\/4 dòng phù hợp/);
    assert.equal(text(ui.root).includes('12/12'), false);
    assert.match(text(ui.root), /chuyển dòng tới Vận hành, Quản lý/);
    assert.equal(ui.root.findAllByProps({ 'aria-label': 'Cách kết hợp các điều kiện' }).length, 0);
    await act(async () => ui.root.findByProps({ 'aria-label': 'Bảng tính dùng để thử' }).props.onChange({ target: { value: 'b' } }));
    assert.match(text(ui.root), /Kho Đà Nẵng: 3\/4 dòng phù hợp/);
  } finally { if (ui) await act(async () => ui.unmount()); }
});

test('multiple router conditions use plain-language choices while preserving ANY semantics on save', async () => {
  let ui, saved;
  try {
    await act(async () => { ui = create(React.createElement(RouterConditionConfigModal, {
      data: { routerTriggerOn: 'UPDATED', routerConditions: [{ columnName: 'status', operator: 'EQUALS', value: 'SHIPPING' }] },
      availableColumns: ['id', 'status'], disabled: false, onClose() {}, onSave: async settings => { saved = settings; },
    })); });
    await act(async () => ui.root.findAllByType('button').find(node => text(node).includes('Thêm điều kiện')).props.onClick());
    await act(async () => ui.root.findByProps({ 'aria-label': 'Cách kết hợp các điều kiện' }).props.onChange({ target: { value: 'ANY' } }));
    await act(async () => ui.root.findAllByType('button').at(-1).props.onClick());
    assert.equal(saved.routerMatchMode, 'ANY'); assert.equal(saved.routerTriggerOn, 'UPDATED'); assert.equal(saved.routerConditions.length, 2);
    assert.equal(text(ui.root).includes('snapshot'), false);
  } finally { if (ui) await act(async () => ui.unmount()); }
});
