import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import { icnsBuffer, writeFaviconBundle, writePngSet } from '../src/formats.mjs';

async function makeMaster() {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><circle cx="512" cy="512" r="400" fill="#e63946"/></svg>');
  return sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: svg }]).png().toBuffer();
}

test('icnsBuffer writes correctly sized PNG chunks', async () => {
  const master = await makeMaster();
  const buffer = await icnsBuffer(master);
  assert.equal(buffer.toString('ascii', 0, 4), 'icns');
  assert.equal(buffer.readUInt32BE(4), buffer.length);
  const dimensions = new Map([
    ['ic07', 128], ['ic08', 256], ['ic09', 512], ['ic10', 1024],
    ['ic11', 32], ['ic12', 64], ['ic13', 256], ['ic14', 512],
    ['icp4', 16], ['icp5', 32], ['icp6', 64],
  ]);
  let offset = 8;
  while (offset < buffer.length) {
    const type = buffer.toString('ascii', offset, offset + 4);
    const length = buffer.readUInt32BE(offset + 4);
    assert.ok(dimensions.has(type));
    const payload = buffer.subarray(offset + 8, offset + length);
    const metadata = await sharp(payload).metadata();
    assert.equal(metadata.format, 'png');
    assert.equal(metadata.width, dimensions.get(type));
    assert.equal(metadata.height, dimensions.get(type));
    offset += length;
  }
  assert.equal(offset, buffer.length);
  assert.equal(dimensions.size, 11);
});

test('writePngSet writes requested image dimensions', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'iconwright-formats-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const paths = await writePngSet(await makeMaster(), dir, 'sample', [16, 48, 256]);
  assert.deepEqual(paths.map((file) => path.basename(file)), ['sample-16.png', 'sample-48.png', 'sample-256.png']);
  for (const [index, size] of [16, 48, 256].entries()) {
    const metadata = await sharp(paths[index]).metadata();
    assert.equal(metadata.width, size);
    assert.equal(metadata.height, size);
  }
});

test('writeFaviconBundle writes web icons, opaque touch icon, and manifest', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'iconwright-formats-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const bundle = await writeFaviconBundle(await makeMaster(), dir, 'sample', { maskableBg: '#123456', svg: '<svg/>' });
  assert.equal(bundle.dir, path.join(dir, 'sample-web'));
  assert.equal(bundle.files.length, 8);
  for (const file of bundle.files) assert.ok((await readFile(file)).length > 0, `${path.basename(file)} should exist`);
  const touch = await sharp(path.join(bundle.dir, 'apple-touch-icon.png')).stats();
  assert.equal(touch.channels[3].min, 255);
  const manifest = JSON.parse(await readFile(path.join(bundle.dir, 'site.webmanifest'), 'utf8'));
  assert.equal(manifest.name, 'sample');
  assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'));
  for (const icon of manifest.icons) await readFile(path.join(bundle.dir, icon.src));
  assert.equal(await readFile(path.join(bundle.dir, 'icon.svg'), 'utf8'), '<svg/>');
});

test('format writers reject a master with incorrect dimensions', async () => {
  const wrongSize = await sharp({ create: { width: 512, height: 512, channels: 4, background: 'red' } }).png().toBuffer();
  await assert.rejects(icnsBuffer(wrongSize), /1024x1024 RGBA PNG/);
});
