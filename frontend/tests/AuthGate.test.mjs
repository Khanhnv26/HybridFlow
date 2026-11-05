import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { build } from 'esbuild';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

globalThis.__authGateApi = { me: async () => { throw { isAxiosError: true, response: { status: 401 } }; } };
const bundle = await build({
  entryPoints: [fileURLToPath(new URL('../src/components/auth/AuthGate.tsx', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic',
  plugins: [{ name: 'auth-boundary', setup(builder) {
    builder.onResolve({ filter: /services\/api$/ }, () => ({ path: 'api', namespace: 'auth-api' }));
    builder.onLoad({ filter: /.*/, namespace: 'auth-api' }, () => ({ contents: 'export const authService = globalThis.__authGateApi;' }));
    builder.onResolve({ filter: /^(?:react(?:\/.*)?|axios|lucide-react)$/ }, args => ({ path: import.meta.resolve(args.path), external: true }));
  } }],
});
const directory = await mkdtemp(join(tmpdir(), 'hybridflow-auth-test-'));
const file = join(directory, 'AuthGate.mjs');
await writeFile(file, bundle.outputFiles[0].text);
const { AuthGate } = await import(pathToFileURL(file).href);
await rm(directory, { recursive: true });

async function renderAnonymous(search, check) {
  const previous = globalThis.window;
  globalThis.window = Object.assign(new EventTarget(), { location: { search } });
  let renderer;
  try {
    await act(async () => { renderer = create(React.createElement(AuthGate, { children: () => 'Workspace' })); });
    check(renderer);
  } finally {
    if (renderer) await act(async () => renderer.unmount());
    globalThis.window = previous;
  }
}

test('failed Google callback explains token exchange failure after auth/me returns 401', async () => {
  await renderAnonymous('?login=failed&reason=invalid_token_response', renderer => {
    assert.equal(renderer.root.findAllByProps({ role: 'alert' }).length, 1);
    assert.match(JSON.stringify(renderer.toJSON()), /invalid_token_response/);
    assert.match(JSON.stringify(renderer.toJSON()), /Backend không đổi được mã Google/);
  });
});

test('initial anonymous visit shows login without a failure alert', async () => {
  await renderAnonymous('', renderer => {
    assert.equal(renderer.root.findAllByProps({ role: 'alert' }).length, 0);
    const login = renderer.root.findAllByType('a').find(link => link.props.href === '/api/v1/auth/login/google');
    assert.ok(login);
    const previousStorage = globalThis.sessionStorage;
    const storage = new Map();
    globalThis.sessionStorage = { setItem: (key, value) => storage.set(key, value) };
    try {
      login.props.onClick();
      assert.equal(storage.get('hf_login_pending'), '1');
    } finally { globalThis.sessionStorage = previousStorage; }
  });
});

test('unknown failure reason is not reflected in the login page', async () => {
  await renderAnonymous('?login=failed&reason=secret-token', renderer => {
    assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /secret-token/);
    assert.match(JSON.stringify(renderer.toJSON()), /authentication_failed/);
  });
});
