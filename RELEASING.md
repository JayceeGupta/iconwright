# Releasing

Checklists for the maintainer. The npm package is prepared but not published yet.

## Going public (once)

1. Make the repository public: `gh repo edit JayceeGupta/iconwright --visibility public --accept-visibility-change-consequences`.
2. Create the issue labels the forms use: `gh label create "test report" --color 2d5ba6` (`bug` exists by default).
3. Check the Claude Code install from GitHub in a clean profile: `/plugin marketplace add JayceeGupta/iconwright`, `/plugin install iconwright@icon-playground`, then ask for `doctor`.
4. Publish to npm (below), then update the install docs.

## Publishing to npm

The npm package is `iconwright`. `npx -y iconwright mcp` starts the MCP server, and `npx -y iconwright <command>` runs any CLI command.

1. `npm test` passes and CI is green on main.
2. Bump `version` in `package.json` and `.claude-plugin/plugin.json`, and add a `CHANGELOG.md` entry.
3. Check the package contents and try it from the tarball:

   ```bash
   npm pack --dry-run                      # lists the files that would ship
   npm pack                                # writes iconwright-<version>.tgz
   cd "$(mktemp -d)" && npx -y -p /path/to/iconwright-<version>.tgz iconwright report
   ```

   Use a path without spaces for the tarball; npx mishandles local tarball paths with spaces.
4. `npm login`, then `npm publish --access public`.
5. Tag the release: `git tag v<version> && git push --tags`, and create a GitHub release from the changelog entry.
6. Try it from the registry: `npx -y iconwright mcp` in an MCP client, and `npx -y iconwright report`.

### Install docs to update after the first publish

Replace the clone-and-register steps in `README.md`, `docs/getting-started.md` and the setup prompt in `docs/agents.md` with:

```bash
claude mcp add iconwright -- npx -y iconwright mcp      # Claude Code without the plugin
codex mcp add iconwright -- npx -y iconwright mcp       # Codex
```

```json
{ "mcpServers": { "iconwright": { "command": "npx", "args": ["-y", "iconwright", "mcp"] } } }
```

The Claude Code plugin keeps running from its own checkout (`.claude-plugin/plugin.json`), so it doesn't depend on npm.

## Every release

- `npm test` and CI green.
- Live checks on Windows through MCP: restyle one app and restore it; `taskbar_pins` with a pin and a move, then unpin, and compare `taskbar_status` before and after; `capture` after each.
- `npm run site:build` and look at the home page, a docs page and the studio (`node scripts/dev/serve-site.mjs`).
- Pushing to main deploys the site to https://iconwright.guptajayam.com.
