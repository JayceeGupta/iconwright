// Serves site/dist like Vercel does (clean URLs, /api/* -> the hosted studio API) for local checks.
// Usage: node scripts/dev/serve-site.mjs [port]
import http from 'node:http';
import path from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createStudioHandler } from '../../src/studio.mjs';

const dist = fileURLToPath(new URL('../../site/dist/', import.meta.url));
const api = createStudioHandler({ local: false });
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.json': 'application/json' };
const port = Number(process.argv[2]) || 4318;

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) return api(req, res);
  let file = path.join(dist, decodeURIComponent(url.pathname));
  if (!file.startsWith(dist.slice(0, -1))) { res.writeHead(403); return res.end(); }
  const candidates = [file, `${file}.html`, path.join(file, 'index.html')];
  for (const f of candidates) {
    const s = await stat(f).catch(() => null);
    if (s?.isFile()) { res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); return res.end(await readFile(f)); }
  }
  res.writeHead(404); res.end('Not found');
}).listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}/`));
