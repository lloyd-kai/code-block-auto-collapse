# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
See [CONTRIBUTING.md](CONTRIBUTING.md) for the versioning policy and for the
Obsidian constraint that rules out pre-release suffixes in `manifest.version`.

## [Unreleased]

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
