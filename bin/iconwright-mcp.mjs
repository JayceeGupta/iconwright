#!/usr/bin/env node
// The MCP server (stdio). `npx -y iconwright mcp` runs the same server.
import { ensureDeps } from './ensure-deps.mjs';

ensureDeps();
await import('../src/mcp.mjs');
