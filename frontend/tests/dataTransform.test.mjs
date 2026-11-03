import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('../src/services/dataTransform.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { transformValue } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const apply = (value, rules, defaultValue) => transformValue(value, { columnName: 'value', rules, defaultValue });

test('preview matches backend trimming, casing and ordered default pipeline', () => {
  assert.equal(apply(' \tsp\u00a0 01\n', ['TRIM', 'UPPERCASE']), 'SP 01');
  assert.equal(apply(' nGUYỄN   VĂN an ', ['TRIM', 'CAPITALIZE']), 'Nguyễn Văn An');
  assert.equal(apply(' A@Example.COM ', ['TRIM', 'LOWERCASE']), 'a@example.com');
  assert.equal(apply(null, ['DEFAULT_IF_EMPTY', 'LOWERCASE'], 'NEW'), 'new');
  assert.equal(apply(null, ['LOWERCASE', 'DEFAULT_IF_EMPTY'], 'NEW'), 'NEW');
  assert.equal(apply('\u00a0', ['DEFAULT_IF_EMPTY'], 'N/A'), 'N/A');
  assert.equal(apply(null, ['TRIM', 'PHONE_VN']), null);
});
test('preview normalizes Vietnamese phones and preserves invalid and overseas values', () => {
  for (const phone of ['0912 345 678', '84 912-345-678', '+84 (912) 345678', '0084912345678']) {
    assert.equal(apply(phone, ['PHONE_VN']), '+84912345678');
  }
  for (const phone of ['abc0912345678', '+12025550123', '123', '']) assert.equal(apply(phone, ['PHONE_VN']), phone);
});
