import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const bundle = await build({ entryPoints: [fileURLToPath(new URL('../src/services/history.ts', import.meta.url))], bundle: true, write: false, platform: 'node', format: 'esm' });
const { historyLog, logConflictState } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

test('failed executions retain the saved support reference without changing legacy history', () => {
  const failure = { id: 'run', status: 'ERROR', started_at: '2026-11-03T10:00:00Z', error: 'Chưa ghi được dữ liệu.' };
  assert.equal(historyLog(failure).message, 'Chưa ghi được dữ liệu.');
  assert.equal(historyLog({ ...failure, error_code: 'SYNC_VERIFY_FAILED', correlation_id: 'trace-1' }).message,
    'Chưa ghi được dữ liệu. (Mã tra cứu: trace-1)');
});

test('historical conflict IDs are compared with live open IDs instead of trusting the old status', () => {
  const log = historyLog({ id: 'run', status: 'CONFLICT', started_at: '2026-11-02T10:00:00', result: JSON.stringify({
    cleanRecordIds: ['A'], conflicts: [{ id: 9, status: 'OPEN' }], notificationsSent: 1, notificationsFailed: 0,
  }) });
  assert.deepEqual(log.conflictIds, [9]);
  assert.equal(logConflictState(log, new Set()).resolved, true);
  assert.equal(logConflictState(log, new Set()).displayType, 'info');
  assert.deepEqual(logConflictState(log, new Set([9])).pendingIds, [9]);
});
test('bootstrap confirmation is informational rather than a conflict alert', () => {
  const log = historyLog({ id: 'init', status: 'AWAITING_CONFIRMATION', started_at: '2026-11-02T10:00:00', result: null });
  assert.equal(log.type, 'info');
  assert.equal(log.message.includes('Chờ xác nhận'), false);
});
test('missing conflict IDs never turn a historical row into an actionable alert', () => {
  const log = historyLog({ id: 'old', status: 'CONFLICT', started_at: '2026-11-02T10:00:00', result: 'invalid' });
  assert.deepEqual(logConflictState(log, new Set([9])).pendingIds, []);
  assert.equal(logConflictState(log, new Set([9])).resolved, false);
});
