# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
See [CONTRIBUTING.md](CONTRIBUTING.md) for the versioning policy and for the
Obsidian constraint that rules out pre-release suffixes in `manifest.version`.

## [Unreleased]

### Added

- A Styling section in `README.md` (and 自定义样式 in the Chinese half)
  documenting the wrapper class, the state classes, the inner-element prefix, and
  the eight `--cbac-*` custom properties. Seven of them are rewritten by the
  script on every layout pass, so only `--cbac-fade-height` can be overridden
  from a CSS snippet; saying so in the README is cheaper than answering the
  issue later.

### Changed

- `.github/dependabot.yml` now targets `develop` instead of the default branch.
  Dependency upgrades are integration work, and `main` has to stay exactly equal
  to the source of the published tag: the directory rebuilds the default branch
  and compares the result against the release assets, so merging a dependency
  pull request into `main` would be editing an already-released version. Without
  `target-branch`, Dependabot aims at the default branch, and all three pull
  requests it opened pointed at `main`.
- The `types` group was split into `node-types` and `typescript`, and
  `typescript` is now ignored from 6.1.0 upwards. `typescript-eslint` 8.x
  declares `typescript >=4.8.4 <6.1.0`, and `eslint.config.mjs` enables
  `projectService` for type-aware linting, so a newer compiler makes
  `npm run lint` fail while `tsc --noEmit` and esbuild keep passing. Remove the
  ignore once `typescript-eslint` supports the newer compiler.
- `eslint` was bumped to 10 and `esbuild` to 0.28. The esbuild bump was checked to
  be output-neutral before it was taken: building the same source with 0.25.12 and
  with 0.28.2 produced a byte-identical `main.js`. That check matters because the
  released artifact has to keep matching what the default branch builds, so a
  bundler upgrade that changes the output cannot be taken casually.
- `@types/node` stays on 20 for now, and the range is worth revisiting: the
  workflows run Node.js 22, so the types are two majors behind the runtime, while
  the 26 that Dependabot proposes is four majors ahead of it. Neither describes
  what actually runs; `^22` would.

## [1.0.1] - 2026-09-17

### Added

- `tools/git-guard.mjs`, exposed as `npm run git --`, `npm run git:check`, and
  `npm run git:check:strict`. It diagnoses and works around a silent ref-loss
  defect in this development environment's shell sandbox: the bundled
  PortableGit reports success while writing nothing for refs nested deeper than
  `.git/refs/<name>/<file>` inside the workspace. `feature/*` branches silently
  became unborn, and `git merge` could discard uncommitted work through
  autostash. The same defect also makes a branch switch delete a whole directory
  instead of the one file that actually differs, so the guard additionally
  checks for tracked files reported as deleted after `checkout`, `switch`,
  `merge`, `pull`, `rebase`, `cherry-pick`, `revert`, and `reset`. The guard
  picks a working Git, verifies the result of every ref-mutating command, and
  fails loudly when the result is wrong.
- `.github/dependabot.yml`, which takes over tracking the pinned action versions
  and the npm dependencies, one grouped pull request per ecosystem per week.
  `upload-artifact` had already been left pointing at Node.js 20 while the runner
  forced it onto Node.js 24, and nothing was watching for that.
- `.github/SECURITY.md`, documenting the private vulnerability reporting path.

### Changed

- `PLUGIN_DEVELOPMENT.md` no longer carries the two sections that only applied to
  the machine this was developed on: the draft issue list and the notes on the
  shell sandbox's Git defect, including local absolute paths and internal tool
  names. Both moved to a local, uncommitted file. The published guide keeps the
  architecture, API, rendering and release material, and section 11 now records
  the bug history of both releases.
- `npm run validate` now asserts that every local-only path is untracked, not
  just `main.js`. `.gitignore` does not stop `git add -f`, and the official docs
  mirror is the sort of thing that must not be pushed by accident.

- `npm run git:check` runs in warn-only mode and cannot fail the build. Its
  verdict depends on the machine — whether a system Git is installed, whether
  the checkout is a linked worktree, whether the directory is managed by a sync
  client — so it has no business gating `npm run preflight`. Use the new
  `npm run git:check:strict` when you want it to block. `npm run git:check` is
  now the first step of `npm run preflight`.
- `.gitignore` covers the local agent orientation guide and the usual editor and
  operating-system noise (`.vscode/`, `.idea/`, `*.iml`, `.DS_Store`,
  `Thumbs.db`, `desktop.ini`, `*.log`, `.eslintcache`), plus a local test vault.

### Fixed

- A settings change or a minimap width drag could be lost. `saveData()` is
  debounced by 400 ms and `onunload()` cancelled the pending call, so reloading
  the plugin or quitting the app inside that window discarded the change. The
  debounce now exposes `flush()`, and unload flushes it before tearing anything
  else down.
- Scrolling a note with many code blocks re-read `textContent` for every tracked
  block on every frame, allocating a fresh copy of the full source each time.
  Blocks far outside the viewport are now skipped before that read.
- A code block that fills the viewport still rebuilt its entire source string
  every frame. The previous fix only skipped blocks that were fully off screen,
  which does nothing for one long block that is itself the whole screen — the
  worst case, since a 20,000-line block meant re-allocating roughly 0.6 MB per
  frame while scrolling. The read is now gated to once every 400 ms. Reading view
  content is effectively static, so the delay is invisible, and minimap geometry
  still updates every frame.
- `CodeMinimap.update()` resolved the scroll container — an ancestor walk that
  reads computed styles and `scrollHeight` at every level — before checking
  whether the block was on screen. The cheap viewport test now runs first, so
  off-screen blocks skip the expensive walk.
- A block longer than "Maximum lines to render" still rebuilt its per-row
  representative array on every geometry change, even though nothing is drawn
  for it.
- A block whose source shrank below "Minimum lines to collapse" stayed clamped.
  The collapse flag was recomputed but never re-applied, so the wrapper kept its
  `is-collapsed` class while the toggle advertised "Collapse".
- With "Jump on" set to `Pointer up`, right-clicking the minimap jumped to the
  clicked position. Only a real left-button release navigates now.
- The hover preview kept a reference to the block's full source after it was
  destroyed.
- `tools/git-guard.mjs` reported false failures for correct commands. `git -c
  key=value <command>` was read as a ref name, so the guard claimed
  `merge.autostash=false` had been silently dropped; `git branch --list
  <pattern>`, `git tag -l <pattern>`, and `git branch -a` were treated as branch
  creations that never appeared; and an unstaged deletion that already existed
  before the command was blamed on the command. The guard now parses the
  subcommand past global options, ignores listing and pattern arguments, and
  diffs the worktree against a snapshot taken beforehand.
- `tools/git-guard.mjs` declared a perfectly good Git unusable inside a linked
  worktree or submodule, because it looked for ref files under
  `--absolute-git-dir` while refs live in the common directory.
- `npm run release` on Node below 20.15 or 22.2 died with an opaque
  module-resolution `SyntaxError` about `node:zlib`, because `crc32` does not
  exist there. It now fails with the Node version it found and the version it
  needs.

## [1.0.0] - 2026-09-16

First public release.

### Added

- Automatic collapsing of code blocks with four or more lines in Reading view,
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
- `.github/workflows/release.yml`: pushing a tag builds the plugin, runs the
  official ESLint rule set and the smoke tests, generates a build provenance
  attestation, and opens a draft GitHub release with `main.js`, `manifest.json`,
  and `styles.css` attached. The workflow fails outright if the tag does not
  match `manifest.version`, since Obsidian locates a release by exact tag match.
- `.github/workflows/ci.yml`: every push and pull request against `main` or
  `develop` runs lint, tests, and the build on **both** Ubuntu and Windows, plus
  a packaging job that runs the submission validator. The release workflow runs
  on Ubuntu while development happens on Windows, so a platform-specific bug
  could previously pass every local check and only surface at tag time.

### Changed

- The settings tab uses the declarative settings API
  (`getSettingDefinitions()`), which requires Obsidian 1.13.0 — `minAppVersion`
  is raised from `1.8.7` accordingly. Settings render through the framework
  instead of a hand-written `display()`, and every setting is now indexed by
  Obsidian's global settings search. `setControlValue()` is overridden so that a
  change still runs through `updateSettings()`, keeping the existing
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
- The plugin no longer uses the `lh` unit or `color-mix()`, so it works on older
  Chromium builds.

### Removed

- `settings-tab.ts` no longer imports `Setting` or builds rows by hand; the
  imperative `display()` override is gone, which clears the two ESLint warnings
  the official rule set reported for it.

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

[Unreleased]: https://github.com/lloyd-kai/code-block-auto-collapse/compare/1.0.1...HEAD
[1.0.1]: https://github.com/lloyd-kai/code-block-auto-collapse/compare/1.0.0...1.0.1
[1.0.0]: https://github.com/lloyd-kai/code-block-auto-collapse/releases/tag/1.0.0
