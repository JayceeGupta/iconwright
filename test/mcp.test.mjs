import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { listedTools, PROMPTS } from '../src/tools.mjs';

test('stdio MCP server exposes tools and returns generated icon preview', async (t) => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), 'iconwright-mcp-'));
  t.after(() => rm(outDir, { recursive: true, force: true }));
  const serverPath = fileURLToPath(new URL('../bin/iconwright-mcp.mjs', import.meta.url));
  const fixture = fileURLToPath(new URL('./fixtures/logo.svg', import.meta.url));
  const transport = new StdioClientTransport({ command: process.execPath, args: [serverPath] });
  const client = new Client({ name: 'iconwright-test', version: '1.0.0' });
  t.after(async () => { await client.close().catch(() => {}); await transport.close().catch(() => {}); });
  await client.connect(transport);

  const { tools } = await client.listTools();
  const expected = listedTools(process.platform === 'win32').map((x) => x.name);
  assert.deepEqual(tools.map((tool) => tool.name), expected);

  // Schemas reject unknown keys; MCP defaults are omitted from annotations.
  for (const tool of tools) {
    assert.equal(tool.inputSchema.additionalProperties, false, tool.name);
    assert.equal(Object.hasOwn(tool.inputSchema, '$schema'), false, tool.name);
  }
  const listBytes = JSON.stringify(tools).length;
  console.log(`tools/list JSON size: ${listBytes} chars`);
  assert.ok(listBytes < 17000, `${listBytes} chars`);
  const typo = await client.callTool({ name: 'make_icon', arguments: { source: fixture, colour: 'red', outDir } });
  assert.equal(typo.isError, true);

  const made = await client.callTool({ name: 'make_icon', arguments: { source: fixture, name: 'test-logo', outDir } });
  assert.equal(made.isError, undefined);
  assert.ok(made.content.some((block) => block.type === 'image' && block.mimeType === 'image/png' && block.data.length > 0));

  const designed = await client.callTool({ name: 'design_icons', arguments: { sources: [fixture, '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><circle cx="12" cy="12" r="9" fill="red"/></svg>'], styles: ['', 'bg=#fff shape=squircle'] } });
  assert.equal(designed.isError, undefined);
  assert.ok(designed.content.some((block) => block.type === 'image' && block.mimeType === 'image/png'));
  const preview = await client.callTool({ name: 'preview_icon', arguments: { source: fixture, scenes: ['sizes'] } });
  assert.equal(preview.isError, undefined);
  assert.ok(preview.content.some((block) => block.type === 'image' && block.mimeType === 'image/png'));

  const promptList = await client.listPrompts();
  assert.equal(promptList.prompts.length, 4);
  const prompt = await client.getPrompt({ name: 'design-icon', arguments: { idea: 'x' } });
  assert.match(prompt.messages[0].content.text, /Design an icon: x/);

  // CI runners may have no interactive desktop, so live shell calls run on dev machines only.
  if (process.platform === 'win32' && !process.env.CI) {
    // Read-only Windows calls: they must succeed and return JSON.
    for (const [name, args] of [['find_apps', { query: 'a' }], ['doctor', {}], ['taskbar_status', {}], ['desktop_info', {}], ['capture', { what: 'taskbar' }]]) {
      const r = await client.callTool({ name, arguments: args });
      if (r.isError && /locked/.test(r.content?.[0]?.text)) continue;   // screenshots need an unlocked screen
      assert.equal(r.isError, undefined, `${name}: ${r.content?.[0]?.text}`);
      assert.doesNotThrow(() => JSON.parse(r.content[0].text), name);
    }
    const doctor = JSON.parse((await client.callTool({ name: 'doctor', arguments: {} })).content[0].text);
    assert.equal(typeof doctor.ok, 'boolean');
    // The SDK starts servers with a trimmed environment; Windows programs must still run.
    assert.equal(doctor.checks.nativeCommands.ok, true);
  }
});
