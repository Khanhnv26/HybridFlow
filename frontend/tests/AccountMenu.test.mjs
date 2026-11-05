import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const bundle = await build({
  entryPoints: [fileURLToPath(new URL('../src/components/orchestration/AccountMenu.tsx', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic',
  plugins: [{ name: 'external', setup(builder) {
    builder.onResolve({ filter: /^(react(?:\/.*)?|lucide-react)$/ }, args => ({ path: import.meta.resolve(args.path), external: true }));
  } }],
});
const { AccountMenu } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const user = { id: '1', displayName: 'Nguyễn Minh Anh', email: 'minhanh@example.com' };

test('account opens real identity and workspace role; logout happens only on explicit click', () => {
  let loggedOut = 0;
  let renderer;
  try {
    act(() => { renderer = create(React.createElement(AccountMenu, { user, workspaceRole: 'OWNER', workspaceName: 'Vận hành', onLogout: () => loggedOut++ })); });
    const trigger = renderer.root.findByType('button');
    assert.equal(trigger.props['aria-expanded'], false);
    assert.equal(renderer.root.findAllByType('section').length, 0);
    assert.match(JSON.stringify(renderer.toJSON()), /NA/);
    act(() => trigger.props.onClick());
    const content = JSON.stringify(renderer.toJSON());
    assert.match(content, /Nguyễn Minh Anh/);
    assert.match(content, /minhanh@example.com/);
    assert.match(content, /Chủ sở hữu/);
    assert.match(content, /Vận hành/);
    assert.equal(loggedOut, 0);
    act(() => renderer.root.findByType('section').findByType('button').props.onClick());
    assert.equal(loggedOut, 1);
    assert.equal(renderer.root.findAllByType('section').length, 0);
  } finally { if (renderer) act(() => renderer.unmount()); }
});

test('Escape closes the account and returns keyboard focus to its trigger', () => {
  const previous = globalThis.window;
  globalThis.window = new EventTarget();
  let focused = false;
  let renderer;
  try {
    act(() => { renderer = create(React.createElement(AccountMenu, { user }), { createNodeMock: element => element.type === 'button' ? { focus: () => { focused = true; } } : null }); });
    act(() => renderer.root.findByType('button').props.onClick());
    const escape = new Event('keydown', { cancelable: true });
    Object.defineProperty(escape, 'key', { value: 'Escape' });
    act(() => window.dispatchEvent(escape));
    assert.equal(renderer.root.findAllByType('section').length, 0);
    assert.equal(focused, true);
    assert.equal(escape.defaultPrevented, true);
  } finally { if (renderer) act(() => renderer.unmount()); globalThis.window = previous; }
});

test('an account without display name uses email and exposes no unavailable actions', () => {
  let renderer;
  try {
    act(() => { renderer = create(React.createElement(AccountMenu, { user: { ...user, displayName: '  ' } })); });
    assert.equal(renderer.root.findByType('button').props['aria-label'], 'Tài khoản: minhanh@example.com');
    act(() => renderer.root.findByType('button').props.onClick());
    assert.equal(renderer.root.findByType('section').findAllByType('button').length, 0);
  } finally { if (renderer) act(() => renderer.unmount()); }
});
