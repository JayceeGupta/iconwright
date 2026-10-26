import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

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
  const core = ['search_icons', 'make_icon', 'make_sheet'];
  const windows = ['list_apps', 'app_info', 'taskbar_status', 'apply_icon', 'set_icon', 'pin_apps', 'unpin_apps', 'refresh',
    'restore_icons', 'restore_all_icons', 'restore_taskbar_backup', 'doctor', 'reorder_taskbar', 'desktop_info', 'desktop_move',
    'desktop_arrange', 'desktop_icon_size', 'desktop_options', 'desktop_system_icons', 'desktop_apply_icon', 'desktop_restore_icons',
    'desktop_layout_save', 'desktop_layout_load'];
  const expected = process.platform === 'win32' ? [...core, ...windows] : core;
  assert.deepEqual(new Set(tools.map((tool) => tool.name)), new Set(expected));

  const made = await client.callTool({ name: 'make_icon', arguments: { source: fixture, name: 'test-logo', outDir } });
  assert.equal(made.isError, undefined);
  assert.ok(made.content.some((block) => block.type === 'image' && block.mimeType === 'image/png' && block.data.length > 0));

  // CI runners may have no interactive desktop, so live shell calls run on dev machines only.
  if (process.platform === 'win32' && !process.env.CI) {
    // Read-only Windows calls: they must succeed and return JSON.
    for (const [name, args] of [['list_apps', { query: 'a' }], ['doctor', {}], ['taskbar_status', {}], ['desktop_info', {}]]) {
      const r = await client.callTool({ name, arguments: args });
      assert.equal(r.isError, undefined, `${name}: ${r.content?.[0]?.text}`);
      assert.doesNotThrow(() => JSON.parse(r.content[0].text), name);
    }
    const doctor = JSON.parse((await client.callTool({ name: 'doctor', arguments: {} })).content[0].text);
    assert.equal(typeof doctor.ok, 'boolean');
  }
});
