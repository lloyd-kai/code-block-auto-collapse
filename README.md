# Code Block Auto Collapse

**English** · [中文](#中文说明)

**Version 1.0.1** · requires Obsidian **1.13.0** or newer · desktop and mobile

A long fenced code block can swallow a whole note. This plugin keeps code blocks compact in Reading view and gives the very long ones a real code minimap, so you can still see the shape of the code and jump around it without scrolling past hundreds of lines.

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

## Styling

The plugin decorates with a single wrapper class and a small set of CSS variables, so a theme or a CSS snippet can restyle it without touching Obsidian's own code.

The wrapper is `.code-block-auto-collapse`. State lives in additional classes: `is-collapsed`, `has-code-minimap`, `is-minimap-left`. Inner elements use the `code-block-auto-collapse__` prefix — `__expand`, `__fade`, `__minimap`, `__minimap-canvas`, `__minimap-viewport`, `__lens`, `__lens-line`, `__lens-number`, `__lens-text`.

| Variable | Controls | Written at runtime |
|---|---|---|
| `--cbac-preview-height` | Height kept visible while a block is collapsed | Yes — from **Preview lines** |
| `--cbac-minimap-width` | Width of the minimap column | Yes — from **Minimap width** and the edge drag |
| `--cbac-canvas-height` | Height of the minimap canvas | Yes |
| `--cbac-viewport-color` | Fill of the viewport rectangle | Yes — from **Viewport color** |
| `--cbac-viewport-color-strong` | Fill while the viewport is hovered or dragged | Yes |
| `--cbac-viewport-border` | Border color of the viewport rectangle | Yes — from **Viewport border color** |
| `--cbac-viewport-border-width` | Border width, in pixels | Yes — from **Viewport border width** |
| `--cbac-fade-height` | Height of the fade above the expand button | **No** — CSS only |

The last column is the one that matters. Seven of these are rewritten by the plugin on every layout pass, so overriding them in a snippet will not stick — change the matching setting instead. `--cbac-fade-height` is the only one that is yours to set:

```css
.code-block-auto-collapse {
	--cbac-fade-height: 5em;
}
```

Everything else is drawn from Obsidian's own variables — `--text-normal`, `--background-primary`, `--code-background`, `--font-monospace`, `--font-ui-small`, `--interactive-accent`, `--background-modifier-border` — so the plugin follows the active theme instead of hard-coding colors.

## Install

### From the release ZIP

Unzip `code-block-auto-collapse-1.0.1.zip` directly into `<vault>/.obsidian/plugins/`. The archive contains the `code-block-auto-collapse` plugin directory with all runtime files.

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
.github/workflows/ci.yml              Lint, test and build on Linux and Windows for every push
.github/workflows/release.yml         Tag-driven release: build, attest, draft the GitHub release
.github/dependabot.yml                Weekly dependency and action version updates, targeting develop
manifest.json / versions.json / styles.css / main.js
release/code-block-auto-collapse/     Ready-to-copy plugin directory
code-block-auto-collapse-<version>.zip  Release archive
```

`main.js`, `release/`, and the ZIP are build outputs and are **not committed** — `main.js` is distributed as a GitHub release asset only, as the community directory requires.

### Scripts

- `npm run build` runs `tsc --noEmit` first, then bundles with esbuild.
- `npm test` runs the smoke tests for the geometry, text parsing, and weight tables (no DOM required).
- `npm run lint` runs the official [`eslint-plugin-obsidianmd`](https://github.com/obsidianmd/eslint-plugin) rule set, which is what Obsidian's reviewers check against. It currently reports **zero errors and zero warnings**.
- `npm run release` builds, syncs `release/code-block-auto-collapse/`, and packs `code-block-auto-collapse-<version>.zip` from the same in-memory artifacts — so the three can never drift apart.
- `npm run validate` checks the submission requirements mechanically: manifest field constraints, version agreement across `manifest.json` / `package.json` / `versions.json` / the ZIP name, and that the root `main.js`, the `release/` copy, and the copy inside the ZIP are byte-identical. It also enforces the rules the community directory scanner applies — `main.js` must not be tracked by Git, the README must carry a disclosures section, and `package.json` must expose a build script the scanner can find.
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

### Publishing to the community directory

The plugin is listed in the [Obsidian community directory](https://community.obsidian.md). Submitting goes through the directory's web form — **not** through a pull request against `obsidian-releases`, which is the older process and no longer used.

1. Push a tag matching `manifest.version` exactly (no `v` prefix). `.github/workflows/release.yml` then builds the plugin, generates a build provenance attestation, and opens a **draft** release with `main.js`, `manifest.json`, and `styles.css` attached. Add the release notes and publish it. The workflow refuses to run if the tag and the manifest version disagree.
2. Sign in at [community.obsidian.md](https://community.obsidian.md) with an **Obsidian account**, then connect your GitHub account under **Profile → GitHub**. The directory uses that connection to verify you own the repository, so it is required before you can submit.
3. Open **Plugins → New plugin**, enter the repository URL, and accept the [developer policies](https://docs.obsidian.md/Community+directory/Developer+policies).

The directory then scans the manifest, the release assets, the source code, and the build. Those four groups each report errors, warnings, recommendations, or passes, and an error blocks installation from Obsidian until it is resolved. **Review branch** previews a scan against any branch, tag, or commit — no release required — which is the fastest way to check a fix.

Run `npm run validate` before submitting: it asserts the requirements that the scanner checks, so the common failures are caught locally instead. The full walkthrough, including listing metadata and screenshots, is in [PLUGIN_DEVELOPMENT.md](PLUGIN_DEVELOPMENT.md) § 13.

Only the initial submission uses the form. After that, publishing a new release is all it takes.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) first. In short:

- **Branches** follow GitFlow. `main` holds the released state and is the default branch; `develop` is the integration branch. Work happens on `feature/<topic>`, `bugfix/<topic>`, `release/<version>`, or `hotfix/<version>`, merged back with `--no-ff`.
- **Commits** follow [Conventional Commits](https://www.conventionalcommits.org/): `feat(minimap): add drag-to-resize gutter`.
- **Versions** follow SemVer, with the Obsidian constraint that `manifest.version` may contain only digits and periods — no `-beta` suffixes.
- **Issues** use the provided forms; blank issues are disabled.

Changes land on `develop` and reach `main` through a `release/*` branch, which is where the version bump and the tag are applied. Notable changes are recorded in [CHANGELOG.md](CHANGELOG.md).

## Disclosures

Obsidian's [developer policies](https://docs.obsidian.md/Community+directory/Developer+policies) require plugins to declare anything that touches the user's data, network, or money. This plugin declares all of the following as **none**:

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

**What the plugin does touch.** It only decorates the DOM that Obsidian has already rendered in Reading view. It never writes to your Markdown files, and it never modifies your vault. Removing the plugin leaves every note byte-for-byte unchanged.

**Third-party code.** No third-party runtime code is bundled — the released `main.js` contains only this project's source plus the Obsidian API it is linked against. The upstream [CodeGlance Pro](https://github.com/Nasller/CodeGlancePro) repository is a reference for the minimap rendering algorithm only; it is not part of this project and is not distributed with it.

## Support

Found a bug or want a feature? Open an issue at [github.com/lloyd-kai/code-block-auto-collapse/issues](https://github.com/lloyd-kai/code-block-auto-collapse/issues).

For anything exploitable, use [private vulnerability reporting](https://github.com/lloyd-kai/code-block-auto-collapse/security/advisories/new) instead of a public issue — see [SECURITY.md](.github/SECURITY.md).

## License

MIT — see [LICENSE](LICENSE).

---

# 中文说明

[English](#code-block-auto-collapse) · **中文**

**版本 1.0.1** · 需要 Obsidian **1.13.0** 或更高 · 桌面端与移动端

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

## 自定义样式

插件只用一层包装类加一组 CSS 变量来做装饰，主题或 CSS 片段可以直接改它，不必动 Obsidian 自身的代码。

包装类是 `.code-block-auto-collapse`；状态用附加类表达：`is-collapsed`、`has-code-minimap`、`is-minimap-left`。内部元素统一 `code-block-auto-collapse__` 前缀 —— `__expand`、`__fade`、`__minimap`、`__minimap-canvas`、`__minimap-viewport`、`__lens`、`__lens-line`、`__lens-number`、`__lens-text`。

| 变量 | 控制什么 | 是否由脚本写入 |
|---|---|---|
| `--cbac-preview-height` | 折叠时保留的高度 | 是 —— 来自**折叠时显示的行数** |
| `--cbac-minimap-width` | 缩略图列宽 | 是 —— 来自**缩略图宽度**与内边缘拖拽 |
| `--cbac-canvas-height` | 缩略图 canvas 高度 | 是 |
| `--cbac-viewport-color` | 视窗矩形的填充色 | 是 —— 来自**视窗颜色** |
| `--cbac-viewport-color-strong` | 视窗被悬停或拖拽时的填充色 | 是 |
| `--cbac-viewport-border` | 视窗矩形边框色 | 是 —— 来自**视窗边框颜色** |
| `--cbac-viewport-border-width` | 边框厚度（像素） | 是 —— 来自**视窗边框厚度** |
| `--cbac-fade-height` | 展开按钮上方渐变遮罩的高度 | **否** —— 只由 CSS 决定 |

最后一列是关键：其中 7 个在每次布局时都会被脚本重写，**在片段里覆盖它们不会生效**，要改请改对应的设置项。只有 `--cbac-fade-height` 是留给你的：

```css
.code-block-auto-collapse {
	--cbac-fade-height: 5em;
}
```

其余样式全部取自 Obsidian 自己的变量 —— `--text-normal`、`--background-primary`、`--code-background`、`--font-monospace`、`--font-ui-small`、`--interactive-accent`、`--background-modifier-border`，所以插件跟随当前主题，没有硬编码颜色。

## 安装

### 用发布包

把 `code-block-auto-collapse-1.0.1.zip` 直接解压到 `<vault>/.obsidian/plugins/`。压缩包内是完整的 `code-block-auto-collapse` 插件目录。

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
- `npm run lint` —— 官方 [`eslint-plugin-obsidianmd`](https://github.com/obsidianmd/eslint-plugin) 规则集，也就是 Obsidian 审阅人比对的那套。当前 **0 error、0 warning**。
- `npm run release` —— 构建 → 同步 `release/` → 打 ZIP，三者取自同一份内存产物。
- `npm run validate` —— 把上架要求变成机械断言：manifest 字段约束、版本号一致、三份 `main.js` 逐字节相同，以及扫描器会查的几条硬规则（`main.js` 不得被 Git 跟踪、README 必须有披露章节、`package.json` 必须有扫描器认得的构建脚本）。
- `npm run preflight` —— `lint → test → release → validate`，发版前跑这一条。
- `npm run weights` —— 重新生成 `src/render/character-weights.ts`，需要先 `git clone --depth 1 https://github.com/Nasller/CodeGlancePro.git _CodeGlancePro`。生成表已提交，只在复核数值时才需要。

## 发布与上架

插件已列入 [Obsidian 社区目录](https://community.obsidian.md)。提交走目录的**网页表单**，不是往 `obsidian-releases` 提 PR —— 那是已经废弃的旧流程。

1. 推送与 `manifest.version` **完全一致**的 tag（不带 `v` 前缀）。`.github/workflows/release.yml` 会自动构建、生成构建溯源证明，并建一个 **draft** Release 附上 `main.js`、`manifest.json`、`styles.css` 三个文件。补好发布说明后手动发布。tag 与版本号不一致时工作流会直接失败。
2. 用 **Obsidian 账号**登录 [community.obsidian.md](https://community.obsidian.md)，在 **Profile → GitHub** 关联 GitHub 账号。目录靠这个确认仓库归属，**不关联就无法提交**。
3. 侧栏 **Plugins → New plugin**，填仓库地址，同意[开发者政策](https://docs.obsidian.md/Community+directory/Developer+policies)。

之后目录会扫描 manifest、Release 附件、源码与构建，分四组给出错误 / 警告 / 建议 / 通过；存在错误时插件无法从 Obsidian 内安装。**Review branch** 可以在不发 Release 的情况下对任意分支或 commit 预览扫描结果，是验证修复最快的方式。

提交前先跑 `npm run validate`，它把扫描器会检查的要求变成了本地断言。完整的提交步骤、条目元数据与截图规格见 [PLUGIN_DEVELOPMENT.md](PLUGIN_DEVELOPMENT.md) 第 13 节。

只有首次上架需要走表单，之后每次更新只需发布新的 Release。

## 隐私与合规声明

Obsidian 的[开发者政策](https://docs.obsidian.md/Community+directory/Developer+policies)要求插件声明任何涉及用户数据、网络或付费的行为。本插件全部声明为**无**：

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
