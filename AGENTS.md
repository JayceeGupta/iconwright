# Working on iconwright

For coding agents working on this repository. (For agents that *use* iconwright, see [docs/agents.md](docs/agents.md).)

## Where things are

- `src/`: the Node package. `tools.mjs` defines every MCP tool in one table (the [tool reference](docs/tools.md) is generated from it); `cli.mjs` and `cli-win.mjs` are the command line; `render.mjs` draws icons; `shared/` is pixel and style code that also runs in the browser studio.
- `scripts/win/`: the PowerShell side (`iconwright.ps1`, with `desktop.ps1` dot-sourced) plus a C# helper. Node calls it through `src/win.mjs`.
- `studio/`: the browser studio. `api/studio.mjs` is the hosted version on Vercel.
- `site/build.mjs`: builds the website and docs into `site/dist`. Pushing to main deploys it.
- [How it works](docs/how-it-works.md) explains the parts; [Windows internals](docs/windows-internals.md) covers pins and Explorer. Read it before changing pins.

## Checks

- `npm test` runs on any OS. `tools/list` must stay under 17,000 characters (`test/mcp.test.mjs`), so keep tool descriptions short.
- CI also parses the PowerShell scripts and compiles the C# helper on Windows.
- Changes to pins, icons or the desktop need an end-to-end check on a real Windows PC, with everything put back afterwards. Prefer read-only commands (`iconwright report`, `desktop-icon-image`, `info`) when you only need to see state.
- Docs to update with behavior changes: `docs/`, `skills/iconwright/SKILL.md`, tool descriptions in `src/tools.mjs`, and `CHANGELOG.md` (under `## Unreleased` at the top; add it if the last release removed it).

## Windows PowerShell pitfalls

The scripts run under Windows PowerShell 5.1 (`powershell.exe`, not `pwsh`) with `Set-StrictMode -Version 2` and `$ErrorActionPreference = 'Stop'`.

- `ConvertFrom-Json` fails on a JSON key that is an empty string. Don't store one; the registry default value is stored under the name `(default)`.
- `(Get-Item <key>).Property` calls the registry default value `(default)`, but `GetValue` and `GetValueKind` only know it as `''`. Use `GetValueNames()`.
- A missing key on a hashtable is fine (`$h['x']`), but a missing property on an object throws under strict mode. An empty list passed as an argument arrives as `$null`.
- `.ps1` files are CRLF in the working tree (`.gitattributes`). Editors that write LF are fine; git normalizes them.

## Releasing

See [RELEASING.md](RELEASING.md). Releases publish from a `v*` tag through GitHub Actions with npm trusted publishing; nobody publishes from a laptop.

## Style

Keep the docs' voice: short sentences, plain words, what the user sees. Match the surrounding code's density and naming. Pull requests use the template in `.github/`.
