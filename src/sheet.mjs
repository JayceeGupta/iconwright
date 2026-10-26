import path from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { largestIcoImage as firstIcoImage } from './ico.mjs';

export async function makeSheet(icoOrPngPaths, outPath) {
  if (!icoOrPngPaths?.length) throw new Error('sheet requires at least one image');
  if (!outPath) throw new Error('sheet output path is required');
  const cols = Math.min(4, icoOrPngPaths.length), cellW = 180, cellH = 210;
  const rows = Math.ceil(icoOrPngPaths.length / cols);
  const composites = [];
  for (let i = 0; i < icoOrPngPaths.length; i++) {
    const file = icoOrPngPaths[i];
    let input = await readFile(file);
    if (path.extname(file).toLowerCase() === '.ico') input = await firstIcoImage(input);
    const icon = await sharp(input).resize(144, 144, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    const x = (i % cols) * cellW, y = Math.floor(i / cols) * cellH;
    const label = path.basename(file).replace(/[&<>"']/g, '');
    const text = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="180" height="40"><text x="90" y="25" text-anchor="middle" font-family="Arial" font-size="13" fill="#222">${label}</text></svg>`);
    composites.push({ input: icon, left: x + 18, top: y + 10 }, { input: text, left: x, top: y + 160 });
  }
  const output = path.resolve(outPath);
  await mkdir(path.dirname(output), { recursive: true });
  await sharp({ create: { width: cols * cellW, height: rows * cellH, channels: 4, background: '#eeeeee' } }).composite(composites).png().toFile(output);
  return output;
}
