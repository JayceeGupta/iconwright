// Bridge to the Windows layer (scripts/win/iconwright.ps1). Every call returns parsed JSON.
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'win', 'iconwright.ps1');
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

export function buildWinArgs(command, { app, query, icon, iconIndex, noRestart, restartCooldown,
  item, x, y, value, file, by, corner, flow, autoArrange, snapToGrid, showIcons, position, maxWidth, monitor } = {}) {
  const args = [command];
  const apps = [].concat(app ?? []).filter(Boolean);
  if (apps.length) args.push('-App', apps.map(q).join(','));
  if (query) args.push('-Query', q(query));
  if (icon) args.push('-Icon', q(path.resolve(icon)));
  if (iconIndex != null) args.push('-IconIndex', String(Number(iconIndex)));
  if (noRestart) args.push('-NoRestart');
  if (restartCooldown != null) args.push('-RestartCooldown', String(Number(restartCooldown)));
  const items = [].concat(item ?? []).filter(Boolean);
  if (items.length) args.push('-Item', items.map(q).join(','));
  for (const [name, value] of [['X', x], ['Y', y]]) if (value != null) args.push(`-${name}`, q(Number(value)));
  if (value != null) args.push('-Value', q(value));
  if (file) args.push('-File', q(path.resolve(file)));
  for (const [name, value] of [['By', by], ['Corner', corner], ['Flow', flow], ['AutoArrange', autoArrange], ['SnapToGrid', snapToGrid], ['ShowIcons', showIcons]]) {
    if (value != null) args.push(`-${name}`, q(value));
  }
  if (position != null) args.push('-Position', String(Number(position)));
  if (maxWidth != null) args.push('-MaxWidth', String(Number(maxWidth)));
  if (monitor != null) args.push('-Monitor', String(Number(monitor)));
  return args;
}

export async function win(command, options = {}) {
  if (process.platform !== 'win32') {
    throw new Error(`'${command}' changes the Windows taskbar or desktop and only runs on Windows. Icon creation (search, make, sheet) works on any OS.`);
  }
  const args = buildWinArgs(command, options);
  const cmd = `$ProgressPreference='SilentlyContinue'; & ${q(SCRIPT)} ${args.join(' ')}`;
  const out = await new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', cmd],
      { windowsHide: true, maxBuffer: 16 << 20, timeout: 180000 },
      (err, stdout, stderr) => {
        if (err) reject(new Error((stderr || err.message).trim().split('\n').slice(0, 4).join('\n')));
        else resolve(stdout.trim());
      });
  });
  try { return JSON.parse(out); } catch { return out; }
}
