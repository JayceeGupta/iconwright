import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { largestIcoImage } from '../src/ico.mjs';

function dibBuffer({ width, rows, bitDepth, palette = [], maskRows, topDown = false }) {
  const height = rows.length;
  const xorStride = Math.ceil(width * bitDepth / 32) * 4;
  const maskStride = Math.ceil(width / 32) * 4;
  const pixelStart = 40 + palette.length * 4;
  const output = Buffer.alloc(pixelStart + xorStride * height + maskStride * height);
  output.writeUInt32LE(40, 0);
  output.writeInt32LE(width, 4);
  output.writeInt32LE((topDown ? -1 : 1) * height * 2, 8);
  output.writeUInt16LE(1, 12);
  output.writeUInt16LE(bitDepth, 14);
  output.writeUInt32LE(0, 16);
  output.writeUInt32LE(palette.length, 32);
  palette.forEach((pixel, i) => {
    const offset = 40 + i * 4;
    output[offset] = pixel.b; output[offset + 1] = pixel.g; output[offset + 2] = pixel.r;
  });

  for (let y = 0; y < height; y++) {
    const storedY = topDown ? y : height - 1 - y;
    const row = pixelStart + storedY * xorStride;
    for (let x = 0; x < width; x++) {
      const pixel = rows[y][x];
      if (bitDepth === 1) output[row + (x >> 3)] |= (pixel & 1) << (7 - (x & 7));
      else if (bitDepth === 4) output[row + (x >> 1)] |= (pixel & 0xf) << ((x & 1) === 0 ? 4 : 0);
      else if (bitDepth === 8) output[row + x] = pixel;
      else if (bitDepth === 24) {
        const offset = row + x * 3;
        output[offset] = pixel[2]; output[offset + 1] = pixel[1]; output[offset + 2] = pixel[0];
      } else {
        const offset = row + x * 4;
        output[offset] = pixel[2]; output[offset + 1] = pixel[1]; output[offset + 2] = pixel[0]; output[offset + 3] = pixel[3];
      }
    }
    const maskStart = pixelStart + xorStride * height + storedY * maskStride;
    for (let x = 0; x < width; x++) if (maskRows?.[y]?.[x]) output[maskStart + (x >> 3)] |= 0x80 >> (x & 7);
  }
  return output;
}

function icoEntry(image, { width, height, bitDepth }) {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
  header[6] = width === 256 ? 0 : width;
  header[7] = height === 256 ? 0 : height;
  header.writeUInt16LE(1, 10); header.writeUInt16LE(bitDepth, 12);
  header.writeUInt32LE(image.length, 14); header.writeUInt32LE(22, 18);
  return Buffer.concat([header, image]);
}

async function pixels(image) {
  const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

test('decodes 1-, 4-, and 8-bit palette DIBs and applies the AND mask', async () => {
  const palette = [{ r: 255, g: 0, b: 0 }, { r: 0, g: 255, b: 0 }, { r: 0, g: 0, b: 255 }];
  for (const bitDepth of [1, 4, 8]) {
    const rows = [[0, 1, bitDepth === 1 ? 0 : 2]];
    const image = dibBuffer({ width: 3, rows, bitDepth, palette: palette.slice(0, bitDepth === 1 ? 2 : 3), maskRows: [[false, true, false]] });
    const { data, width } = await pixels(await largestIcoImage(icoEntry(image, { width: 3, height: 1, bitDepth })));
    assert.equal(width, 3);
    assert.deepEqual([...data], [255, 0, 0, 255, 0, 255, 0, 0, ...(bitDepth === 1 ? [255, 0, 0, 255] : [0, 0, 255, 255])]);
  }
});

test('decodes padded 24-bit rows in bottom-up and top-down DIBs', async () => {
  const rows = [
    [[255, 0, 0], [0, 255, 0]],
    [[0, 0, 255], [255, 255, 255]],
  ];
  for (const topDown of [false, true]) {
    const image = dibBuffer({ width: 2, rows, bitDepth: 24, maskRows: [[false, false], [false, false]], topDown });
    const { data, width, height } = await pixels(await largestIcoImage(icoEntry(image, { width: 2, height: 2, bitDepth: 24 })));
    assert.equal(width, 2); assert.equal(height, 2);
    assert.deepEqual([...data], [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]);
  }
});

test('uses the AND mask when 32-bit DIB alpha bytes are all zero', async () => {
  const image = dibBuffer({
    width: 2, bitDepth: 32, rows: [[[255, 0, 0, 0], [0, 0, 255, 0]]],
    maskRows: [[false, true]],
  });
  const { data } = await pixels(await largestIcoImage(icoEntry(image, { width: 2, height: 1, bitDepth: 32 })));
  assert.deepEqual([...data], [255, 0, 0, 255, 0, 0, 255, 0]);
});

test('returns PNG entries directly and checks directory bounds', async () => {
  const png = await sharp({ create: { width: 2, height: 2, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 0.5 } } }).png().toBuffer();
  const decoded = await largestIcoImage(icoEntry(png, { width: 2, height: 2, bitDepth: 32 }));
  const { data } = await pixels(decoded);
  assert.deepEqual([...data.slice(0, 4)], [10, 20, 30, 128]);

  const invalid = icoEntry(png, { width: 2, height: 2, bitDepth: 32 });
  invalid.writeUInt32LE(png.length + 1, 14);
  await assert.rejects(largestIcoImage(invalid), /invalid ICO: image entry is out of bounds/);
});
