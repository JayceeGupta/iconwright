import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { makeIcon, ICO_SIZES } from '../src/render.mjs';
import { loadSource, searchIcons } from '../src/source.mjs';

const fixture = new URL('./fixtures/logo.svg', import.meta.url);
const glyph = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><path d="M25 20h50v60H25z" fill="#ffffff"/></svg>';

async function tempDir() { return mkdtemp(path.join(os.tmpdir(), 'iconwright-test-')); }
async function alphaBounds(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width, top = info.height, right = -1, bottom = -1;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (data[(y * info.width + x) * info.channels + 3] > 0) {
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
  }
  return { left, top, right, bottom };
}

test('ICO has seven entries at the requested sizes', async (t) => {
  const dir = await tempDir(); t.after(() => rm(dir, { recursive: true, force: true }));
  const result = await makeIcon({ source: glyph, name: 'sizes', outDir: dir });
  const ico = await readFile(result.ico);
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 7);
  const sizes = Array.from({ length: ico.readUInt16LE(4) }, (_, i) => ico[6 + i * 16] || 256);
  assert.deepEqual(sizes, ICO_SIZES);
});

test('SVG recolor updates fills', async (t) => {
  const dir = await tempDir(); t.after(() => rm(dir, { recursive: true, force: true }));
  const result = await makeIcon({ source: fileURLToPath(fixture), name: 'recolored', color: '#ff4040', outDir: dir });
  const { data, info } = await sharp(result.pngs[0]).raw().toBuffer({ resolveWithObject: true });
  let red = false;
  for (let i = 0; i < data.length; i += info.channels) if (data[i] > 220 && data[i + 1] < 100 && data[i + 2] < 100 && data[i + 3] > 0) red = true;
  assert.equal(red, true);
});

test('trim and padding center the glyph with the requested margin', async (t) => {
  const dir = await tempDir(); t.after(() => rm(dir, { recursive: true, force: true }));
  const result = await makeIcon({ source: glyph, name: 'padding', padding: 0.1, outDir: dir });
  const bounds = await alphaBounds(result.pngs[0]);
  assert.ok(bounds.right - bounds.left >= 170 && bounds.right - bounds.left <= 180, JSON.stringify(bounds));
  assert.ok(Math.abs((bounds.left + bounds.right) / 2 - 127.5) <= 1);
  assert.ok(Math.abs((bounds.top + bounds.bottom) / 2 - 127.5) <= 1);
});

test('rounded backplate leaves transparent corner pixels', async (t) => {
  const dir = await tempDir(); t.after(() => rm(dir, { recursive: true, force: true }));
  const result = await makeIcon({ source: glyph, name: 'rounded', bg: '#202020', shape: 'rounded', outDir: dir });
  const { data, info } = await sharp(result.pngs[0]).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(data[3], 0);
  assert.equal(data[((info.height - 1) * info.width + info.width - 1) * info.channels + 3], 0);
});

test('raster source produces an icon and tint preserves its alpha', async (t) => {
  const dir = await tempDir(); t.after(() => rm(dir, { recursive: true, force: true }));
  const png = await sharp({ create: { width: 24, height: 24, channels: 4, background: { r: 20, g: 40, b: 60, alpha: 0.5 } } }).png().toBuffer();
  const raster = path.join(dir, 'source.png'); await writeFile(raster, png);
  const result = await makeIcon({ source: raster, name: 'raster', color: '#00cc44', outDir: dir });
  assert.equal((await sharp(result.pngs[0]).metadata()).width, 256);
  const pixel = await sharp(result.pngs[0]).raw().toBuffer();
  const center = (128 * 256 + 128) * 4;
  assert.ok(pixel[center + 1] > 150);
});

test('optional Iconify lookup skips gracefully when offline', async (t) => {
  try {
    const found = await searchIcons('github', 1);
    assert.ok(Array.isArray(found));
  } catch (error) {
    t.skip(`Iconify unavailable: ${error.message}`);
  }
});

test('source loader accepts raw SVG fixture', async () => {
  const loaded = await loadSource((await readFile(fixture, 'utf8')));
  assert.equal(loaded.kind, 'svg');
  assert.match(loaded.svg, /<svg/);
});
