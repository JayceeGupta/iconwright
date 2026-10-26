// Builds the static site into site/dist: the landing page plus one HTML page per doc in docs/.
// Run with `npm run site:build`. No network access needed.
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Marked } from 'marked';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dist = path.join(here, 'dist');
const REPO_SLUG = 'JayceeGupta/iconwright';
const REPO = `https://github.com/${REPO_SLUG}`;

// Docs in sidebar order. Files that don't exist are skipped.
const DOCS = [
  ['getting-started', 'Getting started'],
  ['commands', 'Commands'],
  ['safety', 'Safety and risks'],
  ['compatibility', 'Compatibility'],
  ['how-it-works', 'How it works'],
  ['windows-internals', 'Windows internals'],
];

const slug = (text) => text.toLowerCase().replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, '')
  .replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');

// Links between docs point at the generated pages; links to other repo files point at GitHub.
function rewriteHref(href) {
  if (/^(https?:|mailto:|#)/.test(href)) return href;
  const [file, hash] = href.split('#');
  const name = path.basename(file, '.md');
  if (file.endsWith('.md') && DOCS.some(([d]) => d === name)) return `/docs/${name}.html${hash ? `#${hash}` : ''}`;
  if (/(^|\/)README\.md$/.test(file)) return '/';
  const repoPath = path.posix.normalize(path.posix.join('docs', file));
  return `${REPO}/blob/main/${repoPath}${hash ? `#${hash}` : ''}`;
}

function markdown() {
  const md = new Marked({ gfm: true });
  md.use({
    walkTokens(token) { if (token.type === 'link' || token.type === 'image') token.href = rewriteHref(token.href); },
    renderer: {
      heading({ tokens, depth }) {
        const html = this.parser.parseInline(tokens);
        return `<h${depth} id="${slug(html)}">${html}</h${depth}>\n`;
      },
    },
  });
  return md;
}

function page({ title, description, body, current }) {
  const nav = DOCS.filter(([name]) => current.available.has(name))
    .map(([name, label]) => `<a href="/docs/${name}.html"${name === current.name ? ' aria-current="page"' : ''}>${label}</a>`).join('\n      ');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} | iconwright</title>
<meta name="description" content="${description.replace(/"/g, '&quot;')}">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="stylesheet" href="/style.css">
</head>
<body>
<header class="wrap top">
  <a class="brand" href="/"><img src="/logo.png" alt="" width="32" height="32">iconwright</a>
  <nav aria-label="Main">
    <a href="/docs/getting-started.html">Docs</a>
    <a href="/docs/safety.html">Safety</a>
    <a href="${REPO}">GitHub</a>
  </nav>
</header>
<div class="wrap docs">
  <nav class="side" aria-label="Docs">
      ${nav}
  </nav>
  <article class="prose">
${body}
  </article>
</div>
<footer><div class="wrap"><span>iconwright 0.1, MIT license</span><a href="${REPO}/blob/main/docs/${current.name}.md">Edit this page on GitHub</a></div></footer>
</body>
</html>
`;
}

async function inlineIcons(html) {
  const names = [...new Set([...html.matchAll(/\{\{icon:([\w-]+)\}\}/g)].map((m) => m[1]))];
  for (const name of names) {
    let svg = await readFile(path.join(here, 'src', 'icons', `${name}.svg`), 'utf8');
    svg = svg.replace(/\s(width|height)="[^"]*"/g, '').replace('<svg', '<svg aria-hidden="true" focusable="false"');
    html = html.replaceAll(`{{icon:${name}}}`, svg);
  }
  return html;
}

await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, 'docs'), { recursive: true });
await cp(path.join(here, 'public'), dist, { recursive: true });
for (const f of ['style.css', 'demo.js']) await cp(path.join(here, 'src', f), path.join(dist, f));
await cp(path.join(root, '.claude-plugin', 'icon.png'), path.join(dist, 'logo-1024.png'));

let index = await readFile(path.join(here, 'src', 'index.html'), 'utf8');
index = (await inlineIcons(index)).replaceAll('{{repoSlug}}', REPO_SLUG).replaceAll('{{repo}}', REPO);
await writeFile(path.join(dist, 'index.html'), index);

const available = new Set((await readdir(path.join(root, 'docs'))).filter((f) => f.endsWith('.md')).map((f) => path.basename(f, '.md')));
const md = markdown();
for (const [name] of DOCS) {
  if (!available.has(name)) continue;
  const source = await readFile(path.join(root, 'docs', `${name}.md`), 'utf8');
  const title = (/^#\s+(.+)$/m.exec(source)?.[1] ?? name).replace(/[`*]/g, '');
  const firstPara = source.split(/\n\s*\n/).find((p) => p.trim() && !p.startsWith('#')) ?? '';
  const description = firstPara.replace(/[`*_[\]]|\(.*?\)/g, '').replace(/\s+/g, ' ').trim().slice(0, 160);
  await writeFile(path.join(dist, 'docs', `${name}.html`), page({ title, description, body: md.parse(source), current: { name, available } }));
}
await writeFile(path.join(dist, 'docs', 'index.html'), '<!doctype html><meta http-equiv="refresh" content="0; url=/docs/getting-started.html"><link rel="canonical" href="/docs/getting-started.html">');
console.log(`built ${path.relative(root, dist)}: index + ${[...available].filter((n) => DOCS.some(([d]) => d === n)).length} docs`);
