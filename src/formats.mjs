import path from 'node:path';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { atomicWrite, ensureDir } from './fsutil.mjs';

const MASTER_SIZE = 1024;
const RESIZE_OPTIONS = {
  fit: 'contain',
  background: { r: 0, g: 0, b: 0, alpha: 0 },
  kernel: 'lanczos3',
};

// Apple Icon Image format lists these PNG payload types and pixel dimensions: https://github.com/fiahfy/icns
const ICNS_CHUNKS = [
  ['ic07', 128], ['ic08', 256], ['ic09', 512], ['ic10', 1024],
  ['ic11', 32], ['ic12', 64], ['ic13', 256], ['ic14', 512],
  ['icp4', 16], ['icp5', 32], ['icp6', 64],
];

async function validateMaster(master) {
  let metadata;
  try {
    metadata = await sharp(master).metadata();
  } catch (error) {
    throw new Error(`master must be a decodable 1024x1024 RGBA PNG: ${error.message}`);
  }
  if (metadata.format !== 'png' || metadata.width !== MASTER_SIZE || metadata.height !== MASTER_SIZE || metadata.channels !== 4) {
    throw new Error('master must be a 1024x1024 RGBA PNG');
  }
}

async function resized(master, size) {
  return sharp(master).resize(size, size, RESIZE_OPTIONS).png().toBuffer();
}

export async function icnsBuffer(master) {
  await validateMaster(master);
  const images = new Map();
  for (const [, size] of ICNS_CHUNKS) {
    if (!images.has(size)) images.set(size, await resized(master, size));
  }
  const chunks = ICNS_CHUNKS.map(([type, size]) => {
    const payload = images.get(size);
    const header = Buffer.alloc(8);
    header.write(type, 0, 4, 'ascii');
    header.writeUInt32BE(payload.length + 8, 4);
    return Buffer.concat([header, payload]);
  });
  const length = 8 + chunks.reduce((total, chunk) => total + chunk.length, 0);
  const header = Buffer.alloc(8);
  header.write('icns', 0, 4, 'ascii');
  header.writeUInt32BE(length, 4);
  return Buffer.concat([header, ...chunks], length);
}

export async function writeIcns(master, file) {
  await validateMaster(master);
  await atomicWrite(file, await icnsBuffer(master));
  return file;
}

export async function writePngSet(master, outDir, name, sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024]) {
  await validateMaster(master);
  if (!Array.isArray(sizes) || sizes.some((size) => !Number.isInteger(size) || size < 16 || size > MASTER_SIZE)) {
    throw new Error('sizes must be integers from 16 to 1024');
  }
  await ensureDir(outDir);
  const paths = [];
  for (const size of sizes) {
    const file = path.join(outDir, `${name}-${size}.png`);
    await atomicWrite(file, await resized(master, size));
    paths.push(file);
  }
  return paths;
}

async function opaquePng(master, size, background, artworkSize = size) {
  const artwork = await resized(master, artworkSize);
  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: artwork, left: Math.floor((size - artworkSize) / 2), top: Math.floor((size - artworkSize) / 2) }])
    .png().toBuffer();
}

// maskable: an optional full-bleed 1024 px image (artwork inside the safe zone) used as is.
export async function writeFaviconBundle(master, outDir, name, { maskableBg, svg, maskable } = {}) {
  await validateMaster(master);
  const dir = path.join(outDir, `${name}-web`);
  await ensureDir(dir);
  const bg = maskableBg ?? '#ffffff';
  const fileNames = ['favicon.ico', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'site.webmanifest', 'head.html'];
  if (svg !== undefined) fileNames.push('icon.svg');

  const icoPngs = await Promise.all([16, 32, 48].map((size) => resized(master, size)));
  await atomicWrite(path.join(dir, 'favicon.ico'), await pngToIco(icoPngs));
  await atomicWrite(path.join(dir, 'apple-touch-icon.png'), await opaquePng(master, 180, bg));
  await atomicWrite(path.join(dir, 'icon-192.png'), await resized(master, 192));
  await atomicWrite(path.join(dir, 'icon-512.png'), await resized(master, 512));
  await atomicWrite(path.join(dir, 'icon-maskable-512.png'), maskable
    ? await sharp(maskable).resize(512, 512, { kernel: 'lanczos3' }).flatten({ background: bg }).png().toBuffer()
    : await opaquePng(master, 512, bg, 410));
  if (svg !== undefined) await atomicWrite(path.join(dir, 'icon.svg'), svg);

  const icons = [
    { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ];
  const manifest = `${JSON.stringify({ name, icons }, null, 2)}\n`;
  await atomicWrite(path.join(dir, 'site.webmanifest'), manifest);
  const head = [
    '<link rel="icon" href="favicon.ico" sizes="any">',
    ...(svg !== undefined ? ['<link rel="icon" href="icon.svg" type="image/svg+xml">'] : []),
    '<link rel="apple-touch-icon" href="apple-touch-icon.png">',
    '<link rel="manifest" href="site.webmanifest">',
  ].join('\n') + '\n';
  await atomicWrite(path.join(dir, 'head.html'), head);
  return { dir, files: fileNames.map((file) => path.join(dir, file)) };
}
