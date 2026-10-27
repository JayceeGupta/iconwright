import sharp from 'sharp';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function invalid(reason) {
  throw new Error(`invalid ICO: ${reason}`);
}

function readUInt16(buffer, offset, label) {
  if (offset < 0 || offset + 2 > buffer.length) invalid(`truncated ${label}`);
  return buffer.readUInt16LE(offset);
}

function readUInt32(buffer, offset, label) {
  if (offset < 0 || offset + 4 > buffer.length) invalid(`truncated ${label}`);
  return buffer.readUInt32LE(offset);
}

function readInt32(buffer, offset, label) {
  if (offset < 0 || offset + 4 > buffer.length) invalid(`truncated ${label}`);
  return buffer.readInt32LE(offset);
}

function dibPixel(image, rowStart, x, bitDepth, paletteStart, paletteCount) {
  if (bitDepth === 1 || bitDepth === 4 || bitDepth === 8) {
    let index;
    if (bitDepth === 1) index = (image[rowStart + (x >> 3)] >> (7 - (x & 7))) & 1;
    else if (bitDepth === 4) {
      const packed = image[rowStart + (x >> 1)];
      index = (x & 1) === 0 ? packed >> 4 : packed & 0x0f;
    } else index = image[rowStart + x];
    if (index >= paletteCount) invalid('palette index is out of range');
    const offset = paletteStart + index * 4;
    return [image[offset + 2], image[offset + 1], image[offset], 255];
  }
  const offset = rowStart + x * (bitDepth / 8);
  if (bitDepth === 24) return [image[offset + 2], image[offset + 1], image[offset], 255];
  return [image[offset + 2], image[offset + 1], image[offset], image[offset + 3]];
}

// Returns the largest image in an .ico as a PNG buffer.
export async function largestIcoImage(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 6) invalid('truncated ICO header');
  if (readUInt16(buffer, 0, 'ICO header') !== 0 || readUInt16(buffer, 2, 'ICO header') !== 1) invalid('invalid header');
  const count = readUInt16(buffer, 4, 'ICO header');
  if (count === 0) invalid('ICO has no image entries');
  const tableEnd = 6 + count * 16;
  if (tableEnd > buffer.length) invalid('truncated image directory');

  let best = null;
  for (let i = 0; i < count; i++) {
    const entry = 6 + i * 16;
    const width = buffer[entry] || 256;
    const bitDepth = readUInt16(buffer, entry + 6, 'image directory entry');
    const length = readUInt32(buffer, entry + 8, 'image directory entry');
    const offset = readUInt32(buffer, entry + 12, 'image directory entry');
    if (length === 0 || offset < tableEnd || offset + length > buffer.length) invalid('image entry is out of bounds');
    if (!best || width > best.width || (width === best.width && bitDepth > best.bitDepth)) {
      best = { offset, length, width, bitDepth };
    }
  }

  const image = buffer.subarray(best.offset, best.offset + best.length);
  if (image.length >= PNG_SIGNATURE.length && image.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return Buffer.from(image);
  if (image.length < 40) invalid('truncated DIB header');

  const headerSize = readUInt32(image, 0, 'DIB header');
  if (headerSize < 40 || headerSize > image.length) invalid('unsupported DIB header');
  const width = readInt32(image, 4, 'DIB dimensions');
  const doubledHeight = readInt32(image, 8, 'DIB dimensions');
  const planes = readUInt16(image, 12, 'DIB header');
  const bitDepth = readUInt16(image, 14, 'DIB header');
  const compression = readUInt32(image, 16, 'DIB header');
  if (width < 1 || width > 256 || doubledHeight === 0 || Math.abs(doubledHeight) % 2 !== 0) invalid('invalid DIB dimensions');
  const height = Math.abs(doubledHeight) / 2;
  if (height < 1 || height > 256) invalid('invalid DIB dimensions');
  if (planes !== 1 || ![1, 4, 8, 24, 32].includes(bitDepth)) invalid('unsupported DIB bit depth');
  if (compression !== 0) invalid('unsupported DIB compression');

  const colorsUsed = readUInt32(image, 32, 'DIB header');
  const paletteCount = bitDepth <= 8 ? (colorsUsed || (1 << bitDepth)) : colorsUsed;
  if (paletteCount > (bitDepth <= 8 ? 1 << bitDepth : 256)) invalid('invalid DIB palette size');
  const paletteStart = headerSize;
  const paletteBytes = paletteCount * 4;
  const pixelStart = paletteStart + paletteBytes;
  if (pixelStart > image.length) invalid('truncated DIB palette');

  const xorStride = Math.ceil((width * bitDepth) / 32) * 4;
  const xorLength = xorStride * height;
  const xorEnd = pixelStart + xorLength;
  if (!Number.isSafeInteger(xorEnd) || xorEnd > image.length) invalid('truncated DIB pixel data');
  const maskStride = Math.ceil(width / 32) * 4;
  const maskLength = maskStride * height;
  const maskAvailable = image.length - xorEnd;
  if (maskAvailable > 0 && maskAvailable < maskLength) invalid('truncated DIB transparency mask');
  const hasMask = maskAvailable >= maskLength;
  const topDown = doubledHeight < 0;
  const raw = Buffer.alloc(width * height * 4);
  let hasAlpha = false;

  for (let y = 0; y < height; y++) {
    const sourceY = topDown ? y : height - 1 - y;
    const rowStart = pixelStart + sourceY * xorStride;
    for (let x = 0; x < width; x++) {
      const pixel = dibPixel(image, rowStart, x, bitDepth, paletteStart, paletteCount);
      const to = (y * width + x) * 4;
      raw[to] = pixel[0]; raw[to + 1] = pixel[1]; raw[to + 2] = pixel[2]; raw[to + 3] = pixel[3];
      if (bitDepth === 32 && pixel[3] !== 0) hasAlpha = true;
    }
  }

  if (bitDepth < 32 || !hasAlpha) {
    for (let y = 0; y < height; y++) {
      const sourceY = topDown ? y : height - 1 - y;
      const maskRow = xorEnd + sourceY * maskStride;
      for (let x = 0; x < width; x++) {
        const to = (y * width + x) * 4;
        raw[to + 3] = hasMask && (image[maskRow + (x >> 3)] & (0x80 >> (x & 7))) ? 0 : 255;
      }
    }
  }

  return sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
}
