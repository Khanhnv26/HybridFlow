import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { build } from 'esbuild';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const api = {};
globalThis.__workspaceConnectionModalApi = api;

const bundle = await build({
  entryPoints: [fileURLToPath(new URL('../src/components/workspace/WorkspaceConnectionsModal.tsx', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic',
  plugins: [{ name: 'test-boundaries', setup(builder) {
    builder.onResolve({ filter: /services\/api$/ }, () => ({ path: 'api', namespace: 'test-api' }));
    builder.onLoad({ filter: /.*/, namespace: 'test-api' }, () => ({
      contents: 'export const workspaceConnectionService = globalThis.__workspaceConnectionModalApi;',
    }));
    builder.onResolve({ filter: /^(?:react(?:\/.*)?|lucide-react)$/ }, args => ({ path: import.meta.resolve(args.path), external: true }));
  } }],
});

const directory = await mkdtemp(join(tmpdir(), 'hybridflow-connection-modal-test-'));
const file = join(directory, 'WorkspaceConnectionsModal.mjs');
await writeFile(file, bundle.outputFiles[0].text);
const { WorkspaceConnectionsModal } = await import(pathToFileURL(file).href);
await unlink(file); await rmdir(directory);

let renderer;
const originalWindow = globalThis.window;
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  renderer = null;
  globalThis.window = originalWindow;
});

test('Google popup opens before authorization request and accepts only its expected callback origin', async context => {
  context.mock.timers.enable({ apis: ['setInterval'] });
  const browser = new EventTarget();
  const popup = { closed: false, location: { href: '' }, close() { this.closed = true; } };
  const order = [];
  browser.open = () => { order.push('open'); return popup; };
  globalThis.window = browser;
  let loads = 0, changed = 0;
  api.list = async () => { loads++; return []; };
  api.startGoogleOAuth = async () => { order.push('request'); return { url: 'https://accounts.example/authorize', callbackOrigin: 'http://localhost:8080' }; };
  await act(async () => { renderer = create(React.createElement(WorkspaceConnectionsModal,
    { workspaceId: 'ws', userRole: 'OWNER', onClose() {}, onConnectionsChanged() { changed++; } })); });
  await act(async () => button('Kết nối Google Account').props.onClick());
  assert.deepEqual(order, ['open', 'request']);
  assert.equal(popup.location.href, 'https://accounts.example/authorize');
  const dispatch = (origin, source, data) => browser.dispatchEvent(Object.assign(new Event('message'), { origin, source, data }));
  await act(async () => dispatch('https://wrong.example', popup, { type: 'WORKSPACE_GOOGLE_CONNECTED', connectionId: 'foreign' }));
  assert.equal(changed, 0);
  await act(async () => dispatch('http://localhost:8080', {}, { type: 'WORKSPACE_GOOGLE_CONNECTED', connectionId: 'foreign' }));
  assert.equal(changed, 0);
  await act(async () => dispatch('http://localhost:8080', popup, { type: 'WORKSPACE_GOOGLE_CONNECTED', connectionId: 'gconn-selected' }));
  assert.equal(changed, 1);
  assert.ok(loads >= 2);
  assert.equal(popup.closed, true);
  assert.match(text(renderer.root), /Đã thêm kết nối Google vào workspace/);
});

test('unmount cancels Google popup polling and closes the pending popup', async context => {
  context.mock.timers.enable({ apis: ['setInterval'] });
  const browser = new EventTarget();
  const popup = { closed: false, location: { href: '' }, close() { this.closed = true; } };
  browser.open = () => popup;
  globalThis.window = browser;
  let loads = 0;
  api.list = async () => { loads++; return []; };
  api.startGoogleOAuth = async () => ({ url: 'https://accounts.example/authorize', callbackOrigin: 'http://localhost:8080' });
  await act(async () => { renderer = create(React.createElement(WorkspaceConnectionsModal,
    { workspaceId: 'ws', userRole: 'OWNER', onClose() {} })); });
  await act(async () => button('Kết nối Google Account').props.onClick());
  await act(async () => renderer.unmount()); renderer = null;
  const count = loads;
  await act(async () => context.mock.timers.tick(3000));
  assert.equal(loads, count);
  assert.equal(popup.closed, true);
});

function text(node) {
  return typeof node === 'string' ? node : (node.children || []).map(text).join('');
}

function button(label) {
  return renderer.root.findAllByType('button').find(node => text(node).includes(label));
}

test('renders connections list with status badges and usage count without manager actions for viewer', async () => {
  api.list = async () => [
    { id: 'conn-1', name: 'Kho Google', provider: 'GOOGLE', state: 'ACTIVE', usageCount: 2 },
    { id: 'conn-2', name: 'Bot Kho', provider: 'TELEGRAM', state: 'REVOKED', usageCount: 0 },
  ];

  await act(async () => {
    renderer = create(React.createElement(WorkspaceConnectionsModal, {
      workspaceId: 'ws-1',
      userRole: 'VIEWER',
      onClose: () => {},
    }));
  });

  const content = text(renderer.root);
  assert.match(content, /Kho Google/);
  assert.match(content, /ACTIVE/);
  assert.match(content, /Đang dùng trong 2 workflow/);
  assert.match(content, /Bot Kho/);
  assert.match(content, /REVOKED/);
  assert.equal(button('Cấp Editor'), undefined);
  assert.equal(button('Thu hồi'), undefined);
  assert.equal(button('Thêm Bot Telegram'), undefined);
});

test('owner can grant editor role to active connection', async () => {
  const grants = [];
  api.list = async () => [
    { id: 'conn-1', name: 'Kho Google', provider: 'GOOGLE', state: 'ACTIVE', usageCount: 1 },
  ];
  api.grantRole = async (wsId, connId, role) => {
    grants.push([wsId, connId, role]);
  };

  await act(async () => {
    renderer = create(React.createElement(WorkspaceConnectionsModal, {
      workspaceId: 'ws-1',
      userRole: 'OWNER',
      onClose: () => {},
    }));
  });

  const grantBtn = button('Cấp Editor');
  assert.ok(grantBtn);
  await act(async () => grantBtn.props.onClick());

  assert.deepEqual(grants, [['ws-1', 'conn-1', 'EDITOR']]);
  assert.match(text(renderer.root), /Đã cấp quyền dùng kết nối cho Editor/);
});

test('manager can revoke connection', async () => {
  const revokes = [];
  api.list = async () => [
    { id: 'conn-1', name: 'Kho Google', provider: 'GOOGLE', state: 'ACTIVE', usageCount: 1 },
  ];
  api.revoke = async (wsId, connId) => {
    revokes.push([wsId, connId]);
  };

  await act(async () => {
    renderer = create(React.createElement(WorkspaceConnectionsModal, {
      workspaceId: 'ws-1',
      userRole: 'ADMIN',
      onClose: () => {},
    }));
  });

  const revokeBtn = button('Thu hồi');
  assert.ok(revokeBtn);
  await act(async () => revokeBtn.props.onClick());

  assert.deepEqual(revokes, [['ws-1', 'conn-1']]);
  assert.match(text(renderer.root), /Đã thu hồi kết nối/);
});

test('manager can add telegram bot connection', async () => {
  const created = [];
  api.list = async () => [];
  api.createTelegram = async (wsId, name, token) => {
    created.push([wsId, name, token]);
    return { id: 'tconn-new', name, provider: 'TELEGRAM', state: 'ACTIVE', usageCount: 0 };
  };

  await act(async () => {
    renderer = create(React.createElement(WorkspaceConnectionsModal, {
      workspaceId: 'ws-1',
      userRole: 'ADMIN',
      onClose: () => {},
    }));
  });

  const inputs = renderer.root.findAllByType('input');
  const nameInput = inputs.find(node => node.props.placeholder && node.props.placeholder.includes('Tên bot'));
  const tokenInput = inputs.find(node => node.props.placeholder && node.props.placeholder.includes('Bot Token'));

  assert.ok(nameInput);
  assert.ok(tokenInput);

  await act(async () => nameInput.props.onChange({ target: { value: 'Bot Cảnh Báo' } }));
  await act(async () => tokenInput.props.onChange({ target: { value: '123456:secret-token' } }));

  const addBtn = button('Thêm Bot Telegram');
  assert.ok(addBtn);
  await act(async () => addBtn.props.onClick());

  assert.deepEqual(created, [['ws-1', 'Bot Cảnh Báo', '123456:secret-token']]);
  assert.match(text(renderer.root), /Đã thêm kết nối Telegram thành công/);
});
