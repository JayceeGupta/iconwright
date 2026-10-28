// Bridge to the Windows layer (scripts/win/iconwright.ps1). Every call returns parsed JSON.
//
// Two ways to run it:
// - win(): one PowerShell process per call. Simple and isolated; used by the CLI.
// - WinWorker: one long-lived PowerShell process answering JSON requests over stdin/stdout.
//   Saves ~1-2 s of PowerShell startup per call; used by the MCP server. Commands that restart
//   Explorer retire the worker afterwards, so no shell objects outlive the restart.
import { execFile, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'win', 'iconwright.ps1');
const PS_ARGS = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass'];
// Full path: MCP clients may start the server with a trimmed environment (no PATH).
const PS_EXE = (() => {
  const exe = path.join(process.env.SystemRoot || process.env.windir || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  return existsSync(exe) ? exe : 'powershell.exe';
})();
// Without PATHEXT, Windows PowerShell silently refuses to run any .exe (reg.exe, explorer.exe);
// some MCP clients start servers without it, so fill in Windows' defaults.
const PS_ENV = (() => {
  const root = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
  return {
    ...process.env,
    PATHEXT: process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD;.VBS;.VBE;.JS;.JSE;.WSF;.WSH;.MSC',
    SystemRoot: root, windir: process.env.windir || root,
    ComSpec: process.env.ComSpec || path.join(root, 'System32', 'cmd.exe'),
  };
})();
// Longer than the script's own 120 s wait for another change to finish, plus a restart.
const TIMEOUT_MS = 300_000;
// After these, Explorer has restarted: start a fresh worker for the next call.
const RESTARTS_EXPLORER = new Set(['pin', 'unpin', 'reorder', 'pins', 'refresh', 'restore-pins']);
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

function requireWindows(command) {
  if (process.platform !== 'win32') {
    throw new Error(`'${command}' changes the Windows taskbar or desktop and only runs on Windows. Icon creation (search, make, sheet) works on any OS.`);
  }
}

/** Options (camelCase) -> the script's parameters (PascalCase). Paths become absolute. */
export function winParams({ app, query, icon, iconIndex, noRestart, restartCooldown, item, x, y, value, file,
  by, corner, flow, autoArrange, snapToGrid, showIcons, position, maxWidth, monitor, pin, unpin, order, dryRun } = {}) {
  const p = {};
  const list = (v) => [].concat(v ?? []).filter(Boolean).map(String);
  for (const [k, v] of [['App', app], ['Pin', pin], ['Unpin', unpin], ['Order', order]]) if (list(v).length) p[k] = list(v);
  if (dryRun) p.DryRun = true;
  if (query) p.Query = String(query);
  if (icon) p.Icon = path.resolve(icon);
  if (iconIndex != null) p.IconIndex = Number(iconIndex);
  if (noRestart) p.NoRestart = true;
  if (restartCooldown != null) p.RestartCooldown = Number(restartCooldown);
  const items = [].concat(item ?? []).filter(Boolean).map(String);
  if (items.length) p.Item = items;
  if (x != null) p.X = Number(x);
  if (y != null) p.Y = Number(y);
  if (value != null) p.Value = String(value);
  if (file) p.File = path.resolve(file);
  for (const [k, v] of [['By', by], ['Corner', corner], ['Flow', flow], ['AutoArrange', autoArrange], ['SnapToGrid', snapToGrid], ['ShowIcons', showIcons]]) {
    if (v != null) p[k] = String(v);
  }
  if (position != null) p.Position = Number(position);
  if (maxWidth != null) p.MaxWidth = Number(maxWidth);
  if (monitor != null) p.Monitor = Number(monitor);
  return p;
}

/** PowerShell argument text for one-shot calls (every value single-quoted). */
export function buildWinArgs(command, options = {}) {
  const args = [command];
  for (const [k, v] of Object.entries(winParams(options))) {
    if (v === true) args.push(`-${k}`);
    else if (Array.isArray(v)) args.push(`-${k}`, v.map(q).join(','));
    else if (typeof v === 'number') args.push(`-${k}`, String(v));
    else args.push(`-${k}`, q(v));
  }
  return args;
}

function parseReply(out, command) {
  try { return JSON.parse(out); }
  catch { throw new Error(`iconwright '${command}' returned unreadable output: ${String(out).slice(0, 300)}`); }
}

/** One PowerShell process per call. */
export async function win(command, options = {}) {
  requireWindows(command);
  const cmd = `$ProgressPreference='SilentlyContinue'; & ${q(SCRIPT)} ${buildWinArgs(command, options).join(' ')}`;
  const out = await new Promise((resolve, reject) => {
    execFile(PS_EXE, [...PS_ARGS, '-Command', cmd], { windowsHide: true, maxBuffer: 16 << 20, timeout: TIMEOUT_MS, env: PS_ENV },
      (err, stdout, stderr) => {
        if (err?.killed) reject(new Error(`iconwright '${command}' timed out after ${TIMEOUT_MS / 1000} s; it may be half done. Check with doctor and status.`));
        else if (err) reject(new Error((stderr || err.message).trim().split(/\r?\n/).slice(0, 6).join('\n')));
        else resolve(stdout.trim());
      });
  });
  return parseReply(out, command);
}

/** A long-lived PowerShell process that runs one request at a time. */
export class WinWorker {
  #proc = null; #ready = null; #pending = new Map(); #nextId = 1; #queue = Promise.resolve(); #stderr = [];

  /** Same contract as win(). Requests are queued and run one at a time. */
  call(command, options = {}) {
    requireWindows(command);
    const run = this.#queue.then(() => this.#request(command, options));
    this.#queue = run.catch(() => {});
    return run;
  }

  /** Stops the worker; the next call starts a new one. */
  close() {
    const p = this.#proc;
    this.#proc = null; this.#ready = null;
    if (p && p.exitCode === null) { p.stdin.end(); setTimeout(() => { if (p.exitCode === null) p.kill(); }, 2000).unref(); }
  }

  #start() {
    if (this.#ready) return this.#ready;
    const proc = spawn(PS_EXE, [...PS_ARGS, '-File', SCRIPT, '__worker'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: PS_ENV });
    this.#proc = proc; this.#stderr = [];
    proc.stdin.setDefaultEncoding('utf8');
    proc.stdin.on('error', () => {});   // a dead worker's pipe; reported through the request instead
    proc.stderr.setEncoding('utf8').on('data', (d) => { this.#stderr.push(d); if (this.#stderr.length > 20) this.#stderr.shift(); });
    this.#ready = new Promise((resolve, reject) => {
      const lines = createInterface({ input: proc.stdout.setEncoding('utf8') });
      lines.on('line', (line) => {
        if (!line.trim()) return;
        let msg; try { msg = JSON.parse(line); } catch { return; }   // ignore stray output
        if (msg.ready) { resolve(); return; }
        const waiter = this.#pending.get(msg.id);
        if (waiter) { this.#pending.delete(msg.id); waiter(msg); }
      });
      proc.on('error', (e) => reject(e));
      proc.on('exit', (code) => {
        const why = this.#stderr.join('').trim().split(/\r?\n/).slice(-4).join('\n');
        const err = new Error(`iconwright Windows worker stopped (exit ${code})${why ? `: ${why}` : ''}`);
        reject(err);
        for (const waiter of this.#pending.values()) waiter({ ok: false, error: err.message, crashed: true });
        this.#pending.clear();
        if (this.#proc === proc) { this.#proc = null; this.#ready = null; }
      });
    });
    this.#ready.catch(() => {});
    return this.#ready;
  }

  async #request(command, options) {
    await this.#start();
    const proc = this.#proc;
    const id = this.#nextId++;
    const reply = await new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        // Retire this worker now so no queued call reuses it, and release the queue only once
        // it has really exited (it may hold the change lock until then).
        if (this.#proc === proc) { this.#proc = null; this.#ready = null; }
        const done = () => resolve({ ok: false, error: `iconwright '${command}' timed out after ${TIMEOUT_MS / 1000} s; it may be half done. Check with doctor and taskbar_status.` });
        if (proc.exitCode !== null) done(); else { proc.once('exit', done); proc.kill(); }
      }, TIMEOUT_MS);
      this.#pending.set(id, (msg) => { clearTimeout(timer); resolve(msg); });
      proc.stdin.write(JSON.stringify({ id, command, params: winParams(options) }) + '\n', (err) => {
        if (err && this.#pending.delete(id)) { clearTimeout(timer); resolve({ ok: false, error: `iconwright Windows worker is not accepting requests: ${err.message}` }); }
      });
    });
    if (RESTARTS_EXPLORER.has(command) && !options.dryRun) this.close();
    if (!reply.ok) throw new Error(reply.error);
    return reply.result;
  }
}
