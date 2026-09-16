# Code Block Auto Collapse

**Version 3.0.0** · requires Obsidian **1.8.7** or newer · desktop and mobile

An Obsidian plugin that keeps long fenced code blocks compact in Reading View and gives very long blocks a real code minimap for navigation.

## What it does

**Collapse.** Code blocks with four or more lines are collapsed automatically. Move the pointer over a block and the toggle appears: **Expand code** to show the whole block, **Collapse code** to fold it again. Clicking anywhere on a collapsed block also expands it, and the toggle stays reachable with the keyboard.

**Minimap.** Code blocks with more than 100 lines get a navigation minimap next to the code. It is drawn on a canvas with the theme's syntax colors, a viewport rectangle for the visible region, and MARK/region labels. You can:

- click the minimap to jump to that position,
- drag the viewport rectangle to scroll precisely,
- hover to preview the nearby code,
- drag the inner edge to change the width,
- scroll the document with the wheel as usual,
- focus the minimap and use `↑` `↓` `PageUp` `PageDown` `Home` `End`.

The minimap stays usable while a block is collapsed: it shrinks to the preview height, and clicking it expands the block and jumps to that line.

## How the minimap renders

The rendering follows the CodeGlance / CodeGlance Pro approach, which is what makes the thumbnail read like a text texture instead of a solid block:

- Each source line is mapped to `Pixels Per Line` rows (default 4). Tab counts as four columns, and a line wider than the minimap is clipped rather than squeezed.
- **Clean** style fills a uniform weight per character; **Accurate** style uses per-character top/bottom ink coverage measured from the Courier font, so the thumbnail keeps the shape of the text.
- Syntax colors come from the tokens Obsidian already rendered, with a lexical fallback (strings, comments, numbers, common keywords) when a block has no token spans.
- `Proportional` keeps a stable row pitch and pans the canvas window while you scroll; `Fit` compresses the whole block into the visible height.

Everything is configurable in **Settings → Code Block Auto Collapse**, grouped into five sections: Collapse, Minimap, Viewport, Interaction, and Rendering.

The interface follows Obsidian's own language: it is English by default and switches to Chinese automatically when Obsidian runs in Chinese. The plugin adds no interface of its own beyond the toggle on each code block and one settings tab.

## Settings overview

| Group | Options |
|---|---|
| Collapse | minimum lines to collapse, preview lines |
| Minimap | minimum/maximum lines, keep empty area out of range, pixels per line, height mode, render style, alignment, width, lock width, auto-shrink |
| Viewport | viewport color, border color, border width |
| Interaction | click behavior (code position / mouse position), jump on, scroll only, hover preview, wheel moves preview |
| Rendering | syntax highlighting, markers, marker pattern, marker font scale |

## Install locally

### Use the release ZIP

Unzip `code-block-auto-collapse-3.0.0.zip` directly into `<vault>/.obsidian/plugins/`. The archive contains the `code-block-auto-collapse` plugin directory with all runtime files.

The ZIP holds exactly three files — `main.js`, `manifest.json`, and `styles.css` — under a single `code-block-auto-collapse/` directory. It is produced by `npm run release` (see below), so it always matches the current build.

### Build from source

1. Run `npm install` and then `npm run build`.
2. Copy `main.js`, `manifest.json`, and `styles.css` into `<vault>/.obsidian/plugins/code-block-auto-collapse/`.
3. Enable **Code Block Auto Collapse** in Obsidian's community plugins settings.

## Development

```text
src/main.ts                       Plugin entry, events, settings persistence
src/settings.ts                   Settings shape and validation
src/settings-tab.ts               Settings tab
src/i18n.ts                       Interface text (English base, Chinese auto-switch)
src/types.ts                      Enum literal types
src/code-blocks/                  Code block decoration and the collapsed view
src/minimap/geometry.ts           Minimap geometry and line/coordinate mapping
src/minimap/code-minimap.ts       Minimap component (drawing, viewport, interaction)
src/render/                       Glyph rasterization, syntax colors, canvas painting
src/preview/code-lens.ts          Hover code preview
src/util/                         Numeric, DOM, color, and text helpers
tools/generate-character-weights.mjs  Generates the glyph weight table from upstream CodeGlance Pro
tools/package-release.mjs             Syncs release/ and packs the release ZIP
tools/validate-submission.mjs         Submission checks (manifest constraints, version agreement, artifact hashes)
tools/smoke-test.mjs                  Pure-logic smoke tests
eslint.config.mjs                     ESLint config matching the official community plugin review
manifest.json / versions.json / styles.css / main.js
release/code-block-auto-collapse/     Ready-to-copy plugin directory
code-block-auto-collapse-<version>.zip  Release archive
```

### Scripts

- `npm run build` runs `tsc --noEmit` first, then bundles with esbuild.
- `npm test` runs the smoke tests for the geometry, text parsing, and weight tables (no DOM required).
- `npm run lint` runs the official [`eslint-plugin-obsidianmd`](https://github.com/obsidianmd/eslint-plugin) rule set, which is what Obsidian's reviewers check against. It currently reports zero errors and two advisory warnings about the pre-1.13 settings API — see [PLUGIN_DEVELOPMENT.md](PLUGIN_DEVELOPMENT.md#13-提交到官方社区插件目录).
- `npm run release` builds, syncs `release/code-block-auto-collapse/`, and packs `code-block-auto-collapse-<version>.zip` from the same in-memory artifacts — so the three can never drift apart.
- `npm run validate` checks the submission requirements mechanically: manifest field constraints, version agreement across `manifest.json` / `package.json` / `versions.json` / the ZIP name, and that the root `main.js`, the `release/` copy, and the copy inside the ZIP are byte-identical.
- `npm run preflight` runs `lint` → `test` → `release` → `validate` in one go. This is the command to run before every release.
- `npm run weights` regenerates `src/render/character-weights.ts` from the upstream [CodeGlance Pro](https://github.com/Nasller/CodeGlancePro) source. It needs a local clone, which is **not** shipped with this repo — clone it first:
  `git clone --depth 1 https://github.com/Nasller/CodeGlancePro.git _CodeGlancePro`.
  The generated table is committed, so this is only needed when re-verifying the numbers.

See [PLUGIN_DEVELOPMENT.md](PLUGIN_DEVELOPMENT.md) for the full architecture notes, the Obsidian APIs involved, and the bug history.

### Releasing

```bash
npm run release
```

That single command does everything needed to ship:

1. `tsc --noEmit` type-checks the whole `src/` tree.
2. esbuild bundles and minifies `src/main.ts` into `main.js` (about 43 KB).
3. The three runtime files are copied into `release/code-block-auto-collapse/`.
4. The same in-memory buffers are written into `code-block-auto-collapse-<version>.zip`, with forward-slash entry paths and the plugin directory level included.

Because step 3 and step 4 read from one source, the ZIP, the `release/` directory, and the repository root can never disagree. Do not copy the files by hand and zip them separately — that is exactly how an earlier release ended up shipping a stale `main.js`.

The version comes from `manifest.json`; `package.json` and `versions.json` should be bumped alongside it. The ZIP is written to the repository root and the version must match the Git tag (no `v` prefix). See [PLUGIN_DEVELOPMENT.md](PLUGIN_DEVELOPMENT.md) for the full release checklist.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) first. In short:

- **Branches** follow GitFlow. `main` holds the released state and is the default branch; `develop` is the integration branch. Work happens on `feature/<topic>`, `bugfix/<topic>`, `release/<version>`, or `hotfix/<version>`, merged back with `--no-ff`.
- **Commits** follow [Conventional Commits](https://www.conventionalcommits.org/): `feat(minimap): add drag-to-resize gutter`.
- **Versions** follow SemVer, with the Obsidian constraint that `manifest.version` may contain only digits and periods — no `-beta` suffixes.
- **Issues** use the provided forms; blank issues are disabled.

Changes land on `develop` and reach `main` through a `release/*` branch, which is where the version bump and the tag are applied. Notable changes are recorded in [CHANGELOG.md](CHANGELOG.md).

## Disclosures

Obsidian's [developer policies](https://docs.obsidian.md/Developer+policies) require plugins to declare anything that touches the user's data, network, or money. This plugin declares all of the following as **none**:

| Item | Status |
|---|---|
| Network access or remote services | None. The plugin never makes a request. |
| Telemetry (client or server side) | None. |
| Accounts or sign-in | None. |
| Paid features | None. Everything is free and unlocked. |
| Ads (dynamic or static) | None. |
| Files read or written outside the vault | None. The plugin does not touch the filesystem at all. |
| Node.js or Electron APIs | None, so `isDesktopOnly` is `false` and the plugin runs on mobile. |
| Obfuscated or minified-only source | None. `main.js` is a readable esbuild bundle built from the `src/` tree in this repository. |

**What the plugin does touch.** It only decorates the DOM that Obsidian has already rendered in Reading View. It never writes to your Markdown files, and it never modifies your vault. Removing the plugin leaves every note byte-for-byte unchanged.

**Third-party code.** No third-party runtime code is bundled — the released `main.js` contains only this project's source plus the Obsidian API it is linked against. The upstream [CodeGlance Pro](https://github.com/Nasller/CodeGlancePro) repository is a reference for the minimap rendering algorithm only; it is not part of this project and is not distributed with it.

## Support

Found a bug or want a feature? Open an issue at [github.com/lloyd-kai/code-block-auto-collapse/issues](https://github.com/lloyd-kai/code-block-auto-collapse/issues).

## License

MIT — see [LICENSE](LICENSE).
