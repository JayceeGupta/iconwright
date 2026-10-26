import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { buildWinArgs } from '../src/win.mjs';

test('buildWinArgs maps optional Windows parameters without running PowerShell', () => {
  assert.deepEqual(buildWinArgs('desktop-arrange', {
    item: ['first item', "second's"], x: 12, y: -3, value: 'large', file: 'layout.json',
    by: 'name', corner: 'top-left', flow: 'columns', autoArrange: 'on', snapToGrid: 'off', showIcons: 'on', position: '-2',
  }), [
    'desktop-arrange', '-Item', "'first item','second''s'", '-X', "'12'", '-Y', "'-3'", '-Value', "'large'",
    '-File', `'${path.resolve('layout.json')}'`, '-By', "'name'", '-Corner', "'top-left'", '-Flow', "'columns'",
    '-AutoArrange', "'on'", '-SnapToGrid', "'off'", '-ShowIcons', "'on'", '-Position', '-2',
  ]);
});
