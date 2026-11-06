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
globalThis.__switcherApi = {
  moduleService: { list: async id => modules.filter(item => item.workspaceId === id) },
  tenantWorkflowService: { list: async id => workflows.filter(item => item.workspaceId === id) },
};
const bundle = await build({
  stdin: { contents: `export { WorkflowSwitcher } from './src/components/workspace/WorkflowSwitcher';
    export { ModuleWorkflowPicker } from './src/components/workspace/ModuleWorkflowPicker';`, resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'tsx' },
  bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic',
  plugins: [{ name: 'boundaries', setup(builder) {
    builder.onResolve({ filter: /services\/api$/ }, () => ({ path: 'api', namespace: 'switcher-api' }));
    builder.onLoad({ filter: /.*/, namespace: 'switcher-api' }, () => ({ contents: 'export const moduleService = globalThis.__switcherApi.moduleService; export const tenantWorkflowService = globalThis.__switcherApi.tenantWorkflowService;' }));
    builder.onResolve({ filter: /^(?:react(?:\/.*)?|lucide-react)$/ }, args => ({ path: import.meta.resolve(args.path), external: true }));
  } }],
});
const directory = await mkdtemp(join(tmpdir(), 'hybridflow-switcher-'));
const path = join(directory, 'Switcher.mjs');
await writeFile(path, bundle.outputFiles[0].text);
const { WorkflowSwitcher, ModuleWorkflowPicker } = await import(pathToFileURL(path).href);
await unlink(path); await rmdir(directory);
let renderer;
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); renderer = undefined; });
const text = node => typeof node === 'string' ? node : (node.children || []).map(text).join('');
const button = label => renderer.root.findByProps({ role: 'dialog' }).findAllByType('button').find(node => text(node).includes(label));
const field = label => renderer.root.findAllByType('input').find(node => node.props['aria-label'] === label);
const navigation = overrides => ({
  workspaces: [{ id: 'w1', name: 'Kinh doanh', role: 'OWNER' }, { id: 'w2', name: 'Tài chính', role: 'EDITOR' }],
  selectedWorkspaceId: 'w1', modules: [modules[0]], selectedModuleId: 'm1', workflows: [workflows[0]], selectedWorkflowId: 'f1',
  onCreateWorkspace: async () => {}, onCreateModule: async () => {}, onCreateWorkflow: async () => {}, onLogout() {},
  onSelectWorkspace() { throw Error('Browsing must not change the active workspace'); },
  onSelectModule() { throw Error('Browsing must not change the active module'); }, onSelectWorkflow() {},
  ...overrides,
});
async function mount(overrides) {
  await act(async () => { renderer = create(React.createElement(WorkflowSwitcher, { navigation: navigation(overrides) })); });
  await act(async () => renderer.root.findByProps({ 'aria-haspopup': 'dialog' }).props.onClick());
}

test('browsing another workspace leaves the editor intact and commits the exact workflow once selected', async () => {
  const opened = [];
  await mount({ onNavigate: (...ids) => opened.push(ids) });
  assert.equal(renderer.root.findAllByProps({ role: 'dialog' }).length, 1);
  assert.equal(renderer.root.findAllByProps({ placeholder: 'Nhập tên…' }).length, 0);
  await act(async () => button('Tài chính').props.onClick());
  assert.deepEqual(opened, []);
  assert.ok(button('Kế toán'));
  assert.equal(button('Đồng bộ đơn'), undefined);
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
  await mount({ createModuleInWorkspace: async (id, name) => { created.push([id, name]); throw Error('Không thể tạo module'); } });
  await act(async () => button('Tài chính').props.onClick());
  await act(async () => renderer.root.findByProps({ 'aria-label': 'Tạo module' }).props.onClick());
  assert.ok(renderer.root.findAllByType('p').some(node => text(node).includes('workspace Tài chính')));
  await act(async () => field('Tên module').props.onChange({ target: { value: 'Chi phí' } }));
  await act(async () => renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  assert.deepEqual(created, [['w2', 'Chi phí']]);
  assert.equal(field('Tên module').props.value, 'Chi phí');
  assert.ok(text(renderer.root.findByProps({ role: 'alert' })).includes('Không thể tạo module'));
});

test('the editor picker honors a requested module and workflow instead of the first available item', async () => {
  modules.unshift({ id: 'm0', workspaceId: 'w2', name: 'Module đầu tiên', enabled: true });
  workflows.unshift({ flowId: 'f0', workspaceId: 'w2', moduleId: 'm0', name: 'Luồng đầu tiên', definitionVersion: 1 });
  const props = {
    workspace: { id: 'w2', name: 'Tài chính', role: 'EDITOR' },
    workspaceNavigation: { ...navigation({}), navigationTarget: { moduleId: 'm2', workflowId: 'f2' } },
    children: workflow => React.createElement('p', { 'data-workflow': workflow.id }, workflow.name),
  };
  try {
    await act(async () => { renderer = create(React.createElement(ModuleWorkflowPicker, props)); });
    assert.equal(renderer.root.findByProps({ 'data-workflow': 'f2' }).children[0], 'Báo cáo');
  } finally { modules.shift(); workflows.shift(); }
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

test('disabled workflows display a disabled indicator in the switcher list', async () => {
  workflows.push({ flowId: 'f3', workspaceId: 'w1', moduleId: 'm1', name: 'Đơn hàng nháp', definitionVersion: 1, enabled: false });
  try {
    await mount();
    assert.ok(button('Đơn hàng nháp (tắt)'));
  } finally {
    workflows.pop();
  }
});
