import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { largestIcoImage } from './ico.mjs';

const ICONIFY = process.env.ICONWRIGHT_ICONIFY_API || 'https://api.iconify.design';
const MAX_LOCAL_SOURCE = 25 * 1024 * 1024;
const MAX_ICONIFY_RESPONSE = 2 * 1024 * 1024;

// Iconify requests time out instead of hanging an agent call forever.
async function get(url) {
  try { return await fetch(url, { signal: AbortSignal.timeout(20000) }); }
  catch (error) {
    const why = error?.name === 'TimeoutError' ? 'timed out after 20 s' : (error?.cause?.code || error?.message || String(error));
    throw new Error(`Could not reach Iconify (${why}). Check the network, or use a local .svg/.png/.ico file as the source.`);
  }
}

async function readLocalSource(file) {
  const details = await stat(file);
  if (details.size > MAX_LOCAL_SOURCE) throw new Error(`source file too large (max 25 MB): ${file}`);
  return readFile(file);
}

async function responseText(response) {
  const declaredSize = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declaredSize) && declaredSize > MAX_ICONIFY_RESPONSE) {
    throw new Error('Iconify response too large (max 2 MB)');
  }
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_ICONIFY_RESPONSE) {
          await reader.cancel();
          throw new Error('Iconify response too large (max 2 MB)');
        }
        chunks.push(Buffer.from(value));
      }
    } finally {
      reader.releaseLock?.();
    }
    return Buffer.concat(chunks, total).toString('utf8');
  }
  if (typeof response.text === 'function') {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_ICONIFY_RESPONSE) throw new Error('Iconify response too large (max 2 MB)');
    return text;
  }
  const value = await response.json();
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_ICONIFY_RESPONSE) throw new Error('Iconify response too large (max 2 MB)');
  return JSON.stringify(value);
}

export async function loadSource(ref) {
  if (typeof ref !== 'string' || !ref.trim()) throw new Error('source is required');
  const value = ref.trim();
  if (value.startsWith('<svg')) return { svg: value, kind: 'svg' };

  const ext = path.extname(value).toLowerCase();
  if (ext === '.ico') return { raster: await largestIcoImage(await readLocalSource(value)), kind: 'raster' };
  if (['.svg', '.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
    const data = await readLocalSource(value);
    if (ext === '.svg') return { svg: data.toString('utf8'), kind: 'svg' };
    return { raster: data, kind: 'raster' };
  }

  const match = /^([a-z0-9-]+):([a-z0-9-]+)$/i.exec(value);
  if (!match) throw new Error(`unsupported source: ${value}`);
  const [, prefix, name] = match;
  const response = await get(`${ICONIFY}/${encodeURIComponent(prefix)}/${encodeURIComponent(name)}.svg`);
  if (!response.ok) throw new Error(`Iconify source failed (${response.status}): ${value}`);
  return { svg: await responseText(response), kind: 'svg' };
}

export async function searchIcons(query, limit = 20) {
  if (typeof query !== 'string' || !query.trim()) throw new Error('search query is required');
  const safeLimit = Math.max(1, Math.min(999, Math.trunc(Number(limit) || 20)));
  const url = new URL(`${ICONIFY}/search`);
  url.searchParams.set('query', query.trim());
  url.searchParams.set('limit', String(safeLimit));
  const response = await get(url);
  if (!response.ok) throw new Error(`Iconify search failed (${response.status})`);
  const result = JSON.parse(await responseText(response));
  return Array.isArray(result.icons) ? result.icons.slice(0, safeLimit) : [];
}
