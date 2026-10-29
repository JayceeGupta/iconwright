// Makes sure the image library is installed before anything imports it.
// From npm/npx, dependencies are already installed (often next to this package, not inside it),
// so resolve them the way Node will. Only a fresh git clone needs the one-time install.
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function ensureDeps() {
  const require = createRequire(import.meta.url);
  try { require.resolve('sharp'); require.resolve('@modelcontextprotocol/sdk/server/mcp.js'); return; } catch { /* install below */ }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  try {
    // stdout stays clean: the MCP server speaks JSON-RPC on it.
    execSync('npm install --omit=dev --no-audit --no-fund', { cwd: root, stdio: ['ignore', 'ignore', 'inherit'], timeout: 240_000 });
  } catch (e) {
    console.error(`iconwright: installing dependencies failed (${e.message.split(/\r?\n/)[0]}). Run "npm install --omit=dev" in ${root} and try again.`);
    process.exit(1);
  }
}
