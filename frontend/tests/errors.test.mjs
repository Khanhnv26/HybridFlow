import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/services/errors.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { errorDetails, errorMessage, errorFingerprint } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

test('structured errors preserve codes, safe messages, validation and support reference', () => {
  const error = { response: { data: { code: 'CONNECTION_REQUIRED', message: 'Kết nối lại Google.', correlationId: 'trace-1',
    retryable: false, fieldErrors: [{ field: 'id', message: 'Bắt buộc.' }, { field: 1 }], retryAfterSeconds: 17 } } };
  assert.equal(errorDetails(error).code, 'CONNECTION_REQUIRED');
  assert.equal(errorDetails(error).retryAfterSeconds, 17);
  assert.deepEqual(errorDetails(error).fieldErrors, [{ field: 'id', message: 'Bắt buộc.' }]);
  assert.equal(errorMessage(error), 'Kết nối lại Google. (Mã tra cứu: trace-1)');
  assert.equal(errorMessage({ response: { data: { message: 'Legacy error' } } }), 'Legacy error');
});

test('HTML and transport errors never expose Axios details while local validation remains useful', () => {
  for (const error of [{ response: { data: '<html>secret</html>' }, message: 'Request failed with status code 500' },
    { isAxiosError: true, message: 'https://api/botSECRET' }, null]) {
    assert.equal(errorMessage(error, 'Thử lại.'), 'Thử lại.');
  }
  assert.match(errorMessage({ code: 'ERR_NETWORK' }), /Kiểm tra mạng/);
  assert.match(errorMessage({ code: 'ECONNABORTED' }), /phản hồi quá chậm/);
  assert.equal(errorMessage(new Error('Chọn cột khóa.')), 'Chọn cột khóa.');
  assert.equal(errorMessage({ code: 'ERR_CANCELED' }), '');
  assert.equal(errorMessage({ name: 'AbortError' }), '');
});

test('polling fingerprints ignore per-request references and suppress cancellation', () => {
  const failure = id => ({ response: { data: { code: 'UPSTREAM_UNAVAILABLE', message: 'Thử lại sau.', correlationId: id } } });
  assert.equal(errorFingerprint(failure('first')), errorFingerprint(failure('second')));
  assert.equal(errorFingerprint({ code: 'ERR_CANCELED' }), '');
});
