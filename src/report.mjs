// `iconwright report`: a Markdown summary of this machine and a quick self-test, for test reports.
// It names no apps, files or user folders, so it can be pasted into a public issue as is.
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { renderMaster, makeIcon } from './render.mjs';
import { designGrid } from './design.mjs';
import { renderScenes, SCENES } from './scenes.mjs';
import { searchIconsDetailed } from './source.mjs';

const { version } = createRequire(import.meta.url)('../package.json');
const root = fileURLToPath(new URL('..', import.meta.url));
const SAMPLE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z"/></svg>';

// Replaces the user's home folder in text, so paths don't reveal a name.
const scrub = (text) => String(text).split(os.homedir()).join('~').split(os.homedir().replaceAll('\\', '/')).join('~');

async function timed(label, fn) {
  const t = Date.now();
  try { const note = await fn(); return `| ${label} | ok | ${Date.now() - t} ms${note ? ` (${note})` : ''} |`; }
  catch (e) { return `| ${label} | **failed** | ${scrub(e.message).slice(0, 160)} |`; }
}

function commit() {
  try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
  catch { return 'not a git checkout'; }
}

/** Builds the report. win: the Windows bridge (Windows only), for doctor. */
export async function buildReport({ win } = {}) {
  const lines = [
    '## Environment', '',
    `- iconwright ${version} (${commit()})`,
    `- OS: ${os.type()} ${os.release()} (${process.platform} ${os.arch()})${os.version ? `, ${os.version()}` : ''}`,
    `- Node ${process.version}`,
    `- Locale: ${Intl.DateTimeFormat().resolvedOptions().locale}, time zone ${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
    '', '## Self-test', '', '| Check | Result | Detail |', '| --- | --- | --- |',
  ];
  let master;
  lines.push(await timed('Render an icon (engine, sharp)', async () => { master = await renderMaster({ source: SAMPLE, color: 'white', bg: '#2d5ba6', shape: 'squircle' }); }));
  lines.push(await timed('Write .ico, .icns and web icons', async () => {
    const dir = await import('node:fs/promises').then((fs) => fs.mkdtemp(os.tmpdir() + '/iconwright-report-'));
    await makeIcon({ source: SAMPLE, color: 'white', bg: '#2d5ba6', formats: ['ico', 'icns', 'web'], outDir: dir, preview: false });
    await import('node:fs/promises').then((fs) => fs.rm(dir, { recursive: true, force: true }));
  }));
  lines.push(await timed('Design grid (text needs the bundled font)', () => designGrid({ sources: [SAMPLE], styles: [{ color: 'white', bg: '#2d5ba6' }, { color: '#e9c46a' }] }).then(() => '')));
  lines.push(await timed(`All ${SCENES.length} scenes`, async () => { if (!master) throw new Error('no icon to place'); await renderScenes({ master, scenes: SCENES }); }));
  lines.push(await timed('Iconify search (network)', async () => `${(await searchIconsDetailed('star', { limit: 5 })).icons.length} results`));

  if (process.platform === 'win32' && win) {
    lines.push('', '## Windows checks (doctor)', '');
    try {
      const d = await win('doctor');
      lines.push('| Check | OK | Detail |', '| --- | --- | --- |');
      for (const [name, c] of Object.entries(d.checks ?? {})) lines.push(`| ${name} | ${c.ok ? 'yes' : '**no**'} | ${scrub(c.detail ?? '')} |`);
      const mods = d.taskbarMods ?? {};
      lines.push('', `- Taskbar mods: StartAllBack ${mods.startAllBack ? 'yes' : 'no'}, ExplorerPatcher ${mods.explorerPatcher ? 'yes' : 'no'}, running stylers: ${(mods.running ?? []).map((r) => r.name ?? r).join(', ') || 'none'}`);
      lines.push(`- Running as administrator: ${d.elevated ? 'yes' : 'no'}`);
    } catch (e) { lines.push(`doctor failed: ${scrub(e.message)}`); }
  }
  return `# iconwright report\n\n${lines.join('\n')}\n`;
}
