import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const { version } = createRequire(import.meta.url)('../package.json');
const cli = (...args) => execFileSync(process.execPath, ['bin/iconwright.mjs', ...args], { encoding: 'utf8' });

test('--version and -v print the package version', () => {
  assert.equal(cli('--version').trim(), version);
  assert.equal(cli('-v').trim(), version);
});

test('help lists each command once', () => {
  const lines = cli('help').split('\n').filter((l) => /^ {2}report\b/.test(l));
  assert.equal(lines.length, 1);
});
