# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
See [CONTRIBUTING.md](CONTRIBUTING.md) for the versioning policy and for the
Obsidian constraint that rules out pre-release suffixes in `manifest.version`.

## [Unreleased]

### Added

- `.github/workflows/release.yml`: pushing a tag now builds the plugin, runs the
  official ESLint rule set and the smoke tests, generates a build provenance
  attestation, and opens a draft GitHub release with `main.js`, `manifest.json`,
  and `styles.css` attached. The workflow fails outright if the tag does not
  match `manifest.version`, since Obsidian locates a release by exact tag match.
- `.github/workflows/ci.yml`: every push and pull request against `main` or
  `develop` runs lint, tests, and the build on **both** Ubuntu and Windows, plus
  a packaging job that runs the submission validator. The release workflow runs
  on Ubuntu while development happens on Windows, so a platform-specific bug
  could previously pass every local check and only surface at tag time.
- `tools/git-guard.mjs`, exposed as `npm run git:check` and `npm run git --`.
  It diagnoses and works around a silent ref-loss defect in this environment's
  Bash sandbox: the bundled PortableGit 2.55 reports success while writing
  nothing for refs nested deeper than `.git/refs/<name>/<file>` inside the
  workspace. `feature/*` branches silently became unborn and `git merge` could
  discard uncommitted work through autostash. The same defect also makes a
  branch switch delete a whole directory instead of the one file that actually
  differs, so the guard additionally checks for tracked files reported as
  deleted after `checkout`, `switch`, `merge`, `pull`, `rebase`, `cherry-pick`,
  `revert`, and `reset`. The guard picks a working git, verifies the result of
  every ref-mutating command, and fails loudly when it is wrong. It is now the
  first step of `npm run preflight`; the reproduction matrix is in
  `PLUGIN_DEVELOPMENT.md` section 15.

### Changed

- The settings tab now uses the declarative settings API
  (`getSettingDefinitions()`), which requires Obsidian 1.13.0 — `minAppVersion`
  is raised accordingly. Settings render through the framework instead of a
  hand-written `display()`, and every setting is now indexed by Obsidian's
  global settings search. `setControlValue()` is overridden so that a change
  still runs through `updateSettings()`, keeping the existing
  rebuild/content/layout refresh tiers.
- `tools/smoke-test.mjs` resolves its source paths with `fileURLToPath()` /
  `pathToFileURL()`. The previous hand-rolled `pathname` conversion produced a
  path that esbuild accepted on Windows but not on Linux, which broke the
  release workflow at the "Lint and test" step while passing locally.
- `actions/upload-artifact` in CI moved to v7 so it runs on Node.js 24, matching
  the other pinned actions.
- Submission documentation rewritten for the community directory's web form.
  The `obsidian-releases` pull request process — appending to
  `community-plugins.json` and waiting for a `Ready for review` label — has been
  retired and is no longer mentioned in the official developer docs.
- `npm run validate` now also asserts the rules the directory scanner applies:
  `main.js` must not be tracked by Git, the README must carry a disclosures
  section, `package.json` must expose a build script the scanner can find, and
  `id` must not end with `plugin`.

### Removed

- `settings-tab.ts` no longer imports `Setting` or builds rows by hand; the
  imperative `display()` override is gone, which clears the two ESLint warnings
  the official rule set reported for it.

### Fixed

- A settings change or a minimap width drag could be lost. `saveData()` is
  debounced by 400 ms and `onunload()` cancelled the pending call, so reloading
  the plugin or quitting the app inside that window discarded the change. The
  debounce now exposes `flush()`, and unload flushes it before tearing anything
  else down.
- Scrolling a note with many code blocks re-read `textContent` for every tracked
  block on every frame, allocating a fresh copy of the full source each time.
  Blocks far outside the viewport are now skipped before that read.
- `CodeMinimap.update()` resolved the scroll container — an ancestor walk that
  reads computed styles and `scrollHeight` at every level — before checking
  whether the block was on screen. The cheap viewport test now runs first, so
  off-screen blocks skip the expensive walk.
- A block longer than "Maximum lines to render" still rebuilt its per-row
  representative array on every geometry change, even though nothing is drawn
  for it.
- With "Jump on" set to `Pointer up`, right-clicking the minimap jumped to the
  clicked position. Only a real left-button release navigates now.
- The hover preview kept a reference to the block's full source after it was
  destroyed.

## [1.0.0] - 2026-09-16

First public release.

### Added

- Automatic collapsing of code blocks with four or more lines in Reading View,
  with a hover-revealed expand toggle and a bottom fade.
- A code minimap for blocks longer than 100 lines, drawn on a canvas with the
  theme's syntax colors: click to jump, drag the viewport rectangle, hover to
  preview nearby code, drag the inner edge to resize, and navigate with
  `↑` `↓` `PageUp` `PageDown` `Home` `End`.
- CodeGlance-style rendering with per-character ink coverage (`Clean` and
  `Accurate` styles), a configurable `Pixels Per Line` row pitch, and
  `Proportional` / `Fit` height modes.
- Lexical syntax fallback (strings, comments, numbers, common keywords) for code
  blocks that Obsidian rendered without token spans.
- MARK/region labels, viewport color and border customization, left/right
  alignment, and optional width locking and auto-shrink.
- Settings tab grouped into Collapse, Minimap, Viewport, Interaction, and
  Rendering, with a restore-to-defaults action.
- Interface text that follows Obsidian's own language: English by default,
  Chinese automatically.

### Fixed

Bugs present before this release, all of them in the minimap and folding path:

- Window-level event listeners leaked on every re-render. Drag interactions now
  use pointer capture bound to the component's own container.
- Spreading large arrays into `Math.max` overflowed the call stack on very long
  blocks. Replaced with an explicit loop.
- Syntax color lookup was O(n²) in the number of tokens. Replaced with a
  single forward cursor.
- A `lh`-based fold height silently disabled folding entirely on older Electron
  versions, which do not support the `lh` unit. Replaced with pixel values.
- A CSS `min-height` overrode the scripted viewport height.
- The minimap was `display: none` while a block was collapsed, which removed the
  only way to navigate it.
- Click-to-navigate mixed the block-relative position with the scroll range, so
  clicks landed on the wrong line.
- The minimap did not update inside popout windows.
- Minimap colors did not refresh when the theme changed.
- Every slider input rebuilt the entire document. Settings changes are now
  classified as `rebuild`, `content`, or `layout`, with a debounce.

### Changed

- The plugin no longer uses the `lh` unit or `color-mix()`, so it works on older
  Chromium builds.
- `minAppVersion` is `1.8.7`, the version that introduced `getLanguage()`.

[Unreleased]: https://github.com/lloyd-kai/code-block-auto-collapse/compare/1.0.0...HEAD
[1.0.0]: https://github.com/lloyd-kai/code-block-auto-collapse/releases/tag/1.0.0
