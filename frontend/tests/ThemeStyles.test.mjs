import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import config from '../postcss.config.js';

test('theme utilities use the explicit theme even when launched from the repository root', async () => {
  const previousDirectory = process.cwd();
  try {
    process.chdir(fileURLToPath(new URL('../../', import.meta.url)));
    const result = await postcss([tailwindcss(config.plugins.tailwindcss)]).process(
      await readFile(new URL('../src/index.css', import.meta.url), 'utf8'),
      { from: fileURLToPath(new URL('../src/index.css', import.meta.url)) },
    );
    assert.match(result.css, /data-theme/);
    assert.match(result.css, /dark\\:text-white/);
    assert.doesNotMatch(result.css, /prefers-color-scheme:\s*dark/);
  } finally {
    process.chdir(previousDirectory);
  }
});
