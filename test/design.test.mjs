import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { designGrid, searchSheet } from '../src/design.mjs';
import { fetchIcons } from '../src/source.mjs';

const fixture = fileURLToPath(new URL('./fixtures/logo.svg', import.meta.url));
const inline = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><circle cx="12" cy="12" r="10" fill="red"/></svg>';

test('design grid returns expected size and row/column labels', async () => {
  const grid = await designGrid({ sources: [fixture.pathname, inline], styles: [{}, { bg: '#fff', shape: 'circle' }, { color: 'blue' }] });
  const meta = await sharp(grid.png).metadata();
  assert.deepEqual([meta.width, meta.height], [312, 248]);
  assert.deepEqual(grid.rows.map((r) => r.row), ['A', 'B']);
  assert.deepEqual(grid.columns.map((c) => c.column), [1, 2, 3]);
  await assert.rejects(designGrid({ sources: Array(7).fill(inline), styles: Array(6).fill({}) }), /too many cells/);
});

test('search sheet renders Iconify results and reports missing ids; fetch cache avoids repeat requests', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'iconwright-cache-'));
  const previousCache = process.env.ICONWRIGHT_CACHE, originalFetch = globalThis.fetch;
  process.env.ICONWRIGHT_CACHE = dir;
  let calls = 0;
  globalThis.fetch = async (url) => {
    calls++;
    const requestedText = new URL(url).searchParams.get('icons');
    if (!requestedText) return new Response('', { status: 404 });
    const requested = requestedText.split(',');
    return new Response(JSON.stringify({ prefix: 'test', width: 24, height: 24, icons: Object.fromEntries(requested.filter((n) => n === 'ok').map((n) => [n, { body: '<path d="M0 0h24v24H0z"/>' }])) }), { status: 200 });
  };
  t.after(async () => { globalThis.fetch = originalFetch; if (previousCache === undefined) delete process.env.ICONWRIGHT_CACHE; else process.env.ICONWRIGHT_CACHE = previousCache; await rm(dir, { recursive: true, force: true }); });
  const sheet = await searchSheet(['test:ok', 'test:missing']);
  const meta = await sharp(sheet.png).metadata();
  assert.deepEqual([meta.width, meta.height], [128, 72]);
  assert.deepEqual(sheet.missing, ['test:missing']);
  await fetchIcons(['test:ok']);
  assert.equal(calls, 2); // one JSON request plus the missing-id fallback; cache avoids more.
});
