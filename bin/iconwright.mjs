#!/usr/bin/env node
// The command line. `iconwright mcp` starts the MCP server instead.
import { ensureDeps } from './ensure-deps.mjs';

ensureDeps();
if (process.argv[2] === 'mcp') {
  await import('../src/mcp.mjs');
} else {
  const { run } = await import('../src/cli.mjs');
  await import('../src/cli-win.mjs');
  process.exitCode = await run(process.argv);
}
