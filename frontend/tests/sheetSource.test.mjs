import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('../src/services/sheetSource.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { parseSheetSource, chooseSheetTab } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

test('accepts a shared Sheet link and extracts the selected tab, including gid zero', () => {
  assert.deepEqual(parseSheetSource(' https://docs.google.com/spreadsheets/d/file-123_abc/edit?usp=sharing#gid=0 '), { spreadsheetId: 'file-123_abc', gid: 0 });
  assert.deepEqual(parseSheetSource('https://docs.google.com/spreadsheets/u/0/d/file-123/edit?gid=42'), { spreadsheetId: 'file-123', gid: 42 });
});
test('keeps existing configurations compatible with raw file IDs', () => {
  assert.deepEqual(parseSheetSource('file-123_abc'), { spreadsheetId: 'file-123_abc' });
});
test('rejects unsupported links rather than using arbitrary hosts as Google Sheets', () => {
  for (const value of ['', 'not a link', 'http://docs.google.com/spreadsheets/d/id/edit',
    'https://docs.google.com.evil.test/spreadsheets/d/id/edit', 'https://drive.google.com/file/d/id/view',
    'https://user@docs.google.com/spreadsheets/d/id/edit']) assert.throws(() => parseSheetSource(value));
});
test('preselects the tab from the link without silently choosing an unrelated tab', () => {
  const tabs = [{ sheetId: 0, title: 'Orders' }, { sheetId: 42, title: 'Products' }];
  assert.equal(chooseSheetTab(tabs, { spreadsheetId: 'file', gid: 42 }, { spreadsheetId: 'file', sheetName: 'Orders' }), 'Products');
  assert.equal(chooseSheetTab(tabs, { spreadsheetId: 'file', gid: 99 }, {}), '');
  assert.equal(chooseSheetTab(tabs, { spreadsheetId: 'new-file' }, { spreadsheetId: 'file', sheetName: 'Orders' }), '');
});
test('restores the saved tab only if it still belongs to this file', () => {
  const tabs = [{ sheetId: 0, title: 'Orders' }];
  assert.equal(chooseSheetTab(tabs, { spreadsheetId: 'file' }, { spreadsheetId: 'file', sheetName: 'Orders' }), 'Orders');
  assert.equal(chooseSheetTab(tabs, { spreadsheetId: 'file' }, { spreadsheetId: 'file', sheetName: 'Deleted' }), '');
});
