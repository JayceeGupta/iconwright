import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { makeIcon, ICO_SIZES, parseColor } from '../src/render.mjs';
import { loadSource, searchIcons } from '../src/source.mjs';

const fixture = new URL('./fixtures/logo.svg', import.meta.url);
const glyph = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><path d="M25 20h50v60H25z" fill="#ffffff"/></svg>';

async function tempDir() { return mkdtemp(path.join(os.tmpdir(), 'iconwright-test-')); }
async function withIconifyCache(t) {
  const dir = await tempDir(), previous = process.env.ICONWRIGHT_CACHE;
  process.env.ICONWRIGHT_CACHE = dir;
  t.after(async () => { if (previous === undefined) delete process.env.ICONWRIGHT_CACHE; else process.env.ICONWRIGHT_CACHE = previous; await rm(dir, { recursive: true, force: true }); });
}
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

test('ICO has an entry for every size in ICO_SIZES', async (t) => {
  const dir = await tempDir(); t.after(() => rm(dir, { recursive: true, force: true }));
  const result = await makeIcon({ source: glyph, name: 'sizes', outDir: dir });
  const ico = await readFile(result.ico);
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), ICO_SIZES.length);
  const sizes = Array.from({ length: ico.readUInt16LE(4) }, (_, i) => ico[6 + i * 16] || 256);
  assert.deepEqual(sizes, ICO_SIZES);
});

test('SVG recolor updates fills', async (t) => {
  const dir = await tempDir(); t.after(() => rm(dir, { recursive: true, force: true }));
  const result = await makeIcon({ source: fileURLToPath(fixture), name: 'recolored', color: '#ff4040', outDir: dir });
  const { data, info } = await sharp(result.png).raw().toBuffer({ resolveWithObject: true });
  let red = false;
  for (let i = 0; i < data.length; i += info.channels) if (data[i] > 220 && data[i + 1] < 100 && data[i + 2] < 100 && data[i + 3] > 0) red = true;
  assert.equal(red, true);
});

test('trim and padding center the glyph with the requested margin', async (t) => {
  const dir = await tempDir(); t.after(() => rm(dir, { recursive: true, force: true }));
  const result = await makeIcon({ source: glyph, name: 'padding', padding: 0.1, outDir: dir });
  const bounds = await alphaBounds(result.png);
  assert.ok(bounds.right - bounds.left >= 170 && bounds.right - bounds.left <= 180, JSON.stringify(bounds));
  assert.ok(Math.abs((bounds.left + bounds.right) / 2 - 127.5) <= 1);
  assert.ok(Math.abs((bounds.top + bounds.bottom) / 2 - 127.5) <= 1);
});

test('rounded backplate leaves transparent corner pixels', async (t) => {
  const dir = await tempDir(); t.after(() => rm(dir, { recursive: true, force: true }));
  const result = await makeIcon({ source: glyph, name: 'rounded', bg: '#202020', shape: 'rounded', outDir: dir });
  const { data, info } = await sharp(result.png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(data[3], 0);
  assert.equal(data[((info.height - 1) * info.width + info.width - 1) * info.channels + 3], 0);
});

test('squircle, gradient backplate and shadow render expected pixels', async (t) => {
  const dir = await tempDir(); t.after(() => rm(dir, { recursive: true, force: true }));
  const squircle = await makeIcon({ source: glyph, name: 'squircle', bg: '#22aaee', shape: 'squircle', padding: 0.1, outDir: dir });
  const { data, info } = await sharp(squircle.png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(data[3], 0);
  assert.ok(data[(128 * info.width + 128) * 4 + 3] > 0);
  const gradient = await makeIcon({ source: glyph, name: 'gradient', bg: 'linear-gradient(135deg, #f00, #00f)', shape: 'square', padding: 0.4, outDir: dir });
  const gd = await sharp(gradient.png).raw().toBuffer();
  assert.notDeepEqual([...gd.subarray(0, 3)], [...gd.subarray((255 * 256 + 255) * 4, (255 * 256 + 255) * 4 + 3)]);
  const shadow = await makeIcon({ source: glyph, name: 'shadow', shadow: true, padding: 0.1, outDir: dir });
  const sd = await sharp(shadow.png).ensureAlpha().raw().toBuffer();
  assert.ok(sd[(225 * 256 + 128) * 4 + 3] > 0);
});

test('icns, web and pngset formats write their files', async (t) => {
  const dir = await tempDir(); t.after(() => rm(dir, { recursive: true, force: true }));
  const made = await makeIcon({ source: glyph, name: 'formats', formats: ['icns', 'web', 'pngset'], outDir: dir, preview: false });
  assert.ok(made.icns && made.web && made.pngset);
  assert.equal((await readFile(made.icns)).subarray(0, 4).toString(), 'icns');
});

test('raster source produces an icon and tint preserves its alpha', async (t) => {
  const dir = await tempDir(); t.after(() => rm(dir, { recursive: true, force: true }));
  const png = await sharp({ create: { width: 24, height: 24, channels: 4, background: { r: 20, g: 40, b: 60, alpha: 0.5 } } }).png().toBuffer();
  const raster = path.join(dir, 'source.png'); await writeFile(raster, png);
  const result = await makeIcon({ source: raster, name: 'raster', color: '#00cc44', outDir: dir });
  assert.equal((await sharp(result.png).metadata()).width, 256);
  const pixel = await sharp(result.png).raw().toBuffer();
  const center = (128 * 256 + 128) * 4;
  assert.ok(pixel[center + 1] > 150);
});

test('optional Iconify lookup skips gracefully when offline', async (t) => {
  await withIconifyCache(t);
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

test('supported CSS colors tint raster and SVG sources consistently', async (t) => {
  const dir = await tempDir(); t.after(() => rm(dir, { recursive: true, force: true }));
  const raster = path.join(dir, 'source.png');
  await writeFile(raster, await sharp({ create: { width: 8, height: 8, channels: 4, background: { r: 20, g: 30, b: 40, alpha: 1 } } }).png().toBuffer());
  const colors = [
    'hsl(0, 100%, 50%)', 'hsl(0 100% 50% / 100%)', 'red',
    'rgb(255, 0, 0)', 'rgb(100% 0% 0%)', '#f00', '#f00f', '#ff0000', '#ff0000ff',
  ];
  for (let i = 0; i < colors.length; i++) {
    assert.deepEqual(parseColor(colors[i]), { r: 255, g: 0, b: 0, alpha: 1 }, colors[i]);
    for (const [kind, source] of [['raster', raster], ['svg', glyph]]) {
      const made = await makeIcon({ source, name: `${kind}-${i}`, color: colors[i], pngSize: 16, outDir: dir });
      const { data, info } = await sharp(made.png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const pixel = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * 4;
      assert.ok(data[pixel] > 200 && data[pixel + 1] < 50 && data[pixel + 2] < 50 && data[pixel + 3] > 0, `${kind}: ${colors[i]}`);
    }
  }
});

test('invalid colors are rejected for both SVG and raster sources', async (t) => {
  const dir = await tempDir(); t.after(() => rm(dir, { recursive: true, force: true }));
  const raster = path.join(dir, 'source.png');
  await writeFile(raster, await sharp({ create: { width: 2, height: 2, channels: 4, background: '#fff' } }).png().toBuffer());
  for (const color of ['#12345', 'purpel', 'url(x)']) {
    assert.throws(() => parseColor(color), new RegExp(`unsupported color: ${color.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    await assert.rejects(makeIcon({ source: raster, name: 'invalid-raster', color, outDir: dir }), /unsupported color:/);
    await assert.rejects(makeIcon({ source: glyph, name: 'invalid-svg', color, outDir: dir }), /unsupported color:/);
  }
});

test('Iconify search results are sliced to the requested limit', async (t) => {
  await withIconifyCache(t);
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url) => {
    assert.equal(new URL(url).searchParams.get('limit'), '32');
    return new Response(JSON.stringify({ icons: Array.from({ length: 30 }, (_, i) => `test:icon-${i}`) }), { status: 200 });
  };
  assert.equal((await searchIcons('icons', 2)).length, 2);
});

test('rejects oversized local sources and Iconify responses', async (t) => {
  await withIconifyCache(t);
  const dir = await tempDir(); t.after(() => rm(dir, { recursive: true, force: true }));
  const largeFile = path.join(dir, 'too-large.png');
  const handle = await open(largeFile, 'w');
  await handle.truncate(25 * 1024 * 1024 + 1);
  await handle.close();
  await assert.rejects(loadSource(largeFile), new RegExp(`source file too large \\(max 25 MB\\): ${largeFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));

  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response('x'.repeat(2 * 1024 * 1024 + 1), { status: 200 });
  await assert.rejects(loadSource('test:large'), /Iconify response too large \(max 2 MB\)/);
});
