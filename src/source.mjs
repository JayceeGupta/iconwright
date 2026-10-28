import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';
import { mkdir, writeFile, rename } from 'node:fs/promises';
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

// ---------- Iconify icons, cached on disk (an icon id's artwork doesn't change) ----------
const ICON_ID = /^([a-z0-9]+(?:-[a-z0-9]+)*):([a-z0-9]+(?:[-_][a-z0-9]+)*)$/i;
export const isIconId = (s) => typeof s === 'string' && ICON_ID.test(s.trim()) && !/^[a-z]:[\\/]/i.test(s.trim());

export function cacheDir() {
  if (process.env.ICONWRIGHT_CACHE) return path.resolve(process.env.ICONWRIGHT_CACHE);
  return process.platform === 'win32'
    ? path.resolve(process.env.LOCALAPPDATA || path.join(homedir(), 'AppData', 'Local'), 'iconwright', 'cache')
    : path.resolve(homedir(), '.cache', 'iconwright');
}
const cachePath = (prefix, name) => path.join(cacheDir(), 'iconify', prefix, `${name}.svg`);

async function readCached(prefix, name) {
  try { return await readFile(cachePath(prefix, name), 'utf8'); } catch { return null; }
}
async function writeCached(prefix, name, svg) {
  try {
    const file = cachePath(prefix, name);
    await mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, svg);
    await rename(tmp, file);
  } catch { /* a cache miss next time is fine */ }
}

// Builds an <svg> from Iconify icon JSON data.
function iconSvg(set, data) {
  const w = data.width ?? set.width ?? 16, h = data.height ?? set.height ?? 16;
  const l = data.left ?? set.left ?? 0, t = data.top ?? set.top ?? 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${l} ${t} ${w} ${h}">${data.body}</svg>`;
}

/**
 * Fetch many Iconify icons at once: one request per icon set, cached on disk.
 * Returns Map(id -> svg text); ids that don't exist are missing from the map.
 */
export async function fetchIcons(ids) {
  const wanted = [...new Set(ids.map((i) => String(i).trim()).filter((i) => ICON_ID.test(i)))];
  const out = new Map(), byPrefix = new Map();
  for (const id of wanted) {
    const [prefix, name] = id.split(':');
    const cached = await readCached(prefix, name);
    if (cached) { out.set(id, cached); continue; }
    if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
    byPrefix.get(prefix).push(name);
  }
  await Promise.all([...byPrefix].map(async ([prefix, names]) => {
    // Batches stay under ~450 characters of names, like Iconify's own client.
    const chunks = [[]];
    for (const n of names.sort()) {
      if (chunks.at(-1).join(',').length + n.length > 450) chunks.push([]);
      chunks.at(-1).push(n);
    }
    for (const chunk of chunks) {
      const response = await get(`${ICONIFY}/${encodeURIComponent(prefix)}.json?icons=${chunk.map(encodeURIComponent).join(',')}`);
      if (!response.ok) continue;
      const set = JSON.parse(await responseText(response));
      for (const name of chunk) {
        let data = set.icons?.[name];
        const alias = set.aliases?.[name];
        // Plain aliases point at a parent icon; ones with transforms use the SVG endpoint below.
        if (!data && alias && !alias.rotate && !alias.hFlip && !alias.vFlip && set.icons?.[alias.parent]) data = { ...set.icons[alias.parent], ...alias };
        if (!data?.body) continue;
        const svg = iconSvg(set, data);
        out.set(`${prefix}:${name}`, svg);
        await writeCached(prefix, name, svg);
      }
    }
  }));
  await Promise.all(wanted.filter((id) => !out.has(id) && byPrefix.size).map(async (id) => {
    const [prefix, name] = id.split(':');
    const response = await get(`${ICONIFY}/${encodeURIComponent(prefix)}/${encodeURIComponent(name)}.svg`);
    if (!response.ok) return;
    const svg = await responseText(response);
    if (svg.trim().startsWith('<svg')) { out.set(id, svg); await writeCached(prefix, name, svg); }
  }));
  return out;
}

export async function loadSource(ref) {
  if (typeof ref !== 'string' || !ref.trim()) throw new Error('source is required');
  const value = ref.trim();
  if (value.startsWith('<svg') || value.startsWith('<?xml')) return { svg: value, kind: 'svg' };

  const ext = path.extname(value).toLowerCase();
  if (ext === '.ico') return { raster: await largestIcoImage(await readLocalSource(value)), kind: 'raster' };
  if (['.svg', '.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
    const data = await readLocalSource(value);
    if (ext === '.svg') return { svg: data.toString('utf8'), kind: 'svg' };
    return { raster: data, kind: 'raster' };
  }
  if (!isIconId(value)) throw new Error(`unsupported source: ${value} (use an Iconify id like "mdi:music", an image file path, or raw <svg>)`);
  const svg = (await fetchIcons([value])).get(value);
  if (!svg) throw new Error(`Iconify has no icon "${value}"; find ids with search_icons`);
  return { svg, kind: 'svg' };
}

/**
 * Search Iconify. Returns { icons: [ids], total, collections: { prefix: { name, license } } }.
 * opts: limit (1-999, default 20), start (offset, for more results), collections (icon set prefixes),
 * palette ("mono": single-color sets, which recolor cleanly; "color": multicolor sets).
 */
export async function searchIconsDetailed(query, { limit = 20, start = 0, collections, palette } = {}) {
  if (typeof query !== 'string' || !query.trim()) throw new Error('search query is required');
  const want = Math.max(1, Math.min(999, Math.trunc(Number(limit) || 20)));
  const url = new URL(`${ICONIFY}/search`);
  url.searchParams.set('query', query.trim());
  // Iconify's smallest page is 32. A palette filter is applied here, so ask for more.
  url.searchParams.set('limit', String(Math.min(999, Math.max(32, palette ? 400 : want))));
  if (start) url.searchParams.set('start', String(Math.max(0, Math.trunc(start))));
  if (collections?.length) url.searchParams.set('prefixes', collections.join(','));
  const response = await get(url);
  if (!response.ok) throw new Error(`Iconify search failed (${response.status})`);
  const result = JSON.parse(await responseText(response));
  const wantColor = palette === 'color';
  const fits = (id) => !palette || Boolean(result.collections?.[id.split(':')[0]]?.palette) === wantColor;
  const icons = Array.isArray(result.icons) ? result.icons.filter(fits).slice(0, want) : [];
  const used = new Set(icons.map((i) => i.split(':')[0]));
  const sets = {};
  for (const [prefix, info] of Object.entries(result.collections ?? {})) {
    if (used.has(prefix)) sets[prefix] = { name: info.name, license: info.license?.spdx || info.license?.title };
  }
  return { icons, total: result.total ?? icons.length, collections: sets };
}

export async function searchIcons(query, limit = 20) {
  return (await searchIconsDetailed(query, { limit })).icons;
}
