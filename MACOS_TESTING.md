# macOS verification

This is the source of a community plugin hosted by Obsidian. It does not include
or modify Obsidian's application source. Runtime code uses browser and public
Obsidian APIs, so the same build remains usable on Windows, Linux and mobile.

## Prepare a disposable vault

Use Node.js 22, run `npm ci`, then `npm run preflight`. Do not copy `node_modules`
between operating systems. Open a new test vault in Obsidian and install with:

```bash
npm run install:local -- --vault "/absolute/path/to/中文 Test Vault"
```

Enable community plugins, then Code Block Auto Collapse. The script expects the
default `.obsidian` directory. For a custom configuration directory, copy
`main.js`, `manifest.json` and `styles.css` manually into its `plugins/code-block-auto-collapse/` folder.

## Check in the application

Create a fenced code block with at least 120 lines and switch to **Reading view**.
The defaults collapse blocks at 4 lines and create a minimap at 101 lines.

| Scenario | Expected result |
| --- | --- |
| Expand, collapse, then Tab to the toggle | Source is unchanged; focus is visible and Enter/Space works |
| Scroll over the minimap with the preview hidden | The note scrolls naturally |
| Hover for 400 ms, then scroll with preview-wheel mode enabled | Preview moves by accumulated delta rather than one line per tiny event |
| Control-click or secondary-click the minimap | No unintended jump or resize |
| Pinch or scroll horizontally | Gesture is not prevented by the preview handler |
| Drag viewport or width gutter, then release/cancel | Drag ends and no later pointerup causes a stale jump |
| Move the tab to a popout; minimize the main window | Popout continues to scroll and draw independently |
| Move tab back; close and reopen popout repeatedly | Observation follows the tab; no orphan overlay remains |
| Enable plugin with a popout already open | Existing Reading-view blocks are decorated |
| Move between Retina and an external display | Canvas raster size follows that window's device pixel ratio |
| Change theme and system Reduce motion | Theme colors refresh; minimap navigation honors Reduce motion |
| Disable plugin | Wrappers, observers, timers and pending navigation are removed |

DOM regressions run automatically in `npm test` with controlled geometry and
independent window frame queues. They verify lifecycle and event behavior, not
native compositor performance, physical display switching or mobile hardware.
Record those manual results in the PR when the corresponding hardware is available.

## GitHub identities

Git commit authorship, SSH push authentication, browser login and the connected
GitHub API identity are separate. Verify the account before opening or merging
a PR. The intended workflow is a contributor fork PR into `develop`, followed by
a maintainer review and merge commit. Keep SSH private keys outside this repo.
