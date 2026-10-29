# Releasing

Checklists for the maintainer. The package is published on npm as [`iconwright`](https://www.npmjs.com/package/iconwright): `npx -y iconwright mcp` starts the MCP server, and `npx -y iconwright <command>` runs any CLI command.

## Publishing to npm

1. `npm test` passes and CI is green on main.
2. Bump `version` in `package.json` and `.claude-plugin/plugin.json` (and run `npm install` to update the lockfile), and add a `CHANGELOG.md` entry.
3. Check the package contents and try it from the tarball:

   ```bash
   npm pack --dry-run                      # lists the files that would ship
   npm pack                                # writes iconwright-<version>.tgz
   cd "$(mktemp -d)" && npx -y -p /path/to/iconwright-<version>.tgz iconwright report
   ```

   Use a path without spaces for the tarball; npx mishandles local tarball paths with spaces.
4. `npm publish --access public` (needs `npm login`, or a granular token with publish rights).
5. Tag the release: `git tag v<version> && git push --tags`, and create a GitHub release from the changelog entry (`gh release create v<version> --notes-file <notes>`).
6. Try it from the registry: `npx -y iconwright mcp` in an MCP client, and `npx -y iconwright report`.

The Claude Code plugin runs from its own checkout (`.claude-plugin/plugin.json`), so it doesn't depend on npm.

## Every release

- `npm test` and CI green.
- Live checks on Windows through MCP: restyle one app and restore it; `taskbar_pins` with a pin and a move, then unpin, and compare `taskbar_status` before and after; `capture` after each.
- `npm run site:build` and look at the home page, a docs page and the studio (`node scripts/dev/serve-site.mjs`).
- Pushing to main deploys the site to https://iconwright.guptajayam.com.
