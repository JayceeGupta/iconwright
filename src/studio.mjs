// iconwright studio: a web UI for designing icons by hand, served locally (`iconwright studio`)
// or hosted (the site's /studio, via a serverless function). Same engine as the MCP tools.
//
// Local mode binds 127.0.0.1 and requires a per-session token on every API call, so other
// websites can't drive it; it can also save files and (on Windows) apply icons to apps.
// Hosted mode only accepts Iconify ids and raw SVG as sources and never touches disk except temp files.
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { readFile, mkdtemp, rm, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { resizePng, makeIcon, parseStyle, formatStyle, FORMATS, safeName, defaultOutDir, artFor } from './render.mjs';
import { resolveOwnIcons, isOwnIcon } from './own-icons.mjs';
import { searchIconsDetailed, isIconId, loadSource } from './source.mjs';
import { zip } from './zip.mjs';

const STATIC_DIR = fileURLToPath(new URL('../studio/', import.meta.url));
// The studio draws in the browser with the same recipes the server uses; serve them as-is.
const EXTRA_DIRS = { 'shared/': fileURLToPath(new URL('./shared/', import.meta.url)), 'neighbors/': fileURLToPath(new URL('../assets/neighbors/', import.meta.url)) };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const MAX_BODY = 1_000_000;

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

function send(res, status, body, type = 'application/json; charset=utf-8', extra = {}) {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra });
  res.end(data);
}

async function readBody(req) {
  if (req.body !== undefined) {   // Vercel pre-parses bodies; still hold them to the same limit
    const text = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
    if (text.length > MAX_BODY) throw new HttpError(413, 'Request too large (max 1 MB)');
    return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
  }
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > MAX_BODY) throw new HttpError(413, 'Request too large (max 1 MB)'); chunks.push(c); }
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

// Request parameters: query string, overlaid by a JSON body for POST.
async function params(req, url) {
  const p = Object.fromEntries(url.searchParams);
  for (const k of ['sources', 'styles', 'scenes', 'formats', 'apps']) if (url.searchParams.getAll(k).length > 1) p[k] = url.searchParams.getAll(k);
  if (req.method === 'POST') Object.assign(p, await readBody(req));
  return p;
}
const list = (v) => (v == null || v === '' ? [] : Array.isArray(v) ? v : String(v).split(',').map((s) => s.trim()).filter(Boolean));

/**
 * The API + static handler. opts: local (bool), token (local only), win (Windows bridge or null).
 * Returns (req, res) => Promise.
 */
export function createStudioHandler({ local = false, token = null, win = null, exclusive = (fn) => fn() } = {}) {
  // A source the current mode accepts, as something renderMaster can load.
  async function source(value) {
    const s = String(value ?? '').trim();
    if (!s) throw new HttpError(400, 'Choose an icon first.');
    if (s.startsWith('<svg') || s.startsWith('<?xml')) {
      if (s.length > 500_000) throw new HttpError(413, 'That SVG is too large (max 500 KB).');
      // Hosted: no entities, scripts or references to anything outside the SVG itself.
      if (!local && /<!ENTITY|<!DOCTYPE|<script|<foreignObject|\bhref\s*=\s*["']\s*(?!#|data:image\/)/i.test(s)) {
        throw new HttpError(400, 'That SVG links to outside files or has scripts; remove them, or use the local studio.');
      }
      return s;
    }
    // Before the Iconify check: "app:zen" and "desktop:this-pc" look like icon ids.
    if (local && isOwnIcon(s) && win) {
      try { return (await resolveOwnIcons([s], win))[0]; } catch (e) { throw new HttpError(400, e.message); }
    }
    if (isIconId(s)) return s;
    if (local && path.isAbsolute(s)) return s;
    throw new HttpError(400, local ? 'Use an Iconify id, pasted SVG, an image file path, app:<name> or desktop:<item>.' : 'Use an Iconify id or pasted SVG.');
  }
  const style = (p) => { try { return parseStyle(p.style); } catch (e) { throw new HttpError(400, e.message); } };

  const routes = {
    async info() {
      return { local, windows: Boolean(win), formats: FORMATS };
    },
    async search(p) {
      const palette = ['mono', 'color'].includes(p.palette) ? p.palette : undefined;
      const r = await searchIconsDetailed(String(p.q ?? ''), { limit: Math.min(96, Number(p.limit) || 48), start: Number(p.start) || 0, collections: list(p.collections), palette });
      return { icons: r.icons, total: r.total, collections: r.collections };
    },
    // Measured artwork for the browser to draw: { svg, box } or { href, width, height, box }.
    // cutout: with the artwork's own background removed (pixel work, so done here).
    async art(p) {
      return artFor(await source(p.source), { cutout: p.cutout === true || p.cutout === 'true' });
    },
    async download(p) {
      const format = String(p.format || 'ico');
      if (!FORMATS.includes(format)) throw new HttpError(400, `Unknown format: ${format}`);
      const name = safeName(p.name || 'icon');
      const dir = await mkdtemp(path.join(os.tmpdir(), 'iconwright-'));
      try {
        const made = await makeIcon({ source: await source(p.source), ...style(p), name, outDir: dir, formats: [format], preview: false });
        if (format === 'ico' || format === 'png' || format === 'icns') {
          const file = made[format];
          const ext = path.extname(file);
          return { raw: await readFile(file), type: MIME[ext] || 'application/octet-stream', headers: { 'content-disposition': `attachment; filename="${path.basename(file)}"` } };
        }
        // Bundles download as a zip.
        const folder = format === 'web' ? made.web : dir;
        const files = [];
        for (const f of await readdir(folder, { withFileTypes: true })) if (f.isFile()) files.push({ name: f.name, data: await readFile(path.join(folder, f.name)) });
        return { raw: zip(files), type: 'application/zip', headers: { 'content-disposition': `attachment; filename="${name}-${format}.zip"` } };
      } finally { await rm(dir, { recursive: true, force: true }); }
    },
  };
  // Local only: things that touch this PC.
  const localRoutes = {
    async save(p) {
      const out = p.outDir ? path.resolve(String(p.outDir)) : defaultOutDir();
      const made = await makeIcon({ source: await source(p.source), ...style(p), name: p.name || 'icon', outDir: out, formats: list(p.formats).length ? list(p.formats) : ['ico', 'png'] });
      return made;
    },
    async apps() {
      if (!win) throw new HttpError(400, 'App icons are Windows-only.');
      const status = await win('status');
      const names = status.pins.map((x) => x.name).filter((n) => n && n !== '(unknown)');
      const images = names.length ? await win('app-icon-image', { app: names }) : [];
      return { pinned: images.map((i) => ({ name: i.app, ok: !i.error })) };
    },
    async appIcon(p) {
      if (!win) throw new HttpError(400, 'App icons are Windows-only.');
      const [img] = await win('app-icon-image', { app: [String(p.app)] });
      if (img?.error) throw new HttpError(404, img.error);
      const loaded = await loadSource(img.image);   // .ico files are decoded to their largest image
      return { raw: await resizePng(loaded.raster ?? Buffer.from(loaded.svg), Math.min(256, Number(p.size) || 64)), type: 'image/png', headers: { 'cache-control': 'private, max-age=60' } };
    },
    async apply(p) {
      if (!win) throw new HttpError(400, 'Applying icons is Windows-only.');
      const { applyIcons } = await import('./apply.mjs');
      const apps = list(p.apps);
      if (!apps.length) throw new HttpError(400, 'Choose at least one app.');
      const src = String(p.source) === 'app' ? 'app' : await source(p.source);
      const r = await exclusive(() => applyIcons({ apps, source: src, ...style(p) }, win));
      delete r.preview;
      return r;
    },
  };

  return async function handler(req, res) {
    const url = new URL(req.url, 'http://localhost');
    try {
      let op = url.pathname.startsWith('/api/') ? url.pathname.slice(5) : url.searchParams.get('op');
      if (op === 'studio') op = url.searchParams.get('op');   // hosted: /api/:op is rewritten to /api/studio?op=:op
      if (op) {
        if (local) {
          // Only this machine's browser, only with the session token (blocks other sites and DNS rebinding).
          const host = String(req.headers.host || '').replace(/:\d+$/, '');
          if (!['127.0.0.1', 'localhost'].includes(host)) throw new HttpError(403, 'Forbidden host.');
          if (req.headers['x-iconwright-token'] !== token && url.searchParams.get('t') !== token) throw new HttpError(403, 'Missing studio token; open the link iconwright printed.');
        }
        const fn = routes[op] || (local && localRoutes[op]);
        if (!fn) throw new HttpError(404, `Unknown API: ${op}`);
        const out = await fn(await params(req, url));
        if (out?.raw !== undefined) return send(res, 200, out.raw, out.type, out.headers);
        return send(res, 200, out);
      }
      if (!local) throw new HttpError(404, 'Not found');
      // Static files for the local studio.
      const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
      const extra = Object.keys(EXTRA_DIRS).find((d) => rel.startsWith(d));
      const root = extra ? EXTRA_DIRS[extra] : STATIC_DIR;
      const file = path.resolve(root, extra ? rel.slice(extra.length) : rel);
      if (!file.startsWith(root)) throw new HttpError(403, 'Forbidden');
      const data = await readFile(file).catch(() => { throw new HttpError(404, 'Not found'); });
      return send(res, 200, data, MIME[path.extname(file)] || 'application/octet-stream');
    } catch (e) {
      const status = e.status || 500;
      return send(res, status, { error: e.message || String(e) });
    }
  };
}

/** Open a URL in the default browser. */
export function openBrowser(url) {
  // rundll32 hands the URL to the default browser without any shell parsing of & or %.
  const [cmd, args] = process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

/**
 * Start the local studio. Returns { base, url(design), close }. opts: port (0 = any free), win,
 * keepAlive (the CLI keeps the process running; the MCP server doesn't let the studio hold it open).
 * One studio per process: calling again returns the running one.
 */
let running = null;
export async function startStudio({ port = 0, win = null, exclusive, keepAlive = false } = {}) {
  if (running) return running;
  const token = randomBytes(16).toString('hex');
  const server = http.createServer(createStudioHandler({ local: true, token, win, exclusive }));
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${server.address().port}/?t=${token}`;
  running = {
    base,
    url: (design = {}) => {
      const hash = new URLSearchParams();
      if (design.source) hash.set('source', design.source);
      if (design.style) hash.set('style', typeof design.style === 'string' ? design.style : formatStyle(design.style));
      if (design.label) hash.set('label', design.label);
      return hash.size ? `${base}#${hash}` : base;
    },
    close: () => { server.close(); running = null; },
  };
  if (!keepAlive) server.unref();
  return running;
}

