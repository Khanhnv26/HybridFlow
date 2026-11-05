import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRoute, syncOAuthRedirect } from '../src/router.ts';

test('resolveRoute returns landing for root and landing paths', () => {
  assert.equal(resolveRoute('/', ''), 'landing');
  assert.equal(resolveRoute('', ''), 'landing');
  assert.equal(resolveRoute('/landing', ''), 'landing');
  assert.equal(resolveRoute('/landing/', ''), 'landing');
  assert.equal(resolveRoute('/', '?view=landing'), 'landing');
  assert.equal(resolveRoute('/', '?page=landing'), 'landing');
});

test('resolveRoute returns workspace for app and workspace paths', () => {
  assert.equal(resolveRoute('/app', ''), 'workspace');
  assert.equal(resolveRoute('/app/', ''), 'workspace');
  assert.equal(resolveRoute('/workspace', ''), 'workspace');
  assert.equal(resolveRoute('/workspace/', ''), 'workspace');
  assert.equal(resolveRoute('/', '?view=app'), 'workspace');
  assert.equal(resolveRoute('/', '?page=app'), 'workspace');
  assert.equal(resolveRoute('/', '?view=workspace'), 'workspace');
  assert.equal(resolveRoute('/', '?page=workspace'), 'workspace');
});

test('syncOAuthRedirect forwards root to /app when OAuth is pending', () => {
  const previousWindow = globalThis.window;
  const previousSessionStorage = globalThis.sessionStorage;

  const storage = new Map();
  storage.set('hf_login_pending', '1');

  globalThis.sessionStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, val) => storage.set(key, val),
    removeItem: key => storage.delete(key),
  };

  let replacedPath = '';
  globalThis.window = {
    location: { pathname: '/' },
    history: {
      replaceState: (_state, _title, url) => {
        replacedPath = url;
      },
    },
  };

  try {
    const redirected = syncOAuthRedirect();
    assert.equal(redirected, true);
    assert.equal(replacedPath, '/app');
    assert.equal(storage.has('hf_login_pending'), false);
  } finally {
    globalThis.window = previousWindow;
    globalThis.sessionStorage = previousSessionStorage;
  }
});

test('syncOAuthRedirect does not redirect when no OAuth is pending', () => {
  const previousWindow = globalThis.window;
  const previousSessionStorage = globalThis.sessionStorage;

  globalThis.sessionStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };

  let replaced = false;
  globalThis.window = {
    location: { pathname: '/' },
    history: {
      replaceState: () => {
        replaced = true;
      },
    },
  };

  try {
    const redirected = syncOAuthRedirect();
    assert.equal(redirected, false);
    assert.equal(replaced, false);
  } finally {
    globalThis.window = previousWindow;
    globalThis.sessionStorage = previousSessionStorage;
  }
});
