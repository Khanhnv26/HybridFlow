import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { build } from 'esbuild';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const bundle = await build({
  entryPoints: [fileURLToPath(new URL('../src/pages/LandingPage.tsx', import.meta.url))],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  jsx: 'automatic',
  plugins: [
    {
      name: 'landing-externals',
      setup(builder) {
        builder.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }));
        builder.onResolve({ filter: /^(?:react(?:\/.*)?|lenis|lucide-react)$/ }, args => ({
          path: import.meta.resolve(args.path),
          external: true,
        }));
      },
    },
  ],
});

const directory = await mkdtemp(join(tmpdir(), 'hybridflow-landing-test-'));
const file = join(directory, 'LandingPage.mjs');
await writeFile(file, bundle.outputFiles[0].text);
const { LandingPage } = await import(pathToFileURL(file).href);
await rm(directory, { recursive: true });

function collectText(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(collectText).join(' ');
  if (node.children) return collectText(node.children);
  return '';
}

test('LandingPage renders hero headline and marketing value proposition', async () => {
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(LandingPage));
  });
  const output = JSON.stringify(renderer.toJSON());
  assert.match(output, /Hai bảng tính/);
  assert.match(output, /Một nguồn/);
  assert.match(output, /Thuật toán 3-Way Diff/);
  renderer.unmount();
});

test('LandingPage provides 3 industry tabs and updates datasets on click', async () => {
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(LandingPage));
  });

  const buttons = renderer.root.findAllByType('button');
  const eduBtn = buttons.find(b => collectText(b).includes('Trung Tâm & Học Phí'));
  assert.ok(eduBtn, 'Should find Education industry switcher button');

  await act(async () => {
    eduBtn.props.onClick();
  });

  const eduOutput = JSON.stringify(renderer.toJSON());
  assert.match(eduOutput, /Danh_Sach_Hoc_Vien_K24\.xlsx/);
  assert.match(eduOutput, /Ke_Toan_Thu_Hoc_Phi\.xlsx/);

  const opsBtn = renderer.root.findAllByType('button').find(b => collectText(b).includes('Vận Hành SME & Thu Chi'));
  assert.ok(opsBtn, 'Should find Operations industry switcher button');

  await act(async () => {
    opsBtn.props.onClick();
  });

  const opsOutput = JSON.stringify(renderer.toJSON());
  assert.match(opsOutput, /De_Xuat_Chi_Phi_DA\.xlsx/);
  assert.match(opsOutput, /So_Quy_Tien_Mat_T11\.xlsx/);

  renderer.unmount();
});

test('LandingPage interactive scenarios trigger conflict resolution on Telegram', async () => {
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(LandingPage));
  });

  const conflictBtn = renderer.root.findAllByType('button').find(b => collectText(b).includes('Tình huống 2: Sửa trùng nhau'));
  assert.ok(conflictBtn, 'Should find conflict scenario button');

  await act(async () => {
    conflictBtn.props.onClick();
  });

  const conflictOutput = JSON.stringify(renderer.toJSON());
  assert.match(conflictOutput, /Cảnh báo xung đột số liệu!/);
  assert.match(conflictOutput, /Duyệt số của Sale/);

  const resolveSaleBtn = renderer.root.findAllByType('button').find(b => collectText(b).includes('Duyệt số của Sale'));
  assert.ok(resolveSaleBtn, 'Should find resolve conflict button');

  await act(async () => {
    resolveSaleBtn.props.onClick();
  });

  const resolvedOutput = JSON.stringify(renderer.toJSON());
  assert.match(resolvedOutput, /Đã giải quyết tranh chấp an toàn/);

  renderer.unmount();
});

test('LandingPage sends anonymous visitors to the dedicated login page', async () => {
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(LandingPage));
  });

  const links = renderer.root.findAllByType('a');
  const loginLinks = links.filter(a => a.props.href === '/login');
  assert.ok(loginLinks.length >= 3, 'Header and primary calls to action should open the login page');
  assert.equal(links.filter(a => a.props.href === '/api/v1/auth/login/google').length, 0);

  renderer.unmount();
});

test('workflow steps switch the actual setup preview', async () => {
  let renderer;
  await act(async () => { renderer = create(React.createElement(LandingPage)); });
  try {
    const choose = text => renderer.root.findAllByType('button').find(button => collectText(button).includes(text));
    await act(async () => choose('Đặt quy tắc').props.onClick());
    assert.match(JSON.stringify(renderer.toJSON()), /Ghép cột. Giữ dữ liệu khớp/);
    assert.match(JSON.stringify(renderer.toJSON()), /ma_don/);
    await act(async () => choose('Theo dõi & duyệt').props.onClick());
    assert.match(JSON.stringify(renderer.toJSON()), /Mọi thay đổi, trong tầm mắt/);
  } finally { await act(async () => renderer.unmount()); }
});

test('changing industry cancels a pending demo synchronization', async () => {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const pending = new Map();
  globalThis.setTimeout = callback => { const id = Symbol(); pending.set(id, callback); return id; };
  globalThis.clearTimeout = id => pending.delete(id);
  let renderer;
  try {
    await act(async () => { renderer = create(React.createElement(LandingPage)); });
    const choose = text => renderer.root.findAllByType('button').find(button => collectText(button).includes(text));
    await act(async () => choose('Tình huống 1').props.onClick());
    assert.equal(pending.size, 1);
    await act(async () => choose('Trung Tâm & Học Phí').props.onClick());
    assert.equal(pending.size, 0);
    assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /Đã đồng bộ thành công/);
  } finally {
    if (renderer) await act(async () => renderer.unmount());
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});
