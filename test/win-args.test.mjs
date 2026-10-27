import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { buildWinArgs, winParams } from '../src/win.mjs';

test('winParams maps options to script parameters', () => {
  assert.deepEqual(winParams({
    app: ['T3 Code', "it's"], item: 'first item', x: 12, y: -3, value: 'large', file: 'layout.json', noRestart: true,
    by: 'name', position: -2, monitor: 1, maxWidth: 0, icon: undefined, query: '',
  }), {
    App: ['T3 Code', "it's"], NoRestart: true, Item: ['first item'], X: 12, Y: -3, Value: 'large',
    File: path.resolve('layout.json'), By: 'name', Position: -2, MaxWidth: 0, Monitor: 1,
  });
});

test('buildWinArgs quotes every string for PowerShell', () => {
  assert.deepEqual(buildWinArgs('desktop-arrange', { item: ['first item', "second's"], x: 12, y: -3, corner: 'top-left', noRestart: true }), [
    'desktop-arrange', '-NoRestart', '-Item', "'first item','second''s'", '-X', '12', '-Y', '-3', '-Corner', "'top-left'",
  ]);
  // Characters PowerShell would otherwise interpret stay inside single quotes.
  assert.deepEqual(buildWinArgs('info', { app: ['$x `y; Write-Output pwned'] }), ['info', '-App', "'$x `y; Write-Output pwned'"]);
});
