# Contributing

The most useful contribution right now is **testing on a computer that isn't the developer's**. iconwright has been tested on one Windows 11 PC with a customized taskbar (StartAllBack). Everything else is unknown: the stock Windows 11 taskbar, Windows 10, macOS, Linux, several monitors, non-English Windows.

This page has ready-made prompts: paste one into your AI agent (Claude Code, Codex, Cursor or any agent with a terminal), and it installs iconwright, runs a test plan, and writes a report for you to send back.

## How to send findings

Pick whichever suits you. All three are welcome.

| Way | Best for | How |
| --- | --- | --- |
| **Test report issue** | Most testers | [Open a test report](https://github.com/JayceeGupta/iconwright/issues/new?template=test-report.yml), paste the report your agent wrote, attach screenshots. |
| **Report as a pull request** | Keeping reports with the code | Add your report as `test-reports/<date>-<system>.md` (for example `2026-11-02-windows10.md`) and open a pull request. |
| **Fix as a pull request** | When you know the fix | Open a pull request with the change and the report that shows the problem. |

The maintainer reads every report and pull request, and may write the fix their own way rather than merging yours as is. Either way, your report is what makes the fix possible, and it's credited in the changelog.

Before sharing, check your report and screenshots for anything private. `iconwright report` leaves out app names, file paths and your user name, but screenshots of a taskbar or desktop show your apps and files.

## Test prompts

Each prompt is self-contained. It tells the agent what to test, what it may change, and to put everything back. Changes that restart Explorer (the taskbar blinks and open File Explorer windows close) always need your OK first.

### macOS or Linux

Only the design features run here (search, compare, preview, export, studio); the taskbar and desktop features are Windows-only.

```text
Help me test iconwright (https://github.com/JayceeGupta/iconwright), an MCP server and CLI
for designing icons. Run this plan and write a report. Only create files inside one new
temporary folder; change nothing else on this computer.

1. In a new temporary folder: git clone the repo, run npm install, then run
   `node bin/iconwright.mjs report` and keep its output for the report.
2. Command line. Run each, then open every image it makes and look closely:
   - node bin/iconwright.mjs search rocket --sheet search.png
   - node bin/iconwright.mjs design ph:rocket-launch-fill tabler:rocket --styles "color=white bg=#2d5ba6 shape=squircle|color=#e9c46a bg=#1f2228 shape=circle" --out grid.png
   - node bin/iconwright.mjs preview ph:rocket-launch-fill --style "color=white bg=#2d5ba6 shape=squircle" --scenes taskbar,start,desktop,explorer,browser,dock,ios,android,sizes --scale 2 --out scenes.png
   - node bin/iconwright.mjs make ph:rocket-launch-fill --style "color=white bg=#2d5ba6 shape=squircle" --formats ico,icns,web,pngset --out out
   Note anything wrong: errors, clipped or missing text, misplaced icons, wrong colors,
   blank cells. On macOS, open out/*.icns in Preview and check it shows every size.
3. MCP. Add a stdio MCP server to yourself that runs `node <clone>/bin/iconwright-mcp.mjs`
   (if you can't add servers to yourself, use the MCP SDK from a small Node script).
   Check that exactly these tools are listed: search_icons, design_icons, preview_icon,
   make_icon, open_studio. Call each of the first four once and look at the images.
4. Studio. Run `node bin/iconwright.mjs studio --no-open`, open the printed link, search,
   pick an icon, change color and shape, click "Show 6 ideas", download a .ico and the
   website icons. Note anything broken or confusing. Stop it with Ctrl+C afterwards.
   If you can't use a browser, skip this step and say so in the report.
5. Write the report as iconwright-report.md using the template at
   https://iconwright.guptajayam.com/docs/contributing#report-template, with the
   `report` output, what worked, what didn't (exact commands and errors) and the images
   that looked wrong. Then tell me where the report and images are, and delete the
   temporary folder only after I've said I've sent them.
```

### Windows 10 or 11 with the stock taskbar

This is the most valuable test: iconwright edits how Windows keeps pinned apps, and that has only been tested with StartAllBack. Everything the plan changes is put back at the end.

```text
Help me test iconwright (https://github.com/JayceeGupta/iconwright), an MCP server and CLI
that designs icons and changes the Windows taskbar and desktop. Run this plan and write a
report. Rules:
- Ask me before every step marked RESTART: it restarts Windows Explorer, so the taskbar
  blinks and open File Explorer windows close. Skip it if I say no.
- Put everything back at the end, and prove it by comparing before and after.
- Screenshots may show my apps; ask before including them in the report.

1. Set up: git clone the repo into a new folder, run npm install, then
   `node bin/iconwright.mjs report` (keep the output) and `node bin/iconwright.mjs doctor`.
   If doctor reports a problem, stop and report it.
2. Record the starting state: `node bin/iconwright.mjs status` (pinned apps in order) and
   `node bin/iconwright.mjs desktop list`. Save both outputs to before.json.
3. Design (no changes to Windows): run the four commands in step 2 of the macOS/Linux
   prompt at https://iconwright.guptajayam.com/docs/contributing#macos-or-linux and check
   the images, plus `node bin/iconwright.mjs preview app:<one of my pinned apps> --scenes taskbar,start --out mine.png`.
4. App icon: pick one pinned app that isn't important to me. Run
   `node bin/iconwright.mjs apply "<app>" --source app --style "color=#e9c46a bg=#1f2228 shape=squircle"`,
   take `node bin/iconwright.mjs capture taskbar`, check that only that app's icon changed
   (and the Start menu entry), then `node bin/iconwright.mjs restore "<app>"` and capture again.
5. Pins, dry run: `node bin/iconwright.mjs pins --pin Notepad --order Notepad --position 1 --dry-run`.
   Check the predicted order makes sense.
6. RESTART: `node bin/iconwright.mjs pins --pin Notepad --order Notepad --position 1`.
   Capture the taskbar: is Notepad pinned in second place and did everything else stay?
   Did the taskbar come back normally? Note how long it took.
7. RESTART: `node bin/iconwright.mjs pins --unpin Notepad`. Compare `status` with before.json:
   the pinned apps and their order must be identical.
8. Desktop: `node bin/iconwright.mjs desktop save before-desktop.json`, then
   `node bin/iconwright.mjs desktop arrange --by type --corner top-right`, capture the desktop,
   then `node bin/iconwright.mjs desktop load before-desktop.json` and compare
   `desktop list` with before.json.
9. Final check: `node bin/iconwright.mjs restore --all`, then compare status and desktop list
   with before.json once more. Anything different is a finding.
10. Write the report as iconwright-report.md using the template at
    https://iconwright.guptajayam.com/docs/contributing#report-template. Include exact
    commands, outputs and errors for anything that failed, and tell me where it is.
```

For **Windows with several monitors**, add to the prompt: “In step 8, run the arrange on monitor 1 as well (`--monitor 1`), and check icons on the other monitor didn't move.” For **non-English Windows**, add: “Note my Windows display language in the report, and check that app names in `status` and `apps` look right.”

### Through the agent tools instead of the command line

To test the MCP server the way agents use it, add this to either prompt: “Do the steps with the iconwright MCP tools instead of the command line where a tool exists (taskbar_status, app_apply_icon, restore_icons, taskbar_pins with dryRun, desktop_layout, desktop_arrange, capture), and note any tool description that was unclear or any result that was hard to use.”

## Report template

```markdown
# iconwright test report: <your system, e.g. Windows 10 22H2, stock taskbar>

## Environment
<paste the output of `node bin/iconwright.mjs report`>
- Taskbar: stock / StartAllBack / ExplorerPatcher / other: ...
- Monitors: ..., display scaling: ...%, Windows display language: ...

## What I tested
- [ ] Design commands (search, design, preview, make)
- [ ] MCP server
- [ ] Studio
- [ ] App icon apply and restore
- [ ] Pins: dry run, pin and reorder, unpin
- [ ] Desktop: save, arrange, load
- [ ] Everything back to the starting state (before/after identical)

## What went wrong
For each problem: what I ran, what I expected, what happened (exact error), screenshot.

## What was confusing
Docs, messages or results that were unclear.

## Anything else
```

## Changing the code

```bash
git clone https://github.com/JayceeGupta/iconwright
cd iconwright && npm install
npm test                      # the test suite (any OS)
npm run site:build            # builds the website into site/dist
node scripts/dev/serve-site.mjs  # serves it at http://127.0.0.1:4318
```

- [How it works](how-it-works.md) explains the parts; [Windows internals](windows-internals.md) has the details of the pinned-apps format and Explorer. Read it before changing anything about pins.
- MCP tools are defined in one table in `src/tools.mjs`; the [tool reference](tools.md) is generated from it.
- Test changes to pins, icons or the desktop end to end on a real PC, and put everything back afterwards.
- Keep the docs' voice: short sentences, plain words, what the user sees.
