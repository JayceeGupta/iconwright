// The MCP server: registers the tools and prompts defined in tools.mjs.
import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { win as winOnce, WinWorker } from './win.mjs';
import { TOOLS, PROMPTS, INSTRUCTIONS, listedTools } from './tools.mjs';
import { toJson } from './output.mjs';

const { version } = createRequire(import.meta.url)('../package.json');
const isWindows = process.platform === 'win32';

const server = new McpServer({ name: 'iconwright', version }, {
  instructions: isWindows ? INSTRUCTIONS : 'iconwright designs icons: search_icons (numbered sheet) → design_icons (rows = sources, columns = style strings like "color=white bg=#2d5ba6 shape=squircle"; the user picks a cell like "B2") → preview_icon (mockups) → make_icon (ico, icns, web favicons, PNGs). Show each image and let the user choose. Taskbar and desktop tools exist only on Windows.',
});

// MCP calls share one long-lived PowerShell process (much faster); ICONWRIGHT_NO_WORKER=1 opts out.
const worker = isWindows && !process.env.ICONWRIGHT_NO_WORKER ? new WinWorker() : null;
// Tools that change the PC run one at a time, start to finish (several Windows calls each),
// so two changes, or a change and the studio, never interleave.
let gate = Promise.resolve();
const exclusive = (fn) => { const run = gate.then(fn); gate = run.catch(() => {}); return run; };
const ctx = { isWindows, exclusive, win: worker ? (command, options) => worker.call(command, options) : winOnce };

for (const t of TOOLS) {
  if (t.windows && !isWindows) continue;
  // Strict schemas: a misspelled argument is an error, not silently ignored.
  server.registerTool(t.name, {
    title: t.title, description: t.description,
    inputSchema: z.object(t.input ?? {}).strict(),
    annotations: t.annotations,
  }, async (args) => {
    try {
      const r = t.annotations?.readOnlyHint ? await t.handler(args ?? {}, ctx) : await exclusive(() => t.handler(args ?? {}, ctx));
      const content = [{ type: 'text', text: toJson(r.json) }];
      if (r.image) content.push({ type: 'image', data: Buffer.from(r.image).toString('base64'), mimeType: 'image/png' });
      return { content };
    } catch (error) {
      return { content: [{ type: 'text', text: error?.message || String(error) }], isError: true };
    }
  });
}

// Our own tools/list: the same schemas without per-tool boilerplate ($schema, default-valued
// annotations), which every client otherwise loads into the model's context.
const listed = listedTools(isWindows);
server.server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: listed }));

for (const p of PROMPTS) {
  if (!isWindows && /taskbar|desktop|undo/.test(p.name)) continue;
  server.registerPrompt(p.name, { title: p.title, description: p.description, argsSchema: p.args },
    (args) => ({ messages: [{ role: 'user', content: { type: 'text', text: p.text(args ?? {}) } }] }));
}

process.on('exit', () => worker?.close());
await server.connect(new StdioServerTransport());
