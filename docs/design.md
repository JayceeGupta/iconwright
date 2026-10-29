# Design icons

iconwright turns icon design into a quick back-and-forth: find artwork, compare looks, see the winner in place, then export it. Every step works on Windows, macOS and Linux.

You can do all of this by asking your agent, from the [studio](studio.md), or with the [command line](cli.md). This page uses agent requests as examples; the tool names are in brackets for reference.

## 1. Find artwork

> Find me some rocket icons.

iconwright searches [Iconify](https://iconify.design): more than 200,000 open-source icons from about 200 sets, including brand logos. You get one sheet with numbered pictures, so you can answer “3, 7 and 12” (`search_icons`).

- Brand logos live in the `simple-icons` set: `simple-icons:spotify`, `simple-icons:github`.
- To stay within one look, ask for a set: “only from Phosphor” (`ph`), “Material Design” (`mdi`), “Lucide” (`lucide`), “Tabler” (`tabler`).
- Licenses are listed with every search. Most sets are MIT, Apache 2.0 or similar; a few ask for attribution (CC BY).

You can also start from your own artwork: an `.svg`, `.png`, `.jpg`, `.webp` or `.ico` file, or SVG code pasted into the chat. On Windows, an installed app's current icon works too: `app:Spotify`.

## 2. Compare looks

> Try 3, 7 and 12 in white, on a blue squircle, and with an orange gradient.

You get one grid: artwork in rows (A, B, C) and styles in columns (1, 2, 3). Every cell shows the icon large and at 24 px on a dark and a light strip, because a design that works at 256 px can fail at taskbar size. Answer with a cell: “B2” (`design_icons`).

Keep rounds small and change one thing at a time: a color, then a shape, then padding.

## 3. See it in place

> Show me B2 on a taskbar and on a phone.

iconwright draws the icon where icons live (`preview_icon`):

| Scene | What it shows |
| --- | --- |
| `taskbar` | A Windows 11 taskbar, dark and light, with the app open and focused |
| `start` | The Start menu's pinned grid, with the app name under the icon |
| `desktop` | Medium and large desktop icons on a wallpaper, one selected |
| `explorer` | A File Explorer window: the title-bar icon and a 16 px list row |
| `browser` | Browser tabs, dark and light, with the icon as a favicon |
| `dock` | The macOS Dock with its hover label |
| `ios` | An iPhone home screen, with the iOS rounded mask applied |
| `android` | An Android launcher with a round mask |
| `sizes` | The icon at true pixel sizes (16 to 48 px), plus 16 and 24 px magnified |

On Windows, the taskbar and Start scenes put your own pinned apps around the icon, so you see how it sits next to the icons you actually have.

## 4. Export

> Make a Windows icon and a favicon set for my website.

| Format | You get |
| --- | --- |
| `ico` | A Windows icon with 16, 20, 24, 32, 40, 48, 64, 128 and 256 px images |
| `png` | One PNG, 256 px unless you pick a size |
| `icns` | A macOS icon, 16 to 1024 px including Retina sizes |
| `web` | A folder with `favicon.ico`, `apple-touch-icon.png`, 192 and 512 px app icons, a maskable icon for Android, `site.webmanifest`, and `head.html` with the tags to paste into your page |
| `pngset` | PNGs at 16, 24, 32, 48, 64, 128, 256, 512 and 1024 px |

Files go to `%LOCALAPPDATA%\iconwright\icons` on Windows and `~/.iconwright/icons` elsewhere, unless you name a folder (`make_icon`).

## Styles

A look is written as one short line, a **style string**. You'll see it in agent replies, in the studio's top bar and in the command line, and you can copy it between them.

```text
color=white bg=#2d5ba6 shape=squircle shadow
```

| Key | Values | Default |
| --- | --- | --- |
| `color` | Any CSS color: `white`, `#e9c46a`, `rgb(…)`, `hsl(…)`. Recolors the artwork. | The artwork's own colors |
| `bg` | A CSS color, or a gradient: `linear-gradient(135deg,#e9c46a,#c47335)` | None (transparent) |
| `shape` | `none`, `square`, `rounded`, `squircle`, `circle` | `rounded` when there's a background |
| `radius` | 0 to 0.5, a fraction of the icon size (for `rounded`) | 0.22 |
| `padding` | 0 to 0.45, the space around the artwork | 0.08, or 0.2 with a background |
| `shadow` | On when present | Off |

Recoloring replaces every color in the artwork with one color, which suits single-color icons. For multicolor logos, leave `color` out and add a background instead.

## Tips for icons that read well

- **Check 16 and 24 px.** Taskbars, title bars and browser tabs use tiny sizes. Thin lines and fine detail disappear; bold, simple shapes survive. The `sizes` scene shows exactly what's left.
- **Check light and dark.** A white icon with no background vanishes on a light taskbar. Either add a background or pick a color with contrast on both.
- **Give backgrounds room.** With a shape behind the artwork, 0.18 to 0.24 padding usually looks balanced.
- **Match your neighbors.** On a taskbar, icons with backgrounds look larger than bare glyphs. Pick one approach for a set of apps.
- **macOS and iOS expect a full tile.** Their icons fill a rounded square; a bare glyph looks lost in the Dock. Use `shape=squircle` with a background for those.
