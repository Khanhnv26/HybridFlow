import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('../src/services/history.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { historyLog, logConflictState } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

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
