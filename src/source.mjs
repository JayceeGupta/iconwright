import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { largestIcoImage } from './ico.mjs';

const ICONIFY = process.env.ICONWRIGHT_ICONIFY_API || 'https://api.iconify.design';

// Iconify requests time out instead of hanging an agent call forever.
async function get(url) {
  try { return await fetch(url, { signal: AbortSignal.timeout(20000) }); }
  catch (error) {
    const why = error?.name === 'TimeoutError' ? 'timed out after 20 s' : (error?.cause?.code || error?.message || String(error));
    throw new Error(`Could not reach Iconify (${why}). Check the network, or use a local .svg/.png/.ico file as the source.`);
  }
}

export async function loadSource(ref) {
  if (typeof ref !== 'string' || !ref.trim()) throw new Error('source is required');
  const value = ref.trim();
  if (value.startsWith('<svg')) return { svg: value, kind: 'svg' };

  const ext = path.extname(value).toLowerCase();
  if (ext === '.ico') return { raster: await largestIcoImage(await readFile(value)), kind: 'raster' };
  if (['.svg', '.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
    const data = await readFile(value);
    if (ext === '.svg') return { svg: data.toString('utf8'), kind: 'svg' };
    return { raster: data, kind: 'raster' };
  }

  const match = /^([a-z0-9-]+):([a-z0-9-]+)$/i.exec(value);
  if (!match) throw new Error(`unsupported source: ${value}`);
  const [, prefix, name] = match;
  const response = await get(`${ICONIFY}/${encodeURIComponent(prefix)}/${encodeURIComponent(name)}.svg`);
  if (!response.ok) throw new Error(`Iconify source failed (${response.status}): ${value}`);
  return { svg: await response.text(), kind: 'svg' };
}

export async function searchIcons(query, limit = 20) {
  if (typeof query !== 'string' || !query.trim()) throw new Error('search query is required');
  const safeLimit = Math.max(1, Math.min(999, Math.trunc(Number(limit) || 20)));
  const url = new URL(`${ICONIFY}/search`);
  url.searchParams.set('query', query.trim());
  url.searchParams.set('limit', String(safeLimit));
  const response = await get(url);
  if (!response.ok) throw new Error(`Iconify search failed (${response.status})`);
  const result = await response.json();
  return Array.isArray(result.icons) ? result.icons : [];
}
