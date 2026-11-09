import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { build } from 'esbuild';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Bundle workflow.ts
const workflowBundle = await build({
  entryPoints: [fileURLToPath(new URL('../src/services/workflow.ts', import.meta.url))],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { workflowConfig, flowIdFor } = await import(
  'data:text/javascript;base64,' + Buffer.from(workflowBundle.outputFiles[0].text).toString('base64')
);

// Bundle tenantEditor.ts
const editorBundle = await build({
  entryPoints: [fileURLToPath(new URL('../src/services/tenantEditor.ts', import.meta.url))],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { createTenantEditorApi } = await import(
  'data:text/javascript;base64,' + Buffer.from(editorBundle.outputFiles[0].text).toString('base64')
);

// --- Part 1: Workflow compilation & identity tests ---
test('validates webhookTrigger -> sheetWriteAction workflow graph', async () => {
  const nodes = [
    { id: 'wh-1', type: 'webhookTrigger', data: { label: 'Webhook' } },
    {
      id: 'sw-1',
      type: 'sheetWriteAction',
      data: {
        label: 'Ghi về bảng tính',
        targetSpreadsheetId: 'sheet-tgt-1',
        targetSheetName: 'Danh sách học viên',
        targetKeyColumn: 'student_id',
        sourceKeyColumn: 'student_id',
      },
    },
  ];
  const edges = [
    { source: 'wh-1', sourceHandle: 'out', target: 'sw-1', targetHandle: 'in' },
  ];

  const config = workflowConfig(nodes, edges);
  assert.equal(config.type, 'webhookAppend');
  assert.equal(config.webhookNodeId, 'wh-1');
  assert.equal(config.sheetWriteNodeId, 'sw-1');
  assert.equal(config.spreadsheetId, 'sheet-tgt-1');
  assert.equal(config.sheetName, 'Danh sách học viên');

  const flowId = await flowIdFor(config);
  assert.match(flowId, /^flow-wh-[0-9a-f]{32}$/);

  // Flow ID is deterministic
  const flowId2 = await flowIdFor(config);
  assert.equal(flowId, flowId2);
});

test('rejects disconnected or malformed webhook edge', () => {
  const nodes = [
    { id: 'wh-1', type: 'webhookTrigger', data: { label: 'Webhook' } },
    { id: 'sw-1', type: 'sheetWriteAction', data: { label: 'Ghi về bảng tính' } },
  ];
  // Wrong handle
  const edges = [
    { source: 'wh-1', sourceHandle: 'wrong', target: 'sw-1', targetHandle: 'in' },
  ];
  assert.throws(
    () => workflowConfig(nodes, edges),
    /Nối cổng Ra của Webhook vào cổng Vào của khối Ghi về bảng tính/
  );
});

// --- Part 2: TenantEditor Webhook API tests ---
test('tenantEditor provides webhook operations and saves connection bindings in webhook mode', async () => {
  const calls = [];
  const fakeClient = {
    get: async (url, config) => {
      calls.push(['get', url, config]);
      if (url.endsWith('/webhook')) {
        return {
          data: {
            workflowId: 'wf-test',
            webhookToken: 'token-xyz-123',
            webhookUrl: 'https://api.hybridflow.vn/api/v1/webhooks/token-xyz-123',
            enabled: true,
            sampleFields: ['student_id', 'full_name', 'email'],
          },
        };
      }
      return { data: { definitionVersion: 1 } };
    },
    post: async (url, data, config) => {
      calls.push(['post', url, data, config]);
      if (url.endsWith('/webhook/rotate')) {
        return { data: { webhookToken: 'token-rotated-456', enabled: true } };
      }
      if (url.endsWith('/webhook/preview-append')) {
        return { data: { valid: true, changes: [], duplicateTargetKeys: [] } };
      }
      return { data: {} };
    },
    put: async (url, data, config) => {
      calls.push(['put', url, data, config]);
      if (url.endsWith('/webhook/status')) {
        return { data: { webhookToken: 'token-xyz-123', enabled: data.enabled } };
      }
      return { data: { definitionVersion: 2 } };
    },
    delete: async (url) => {
      calls.push(['delete', url]);
      return { data: {} };
    },
  };

  const api = createTenantEditorApi(fakeClient, 'ws-123', 'wf-456');

  // Test webhook.get()
  const info = await api.webhook.get();
  assert.equal(info.webhookToken, 'token-xyz-123');
  assert.equal(calls[0][1], '/workspaces/ws-123/workflows/wf-456/webhook');

  // Test webhook.rotate()
  const rotated = await api.webhook.rotate();
  assert.equal(rotated.webhookToken, 'token-rotated-456');

  // Test webhook.updateStatus()
  const disabled = await api.webhook.updateStatus(false);
  assert.equal(disabled.enabled, false);

  // Test webhook.previewAppend()
  const preview = await api.webhook.previewAppend({
    targetSpreadSheetId: 'file-1',
    targetSheetName: 'Sheet1',
    sourceKeyColumn: 'student_id',
    targetKeyColumn: 'Mã SV',
    columnMappings: [],
  });
  assert.equal(preview.valid, true);

  // Test workflow.save() with sheetWriteAction in webhook mode (no sheetsTrigger)
  const webhookNodes = [
    { id: 'wh', type: 'webhookTrigger', data: {} },
    { id: 'sw', type: 'sheetWriteAction', data: { connectionId: 'gconn-workspace-1' } },
  ];
  await api.workflow.save('wf-456', { nodes: webhookNodes, edges: [] });
  const saveCall = calls.find((c) => c[0] === 'put' && c[1] === '/workspaces/ws-123/workflows/wf-456');
  assert.ok(saveCall);
  assert.deepEqual(saveCall[2].connectionBindings, [
    { nodeId: 'sw', connectionId: 'gconn-workspace-1' },
  ]);
});

// --- Part 3: WebhookConfigModal UI Component tests ---
const mockWebhookService = {
  get: async () => ({
    workflowId: 'wf-1',
    webhookToken: 'token-sample-999',
    webhookUrl: 'http://localhost/api/v1/webhooks/token-sample-999',
    enabled: true,
    lastReceivedAt: '2026-11-09T12:00:00Z',
    sampleFields: ['student_id', 'full_name', 'email', 'phone', 'tuition_fee'],
    lastPayloadSample: '{"student_id":"SV01","full_name":"Test Student"}',
  }),
  updateStatus: async (_w, _wf, enabled) => ({
    workflowId: 'wf-1',
    webhookToken: 'token-sample-999',
    webhookUrl: 'http://localhost/api/v1/webhooks/token-sample-999',
    enabled,
    sampleFields: ['student_id', 'full_name'],
  }),
  rotate: async () => ({
    workflowId: 'wf-1',
    webhookToken: 'token-new-888',
    webhookUrl: 'http://localhost/api/v1/webhooks/token-new-888',
    enabled: true,
    sampleFields: [],
  }),
};
globalThis.__webhookApi = mockWebhookService;

const bundle = await build({
  entryPoints: [fileURLToPath(new URL('../src/components/orchestration/WebhookConfigModal.tsx', import.meta.url))],
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
          contents: 'export const webhookService = globalThis.__webhookApi;',
        }));
        builder.onResolve({ filter: /^(?:react(?:\/.*)?|lucide-react)$/ }, (args) => ({
          path: import.meta.resolve(args.path),
          external: true,
        }));
      },
    },
  ],
});

const directory = await mkdtemp(join(tmpdir(), 'hybridflow-webhook-test-'));
const file = join(directory, 'WebhookConfigModal.mjs');
await writeFile(file, bundle.outputFiles[0].text);
const { WebhookConfigModal } = await import(pathToFileURL(file).href);
await unlink(file);
await rmdir(directory);

let renderer;
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  renderer = null;
});

function text(node) {
  return typeof node === 'string' ? node : (node.children || []).map(text).join('');
}

test('WebhookConfigModal loads webhook info, displays token endpoint and detected fields', async () => {
  await act(async () => {
    renderer = create(
      React.createElement(WebhookConfigModal, {
        workspaceId: 'ws-1',
        workflowId: 'wf-1',
        data: {},
        disabled: false,
        onClose: () => {},
        onSave: async () => {},
      })
    );
  });

  const fullText = text(renderer.root);
  assert.match(fullText, /Cấu hình Webhook/);
  assert.match(fullText, /token-sample-999/);
  assert.match(fullText, /Đang nhận dữ liệu/);
  assert.match(fullText, /student_id/);
  assert.match(fullText, /full_name/);
  assert.match(fullText, /tuition_fee/);
});

test('WebhookConfigModal saves captured sample fields and token on Save', async () => {
  let savedData = null;
  await act(async () => {
    renderer = create(
      React.createElement(WebhookConfigModal, {
        workspaceId: 'ws-1',
        workflowId: 'wf-1',
        data: {},
        disabled: false,
        onClose: () => {},
        onSave: async (d) => {
          savedData = d;
        },
      })
    );
  });

  const saveBtn = renderer.root.findAllByType('button').find((n) => text(n).includes('Lưu cấu hình'));
  assert.ok(saveBtn);
  await act(async () => saveBtn.props.onClick());

  assert.ok(savedData);
  assert.equal(savedData.webhookToken, 'token-sample-999');
  assert.deepEqual(savedData.webhookSampleFields, ['student_id', 'full_name', 'email', 'phone', 'tuition_fee']);
});
