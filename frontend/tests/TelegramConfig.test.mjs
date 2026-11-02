import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { build } from 'esbuild';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const api = {};
globalThis.__telegramApi = api;
const bundle = await build({
  entryPoints: [fileURLToPath(new URL('../src/components/orchestration/TelegramConfig.tsx', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic',
  plugins: [{ name: 'test-boundaries', setup(builder) {
    builder.onResolve({ filter: /services\/api$/ }, () => ({ path: 'api', namespace: 'test-api' }));
    builder.onLoad({ filter: /.*/, namespace: 'test-api' }, () => ({ contents: 'export const telegramService = globalThis.__telegramApi;' }));
    builder.onResolve({ filter: /^(?:react(?:\/.*)?|lucide-react)$/ }, args => ({ path: import.meta.resolve(args.path), external: true }));
  } }],
});
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'hybridflow-telegram-test-'));
const bundlePath = join(temporaryDirectory, 'TelegramConfig.mjs');
await writeFile(bundlePath, bundle.outputFiles[0].text);
const { TelegramConfig } = await import(pathToFileURL(bundlePath).href);
await unlink(bundlePath); await rmdir(temporaryDirectory);
let renderer;
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); renderer = null; });
const recipient = (chatId = '123', recipientType = 'PRIVATE') => ({ chatId, name: recipientType === 'GROUP' ? 'Team' : 'Alex', recipientType });
const link = () => ({ id: 'session', status: 'WAITING', url: 'https://t.me/TestBot?start=hf_session', command: '/start@TestBot hf_session',
  expiresAt: new Date(Date.now() + 600000).toISOString(), recipient: null });
const data = { label: 'Telegram', type: 'telegramAction', category: 'action', subtitle: '', chatId: '123' };
function text(node) { return typeof node === 'string' ? node : (node.children || []).map(text).join(''); }
function button(label) { return renderer.root.findAllByType('button').find(node => text(node).includes(label)); }
function props(overrides = {}) { return { data, disabled: false, notificationConnected: true, onClose: () => {}, onSave: async () => {}, ...overrides }; }
function defaults() {
  api.getBot = async () => ({ configured: true, username: 'TestBot', canJoinGroups: true, message: '' });
  api.checkRecipient = async (id, type) => recipient(id, type);
  api.startLink = async () => link();
  api.pollLink = async () => ({ ...link(), status: 'CONNECTED', recipient: recipient() });
  api.sendTest = async (id, type) => ({ success: true, message: 'Đã gửi tin nhắn thử.', recipient: recipient(id, type) });
}
async function mount(properties) { await act(async () => { renderer = create(React.createElement(TelegramConfig, properties)); }); }

test('test sends to the draft destination without saving it or requiring a conflict', async () => {
  defaults(); const sends = [], saves = [];
  api.sendTest = async (id, type) => { sends.push([id, type]); return { success: true, message: 'Đã gửi tin nhắn thử.', recipient: recipient(id, type) }; };
  await mount(props({ onSave: async value => { saves.push(value); } }));
  await act(async () => renderer.root.findAllByType('input').find(node => node.props.type !== 'radio').props.onChange({ target: { value: '456' } }));
  assert.equal(button('Gửi tin nhắn thử').props.disabled, true);
  await act(async () => button('Kiểm tra nơi nhận').props.onClick());
  await act(async () => button('Gửi tin nhắn thử').props.onClick());
  assert.deepEqual(sends, [['456', 'PRIVATE']]); assert.equal(saves.length, 0);
  await act(async () => button('Lưu cấu hình Telegram').props.onClick());
  assert.equal(saves[0].chatId, '456'); assert.equal(saves[0].telegramRecipientName, 'Alex');
});

test('group connection auto-selects only the confirmed destination', async () => {
  defaults(); const types = [];
  api.startLink = async type => { types.push(type); return { ...link(), url: 'https://t.me/TestBot?startgroup=hf_session' }; };
  api.pollLink = async () => ({ ...link(), status: 'CONNECTED', recipient: recipient('-1001', 'GROUP') });
  await mount(props());
  await act(async () => renderer.root.findAllByType('input').find(node => node.props.value === 'GROUP').props.onChange());
  await act(async () => button('Kết nối nhóm Telegram').props.onClick());
  assert.equal(renderer.root.findByType('a').props.href, 'https://t.me/TestBot?startgroup=hf_session');
  await act(async () => { await delay(1600); });
  assert.deepEqual(types, ['GROUP']); assert.equal(text(renderer.root).includes('Team'), true);
  assert.equal(button('Gửi tin nhắn thử').props.disabled, false);
});

test('cancel never applies recipient changes', async () => {
  defaults(); let closes = 0, saves = 0;
  await mount(props({ onClose: () => { closes++; }, onSave: async () => { saves++; } }));
  await act(async () => renderer.root.findAllByType('input').find(node => node.props.type !== 'radio').props.onChange({ target: { value: '456' } }));
  await act(async () => button('Hủy').props.onClick());
  assert.equal(closes, 1); assert.equal(saves, 0);
});

test('failed delivery displays useful text without claiming success', async () => {
  defaults(); api.sendTest = async () => { throw new Error('Bot bị chặn. Mở bot và bấm Start.'); };
  await mount(props());
  await act(async () => button('Gửi tin nhắn thử').props.onClick());
  assert.equal(text(renderer.root).includes('Bot bị chặn'), true);
  assert.equal(text(renderer.root).includes('Đã gửi tin nhắn thử.'), false);
});

test('missing bot disables setup and sending, and disconnected branch is explained', async () => {
  defaults(); api.getBot = async () => ({ configured: false, message: 'Bot chưa sẵn sàng.' });
  await mount(props({ notificationConnected: false }));
  assert.equal(button('Gửi tin nhắn thử').props.disabled, true);
  assert.equal(button('Lưu cấu hình Telegram').props.disabled, true);
  assert.equal(text(renderer.root).includes('chưa được nối'), true);
});

test('an unavailable endpoint shows guidance instead of a raw HTTP status', async () => {
  defaults(); api.getBot = async () => { throw { response: { status: 404 }, message: 'Request failed with status code 404' }; };
  await mount(props());
  assert.equal(text(renderer.root).includes('liên hệ quản trị viên'), true);
  assert.equal(text(renderer.root).includes('status code 404'), false);
});

test('save error preserves the chosen recipient and keeps the form open', async () => {
  defaults(); await mount(props({ onSave: async () => { throw new Error('Máy chủ chưa lưu được.'); } }));
  await act(async () => button('Lưu cấu hình Telegram').props.onClick());
  assert.equal(text(renderer.root).includes('Máy chủ chưa lưu được.'), true);
  assert.equal(text(renderer.root).includes('Alex'), true);
  assert.equal(button('Lưu cấu hình Telegram').props.disabled, false);
});

test('expired link stops waiting without selecting or messaging anyone', async () => {
  defaults(); let polls = 0;
  api.startLink = async () => ({ ...link(), expiresAt: new Date(Date.now() - 1000).toISOString() });
  api.pollLink = async () => { polls++; return link(); };
  await mount(props());
  await act(async () => button('Kết nối với bot').props.onClick());
  await act(async () => { await delay(1600); });
  assert.equal(polls, 0);
  assert.equal(text(renderer.root).includes('Liên kết đã hết hạn'), true);
  assert.equal(button('Gửi tin nhắn thử').props.disabled, true);
});

test('changing recipient type discards a late pairing response', async () => {
  defaults(); let finishPoll;
  api.pollLink = async () => new Promise(resolve => { finishPoll = resolve; });
  await mount(props());
  await act(async () => button('Kết nối với bot').props.onClick());
  await act(async () => { await delay(1600); });
  await act(async () => renderer.root.findAllByType('input').find(node => node.props.value === 'GROUP').props.onChange());
  await act(async () => finishPoll({ ...link(), status: 'CONNECTED', recipient: { ...recipient(), name: 'Old destination' } }));
  assert.equal(text(renderer.root).includes('Old destination'), false);
  assert.equal(button('Lưu cấu hình Telegram').props.disabled, true);
});
