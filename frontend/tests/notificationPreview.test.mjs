import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/services/notificationPreview.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { matchesCurrentValues, isValidRuleNumber } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

test('numeric previews compare signed decimals and preserve exact TEXT equality', () => {
  const matches = (operator, value, actual) => matchesCurrentValues([{ columnName: 'quantity', operator, value }], 'ALL', { quantity: actual });
  assert.equal(matches('LESS_THAN', '10', '8'), true);
  assert.equal(matches('GREATER_THAN', '10', '10.01'), true);
  assert.equal(matches('LESS_OR_EQUAL', '-1.250', '-1.25'), true);
  assert.equal(matches('GREATER_OR_EQUAL', '1e1', '10.000'), true);
  assert.equal(matches('LESS_THAN', '10', '10'), false);
  assert.equal(matches('EQUALS', '1', '001'), false);
  assert.equal(matches('IS_EMPTY', undefined, ' '), true);
  assert.equal(matches('IS_EMPTY', undefined, '0'), false);
});

test('current rows cannot predict change operators even under ANY', () => {
  for (const operator of ['CHANGED_TO', 'COLUMN_CHANGED']) {
    assert.equal(matchesCurrentValues([
      { columnName: 'status', operator: 'EQUALS', value: 'READY' },
      { columnName: 'status', operator, value: 'READY' },
    ], 'ANY', { status: 'READY' }), false);
  }
});

test('invalid or empty numeric data never becomes zero or bypasses validation under ANY', () => {
  for (const quantity of ['', ' ', 'abc', 'NaN', 'Infinity', '1,000', '1234567890123456', '1e-400']) {
    assert.equal(isValidRuleNumber(quantity), false, quantity);
    assert.equal(matchesCurrentValues([
      { columnName: 'status', operator: 'EQUALS', value: 'READY' },
      { columnName: 'quantity', operator: 'LESS_THAN', value: '10' },
    ], 'ANY', { status: 'READY', quantity }), false, quantity);
  }
  for (const number of ['0', '-0', '1.25', '-1e2', '123456789012345', '0.000000000000001']) {
    assert.equal(isValidRuleNumber(number), true, number);
  }
});
