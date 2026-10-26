#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!existsSync(path.join(root, 'node_modules', 'sharp'))) {
  execSync('npm install --omit=dev --no-audit --no-fund', { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });
}
const { run } = await import('../src/cli.mjs');
await import('../src/cli-win.mjs');

process.exitCode = await run(process.argv);
