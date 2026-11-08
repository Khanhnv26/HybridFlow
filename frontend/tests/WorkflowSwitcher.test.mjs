import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { build } from 'esbuild';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const modules = [
  { id: 'm1', workspaceId: 'w1', name: 'Đơn hàng', enabled: true },
  { id: 'm2', workspaceId: 'w2', name: 'Kế toán', enabled: true },
];
const workflows = [
  { flowId: 'f1', workspaceId: 'w1', moduleId: 'm1', name: 'Đồng bộ đơn', definitionVersion: 1 },
  { flowId: 'f2', workspaceId: 'w2', moduleId: 'm2', name: 'Báo cáo', definitionVersion: 2 },
];
const workspaces = [{ id: 'w1', name: 'Kinh doanh', role: 'OWNER' }, { id: 'w2', name: 'Tài chính', role: 'EDITOR' }];
globalThis.__switcherApi = {
  workspaceService: { list: async () => workspaces },
  authService: {},
  moduleService: { list: async id => modules.filter(item => item.workspaceId === id) },
  tenantWorkflowService: { list: async id => workflows.filter(item => item.workspaceId === id) },
};
const bundle = await build({
  stdin: { contents: `export { WorkflowSwitcher } from './src/components/workspace/WorkflowSwitcher';
    export { WorkspacePicker } from './src/components/workspace/WorkspacePicker';`, resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'tsx' },
  bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic',
  plugins: [{ name: 'boundaries', setup(builder) {
    builder.onResolve({ filter: /services\/api$/ }, () => ({ path: 'api', namespace: 'switcher-api' }));
    builder.onLoad({ filter: /.*/, namespace: 'switcher-api' }, () => ({
      contents: 'export const { moduleService, tenantWorkflowService, workspaceService, authService } = globalThis.__switcherApi;',
    }));
    builder.onResolve({ filter: /^(?:react(?:\/.*)?|lucide-react)$/ }, args => ({ path: import.meta.resolve(args.path), external: true }));
  } }],
});
const directory = await mkdtemp(join(tmpdir(), 'hybridflow-switcher-'));
const path = join(directory, 'Switcher.mjs');
await writeFile(path, bundle.outputFiles[0].text);
const { WorkflowSwitcher, WorkspacePicker } = await import(pathToFileURL(path).href);
await unlink(path); await rmdir(directory);
let renderer;
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); renderer = undefined; });
const text = node => typeof node === 'string' ? node : (node.children || []).map(text).join('');
const button = label => renderer.root.findByProps({ role: 'dialog' }).findAllByType('button').find(node => text(node).includes(label));
const field = label => renderer.root.findAllByType('input').find(node => node.props['aria-label'] === label);
const navigation = overrides => ({
  workspaces,
  selectedWorkspaceId: 'w1', modules: [modules[0]], selectedModuleId: 'm1', workflows: [workflows[0]], selectedWorkflowId: 'f1',
  onCreateWorkspace: async () => {}, onLogout() {},
  ...overrides,
});
async function mount(overrides) {
  await act(async () => { renderer = create(React.createElement(WorkflowSwitcher, { navigation: navigation(overrides) })); });
  await act(async () => renderer.root.findByProps({ 'aria-haspopup': 'dialog' }).props.onClick());
}

test('browsing another workspace leaves the editor intact and commits the exact workflow once selected', async () => {
  const opened = [];
  await mount({ onNavigate: ({ workspace, moduleId, workflowId }) => opened.push([workspace.id, moduleId, workflowId]) });
  assert.equal(renderer.root.findAllByProps({ role: 'dialog' }).length, 1);
  assert.equal(renderer.root.findAllByProps({ placeholder: 'Nhập tên…' }).length, 0);
  await act(async () => button('Tài chính').props.onClick());
  assert.deepEqual(opened, []);
  assert.ok(button('Kế toán'));
  assert.equal(button('Đồng bộ đơn'), undefined);
  assert.equal(renderer.root.findAllByProps({ 'aria-label': 'Tạo module' }).length, 0);
  assert.equal(renderer.root.findAllByProps({ 'aria-label': 'Tạo workflow' }).length, 0);
  await act(async () => button('Báo cáo').props.onClick());
  assert.deepEqual(opened, [['w2', 'm2', 'f2']]);
  assert.equal(renderer.root.findAllByProps({ role: 'dialog' }).length, 0);
});

test('search accepts Vietnamese without accents and Escape closes the panel', async () => {
  await mount({});
  await act(async () => field('Tìm module').props.onChange({ target: { value: 'don hang' } }));
  assert.ok(button('Đơn hàng'));
  await act(async () => field('Tìm module').props.onChange({ target: { value: 'unknown' } }));
  assert.equal(button('Đơn hàng'), undefined);
  await act(async () => renderer.root.findByProps({ className: 'workflow-switcher min-w-0' }).props.onKeyDown({ key: 'Escape', preventDefault() {}, stopPropagation() {} }));
  assert.equal(renderer.root.findAllByProps({ role: 'dialog' }).length, 0);
});

test('creation uses the browsed parent and retains the name after a failed save', async () => {
  const created = [];
  await mount({
    workspaces: [workspaces[0], { ...workspaces[1], role: 'ADMIN' }],
    createModuleInWorkspace: async (id, name) => { created.push([id, name]); throw Error('Không thể tạo module'); },
  });
  await act(async () => button('Tài chính').props.onClick());
  await act(async () => renderer.root.findByProps({ 'aria-label': 'Tạo module' }).props.onClick());
  assert.ok(renderer.root.findAllByType('p').some(node => text(node).includes('workspace Tài chính')));
  await act(async () => field('Tên module').props.onChange({ target: { value: 'Chi phí' } }));
  await act(async () => renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  assert.deepEqual(created, [['w2', 'Chi phí']]);
  assert.equal(field('Tên module').props.value, 'Chi phí');
  assert.ok(text(renderer.root.findByProps({ role: 'alert' })).includes('Không thể tạo module'));
});

const entryButton = label => renderer.root.findAllByType('button').find(node => text(node).includes(label));
async function mountEntry() {
  await act(async () => {
    renderer = create(React.createElement(WorkspacePicker, {
      user: { id: 'u1', displayName: 'User', email: 'user@example.test' },
      children: nav => React.createElement('p', { 'data-workflow': nav.selectedWorkflowId },
        [nav.selectedWorkspaceId, nav.selectedModuleId, nav.selectedWorkflowId].join('/')),
    }));
  });
}

test('the entry page searches each level and opens only the explicitly selected workflow', async () => {
  await mountEntry();
  assert.equal(renderer.root.findAllByProps({ 'data-workflow': 'f2' }).length, 0);
  assert.equal(field('Tìm module'), undefined);
  await act(async () => field('Tìm workspace').props.onChange({ target: { value: 'tai chinh' } }));
  assert.equal(entryButton('Kinh doanh'), undefined);
  await act(async () => entryButton('Tài chính').props.onClick());
  assert.equal(field('Tìm workflow'), undefined);
  await act(async () => field('Tìm module').props.onChange({ target: { value: 'ke toan' } }));
  await act(async () => entryButton('Kế toán').props.onClick());
  assert.equal(renderer.root.findAllByProps({ 'data-workflow': 'f2' }).length, 0);
  await act(async () => field('Tìm workflow').props.onChange({ target: { value: 'bao cao' } }));
  await act(async () => entryButton('Báo cáo').props.onClick());
  assert.equal(text(renderer.root.findByProps({ 'data-workflow': 'f2' })), 'w2/m2/f2');
});

test('creating a workspace and its first module unlocks workflow creation and opens Studio', async () => {
  const { workspaceService, moduleService, tenantWorkflowService } = globalThis.__switcherApi;
  const originalList = workspaceService.list;
  const writes = [];
  workspaceService.list = async () => [];
  workspaceService.create = async name => { writes.push([name]); return { id: 'new-w', name, role: 'OWNER' }; };
  moduleService.create = async (workspaceId, name) => {
    writes.push([workspaceId, name]);
    return { id: 'new-m', workspaceId, name, enabled: true };
  };
  tenantWorkflowService.create = async (workspaceId, moduleId, name) => {
    writes.push([workspaceId, moduleId, name]);
    return { flowId: 'new-f', workspaceId, moduleId, name, definitionVersion: 1, enabled: true };
  };
  async function submit(label, name) {
    await act(async () => field(label).props.onChange({ target: { value: name } }));
    await act(async () => renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  }
  try {
    await mountEntry();
    await submit('Tên workspace', 'Vận hành');
    await submit('Tên module', 'Kho');
    await submit('Tên workflow', 'Đồng bộ kho');
    assert.deepEqual(writes, [['Vận hành'], ['new-w', 'Kho'], ['new-w', 'new-m', 'Đồng bộ kho']]);
    assert.equal(text(renderer.root.findByProps({ 'data-workflow': 'new-f' })), 'new-w/new-m/new-f');
  } finally {
    workspaceService.list = originalList;
    delete workspaceService.create;
    delete moduleService.create;
    delete tenantWorkflowService.create;
  }
});

test('a late response from a previously browsed workspace cannot replace the current columns', async () => {
  let finish, oldSignal;
  await mount({ loadWorkspaceContent: async (id, signal) => {
    if (id === 'w2') { oldSignal = signal; return new Promise(resolve => { finish = resolve; }); }
    return [modules.filter(item => item.workspaceId === id), workflows.filter(item => item.workspaceId === id)];
  } });
  await act(async () => button('Tài chính').props.onClick());
  await act(async () => button('Kinh doanh').props.onClick());
  assert.equal(oldSignal.aborted, true);
  await act(async () => finish([[modules[1]], [workflows[1]]]));
  assert.ok(button('Đơn hàng'));
  assert.equal(button('Kế toán'), undefined);
});

test('a workflow saved after the switcher closes does not open over the current editor', async () => {
  const opened = [];
  let finish, saving;
  await mount({
    onNavigate: selection => opened.push(selection),
    createWorkflowInModule: () => new Promise(resolve => { finish = resolve; }),
  });
  await act(async () => renderer.root.findByProps({ 'aria-label': 'Tạo workflow' }).props.onClick());
  await act(async () => field('Tên workflow').props.onChange({ target: { value: 'Luồng mới' } }));
  await act(async () => { saving = renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }); });
  await act(async () => renderer.root.findByProps({ 'aria-label': 'Đóng bảng chọn' }).props.onClick());
  await act(async () => {
    finish({ ...workflows[0], flowId: 'f3', name: 'Luồng mới' });
    await saving;
  });
  assert.deepEqual(opened, []);
});

test('disabled workflows display a disabled indicator in the switcher list', async () => {
  workflows.push({ flowId: 'f3', workspaceId: 'w1', moduleId: 'm1', name: 'Đơn hàng nháp', definitionVersion: 1, enabled: false });
  try {
    await mount();
    assert.ok(button('Đơn hàng nháp (tắt)'));
  } finally {
    workflows.pop();
  }
});
