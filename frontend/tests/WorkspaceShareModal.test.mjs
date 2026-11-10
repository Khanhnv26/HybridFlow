import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { build } from 'esbuild';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const memberApi = {};
const inviteApi = {};
globalThis.__shareModalMemberApi = memberApi;
globalThis.__shareModalInviteApi = inviteApi;

const bundle = await build({
  entryPoints: [fileURLToPath(new URL('../src/components/workspace/WorkspaceShareModal.tsx', import.meta.url))],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  jsx: 'automatic',
  plugins: [
    {
      name: 'test-boundaries',
      setup(builder) {
        builder.onResolve({ filter: /services\/api$/ }, () => ({ path: 'api', namespace: 'test-api' }));
        builder.onLoad({ filter: /.*/, namespace: 'test-api' }, () => ({
          contents: `export const memberService = globalThis.__shareModalMemberApi;
export const invitationService = globalThis.__shareModalInviteApi;`,
        }));
        builder.onResolve({ filter: /^(?:react(?:\/.*)?|lucide-react)$/ }, (args) => ({
          path: import.meta.resolve(args.path),
          external: true,
        }));
      },
    },
  ],
});

const directory = await mkdtemp(join(tmpdir(), 'hybridflow-share-modal-test-'));
const file = join(directory, 'WorkspaceShareModal.mjs');
await writeFile(file, bundle.outputFiles[0].text);
const { WorkspaceShareModal } = await import(pathToFileURL(file).href);
await unlink(file);
await rmdir(directory);

let renderer;
const originalWindow = globalThis.window;

afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  renderer = null;
  globalThis.window = originalWindow;
});

const text = (node) => (typeof node === 'string' ? node : (node.children || []).map(text).join(''));

test('renders members list and allows owner to invite new member via email', async () => {
  const members = [
    { workspaceId: 'ws-1', userId: 'u1', email: 'owner@example.com', displayName: 'Owner User', role: 'OWNER', joinedAt: '2026-11-01' },
    { workspaceId: 'ws-1', userId: 'u2', email: 'editor@example.com', displayName: 'Editor User', role: 'EDITOR', joinedAt: '2026-11-02' },
  ];

  let listCalled = 0;
  memberApi.list = async () => {
    listCalled++;
    return members;
  };

  let invitedEmail = '';
  let invitedRole = '';
  inviteApi.create = async (_ws, email, role) => {
    invitedEmail = email;
    invitedRole = role;
    return { id: 'inv-1', inviteUrl: 'http://localhost:3000/#invite=tok123', expiresAt: '2026-11-12' };
  };

  await act(async () => {
    renderer = create(
      React.createElement(WorkspaceShareModal, {
        workspaceId: 'ws-1',
        workspaceName: 'Kinh Doanh',
        currentUserRole: 'OWNER',
        currentUserId: 'u1',
        isOpen: true,
        onClose: () => {},
      })
    );
  });

  assert.equal(listCalled, 1);
  const renderedText = text(renderer.root);
  assert.match(renderedText, /Owner User/);
  assert.match(renderedText, /Editor User/);
  assert.match(renderedText, /Chủ sở hữu/);

  const emailInput = renderer.root.findByProps({ id: 'share-email-input' });
  await act(async () => {
    emailInput.props.onChange({ target: { value: 'colleague@example.com' } });
  });

  const form = renderer.root.findByType('form');
  await act(async () => {
    form.props.onSubmit({ preventDefault() {} });
  });

  assert.equal(invitedEmail, 'colleague@example.com');
  assert.equal(invitedRole, 'EDITOR');
  assert.match(text(renderer.root), /Đã tạo lời mời cho colleague@example.com/);
});

test('owner can change member role and remove member', async () => {
  const members = [
    { workspaceId: 'ws-1', userId: 'u1', email: 'owner@example.com', displayName: 'Owner', role: 'OWNER', joinedAt: '2026-11-01' },
    { workspaceId: 'ws-1', userId: 'u2', email: 'dev@example.com', displayName: 'Dev', role: 'VIEWER', joinedAt: '2026-11-02' },
  ];

  memberApi.list = async () => members;

  let changedUserId = '';
  let changedRole = '';
  memberApi.changeRole = async (_ws, userId, role) => {
    changedUserId = userId;
    changedRole = role;
  };

  let removedUserId = '';
  memberApi.remove = async (_ws, userId) => {
    removedUserId = userId;
  };

  await act(async () => {
    renderer = create(
      React.createElement(WorkspaceShareModal, {
        workspaceId: 'ws-1',
        workspaceName: 'Dự án',
        currentUserRole: 'OWNER',
        currentUserId: 'u1',
        isOpen: true,
        onClose: () => {},
      })
    );
  });

  const roleSelect = renderer.root.findByProps({ 'aria-label': 'Đổi vai trò của dev@example.com' });
  await act(async () => {
    roleSelect.props.onChange({ target: { value: 'EDITOR' } });
  });

  assert.equal(changedUserId, 'u2');
  assert.equal(changedRole, 'EDITOR');

  const removeButton = renderer.root.findByProps({ 'aria-label': 'Xóa thành viên dev@example.com' });
  await act(async () => {
    removeButton.props.onClick();
  });

  assert.equal(removedUserId, 'u2');
});

test('viewer sees read-only permissions and cannot invite or modify roles', async () => {
  const members = [
    { workspaceId: 'ws-1', userId: 'u1', email: 'owner@example.com', displayName: 'Owner', role: 'OWNER', joinedAt: '2026-11-01' },
    { workspaceId: 'ws-1', userId: 'u2', email: 'viewer@example.com', displayName: 'Viewer', role: 'VIEWER', joinedAt: '2026-11-02' },
  ];

  memberApi.list = async () => members;

  await act(async () => {
    renderer = create(
      React.createElement(WorkspaceShareModal, {
        workspaceId: 'ws-1',
        workspaceName: 'Dự án',
        currentUserRole: 'VIEWER',
        currentUserId: 'u2',
        isOpen: true,
        onClose: () => {},
      })
    );
  });

  assert.equal(renderer.root.findAllByType('form').length, 0);
  assert.equal(renderer.root.findAllByProps({ 'aria-label': 'Đổi vai trò của viewer@example.com' }).length, 0);
  assert.match(text(renderer.root), /Chỉ Chủ sở hữu mới có quyền gửi lời mời/);
});

test('renders Google avatar image when provided for current user or member', async () => {
  const members = [
    { workspaceId: 'ws-1', userId: 'u1', email: 'vankhanhak54@gmail.com', displayName: 'Khánh Nguyễn Văn', role: 'OWNER', joinedAt: '2026-11-01' },
    { workspaceId: 'ws-1', userId: 'u2', email: 'colleague@gmail.com', displayName: 'Colleague', avatarUrl: 'https://lh3.googleusercontent.com/colleague', role: 'EDITOR', joinedAt: '2026-11-02' },
  ];
  memberApi.list = async () => members;

  await act(async () => {
    renderer = create(
      React.createElement(WorkspaceShareModal, {
        workspaceId: 'ws-1',
        workspaceName: 'Test',
        currentUserRole: 'OWNER',
        currentUserId: 'u1',
        currentUserAvatarUrl: 'https://lh3.googleusercontent.com/khanh',
        isOpen: true,
        onClose: () => {},
      })
    );
  });

  const images = renderer.root.findAllByType('img');
  assert.equal(images.length, 2);
  assert.equal(images[0].props.src, 'https://lh3.googleusercontent.com/khanh');
  assert.equal(images[1].props.src, 'https://lh3.googleusercontent.com/colleague');
});

