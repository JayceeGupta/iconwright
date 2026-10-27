import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../src/args.mjs';

test('parses long options, equals values, booleans, and positional values', () => {
  const parsed = parseArgs(['--name', 'hello', '--size=16', '--quiet', 'one', '--', '--two'], {
    flags: { name: 'string', size: 'number', quiet: 'boolean' }, positional: 'any',
  });
  assert.deepEqual(parsed, {
    values: { name: 'hello', size: 16, quiet: true },
    positional: ['one', '--two'],
    help: false,
  });
});

test('negative numbers are values and numeric flags require finite numbers', () => {
  assert.deepEqual(parseArgs(['--x', '-12.5'], { flags: { x: 'number' } }).values, { x: -12.5 });
  assert.deepEqual(parseArgs(['--x=-1'], { flags: { x: 'number' } }).values, { x: -1 });
  for (const value of ['abc', '', 'Infinity', 'NaN']) {
    assert.throws(() => parseArgs([`--x=${value}`], { flags: { x: 'number' } }), /--x must be a number/);
  }
});

test('reports missing values and rejects values on boolean flags', () => {
  assert.throws(() => parseArgs(['--name'], { flags: { name: 'string' } }), /missing value for --name/);
  assert.throws(() => parseArgs(['--name', '--other'], { flags: { name: 'string', other: 'boolean' } }), /missing value for --name/);
  assert.deepEqual(parseArgs(['--name='], { flags: { name: 'string' } }).values, { name: '' });
  assert.throws(() => parseArgs(['--force=true'], { flags: { force: 'boolean' } }), /does not take a value/);
});

test('unknown options include the expected flags, and help is always allowed', () => {
  assert.throws(() => parseArgs(['--wat'], { flags: { alpha: 'boolean', beta: 'string' } }), /unknown option --wat \(expected: --alpha, --beta\)/);
  assert.deepEqual(parseArgs(['--broken', '--help'], { flags: {} }), { values: {}, positional: [], help: true });
});

test('rejects positional arguments when the spec forbids them', () => {
  assert.throws(() => parseArgs(['file.png'], { flags: {}, positional: 'none' }), /unexpected positional argument: file.png/);
});
