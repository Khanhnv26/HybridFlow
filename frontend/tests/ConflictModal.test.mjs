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
const baseProps = () => ({
  isOpen: true,
  remainingCount: 1,
  onClose: () => {},
  onSendTelegramTest: async () => {},
});
async function mount(conflict, overrides = {}) {
  await act(async () => {
    renderer = create(
      React.createElement(ConflictModal, {
        ...baseProps(),
        conflict,
        onResolve: async () => {},
        ...overrides,
      }),
    );
  });
}
const radios = () => renderer.root.findAllByProps({ type: 'radio' });
const applyButton = () =>
  renderer.root
    .findAllByType('button')
    .find(
      (button) =>
        text(button).includes('Áp dụng giá trị đã chọn') || text(button).includes('Đang áp dụng'),
    );
const legacyConflict = () => ({
  id: 1,
  recordId: '1',
  columnName: 'status',
  valueA: 'SOURCE',
  valueB: 'DESTINATION',
});
const structuredConflict = () => ({
  id: 2,
  recordId: 'SP01',
  columnName: 'stock',
  baseValue: '111',
  endpointsJson: JSON.stringify([
    { spreadsheetId: 'file-one', spreadsheetTitle: 'Kho Hà Nội', sheetName: 'Tồn kho' },
    { spreadsheetId: 'file-two', spreadsheetTitle: 'Kho Sài Gòn', sheetName: 'Tồn kho' },
    { spreadsheetId: 'file-three', spreadsheetTitle: 'Kho Đà Nẵng', sheetName: 'Tồn kho' },
  ]),
  observationsJson: JSON.stringify({
    '8:file-oneTồn kho': '2000',
    '8:file-twoTồn kho': '111',
    '10:file-threeTồn kho': '100000',
  }),
});

test('selection does not write until apply, including literal SOURCE and DESTINATION values', async () => {
  const received = [];
  await mount(legacyConflict(), { onResolve: async (value) => received.push(value) });
  assert.equal(applyButton().props.disabled, true);
  assert.equal(
    radios().some((radio) => radio.props.checked),
    false,
  );
  await act(async () => radios()[0].props.onChange());
  assert.deepEqual(received, []);
  await act(async () => applyButton().props.onClick());
  await act(async () => radios()[1].props.onChange());
  await act(async () => applyButton().props.onClick());
  assert.deepEqual(received, ['SOURCE', 'DESTINATION']);
});

test('three sources remain individually selectable and the preview names the value and target count', async () => {
  const received = [];
  await mount(structuredConflict(), { onResolve: async (value) => received.push(value) });
  assert.equal(radios().length, 3);
  for (const name of ['Kho Hà Nội', 'Kho Sài Gòn', 'Kho Đà Nẵng'])
    assert.match(text(renderer.root), new RegExp(name));
  assert.match(text(renderer.root), /Giống bản gốc/);
  await act(async () => radios()[2].props.onChange());
  assert.deepEqual(received, []);
  const footer = text(renderer.root.findByType('footer'));
  assert.match(footer, /Kho Đà Nẵng/);
  assert.match(footer, /3 trang tính: 100000/);
  await act(async () => applyButton().props.onClick());
  assert.deepEqual(received, ['100000']);
});

test('empty strings can be selected and applied rather than treated as no selection', async () => {
  const received = [];
  await mount(
    { ...legacyConflict(), valueA: '' },
    { onResolve: async (value) => received.push(value) },
  );
  await act(async () => radios()[0].props.onChange());
  assert.equal(applyButton().props.disabled, false);
  assert.match(text(renderer.root.findByType('footer')), /\(trống\)/);
  await act(async () => applyButton().props.onClick());
  assert.deepEqual(received, ['']);
});

test('a failed apply preserves the selected source, explains the error and permits retry', async () => {
  let calls = 0;
  await mount(structuredConflict(), {
    onResolve: async () => {
      if (++calls === 1) throw new Error('Dữ liệu đã đổi. Chạy lại đồng bộ.');
    },
  });
  await act(async () => radios()[1].props.onChange());
  await act(async () => applyButton().props.onClick());
  assert.equal(radios()[1].props.checked, true);
  assert.match(text(renderer.root.findByProps({ role: 'alert' })), /Dữ liệu đã đổi/);
  assert.equal(applyButton().props.disabled, false);
  await act(async () => applyButton().props.onClick());
  assert.equal(calls, 2);
});

test('an in-flight apply blocks duplicate submissions and changing the choice or closing', async () => {
  let complete,
    calls = 0;
  const pending = new Promise((resolve) => {
    complete = resolve;
  });
  await mount(structuredConflict(), {
    onResolve: async () => {
      calls++;
      await pending;
    },
  });
  await act(async () => radios()[0].props.onChange());
  await act(async () => {
    const submit = applyButton().props.onClick;
    submit();
    submit();
  });
  assert.equal(calls, 1);
  assert.equal(applyButton().props.disabled, true);
  assert.equal(
    radios().every((radio) => radio.props.disabled),
    true,
  );
  assert.equal(renderer.root.findByProps({ 'aria-label': 'Đóng' }).props.disabled, true);
  await act(async () => {
    complete();
    await pending;
  });
});

test('moving to the next conflict clears the choice so it cannot be applied accidentally', async () => {
  await mount(structuredConflict());
  await act(async () => radios()[0].props.onChange());
  await act(async () =>
    renderer.update(
      React.createElement(ConflictModal, {
        ...baseProps(),
        conflict: { ...structuredConflict(), id: 3 },
        onResolve: async () => {},
      }),
    ),
  );
  assert.equal(applyButton().props.disabled, true);
  assert.equal(
    radios().some((radio) => radio.props.checked),
    false,
  );
});

test('old label/value conflicts retain their choices without displaying raw IDs in action buttons', async () => {
  const received = [];
  await mount(
    {
      ...legacyConflict(),
      candidatesJson: JSON.stringify({
        'Same [a / Data]': 'SOURCE',
        'Same [b / Data]': 'DESTINATION',
      }),
    },
    { onResolve: async (value) => received.push(value) },
  );
  assert.equal(radios().length, 2);
  const buttonLabels = renderer.root.findAllByType('button').map(text).join(' ');
  assert.doesNotMatch(buttonLabels, /Same \[a/);
  await act(async () => radios()[1].props.onChange());
  await act(async () => applyButton().props.onClick());
  assert.deepEqual(received, ['DESTINATION']);
});
