// Vercel function for the hosted studio (/studio): the same engine as the MCP server and CLI.
// Hosted mode accepts Iconify ids and pasted SVG only, and writes nothing but temp files.
process.env.ICONWRIGHT_CACHE ??= '/tmp/iconwright-cache';
const { createStudioHandler } = await import('../src/studio.mjs');

export default createStudioHandler({ local: false });
