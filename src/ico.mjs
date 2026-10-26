import sharp from 'sharp';

// Returns the largest image in an .ico as a PNG buffer.
export async function largestIcoImage(buffer) {
  if (buffer.readUInt16LE(0) !== 0 || buffer.readUInt16LE(2) !== 1) throw new Error('invalid ICO file');
  const count = buffer.readUInt16LE(4);
  let best = 6, bestSize = -1;
  for (let i = 0; i < count; i++) {
    const e = 6 + i * 16, size = (buffer[e] || 256) * (buffer[e + 1] || 256);
    if (size > bestSize) { bestSize = size; best = e; }
  }
  const offset = buffer.readUInt32LE(best + 12), length = buffer.readUInt32LE(best + 8);
  const image = buffer.subarray(offset, offset + length);
  if (image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return image;
  // png-to-ico emits 32-bit DIB entries. Convert the XOR bitmap to PNG for Sharp.
  const headerSize = image.readUInt32LE(0);
  if (headerSize < 40 || image.readUInt16LE(14) !== 32) throw new Error('unsupported ICO image encoding');
  const width = image.readInt32LE(4), doubledHeight = image.readInt32LE(8);
  const height = Math.floor(Math.abs(doubledHeight) / 2);
  const topDown = doubledHeight < 0;
  const pixelStart = headerSize;
  const stride = Math.floor((width * 32 + 31) / 32) * 4;
  const raw = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const sourceY = topDown ? y : height - 1 - y;
    for (let x = 0; x < width; x++) {
      const from = pixelStart + sourceY * stride + x * 4;
      const to = (y * width + x) * 4;
      raw[to] = image[from + 2]; raw[to + 1] = image[from + 1]; raw[to + 2] = image[from]; raw[to + 3] = image[from + 3];
    }
  }
  return sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
}
