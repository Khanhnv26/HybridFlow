import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('../src/services/workflowLayout.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { arrangeWorkflowNodes } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

test('shared transform layout separates sources, keeps trigger and alerts clear, and preserves configuration', () => {
  const make = (id, type) => ({ id, type, data: { label: id, transforms: ['TRIM'] }, position: { x: 0, y: 0 } });
  const nodes = [make('a', 'sheetsTrigger'), make('b', 'sheetsTrigger'), make('c', 'sheetsTrigger'),
    make('t', 'dataTransform'), make('d', 'diffEngine'), make('timer', 'scheduleTrigger'), make('telegram', 'telegramAction')];
  nodes[1].measured = { height: 300 };
  const original = structuredClone(nodes);
  const edges = ['a', 'b', 'c'].map(source => ({ source, target: 't' }));
  edges.push({ source: 't', target: 'd' });
  const arranged = arrangeWorkflowNodes(nodes, edges);
  const at = id => arranged.find(node => node.id === id).position;
  assert.ok(at('a').x < at('t').x && at('t').x < at('d').x);
  assert.ok(at('b').y - at('a').y >= 210 + 70);
  assert.ok(at('c').y - at('b').y >= 300 + 70);
  assert.ok(at('timer').y + 190 < at('d').y);
  assert.ok(at('telegram').y > at('d').y + 190);
  assert.deepEqual(nodes, original);
  assert.deepEqual(arranged.map(node => node.data), nodes.map(node => node.data));
  assert.deepEqual(arrangeWorkflowNodes(arranged, edges), arranged);
});
