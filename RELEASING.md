# Releasing

Checklists for the maintainer. The package is published on npm as [`iconwright`](https://www.npmjs.com/package/iconwright): `npx -y iconwright mcp` starts the MCP server, and `npx -y iconwright <command>` runs any CLI command.

## Publishing a release

Releases are published by GitHub Actions ([`release.yml`](.github/workflows/release.yml)) when a version tag is pushed. It uses npm trusted publishing: no npm token is stored anywhere, and every version gets provenance that links it to the commit and workflow run that built it.

1. `npm test` passes and CI is green on main.
2. Bump `version` in `package.json` and `.claude-plugin/plugin.json` (run `npm install` to update the lockfile), and add a `## <version> (<date>)` entry to `CHANGELOG.md`. Commit and push to main.
3. Optional: check the package contents with `npm pack --dry-run`.
4. Tag and push: `git tag v<version> && git push origin v<version>`.

The workflow runs the full CI matrix, checks that the tag matches both version fields and has a changelog entry, publishes to npm, and creates the GitHub release from the changelog entry. Watch it with `gh run watch`.

Afterwards, try it from the registry: `npx -y iconwright@<version> --version`, `npx -y iconwright report`, and `npx -y iconwright mcp` in an MCP client.

### One-time setup (done)

- npmjs.com → iconwright → Settings → Trusted publisher: GitHub Actions, owner `JayceeGupta`, repository `iconwright`, workflow `release.yml`, environment `npm`.
- GitHub → Settings → Environments → `npm`: deployments only from `v*` tags.
- npmjs.com → iconwright → Settings → Publishing access: "Require two-factor authentication and disallow tokens", so only the workflow can publish.

The Claude Code plugin runs from its own checkout (`.claude-plugin/plugin.json`), so it doesn't depend on npm.

## Every release

- `npm test` and CI green.
- Live checks on Windows through MCP: restyle one app and restore it; `taskbar_pins` with a pin and a move, then unpin, and compare `taskbar_status` before and after; `capture` after each.
- `npm run site:build` and look at the home page, a docs page and the studio (`node scripts/dev/serve-site.mjs`).
- Pushing to main deploys the site to https://iconwright.guptajayam.com.
