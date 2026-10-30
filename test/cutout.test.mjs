import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { cutoutPixels } from '../src/shared/cutout.mjs';
import { artFor, makeIcon, parseStyle, formatStyle } from '../src/render.mjs';

// An app-style tile: a rounded plate (with a lighter border) holding a ring-shaped glyph.
const tile = ({ plate = '#000', glyph = '#ddd', border = '#555', plateEnd } = {}) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${plate}"/><stop offset="1" stop-color="${plateEnd ?? plate}"/></linearGradient></defs>
    <rect x="4" y="4" width="248" height="248" rx="56" fill="url(#g)" stroke="${border}" stroke-width="6"/>
    <circle cx="128" cy="128" r="60" fill="none" stroke="${glyph}" stroke-width="28"/>
  </svg>`);
const pixels = async (svg) => sharp(svg).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const alphaAt = ({ data, info }, x, y) => data[(y * info.width + x) * 4 + 3];

test('cutout removes a solid plate, its border and the glyph\'s holes, and keeps the glyph', async () => {
  const img = await pixels(tile());
  assert.equal(cutoutPixels(img.data, img.info.width, img.info.height), '#000000');
  assert.equal(alphaAt(img, 128, 128), 0, 'hole in the middle of the ring');
  assert.equal(alphaAt(img, 30, 128), 0, 'plate');
  assert.equal(alphaAt(img, 5, 128), 0, 'border');
  assert.equal(alphaAt(img, 128 + 60, 128), 255, 'glyph');
});

test('cutout handles gradient plates and plates that run to the image edge', async () => {
  const img = await pixels(tile({ plate: '#1d4ed8', plateEnd: '#2563eb', glyph: '#fff', border: '#1d4ed8' }));
  assert.ok(cutoutPixels(img.data, img.info.width, img.info.height));
  assert.equal(alphaAt(img, 128, 20), 0);
  assert.equal(alphaAt(img, 128, 235), 0);
  assert.equal(alphaAt(img, 128 - 60, 128), 255);
});

test('cutout leaves artwork without a plate alone', async () => {
  // A bare glyph on transparency, and a glyph that is all one color.
  for (const svg of [
    '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><circle cx="128" cy="128" r="80" fill="none" stroke="#fff" stroke-width="30"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#000"/></svg>',
  ]) {
    const img = await pixels(Buffer.from(svg));
    const before = Buffer.from(img.data);
    assert.equal(cutoutPixels(img.data, img.info.width, img.info.height), null);
    assert.ok(before.equals(img.data), 'pixels unchanged');
  }
});

test('cutout crops to the foreground, so the glyph fills the icon', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'iw-cutout-'));
  try {
    const file = path.join(dir, 'tile.png');
    await sharp(tile()).png().toFile(file);
    const plain = await artFor(file), cut = await artFor(file, { cutout: true });
    assert.equal(cut.plate, '#000000');
    assert.ok(cut.box[2] < plain.box[2] * 0.7, `cut box ${cut.box} vs ${plain.box}`);
    const made = await makeIcon({ source: file, ...parseStyle('cutout color=white'), outDir: dir, formats: ['png'], preview: false });
    assert.match(made.cutout, /removed the #000000 background/);
    const none = await makeIcon({ source: 'mdi:home', cutout: true, outDir: dir, formats: ['png'], preview: false }).catch(() => null);
    if (none) assert.match(none.cutout, /no solid background/);   // needs the network for the Iconify id
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('cutout is a style flag like shadow', () => {
  assert.deepEqual(parseStyle('cutout color=white'), { cutout: true, color: 'white' });
  assert.deepEqual(parseStyle('cutout=off'), { cutout: false });
  assert.equal(formatStyle({ color: 'white', cutout: true }), 'cutout color=white');
});
