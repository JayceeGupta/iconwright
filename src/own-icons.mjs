// "app:<name>" and "desktop:<item>" sources: an installed app's or a desktop item's own icon,
// saved as an image to restyle (Windows). Shared by the MCP tools, the CLI and the studio.
// The icon is the one it had before iconwright changed it, so restyling never stacks styles.

const KINDS = [
  { prefix: /^app:/i, command: 'app-icon-image', key: 'app' },
  { prefix: /^desktop:/i, command: 'desktop-icon-image', key: 'item' },
];

export const isOwnIcon = (s) => KINDS.some((k) => k.prefix.test(String(s)));

/** Each own-icon source replaced by its image path; other sources pass through. One call per kind. */
export async function resolveOwnIcons(list, win) {
  const out = [...list];
  for (const kind of KINDS) {
    const at = out.map((s, i) => (kind.prefix.test(String(s)) ? i : -1)).filter((i) => i >= 0);
    if (!at.length) continue;
    if (!win) throw new Error(`"${String(out[at[0]]).split(':')[0]}:" sources read icons from Windows and only work there`);
    const names = at.map((i) => String(out[i]).replace(kind.prefix, '').trim());
    const images = await win(kind.command, { [kind.key]: names });
    at.forEach((i, n) => {
      const img = images[n];
      if (!img || img.error) throw new Error(`${out[i]}: ${img?.error ?? 'icon image unavailable'}`);
      out[i] = img.image;
    });
  }
  return out;
}
