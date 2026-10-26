# iconwright — Design Spec

**Date:** 2026-08-20
**Status:** Approved design → ready for implementation planning
**Location:** `D:\Coding\Icon Playground\iconwright\`

## 1. Purpose

A Claude Code **plugin** that turns a natural-language request like *"make me a red
Spotify taskbar icon"* into a finished, applied custom Windows taskbar icon — sourcing
the glyph, recoloring/restyling it programmatically, converting to a proper multi-size
`.ico`, and (optionally) wiring it onto the taskbar. It generalizes the process from the
[dpcdpc11 custom taskbar icons guide](https://dpcdpc11.com/custom-taskbar-icons-guide/),
filling that guide's biggest gap: it never says how to *source* or *style* an icon.

Design goals, in priority order:

1. **Autonomous & low-friction** — agent-driven; minimal user prompting per task.
2. **Token-efficient** — the agent orchestrates a deterministic CLI; it does NOT do pixel
   math or write image code inline per request.
3. **Iterative / re-runnable** — theming is a repeated activity across sessions, not a
   one-shot. State is tracked so "retheme everything red" is one command.
4. **Expansive customization** — recolor, padding/scale, backplates, and (advanced) effects.

## 2. Non-goals (YAGNI)

- No GUI.
- No cross-platform apply layer in v1 (Windows taskbar only; the generation engine is
  OS-agnostic and could serve macOS dock / Linux later).
- No hardened Win11 auto-pin in v1 — see §7. It ships as a documented stub.
- Effects (shadow/gradient/outline) are scaffolded but low-priority; recolor + padding +
  backplate are the must-haves.

## 3. Environment (probed 2026-08-20 on the target machine)

| Tool | Status | Role |
|------|--------|------|
| Node | v24.14.1 | engine runtime |
| npm | 11.11.0 | dep install |
| `sharp` | installed in project | SVG raster + composite |
| `png-to-ico` | installed in project | multi-size `.ico` encode |
| ImageMagick | 7.1.2 (`magick`) | optional fallback only |
| PowerShell | 5.1 | Windows apply layer |
| Python | **absent** | not used |
| `better-icons` (PATH) | absent | discovery via Skill/MCP instead |
| Iconify API | reachable | primary sourcing |

The existing `gen.mjs` in the project root is the proven reference pipeline: density-based
SVG rasterization, `fit:contain` + transparent bg + lanczos3 resampling, glyph trim +
margin, and a full 16/24/32/48/64/128/256 `.ico`. iconwright parameterizes this.

## 4. Architecture — five layers

```
NL request ─► [Skill: iconwright] ─► [CLI: iconwright] ─► manifest.json
                                          │
        ┌─────────────┬──────────────┬────┴────────┬───────────────┐
     Sourcing     Transform      Conversion       Apply         State
    (Iconify/    (SVG munge +   (sharp →PNG →    (PowerShell:   (manifest
     file/logo)   sharp)         png-to-ico)      AppID+.lnk)    + themes)
```

### 4.1 Sourcing
- **Primary:** Iconify API — `GET https://api.iconify.design/{prefix}/{name}.svg` and
  search `GET https://api.iconify.design/search?query=...`. Programmatic, ~0 tokens.
- **Also:** user-supplied `.svg`/`.png`, or a brand logo file path.
- **Assist:** `better-icons` skill/MCP for smarter discovery when the agent chooses.
- Output of this layer: a raw SVG string (PNG inputs are lifted to an `<image>`-wrapped
  SVG or handled as raster-only, in which case recolor is limited — documented).

### 4.2 Transform (customization engine) — deterministic
All transforms are pure functions `(svg, opts) -> svg|rasterBuffer`, composable in a
declared order. Operate on SVG where possible (inspectable, lossless); drop to sharp for
raster-only steps (trim, shadow).
- **recolor:** `color` (solid fill on all paths), `stroke`, `monochrome` (flatten to one
  color), `map` (`{"#000":"#fff"}` old→new for multicolor icons).
- **geometry:** `padding` (margin as fraction, via trim+recanvas from gen.mjs), `scale`,
  `fit`.
- **backplate:** `shape` ∈ {none, square, rounded, circle}, `radius`, `bg` color,
  optional `bgGradient`.
- **effects (advanced/optional):** `outline`, `shadow`, `opacity`, `gradient`.
Each transform is one small module with a clear signature; see cookbook artifact.

### 4.3 Conversion
- SVG → master PNG at high density (sharp), then:
  - PNG set at {1024,512,256,128,64} for previews/other uses.
  - `.ico` with entries {256,128,64,48,32,24,16} via png-to-ico.
- Deterministic, byte-stable given same inputs.

### 4.4 Apply (Windows taskbar) — PowerShell
Improvements over the guide:
- Resolve AppID from fuzzy app name via `get-StartApps`.
- Create `explorer.exe shell:appsFolder\<AppID>` shortcut in a managed folder
  (`%LOCALAPPDATA%\iconwright\Shortcuts`).
- Set `System.AppUserModel.ID` on the `.lnk` via the `IPropertyStore` COM interface —
  **removes the external `Win7AppId.exe` dependency** the guide requires.
- Point the shortcut icon at the generated `.ico`.
- Refresh with `ie4uinit.exe -show`.
- **Pin = runtime choice:**
  - *manual (default):* print `.lnk` path + a one-line drag instruction.
  - *auto (opt-in):* best-effort scripted pin — **v1 stub** (§7).

### 4.5 State / iteration
`manifest.json` (in the plugin data dir) — one record per managed icon:
```json
{
  "id": "spotify",
  "appId": "Spotify.exe...",
  "source": {"type":"iconify","ref":"mdi:spotify"},
  "theme": {"color":"#ff0000","padding":0.1,"shape":"rounded"},
  "outputs": {"ico":"...","png":["..."]},
  "shortcut": "...\\Spotify.lnk",
  "pinned": false,
  "updatedAt": "2026-08-20T..."
}
```
- **Idempotent:** re-running an id updates in place + re-applies + refreshes.
- **Bulk retheme:** `iconwright retheme --theme red` iterates the manifest, re-runs
  transform+convert with the named theme from `themes.json`, re-applies each.

## 5. Interfaces (both — per user)

### 5.1 Skill `iconwright`
Thin NL orchestrator. Reads intent, calls the CLI, offers the pin choice, reports one
result line, updates manifest. Keeps token cost near-constant regardless of image
complexity.

### 5.2 CLI `iconwright`
```
iconwright search <query>                     # Iconify search, prints ids
iconwright make <id> --source <ref> [transform opts] [-o dir]
iconwright apply <id> --app "<name>" [--pin auto|manual]
iconwright retheme --theme <name> [--filter ...]
iconwright batch <spec.json>                  # config-driven bulk
iconwright status|list                        # read manifest
```
Transform opts mirror §4.2 (`--color`, `--padding`, `--shape`, `--bg`, `--map`, …).
`themes.json` holds named theme presets for reuse and bulk.

## 6. Plugin packaging & files

```
iconwright/
  .claude-plugin/plugin.json      # plugin manifest
  skills/iconwright/SKILL.md       # NL orchestration skill
  bin/iconwright.mjs               # CLI entry (Node)
  src/                            # engine: source/, transform/, convert/, manifest
  scripts/win/                    # PowerShell: resolve-appid, make-shortcut, apply, pin(stub)
  themes.json                     # named theme presets
  package.json                    # sharp, png-to-ico deps
  data/manifest.json              # runtime state (gitignored)
  docs/DESIGN.md                  # this file
  references/                     # persisted artifacts (see §8)
```
Packaged as a Claude Code plugin so the skill + CLI ship together. Final skill/plugin
authoring follows the `superpowers:writing-skills` conventions.

## 7. Auto-pin: v1 stub + noted gaps

Win11 (build 26200) removed the classic `Pin to taskbar` shell verb and blocks the old
`shell.Namespace().Verbs()` route. v1 therefore:
- Ships **manual pinning working solidly**.
- Ships `scripts/win/pin.ps1` as an **isolated, clearly-marked stub** that documents every
  candidate technique and why it is/isn't viable, so the module can be swapped without
  touching the pipeline.
- Records findings in `references/win11-pinning-research.md` with an explicit **GAPS**
  section (what we haven't validated, what needs a live test, third-party helpers to
  evaluate: `syspin`, registry `Taskband`, `LayoutModification.xml`, computer-use).

## 8. Persisted artifacts (for future sessions)

- `references/taskbar-process.md` — the guide's steps + our IPropertyStore/refresh upgrades.
- `references/win11-pinning-research.md` — pin techniques, viability, GAPS.
- `references/svg-transform-cookbook.md` — how each customization is implemented.
- `references/environment.md` — the tool-availability probe (§3).
- `references/iconify-api.md` — endpoints, recolor query params, search usage.

## 9. Testing strategy

- Engine (Node): unit tests per transform (SVG in → SVG/PNG out, assert fill/geometry);
  golden `.ico` header checks (entry count/sizes); pure functions → fast, deterministic.
- Apply (PowerShell): dry-run mode that emits the commands + creates `.lnk` in a temp dir
  without pinning; assert AppID property is set.
- End-to-end smoke: reproduce the existing `t3-transparent.ico` output from `logo.svg`
  through the new pipeline and diff against the known-good artifact already in the repo.

## 10. Open items / future iterations

- Harden auto-pin (§7).
- Raster-only (PNG) source recolor is limited vs SVG — document, maybe add posterize/mask.
- Optional macOS/Linux apply layers reuse layers 1–3 unchanged.
- Not currently a git repo; offer `git init` before first commit so the plugin is
  versioned.
