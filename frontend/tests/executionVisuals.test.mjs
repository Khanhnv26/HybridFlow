import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('../src/services/executionVisuals.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const { executionVisuals } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const nodes = [{ id: 'timer', type: 'scheduleTrigger' }, { id: 'sheet', type: 'sheetsTrigger' },
  { id: 'diff', type: 'diffEngine' }, { id: 'vault', type: 'storageAction' }, { id: 'telegram', type: 'telegramAction' }];
const edges = [{ id: 'trigger', source: 'timer', target: 'diff', sourceHandle: 'out' },
  { id: 'input', source: 'sheet', target: 'diff', sourceHandle: 'out' },
  { id: 'output', source: 'diff', target: 'vault', sourceHandle: 'clean' },
  { id: 'conflict', source: 'diff', target: 'telegram', sourceHandle: 'conflict' }];
const phase = (stage, ...nodes) => ({ stage, nodes, label: `Actual ${stage}` });
const run = (status, progress, result = null) => ({ id: 'execution', status, progress: JSON.stringify(progress), result: result && JSON.stringify(result) });

test('only the real active phase moves, with read and write direction reflecting data flow', () => {
  const read = executionVisuals(nodes, edges, run('RUNNING', [phase('READ', 'sheet')]));
  assert.equal(read.nodeStates.sheet.state, 'running');
  assert.equal(read.nodeStates.telegram.state, 'skipped');
  assert.equal(read.edgeStates.input.state, 'running');
  assert.equal(read.edgeStates.conflict.state, 'idle');
  const write = executionVisuals(nodes, edges, run('RUNNING', [phase('READ', 'sheet'), phase('COMPARE', 'diff'), phase('WRITE', 'sheet')]));
  assert.equal(write.edgeStates.input.reverse, true);
  assert.equal(write.nodeStates.diff.state, 'success');
});

test('short completed runs retain static results without replaying fake running animation', () => {
  const view = executionVisuals(nodes, edges, run('SUCCESS', [phase('READ', 'sheet'), phase('COMPARE', 'diff'), phase('WRITE', 'vault')]));
  assert.equal(view.running, false);
  assert.equal(view.nodeStates.sheet.state, 'success');
  assert.equal(view.nodeStates.vault.state, 'success');
  assert.equal(view.nodeStates.timer.state, 'skipped');
  assert.equal(view.nodeStates.telegram.state, 'skipped');
  assert.equal(Object.values(view.edgeStates).some(edge => edge.state === 'running'), false);
});

test('scheduled trigger participation is shown only when recorded by the backend', () => {
  const view = executionVisuals(nodes, edges, run('SUCCESS', [phase('TRIGGER', 'timer'), phase('READ', 'sheet'), phase('COMPARE', 'diff')]));
  assert.equal(view.nodeStates.timer.state, 'success');
  assert.equal(view.edgeStates.trigger.state, 'success');
});

test('conflicts and failed notifications remain distinct from successful data steps', () => {
  const view = executionVisuals(nodes, edges, run('CONFLICT', [phase('READ', 'sheet'), phase('COMPARE', 'diff'), phase('WRITE', 'vault'), phase('NOTIFY', 'telegram')], { notificationsFailed: 1 }));
  assert.equal(view.nodeStates.diff.state, 'warning');
  assert.equal(view.nodeStates.vault.state, 'success');
  assert.equal(view.nodeStates.telegram.state, 'error');
  assert.equal(view.edgeStates.conflict.state, 'error');
});

test('failed writes identify the failed step and do not claim earlier writes committed', () => {
  const view = executionVisuals(nodes, edges, run('ERROR', [phase('READ', 'sheet'), phase('COMPARE', 'diff'), phase('WRITE', 'sheet'), phase('WRITE', 'vault')]));
  assert.equal(view.nodeStates.vault.state, 'error');
  assert.equal(view.nodeStates.sheet.state, 'warning');
  assert.equal(view.nodeStates.telegram.state, 'skipped');
});

test('awaiting bootstrap and legacy histories do not mark unexecuted steps successful', () => {
  const waiting = executionVisuals(nodes, edges, run('AWAITING_CONFIRMATION', [phase('READ', 'sheet'), phase('COMPARE', 'diff')]));
  assert.equal(waiting.nodeStates.diff.state, 'warning');
  assert.equal(waiting.nodeStates.vault.state, 'skipped');
  const legacy = executionVisuals(nodes, edges, { ...run('SUCCESS', []), progress: null });
  assert.equal(legacy.nodeStates.vault.state, 'idle');
  const pending = executionVisuals(nodes, edges, null, true);
  assert.equal(pending.nodeStates.diff.state, 'running');
  assert.equal(pending.edgeStates.input.state, 'idle');
});


test('transform edges follow backend TRANSFORM and WRITE phases in the actual direction', () => {
  const graphNodes = [{ id: 'sheet', type: 'sheetsTrigger' }, { id: 'transform', type: 'dataTransform' }, { id: 'diff', type: 'diffEngine' }];
  const graphEdges = [{ id: 'raw', source: 'sheet', target: 'transform' }, { id: 'clean', source: 'transform', target: 'diff' }];
  const phases = [phase('READ', 'sheet'), phase('TRANSFORM', 'transform')];
  const transform = executionVisuals(graphNodes, graphEdges, run('RUNNING', phases));
  assert.equal(transform.nodeStates.transform.state, 'running');
  assert.equal(transform.edgeStates.clean.state, 'running');
  assert.equal(transform.edgeStates.clean.reverse, false);
  const write = executionVisuals(graphNodes, graphEdges, run('RUNNING', [...phases, phase('COMPARE', 'diff'), phase('WRITE', 'sheet')]));
  for (const id of ['raw', 'clean']) {
    assert.equal(write.edgeStates[id].state, 'running');
    assert.equal(write.edgeStates[id].reverse, true);
  }
});
