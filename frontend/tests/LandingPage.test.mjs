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
        builder.onResolve({ filter: /^(?:react(?:\/.*)?|lenis)$/ }, args => ({
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
  assert.match(output, /Biến Google Sheets thành/);
  assert.match(output, /trung tâm vận hành tự động/);
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

test('LandingPage includes standard Google OAuth login endpoints', async () => {
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(LandingPage));
  });

  const links = renderer.root.findAllByType('a');
  const googleLoginLinks = links.filter(a => a.props.href === '/api/v1/auth/login/google');
  assert.ok(googleLoginLinks.length >= 2, 'Should have multiple accessible Google OAuth login buttons');

  renderer.unmount();
});
