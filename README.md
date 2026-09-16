# Code Block Auto Collapse

**English** · [中文](#中文说明)

**Version 1.0.0** · requires Obsidian **1.8.7** or newer · desktop and mobile

A long fenced code block can swallow a whole note. This plugin keeps code blocks compact in Reading View and gives the very long ones a real code minimap, so you can still see the shape of the code and jump around it without scrolling past hundreds of lines.

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

## Install

### From the release ZIP

Unzip `code-block-auto-collapse-1.0.0.zip` directly into `<vault>/.obsidian/plugins/`. The archive contains the `code-block-auto-collapse` plugin directory with all runtime files.

The ZIP holds exactly three files — `main.js`, `manifest.json`, and `styles.css` — under a single `code-block-auto-collapse/` directory. It is produced by `npm run release`, so it always matches the current build.

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
- `npm run lint` runs the official [`eslint-plugin-obsidianmd`](https://github.com/obsidianmd/eslint-plugin) rule set, which is what Obsidian's reviewers check against. It currently reports zero errors and two advisory warnings about the pre-1.13 settings API — see [PLUGIN_DEVELOPMENT.md](PLUGIN_DEVELOPMENT.md).
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

---

# 中文说明

[English](#code-block-auto-collapse) · **中文**

**版本 1.0.0** · 需要 Obsidian **1.8.7** 或更高 · 桌面端与移动端

一段长代码会把整篇笔记挤没。这个插件让代码块在阅读视图里保持紧凑，并为特别长的代码块配一个真正的代码缩略图 —— 你既能一眼看出代码的形状，也能直接跳转，不用滚过几百行样板代码。

## 它做什么

**折叠。** 四行及以上的代码块会自动折叠。鼠标移到代码块上会出现切换按钮：**展开代码** 显示全部内容，**收起代码** 再次折叠。点击折叠块的任意位置也能展开，按钮同时支持键盘操作。

**缩略图。** 超过 100 行的代码块会在旁边生成一条导航缩略图。它用 canvas 绘制，采用主题的语法高亮配色，带一个标示可见区域的视窗矩形，以及 MARK/region 标记。你可以：

- 点击缩略图跳到对应位置；
- 拖拽视窗矩形精确滚动；
- 悬停预览附近的代码；
- 拖动内边缘调整宽度；
- 照常用滚轮滚动文档；
- 聚焦缩略图后用 `↑` `↓` `PageUp` `PageDown` `Home` `End` 导航。

代码块折叠时缩略图依然可用：它会缩到预览高度，点击它会先展开代码块再跳到那一行。

## 缩略图是怎么画出来的

渲染方式参照 CodeGlance / CodeGlance Pro，这也是缩略图看起来像「文字纹理」而不是一块实心色块的原因：

- 每个源码行映射为 `Pixels Per Line` 行像素（默认 4）。Tab 按四列计算，超过缩略图宽度的行会被裁掉而不是压缩。
- **Clean** 风格给每个字符填统一的权重；**Accurate** 风格使用从 Courier 字体实测出的字符上下墨迹覆盖率，缩略图能保留文字的形状。
- 语法颜色取自 Obsidian 已经渲染好的 token；当代码块没有 token span 时，退回到词法识别（字符串、注释、数字、常见关键字）。
- `Proportional` 保持固定的行距，滚动时平移 canvas 窗口；`Fit` 把整个代码块压缩进可见高度。

所有选项都在 **设置 → Code Block Auto Collapse**，分为五组：折叠、缩略图、视窗、交互、渲染。

界面文案跟随 Obsidian 自身语言：默认英文，当 Obsidian 运行在中文环境时自动切换为中文。除每个代码块上的切换按钮和一个设置页之外，插件不添加任何自己的界面。

## 设置项一览

| 分组 | 选项 |
|---|---|
| 折叠 | 触发折叠的最小行数、预览行数 |
| 缩略图 | 最小/最大行数、排除空白区、每行像素、高度模式、渲染风格、对齐方式、宽度、锁定宽度、自动收窄 |
| 视窗 | 视窗颜色、边框颜色、边框宽度 |
| 交互 | 点击行为（按代码位置/按鼠标位置）、跳转时机、仅滚动、悬停预览、滚轮移动预览 |
| 渲染 | 语法高亮、标记、标记模式、标记字号缩放 |

## 安装

### 用发布包

把 `code-block-auto-collapse-1.0.0.zip` 直接解压到 `<vault>/.obsidian/plugins/`。压缩包内是完整的 `code-block-auto-collapse` 插件目录。

包内恰好三个文件 —— `main.js`、`manifest.json`、`styles.css`，位于 `code-block-auto-collapse/` 目录下。它由 `npm run release` 生成，始终与当前构建一致。

### 从源码构建

1. 执行 `npm install`，然后 `npm run build`。
2. 把 `main.js`、`manifest.json`、`styles.css` 复制到 `<vault>/.obsidian/plugins/code-block-auto-collapse/`。
3. 在 Obsidian 的第三方插件设置里启用 **Code Block Auto Collapse**。

## 开发

模块划分、用到的 Obsidian API、渲染算法细节、构建与发布流程、以及历次 bug 的成因，都写在 [PLUGIN_DEVELOPMENT.md](PLUGIN_DEVELOPMENT.md)（中文）。

分支模型、提交信息格式、版本号规范与 issue 规范见 [CONTRIBUTING.md](CONTRIBUTING.md)。

常用命令：

- `npm run build` —— `tsc --noEmit` 类型检查 + esbuild 打包。
- `npm test` —— 纯逻辑冒烟测试（几何、文本解析、权重表），不需要 DOM。
- `npm run release` —— 构建 → 同步 `release/` → 打 ZIP，三者取自同一份内存产物。
- `npm run preflight` —— `lint → test → release → validate`，发版前跑这一条。

## 隐私与合规声明

Obsidian 的[开发者政策](https://docs.obsidian.md/Developer+policies)要求插件声明任何涉及用户数据、网络或付费的行为。本插件全部声明为**无**：

| 项目 | 状态 |
|---|---|
| 网络访问或远程服务 | 无。插件从不发起任何请求。 |
| 遥测（客户端或服务端） | 无。 |
| 账号或登录 | 无。 |
| 付费功能 | 无，全部功能免费开放。 |
| 广告（动态或静态） | 无。 |
| 读写 vault 之外的文件 | 无。插件完全不碰文件系统。 |
| Node.js 或 Electron API | 未使用，因此 `isDesktopOnly` 为 `false`，移动端可用。 |
| 混淆或仅提供压缩代码 | 无。`main.js` 是由本仓库 `src/` 构建出的可读 esbuild 产物。 |

**插件实际触碰的东西。** 它只装饰 Obsidian 已在阅读视图中渲染好的 DOM，从不写入你的 Markdown 文件，也不修改 vault。卸载插件后，每篇笔记都保持原样。

**第三方代码。** 发布包不含任何第三方运行时代码 —— `main.js` 里只有本项目源码和它链接的 Obsidian API。上游 [CodeGlance Pro](https://github.com/Nasller/CodeGlancePro) 仅作为缩略图渲染算法的参照，不是本项目的一部分，也不随本项目分发。

## 反馈

发现 bug 或想要新功能？到 [github.com/lloyd-kai/code-block-auto-collapse/issues](https://github.com/lloyd-kai/code-block-auto-collapse/issues) 提 issue。

## 许可

MIT —— 见 [LICENSE](LICENSE)。
