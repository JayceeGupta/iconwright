#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!existsSync(path.join(root, 'node_modules', 'sharp'))) {
  // First run: install the image library.
  try {
    execSync('npm install --omit=dev --no-audit --no-fund', { cwd: root, stdio: ['ignore', 'ignore', 'inherit'], timeout: 240_000 });
  } catch (e) {
    console.error(`iconwright: installing dependencies failed (${e.message.split(/\r?\n/)[0]}). Run "npm install --omit=dev" in ${root} and try again.`);
    process.exit(1);
  }
}
const { run } = await import('../src/cli.mjs');
await import('../src/cli-win.mjs');

process.exitCode = await run(process.argv);
