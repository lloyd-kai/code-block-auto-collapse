# Code Block Auto Collapse：从源码到 Obsidian 发布

本文以当前的 `1.0.0` 版本为例，说明插件的架构、涉及的 Obsidian API、与参考实现（JetBrains 插件 CodeGlance Pro）的对应关系，以及发布流程。文中的路径均相对于项目根目录。

## 1. 插件做了什么

插件运行在阅读视图（Markdown Preview）中，只修改渲染结果，不修改 Markdown 源文件：

1. 找到渲染出的 `<pre>` 代码块，忽略 frontmatter / 属性面板里的 `<pre>`。
2. 行数达到阈值时用 wrapper 包住并默认折叠，悬停或聚焦时显示「展开代码 / 收起代码」。
3. 行数达到缩略图阈值时，在代码块一侧绘制 canvas 缩略图：语法配色、字符纹理、MARK/region 标记。
4. 缩略图支持点击跳转、拖动视窗、悬停预览、拖拽调宽、滚轮滚动、键盘导航。
5. 折叠状态下缩略图依然可用：高度收敛到预览高度，点击即展开并跳转。

## 2. 需要掌握的知识

### TypeScript

- `interface` / 映射类型：`settings.ts` 里用映射类型从 `CodeBlockSettings` 推导出「数值键 / 布尔键 / 枚举键」，设置页因此可以写成三个泛型方法。
- 严格的 `tsconfig`：`noImplicitAny`、`strictNullChecks`、`noImplicitReturns`、`noUnusedLocals` 全部开启，`tsc --noEmit` 是构建的第一步。
- ES 模块 + esbuild 打包成单文件 CommonJS，`obsidian` 与 `@codemirror/*` 标记为 external。

### 浏览器平台

- DOM：`replaceWith`、`appendChild`、`createDocumentFragment`、`replaceChildren`。
- Canvas 2D：设备像素比（DPR）、`setTransform`、`clearRect`、`fillRect`、`fillText`、`globalAlpha`。
- Pointer Events 与 `setPointerCapture`：拖拽期间把事件锁定在缩略图容器上，**不需要任何 window 级监听器**，从根上避免监听器泄漏。
- `ResizeObserver`、`requestAnimationFrame`：布局变化后合并到一帧内重绘。
- 自定义属性（CSS 变量）作为 JS → CSS 的接口：脚本只写 `--cbac-*`，样式表负责表现。

### Obsidian 插件模型

- 生命周期：`onload` 注册，`onunload` 还原 DOM 并释放资源。
- 注册式清理：`registerMarkdownPostProcessor`、`registerDomEvent`、`registerEvent`、`register`、`addSettingTab`。
- 工作区事件：`css-change`（主题切换后丢弃颜色缓存）、`layout-change`、`window-open`（弹出窗口）。
- 官方 API 参考：[Obsidian TypeScript API](https://docs.obsidian.md/Reference/TypeScript+API)。

## 3. 项目结构

```text
src/main.ts                            入口：生命周期、事件、设置持久化
src/settings.ts                        设置结构、默认值、逐字段校验
src/settings-tab.ts                    设置页（折叠 / 缩略图 / 视窗 / 交互 / 渲染）
src/types.ts                           枚举字面量类型
src/i18n.ts                            界面文案（英文基准 + 中文自动切换）
src/code-blocks/decorator.ts           扫描并包装代码块
src/code-blocks/code-block-view.ts     单个代码块：折叠状态、按钮、遮罩、持有缩略图
src/minimap/geometry.ts                缩略图几何与「行 ↔ 坐标」映射（纯函数）
src/minimap/code-minimap.ts            缩略图组件：绘制、视窗、拖拽、调宽、键盘
src/render/character-weights.ts        字符上下半权重表（由 tools 生成）
src/render/glyph.ts                    字符栅格化（Clean / Accurate）
src/render/syntax-colors.ts            token 颜色采集、词法兜底、颜色查询游标
src/render/minimap-renderer.ts         canvas 绘制
src/preview/code-lens.ts               悬停代码预览
src/util/helpers.ts                    数值、节流、DOM 度量
src/util/text.ts                       代码文本解析
src/util/color.ts                      颜色转换
tools/generate-character-weights.mjs   从上游 CodeGlance Pro 生成权重表
tools/package-release.mjs              同步 release/ 并打包发布 ZIP
tools/validate-submission.mjs          提交前校验（manifest 约束、版本一致性、产物哈希、新流程硬约束）
tools/smoke-test.mjs                   纯逻辑冒烟测试
eslint.config.mjs                      官方社区插件审核用的 ESLint 配置
.github/workflows/ci.yml               每次推送/PR 在 Linux + Windows 上跑 lint、测试、构建，并校验发布包
.github/workflows/release.yml          打 tag 自动构建、生成产物溯源证明、建 draft Release
manifest.json / versions.json / styles.css / main.js
release/code-block-auto-collapse/      可直接复制到 vault 的发布目录
code-block-auto-collapse-<version>.zip 发布压缩包（由 npm run release 生成）
```

构建与测试：

```powershell
npm install
npm run build     # tsc --noEmit && esbuild（压缩）
npm run dev       # 带 sourcemap 的非压缩产物
npm test          # 纯逻辑冒烟测试
npm run lint      # 官方 ESLint 规则集（提交前必须 0 error）
npm run validate  # 提交前校验 manifest / 版本 / 产物一致性
npm run preflight # lint → test → release → validate
npm run weights   # 重新生成字符权重表
```

### esbuild 的两个参数不能省

- `--charset=utf8`：默认是 `ascii`，界面文案里的中文会被转义成 `\uXXXX`，每个汉字从 3 字节涨到 6 字节，产物还会变得不可读。加上这个参数后 `main.js` 从 44.4kb 降到 42.5kb，中文原样保留。
- `--external:obsidian`：`obsidian` 由宿主提供，不能打进产物，否则插件加载时会出现两份 API 实现。

## 4. 生命周期与事件（`src/main.ts`）

`onload` 中：

1. `await this.loadSettings()`：读取并校验 `data.json`。
2. 创建三个节流/防抖器：滚动更新（每帧一次）、保存设置（400ms）、重建代码块（250ms）。
3. `registerMarkdownPostProcessor`：装饰渲染出的代码块。
4. `registerDomEvent(window, "resize")` 与 `watchDocument(document)`：监听滚动。
5. `css-change` / `layout-change` / `window-open` 工作区事件。
6. `addSettingTab`。

`onunload` 中：取消三个定时器、销毁所有视图（把 `<pre>` 还原回 DOM）、断开 `ResizeObserver`。每个 document 的滚动监听通过 `this.register()` 注册清理函数，卸载时自动移除。

滚动处理是「每帧一次 + 只处理眼前的代码块」：`throttleFrame` 合并同一帧内的多次 scroll，`CodeMinimap.update()` 对完全离开可视区域 ±200px 的代码块直接返回。

## 5. 代码块装饰与折叠

`decorator.ts` 只查询当前渲染片段内的 `pre`，并跳过两类节点：已经被包装过的（父元素带 wrapper class）和 frontmatter / 属性面板内的。行数既不满足折叠阈值也不满足缩略图阈值时保持原样。

`code-block-view.ts` 负责：

- wrapper 与状态 class：`is-collapsed` / `is-expanded` / `has-code-minimap` / `is-minimap-left`。
- 折叠高度：`--cbac-preview-height` 由脚本按「行数 × 实测行高」写成**像素值**。早期版本写的是 `8lh`，`lh` 需要 Chromium 109+，在旧版 Electron 上整条 `max-height` 声明失效，折叠会完全不起作用。
- 展开入口有三个：按钮、点击折叠块（有文本选区时不触发，避免干扰选中）、缩略图。按钮用 `opacity` + `pointer-events` 控制显隐而不是 `display:none`，这样键盘仍然可以 Tab 到它，`aria-expanded` 同步状态。
- 渐变遮罩用真实元素（`.code-block-auto-collapse__fade`）而不是 `::after`，移动端没有 hover 时也能点到。

## 6. 缩略图几何（`src/minimap/geometry.ts`）

`computeGeometry()` 是纯函数，输入行数、行高、设置和「代码块在滚动容器中的可见部分」，输出：

| 字段 | 含义 |
|---|---|
| `documentHeight` | 整篇代码映射到缩略图后的高度 |
| `canvasHeight` | 缩略图（canvas）逻辑高度，受可视高度上限约束 |
| `pitch` / `linesPerRow` / `rowPitch` | 每行占用的像素、每个绘制行覆盖的源码行数、绘制行间距 |
| `viewportStart` / `viewportHeight` | 视窗矩形，表示代码块当前可见的那一段 |
| `windowStart` | 当前窗口起点（文档比缩略图高时窗口跟随视窗平移） |
| `scale` | 缩略图像素 / DOM 像素，用于把坐标换算成 `scrollTop` |

关键点：

- `Proportional` 保持 `pixelsPerLine` 的原始比例；`Fit` 把整篇代码压进可用高度（`pitch` 可以小于 1，此时按 `linesPerRow` 分组采样，每个绘制行至少 1px）。
- 窗口起点被限制在「视窗必须落在窗口内」的区间内，因此长文档滚动时视窗矩形不会跑出缩略图。
- `lineAtDocY()` / `docYOfLine()` 提供行与坐标的双向映射，点击定位和悬停预览都基于它。

这些换算由 `tools/smoke-test.mjs` 覆盖（含极值：空文档、3 行、10 万行）。

## 7. 绘制（`src/render/`）

### 字符栅格化

参考实现把每个字符映射成 `pixelsPerLine` 个物理行，按权重逐行填充：

- **Clean**：可打印字符 0.8、其他 0.4，再按行数展开成 `[0.6]`、`[0.3, 0.6]`、`[0.1, 0.6, 0.6]`、`[0, 0.6, 0.6, 0.6]`。
- **Accurate**：使用 `character-weights.ts` 里 Courier 字体的上下半墨迹覆盖率，展开成 `[0, top, (top+bottom)/2, bottom]` 等模式。

4 行模式里第一个权重为 0，天然形成行间空隙，这就是 CodeGlance 系列缩略图看起来像文本纹理的原因。权重表由 `tools/generate-character-weights.mjs` 直接从上游 [CodeGlance Pro](https://github.com/Nasller/CodeGlancePro) 的 Kotlin 源码解析生成，避免手工誊写误差。生成结果已提交到仓库，脚本只在需要复核数值时运行；上游源码不在本仓库内，脚本会在缺失时给出克隆命令。

### 语法颜色

`collectTokenRuns()` 遍历 `<code>` 的文本节点，按 `className` 缓存 `getComputedStyle` 结果（主题里 token class 数量有限，缓存后每个代码块只需几次样式计算），合并相邻同色区间。没有 token 或颜色单一时退化为词法兜底（字符串、注释、数字、常见关键字）。

绘制时用 `createColorLookup()`：字符按行、按列递增访问，游标只前进，整体是 O(字符数 + 区间数)，取代了早期版本「每个字符都对区间数组做一次线性查找」的写法。

### 窗口化绘制

canvas 只绘制 `[windowStart, windowStart + canvasHeight]` 范围内的绘制行。文档比缩略图高时窗口跟随视窗平移，因此超长代码块每帧的绘制量是常数级，不需要「缩略图内部滚动条」这种会破坏布局的方案。

行采样（`pitch < 1` 时）取每组中视觉宽度最长的一行，避免长行被空行吞掉。

## 8. 交互（`src/minimap/code-minimap.ts`）

| 操作 | 行为 |
|---|---|
| 点击空白处 | 按 `Click Type` 定位：`Code Position` 换算到源码行后居中滚动；`Mouse Position` 按比例跳转 |
| 点击折叠块 | 先展开，下一帧重新测量后再滚动 |
| 拖动视窗 | 按 `Δy / scale` 换算成 `scrollTop` |
| 悬停 | 400ms 后显示代码预览，滚轮可移动预览目标（可选） |
| 内边缘拖拽 | 调整宽度，松开时写入设置 |
| 滚轮 | 不拦截，交给滚动容器原生处理 |
| 键盘 | `↑` `↓` `PageUp` `PageDown` `Home` `End`，容器带 `role="scrollbar"` 与 `aria-valuenow` |

所有拖拽都用 `setPointerCapture` 把事件锁定在容器上，`pointermove` / `pointerup` 直接挂在容器，不使用 window 监听器。`Jump to position on` 为 `None` 时按下即进入拖拽模式（对齐参考实现），为 `Up` 时在松开时跳转。

## 9. 设置与持久化

- `normalizeSettings()` 逐字段收敛：数值 `clamp` 到合法区间、枚举白名单、颜色必须是 `#rrggbb`、正则留空则回退默认值。历史 `data.json` 里的脏数据不会破坏渲染。
- 保存用 400ms 防抖，避免拖动滑条时频繁写盘。
- 更新分三档，避免「改个颜色就把整篇文档重建一遍」：

| 模式 | 用途 | 行为 |
|---|---|---|
| `rebuild` | 阈值、行数范围等结构变化 | 还原 `<pre>` 后重新装饰，250ms 防抖 |
| `content` | 标记、语法高亮 | 只重算标记与颜色 |
| `layout` | 宽度、颜色、对齐、交互 | 只刷新几何与样式，不销毁正在交互的 DOM |

### 界面文案（`src/i18n.ts`）

英文是基准字典，中文按 Obsidian 的界面语言自动切换：

- `en` 用 `as const` 声明，`MessageKey = keyof typeof en`；`zh` 的类型是 `Record<MessageKey, string>`，所以**漏翻一条就编译不过**，不需要额外的测试来守。
- 语言在首次取文案时通过 `getLanguage()` 判定并缓存。Obsidian 切换语言需要重启，缓存不会过期。
- `getLanguage()` 是 1.8.7 才有的 API，这也是 `minAppVersion` 取 1.8.7 的原因。
- 英文文案必须满足官方规则的 sentence case（只有句首与专有名词大写），`npm run lint` 会检查。
- 注释与文档保持中文，不参与翻译。

## 10. 与参考实现的对应关系

| CodeGlance Pro | 本插件 |
|---|---|
| Pixels Per Line | `pixelsPerLine` |
| Editor Size（Proportional / Fit） | `editorSize` |
| Render Style（Clean / Accurate） | `renderStyle` + `character-weights.ts` |
| Alignment | `alignment` |
| Click Type | `clickType` |
| Jump to position on | `jumpOn` |
| Move Only | `moveOnly`（只滚动，不自动展开） |
| Min / Max lines count、Out Range Empty | `minimapMinLines` / `minimapMaxLines` / `outOfRangeEmpty` |
| Viewport Color / Border / Thickness | `viewportColor` / `viewportBorderColor` / `viewportBorderThickness` |
| Markers regex、Markers font scale | `markerRegex` / `markerScale` |
| Show code lens on minimap hover | `enableCodeLens` |
| Mouse wheel move code lens | `wheelMoveCodeLens` |
| Widths、Lock、自动宽度 | `minimapWidth`、`lockWidth`、`autoShrinkWidth` + 内边缘拖拽 |

没有移植的部分：VCS / 错误条高亮、书签标记、Diff 编辑器、控制台编辑器、隐藏原生滚动条、悬停滚动条显示缩略图——这些依赖 IDE 的编辑器模型，在阅读视图里没有对应概念。

## 11. 1.0.0 修复与修正

### 功能性 bug

1. **事件监听器泄漏**：`window` 上的 `pointermove` / `pointerup` 直接注册且从不移除，插件禁用后仍持有 DOM 引用。现在改用 Pointer Capture，容器上监听即可，`onunload` 也会销毁全部视图。
2. **禁用插件不还原 DOM**：没有 `onunload`，wrapper 留在页面上。现在会把 `<pre>` 还原回原位。
3. **超长代码块直接抛异常**：`Math.max(1, ...lines.map(...))` 在大数组上展开会触发 `RangeError: Maximum call stack size exceeded`。改为循环求最大值。
4. **`lh` 单位导致折叠失效**：见第 5 节。
5. **视窗高度被 CSS 覆盖**：`.viewport { min-height: 48px }` 会压过脚本计算的 `height`，视窗永远至少 48px，与内容比例不符。已移除。
6. **折叠状态无法导航**：折叠时缩略图被 `display:none`，超长代码块折叠后失去导航能力。现在折叠时缩略图收敛到预览高度并保留全部交互。
7. **点击定位不精确**：`target = 代码块顶部 + 滚动范围 × 比例` 把「块内比例」和「滚动范围」混用，点击末尾无法精确到达。现在按「比例 → 源码行 → 该行在文档中的位置 → 居中」计算。
8. **缩略图被压成灰块**：文档比缩略图高时把整篇代码压进固定高度（行距小于 1px），并且依赖一个永远不会出现的内部滚动条。现在改为窗口化绘制。
9. **窄窗口/分屏下不收缩**：宽度由内容宽度变量驱动，窄容器里会把正文挤掉。现在有固定列宽、自动收窄和内边缘拖拽。
10. **弹出窗口不更新**：只监听主 `document` 的滚动，且刷新时只扫描 `.markdown-preview-view`。现在按 `ownerDocument` 注册监听（`window-open`），刷新基于已注册视图回溯根节点。
11. **主题切换后颜色不更新**：颜色缓存没有失效机制。现在监听 `css-change` 并重建调色板与 token 区间。

### 性能

12. **颜色查找是 O(字符数 × 区间数)**：每个字符都做一次线性 `find`。改为单向前进游标 + 有界回溯。
13. **重复的样式计算**：每个文本节点一次 `getComputedStyle`，每次重绘都重新采集调色板。改为按 className 缓存、按元素缓存区间。
14. **滚动时强制同步布局**：每个缩略图每帧都要用 `getComputedStyle` 向上找滚动容器。现在滚动容器按视图缓存，且离开可视区域的代码块直接跳过。
15. **改设置就重建整篇文档**：滑条每次 `input` 都还原并重新包装所有代码块。现在分三档更新 + 防抖（见第 9 节）。

### 健壮性与无障碍

16. **设置缺少校验**：早期只对 `minimapWidth` 做了历史回退，其他字段出现 `NaN` / 越界 / 类型错误会直接破坏渲染。现在逐字段收敛。
17. **键盘无法展开**：按钮用 `display:none` 隐藏时不可聚焦。现在保留 Tab 可达并补 `aria-expanded`。
18. **移动端无法展开**：没有 hover 就没有按钮。新增可点击的渐变遮罩元素。
19. **canvas 导航缺少键盘等价操作**：补 `role="scrollbar"`、方向键 / 翻页键 / Home / End。
20. **`color-mix` 兼容性**：视窗颜色原先依赖 `color-mix()`，不可用时整条声明失效。现在在脚本侧算成 `rgba()`。
21. **CSS 重复声明**：`width` 写了三次、`border` 与 `border-left` 重复，已重写为变量驱动的样式表。

### 工程

22. **版本与元数据**：`minAppVersion` 从 `0.15.0` 调整为与**实际使用的 API** 对齐——重构时先定 `1.4.0`，后来界面文案需要 `getLanguage()`（1.8.7 起提供）而改为 `1.8.7`；补 `versions.json` 与 `LICENSE`。
23. **发布目录结构**：文档描述的是 `release/code-block-auto-collapse/`，实际是平铺，已统一。
24. **单文件源码**：436 行的 `src/main.ts` 拆成 16 个模块，纯逻辑（几何、文本、权重）与 DOM 解耦，可以直接在 Node 里测试。

## 12. 测试

`npm test` 覆盖不需要 DOM 的部分：

- 文本解析：CRLF、首尾换行、TAB 计 4 列、行首偏移、行数统计。
- 几何：Proportional 的文档高度/行距、Fit 的压缩与分组、视窗与窗口的越界约束、行 ↔ 坐标往返、空文档 / 3 行 / 10 万行等极值。
- 权重表：抽样校验上下半权重与表外兜底值。

需要人工在测试 vault 中回归的场景：短/空/超长代码块、不同语言高亮、frontmatter、深浅主题、窄窗口、折叠与展开、缩略图点击/拖拽/调宽/键盘、弹出窗口、插件禁用后 DOM 是否还原。

## 13. 提交到官方社区目录

官方资料：[Submit your plugin](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin)、[Submission requirements for plugins](https://docs.obsidian.md/Community+directory/Submission+requirements+for+plugins)、[Developer policies](https://docs.obsidian.md/Community+directory/Developer+policies)、[Set up and claim](https://docs.obsidian.md/Community+directory/Set+up+and+claim)。

> ⚠️ **提交方式已经改变，网上的旧教程全部作废。**
> 过去是「向 `obsidianmd/obsidian-releases` 提 PR、往 `community-plugins.json` 追加一条、等机器人打 `Ready for review` 标签」。**这套流程已经废弃** —— 新版官方文档里 `community-plugins.json`、`obsidian-releases`、`Ready for review` 这些概念**已经完全不再出现**。
> 现在改为在 **[community.obsidian.md](https://community.obsidian.md)** 用 **Obsidian 账号**登录、关联 GitHub 账号后网页提交。

只提交一次：进入目录后，用户直接在 Obsidian 内从 GitHub 拉新版本，后续发版只需递增版本 + 建 Release，目录会周期性自动检测。

### 13.1 作者信息

作者身份已经填好，涉及三处：

- `manifest.json` 的 `author` = `lloyd-kai`
- `manifest.json` 的 `authorUrl` = `https://github.com/lloyd-kai`
- README 的 Support 链接

`npm run validate` 会扫描 `YOUR_GITHUB_USERNAME` 残留，任何一处漏填都会直接报错并指出文件。本仓库自己的检查脚本（`tools/validate-submission.mjs`）里也保留了这两个字面量作为检测模式，那是**故意**的，不要"顺手"替换掉。

> 不要用含 `Obsidian` 字样的作者名。商标政策禁止任何会让人误以为插件是官方出品的用法，用 GitHub 用户名最稳妥。

### 13.2 版本与最低支持版本

- `manifest.version` 用三段式 SemVer，只用数字和点。
- `manifest.minAppVersion` 是**真实的最低版本**，不是越大越安全也不是越小越好。当前 `1.13.0` 是被**声明式设置 API**（`getSettingDefinitions()`，1.13.0 起提供）顶上去的。用不到的 API 不要写进 `minAppVersion`，写高了会白白挡掉老版本用户；反过来，用了新 API 却不抬高，用户在旧版本上会直接报错。
- `versions.json` 记录「插件版本 → 最低 Obsidian 版本」。当用户的 Obsidian 低于 `minAppVersion` 时，Obsidian 会来这里找兼容的旧版本，所以每次发版都要同步加一条。
- 三个文件（`manifest.json`、`package.json`、`versions.json`）的版本必须一致，否则 `npm run release` 会告警。

### 13.3 提交步骤

**A. 准备仓库与 Release**

1. 递增版本：改 `manifest.json` 的 `version`，同步 `package.json`、`versions.json`、`CHANGELOG.md`、README 顶部版本行与本文。
2. 跑通检查：

   ```bash
   npm run preflight
   ```

   它依次执行 `lint`（官方 ESLint 规则集，必须 0 error）、`test`（38 项纯逻辑断言）、`release`（构建 + 同步 `release/` + 打 ZIP）、`validate`。

   `validate` 会把 13.4 的检查清单逐条断言：manifest 字段约束、版本五处一致、根目录 / `release/` / ZIP 内三份 `main.js` 哈希一致、ZIP 条目路径规范、占位符残留。任何一条不满足都会以非零退出码结束并列出问题文件。

   需要单独跑某一步时：`npm run lint`、`npm test`、`npm run release`、`npm run validate`。
3. 在干净 vault 里回归测试：短/空/超长代码块、不同语言高亮、frontmatter、深浅主题、窄窗口、折叠展开、缩略图点击/拖拽/调宽/键盘、弹出窗口、禁用插件后 DOM 是否还原、中英文界面各看一遍。
4. 把插件源码推到 GitHub 公开仓库（根目录含 `README.md`、`LICENSE`、`manifest.json`）。分支模型见 `CONTRIBUTING.md`：`main` 存已发布状态，`develop` 是集成分支，发版走 `release/<version>`，修线上 bug 走 `hotfix/<version>`，合并一律 `--no-ff`。

   > **目录读的是「默认分支 HEAD 上的 `manifest.json`」**，所以 `main` 必须是 GitHub 的默认分支，不要设成 `develop`。`develop` 上的 `manifest.version` 是尚未发布的下一版，目录会找不到对应 Release（旧流程下这个报错是 `No release matches your manifest version`，新流程下表现为条目一直装不上）。
5. 创建 GitHub Release：Tag **必须与 `manifest.version` 完全一致且不带 `v` 前缀**（`1.0.0` 而不是 `v1.0.0`），且打在 `main` 上。把 `main.js`、`manifest.json`、`styles.css` 三个文件作为二进制附件上传。Release 名称与描述随意 —— 目录不使用 Release 名称。

   这一步已经自动化，**推荐直接推 tag，不要手工上传**：

   ```bash
   git tag -a 1.0.0 -m "1.0.0"
   git push origin 1.0.0
   ```

   `.github/workflows/release.yml` 会校验 tag 与 `manifest.version` 一致、跑 lint 与测试、构建、生成产物溯源证明，最后建一个 **draft** Release 并附上三个文件。到 Releases 页补好发布说明再 **Publish release** 即可。原理与注意事项见 13.7。

**B. 在社区目录里提交**

6. 打开 <https://community.obsidian.md>，右上角 **Sign in**，用 **Obsidian 账号**登录（不是 GitHub 账号；没有就按提示创建）。登录后落在 **Community profile** 页。
7. 在 **GitHub** 一项下选 **Connect** 关联 GitHub 账号。目录靠这个验证你确实是所提交仓库的所有者，**不关联就无法提交**。
8. 侧栏进 **Plugins** → **New plugin**，填两项：
   - **GitHub repository URL**：`https://github.com/lloyd-kai/code-block-auto-collapse`
   - **Owner**：选 **Myself**（也可选你所属的组织；不必与仓库的 GitHub 所有者一致）
9. 阅读并同意开发者政策，确认你会在无法继续维护时移除或转移该插件，然后 **Submit**。

**C. 处理审核反馈**

10. 提交后目录会**自动审核**，并针对需要修正的地方给出指引。处理方式是**改仓库 + 递增版本 + 发新 GitHub Release**，目录据此重新审核。
11. **自动审核的错误全部解决之前，插件无法从 Obsidian 内安装。** 描述可以随时编辑并 **Publish**，但那不影响能否安装。
12. 不想等周期性检查：条目 **`...`** 菜单里选 **Request review** 强制立即重扫，选 **Check for new releases** 立刻检测新 Release。
13. 审阅时长取决于团队排期，无法预估。

**D. 上线之后**

14. 在论坛 [Share & showcase](https://forum.obsidian.md/c/share-showcase/9) 发帖，在 Discord 的 `#updates` 频道宣布（需要 `developer` 角色）。

### 13.3.1 条目管理（上线后常用）

侧栏 **Plugins** 页 → **Your entries** → 选中条目。

| 功能 | 说明 |
|---|---|
| **Edit listing** | 改图标、短/长描述、分类、付费类型、截图。 |
| **Request review** / **Check for new releases** | 在 `...` 菜单里，强制立即重扫 / 立即检测新 Release。 |
| **Review branch** | 在**不创建 Release 的情况下**对任意分支、tag 或 commit SHA 预览扫描结果（留空用默认分支），选 **Run preview scan**。 |
| **Add contributor** | 署名贡献者。**只给公开署名，不授予编辑权限，也不改变条目归属。** |
| **Transfer ownership** | 转移给组织，或按**社区目录 handle**（不是 GitHub handle）转给他人。 |
| **Archive** | 下架并阻止新安装；同菜单可选 **Unarchive** 恢复。 |

**截图规格**：桌面端最多 5 张、1200×800；移动端最多 5 张、900×1600；JPEG / PNG / WebP，单张 ≤5 MB。

**README 摘录**：条目页会显示 README 的摘要，相对链接与图片（如 `./images/screenshot.png`）会被自动改写为指向你的仓库。所以 README 里的图片用相对路径即可，不需要写完整 URL。

### 13.4 提交前检查清单

**仓库与文件**

- [ ] 默认分支根目录有 `README.md`、`LICENSE`、`manifest.json`。
- [ ] 仓库公开可访问，且 `README.md` 说明了插件用途与用法。
- [ ] 无 `YOUR_GITHUB_USERNAME` 占位符残留。
- [ ] `LICENSE` 明确写出许可证（MIT）与版权声明。

**manifest.json**

- [ ] `id` 唯一、全小写连字符，与插件目录名一致，且不含 `obsidian`（提交前到 <https://community.obsidian.md/plugins> 搜一遍确认没重名）。
- [ ] `name` 不含 `Obsidian`、`plugin` 等容易误认为官方的字样。
- [ ] `description` 以动词开头、不超过 250 字符、以句号结尾、无 emoji、无特殊字符，`Obsidian` / `Markdown` / `PDF` 等专有名词大小写正确。
- [ ] 不接受捐赠就**不要**写 `fundingUrl`；要写就指向 GitHub Sponsors 或 Buy Me a Coffee 这类服务。
- [ ] 用了 Node.js / Electron API 就必须 `isDesktopOnly: true`。本插件纯 DOM，保持 `false`。

**版本与发布**

- [ ] `manifest.version`、`package.json`、`versions.json`、Git tag、GitHub Release 五处版本完全一致。
- [ ] Tag 不带 `v` 前缀。
- [ ] Release 附件包含 `main.js`、`manifest.json`、`styles.css`。
- [ ] `main.js` 是最新构建产物，不依赖本地绝对路径、开发服务器或未发布的 npm 包。
- [ ] 发布包由 `npm run release` 生成，`release/code-block-auto-collapse/main.js` 与根目录 `main.js` 哈希一致。

**代码与行为**

- [ ] `npm run lint` 零 error（官方规则集），`npm test` 全过，`npm run build` 通过。
- [ ] 所有事件监听都可清理（`registerDomEvent` / `registerEvent` / `register`），组件内部拖拽用 Pointer Capture 挂在自身容器上。
- [ ] 不在 `onunload` 里 detach leaf。
- [ ] 不用全局 `app` / `window.app`，一律 `this.app`。
- [ ] 不用 `innerHTML` / `outerHTML` / `insertAdjacentHTML` 拼接用户内容。
- [ ] 没有默认热键。
- [ ] 界面文案用 sentence case；设置页标题不含「设置」字样、不用插件名当标题。
- [ ] 移动端可用（`isDesktopOnly: false` 时不能碰 Node API）。

**政策披露（README 里必须写清）**

- [ ] 账号、付费功能、网络服务、vault 外文件访问、遥测、广告、闭源——每一项都要么明确写「无」，要么解释用途。本插件全部为「无」，见 README 的 Disclosures 一节。

### 13.5 设置页为什么用声明式 API

`npm run lint` 目前是 **0 error、0 warning**。此前常驻的 2 条 warning 已随设置页迁移消除；这里记录结论与成因，避免日后重新踩坑。

**两条 warning 的成因并不相同**，很容易混为一谈：

| 规则 | 触发条件 | 消除方式 |
|---|---|---|
| `obsidianmd/settings-tab/prefer-setting-definitions` | `PluginSettingTab` 子类没有实现 `getSettingDefinitions()`。**没有任何版本条件。** | 实现 `getSettingDefinitions()`（`minAppVersion` 仍是 1.8.7 时也能消掉） |
| `@typescript-eslint/no-deprecated` | `node_modules/obsidian/obsidian.d.ts` 里 `display()` 上的 JSDoc `@deprecated Since 1.13.0. Use {@link getSettingDefinitions} instead.`。**只取决于类型包版本**（当前 1.13.1），与 `minAppVersion` 无关。 | 只有删掉 `display()`。官方规则集不允许屏蔽该规则。 |

所以**只有 Path A 能清零**：`minAppVersion` 抬到 `1.13.0` 且只保留 `getSettingDefinitions()`。

官方指南 `_ref/dev-docs/en/Plugins/Guides/Migrate to declarative settings.md` 给出三条路，并明确「**优先 Path A**，只有当你有一批丢不掉的 < 1.13.0 老用户时才选 Path B」：

| 方案 | 结果 |
|---|---|
| Path A：`minAppVersion ≥ 1.13.0` + 只留 `getSettingDefinitions()` | 告警清零、设置进入全局搜索（**当前选择**） |
| Path B：`minAppVersion < 1.13.0` + `display()` 与 `getSettingDefinitions()` 双实现 | 老版本可用，但 `no-deprecated` 仍在；两套实现必须长期保持同步 |
| 保持原样 | 官方明确新 API 是 opt-in，两条 warning 会一直留着 |

本插件**尚未上架、装机量为零**，Path B 的前提（丢不掉的老用户）不成立；且 1.13.4 自 2026-07-30 起已是稳定版（1.14 还在 Catalyst 早期体验阶段）。

**迁移实现要点（改设置页前必读）**

- `getSettingDefinitions()` 在每次 `update()` **以及标签页注册时**（建立搜索索引）都会被调用，**必须保持轻量**：只拼数组和取文案，不要读文件、不要做重计算。
- **必须覆写 `setControlValue()`**。默认实现直接写 `this.plugin.settings` 并自动 `saveData()`，会绕过 `plugin.updateSettings()` 的刷新分档 —— 改完设置要重载插件才生效。覆写后持久化由自己负责，本插件交给 `updateSettings()` 内部的防抖保存。
- 刷新档位集中在 `UPDATE_MODE` 映射表里，按 `keyof CodeBlockSettings` 穷尽声明；新增设置字段却忘了归类会直接编译失败。
- 重置按钮用 `action` 定义，刷新必须调 `this.update()` —— 1.13.0+ 上 `display()` 已被绕过。
- 颜色控件在 `setControlValue` 里统一转小写再存：缩略图用颜色拼 `themeKey` 做样式缓存比对，大小写不一致会白白重绘。
- 类型上 `SettingDefinitionItem` 含分组，**不能**直接当 `items` 的元素类型；`items` 只接受 `SettingDefinition`（分组不可嵌套）。
- 风格硬约束（官方 Style guide）：**sentence case**、**顶层不加标题**、标题里不重复 "settings"、一行一个控件、`desc` 只写一句话。

### 13.6 可直接粘贴的文案

README 与 Release 说明面向国际用户，用英文；本文档是内部开发说明，保持中文。

**GitHub Release 说明**（tag `1.0.0`，标题写 `1.0.0`）

```markdown
First public release. Requires Obsidian **1.13.0** or newer.

Long code blocks in Reading View are folded into a short preview with an expand button,
and every folded block gets a CodeGlance-style minimap: syntax-colored, clickable,
draggable, and resizable.

**Features**

- Fold long code blocks in Reading View, keeping the first few lines with a fade-out.
- Syntax-colored minimap with click, drag and keyboard navigation.
- Drag the minimap edge to resize it. Fold threshold, visible lines, colors and
  alignment are all configurable.
- Every setting is findable from Obsidian's global settings search.
- The interface follows your Obsidian language (English / 中文).
- Works on desktop and mobile.

See the README for the full feature list and settings reference.
```

**社区目录条目描述**（在 `community.obsidian.md` 的 **Edit listing** 里填）

短描述 —— 直接与 `manifest.description` 保持一致最省事，它已经满足「≤250 字符、以句号结尾、无 emoji」的要求：

```text
Collapse long code blocks in Reading View and navigate them with a syntax-colored code minimap.
```

长描述：

```markdown
A long fenced code block can swallow a whole note. This plugin folds code blocks in
Reading View and draws a CodeGlance-style minimap beside the very long ones, so you can
see the shape of the code and jump around it without scrolling past hundreds of lines.

No accounts, no payment, no network requests, no telemetry, no ads, and no access to
files outside the vault. Fully open source (MIT).
```

### 13.7 自动发布工作流（`.github/workflows/release.yml`）

打 tag 即自动产出 Release。之所以要自动化：目录按「tag 与 `manifest.version` **精确相等**」定位 Release，附件又必须正好是那三个文件，手工上传很容易漏文件或版本对不上 —— 而这类错误要到用户在 Obsidian 里装不上时才会暴露。

工作流依次做这些事：

1. **校验 tag 与版本一致**。不一致就 `::error::` 直接失败，不会产出一个永远装不上的 Release。
2. `npm ci` 装依赖（有 `package-lock.json`，比 `npm install` 可复现）。
3. `npm run lint` + `npm test`。任一失败就不产出 Release —— 发出去的版本必须已经过官方规则集。
4. `npm run build` 产出压缩后的 `main.js`。
5. **生成 artifact attestation**（`actions/attest@v4`）：给三个产物签一份构建溯源证明。官方文档推荐提交插件到社区目录时启用。
6. `gh release create --draft` 建草稿 Release 并附上 `main.js`、`manifest.json`、`styles.css`。

**首次使用前必须开权限**：仓库 **Settings → Actions → General → Workflow permissions** 选 **Read and write permissions**，否则 `gh release create` 会 403。`attestations: write` 与 `id-token: write` 两个权限是签名用的，不能省。

**为什么建 draft 而不是直接发布**：发布说明是写给人看的，`gh` 生成不了。草稿建好后到 Releases 页补说明再 **Publish release** —— Obsidian 只认已发布的 Release。

**产物溯源证明的价值**：它让任何人都能验证「这份 `main.js` 确实由该 tag 对应的提交构建出来」。这也是社区目录愿意接受**私有源码仓库**的前提 —— 目录会拿公开 Release 的产物与私有仓库的源码做一致性校验。

### 13.8 跨平台 CI（`.github/workflows/ci.yml`）

推送或 PR 到 `main` / `develop` 时触发，做两件事：

1. **`verify` 矩阵**：`ubuntu-latest` 与 `windows-latest` 上各跑一遍 `npm ci` → `npm run lint` → `npm test` → `npm run build`。`fail-fast: false`，一个平台挂了另一个也会跑完，便于一次看清差异。
2. **`package`**：在 `ubuntu-latest` 上跑 `npm run release` + `npm run validate`，并把 ZIP 作为制品上传（便于直接下载 CI 实际校验过的那份包）。

**为什么必须两个平台**：开发机是 Windows，而发布工作流跑在 `ubuntu-latest`。只在 Windows 上验证过的代码很容易把平台差异带进发布流程 —— 真实事故：`tools/smoke-test.mjs` 曾用 `new URL(...).pathname.replace(/^\//, "")` 转路径，Windows 下得到 `C:/Users/...`（碰巧还是绝对路径），Linux 下得到 `home/runner/...`（不以 `./` 开头的裸说明符，esbuild 报 `Could not resolve` 退出）。本地 38/38 全绿，打 tag 后发布工作流挂在 `Lint and test` 一步。

**由此得出的硬规则**：`tools/` 与 `src/` 里**转路径一律用 `node:url` 的 `fileURLToPath` / `pathToFileURL`**，不要手写 `pathname` 处理；这类"只在本地是对的"的代码正是平台矩阵要挡的东西。

**工作流里的 action 版本**：`checkout@v7`、`setup-node@v7`、`upload-artifact@v7`。`upload-artifact` 必须 ≥ v6 —— v4 仍指向 Node.js 20，运行器会强制它跑在 Node 24 上并每次报一条弃用告警。

## 14. 待提 issue 草稿

新仓库的 issue 列表是空的。下面这批可以直接粘进 GitHub —— 本环境没有 API token，无法代你创建。每条都基于当前代码的真实状态，**没有虚构 bug**；其中「支持 Live Preview」与「测量渲染开销」是真正的技术债，建议先提。

用法：仓库页 → **Issues** → **New issue** → 选对应模板 → 标题和正文照抄 → 提交后按「标签」一栏打标。

### 14.1 Support Live Preview

- **标签**：`enhancement`
- **为什么值得先提**：这是功能覆盖面最大的缺口，也是 issue 区最常见的期待。

```text
Title: Support Live Preview
```

```markdown
Reading View works, but the plugin does nothing in Live Preview, which is where
most people actually read and edit code.

The plugin registers only a markdown post-processor
(`registerMarkdownPostProcessor`), which Obsidian runs for Reading View. Live
Preview renders code blocks through CodeMirror 6, so folding there needs a
different mechanism — most likely a CodeMirror extension that decorates the first
N lines of a code block.

Two things worth deciding before writing code:

- Should the minimap exist in Live Preview at all, or is collapsing enough?
- How do we avoid fighting the editor's own selection and cursor behaviour?
```

### 14.2 Remember which code blocks the user expanded

- **标签**：`enhancement`

```text
Title: Remember expanded code blocks within a session
```

```markdown
Every time a note is re-rendered, all code blocks collapse again. If you expand a
block to read it, switch notes, and come back, you have to expand it a second
time.

The plugin currently keeps no per-block state at all. A workable scope:

- Key blocks by file path plus the code block's index within the file.
- Keep the state in memory for the session only. Persisting it to `data.json`
  would grow without bound and would go stale as notes are edited.
- Clear the entry when the block's line count changes, since the index is no
  longer trustworthy at that point.
```

### 14.4 Measure the rendering cost in notes with many code blocks

- **标签**：`enhancement`
- **背景**：绘制已经做了窗口化（窗口跟随视窗平移，超长块每帧绘制量恒定），但**单篇笔记内多个代码块**的合计开销从未测过。

```text
Title: Measure rendering cost in a note with many long code blocks
```

```markdown
Painting is windowed per block, so the cost of one very long code block is
bounded. What has never been measured is a note containing many long blocks at
once — for example twenty 300-line blocks in a single file.

Worth establishing before optimising anything:

- A repeatable fixture: a generated note with a known number of blocks and lines.
- Frame timings while scrolling the whole note, on a low-end machine and on
  mobile.
- Whether off-screen minimaps should skip painting entirely, and whether that can
  be done without a visible pop when they scroll into view.

Please post the numbers in this issue before proposing a change, so the fix can be
judged against a baseline.
```

### 14.4 Add screenshots and a demo GIF to the README

- **标签**：`documentation`, `good first issue`
- **背景**：README 目前 0 张图。对这类「视觉收益」明显的插件来说，一张图比一段文字有效得多。

```text
Title: Add screenshots and a short demo GIF to the README
```

```markdown
The README describes the minimap in prose but shows nothing. For a plugin whose
whole value is visual, that is the single biggest gap in the documentation.

Wanted:

- One screenshot of a collapsed block in a light theme and one in a dark theme.
- One screenshot of the minimap next to a long block, at a readable size.
- A short GIF (under ~5 MB) showing click-to-jump and dragging the viewport.

Put them near the top, above "What it does". Images go in a `docs/` or `assets/`
directory; the README links to them with relative paths.
```

### 14.6 Document the CSS variables

- **标签**：`documentation`, `good first issue`
- **背景**：`styles.css` 里已有 8 个变量，但 README 和 `PLUGIN_DEVELOPMENT.md` 都没有列出，主题和 snippet 作者无从得知。

```text
Title: Document the CSS variables themes and snippets can target
```

```markdown
The stylesheet exposes CSS variables that themes and snippets can override, but
they are not documented anywhere. Anyone who wants to restyle the minimap has to
read `styles.css`.

The variables currently in use:

- `--cbac-minimap-width`
- `--cbac-canvas-height`
- `--cbac-preview-height`
- `--cbac-fade-height`
- `--cbac-viewport-color`
- `--cbac-viewport-color-strong`
- `--cbac-viewport-border`
- `--cbac-viewport-border-width`

Add a "Styling" section to the README listing each one, what it controls, and
whether it is set by the plugin at runtime (several of them are written by the
script on every layout pass, so overriding them in a snippet may not stick).
```

### 14.6 Add a copy button to collapsed code blocks

- **标签**：`enhancement`

```text
Title: Add a copy button to collapsed code blocks
```

```markdown
A collapsed block is usually the one you want to copy — you folded it because you
already know what is in it. Right now you have to expand it first, select the
text, and copy.

A copy button next to the expand toggle, using `navigator.clipboard.writeText()`,
would remove those steps. `navigator.clipboard` is a web API, so this stays
mobile-compatible and `isDesktopOnly` can remain `false`.

Note that Obsidian already shows its own copy button on code blocks; check
whether the two can coexist without crowding the corner.
```

### 14.7 Add a command to collapse or expand every code block in a note

- **标签**：`enhancement`

```text
Title: Add a command to collapse or expand every code block in a note
```

```markdown
The per-block toggle is the only control. When you want the whole note folded —
or the whole note open so you can search it with the browser's own find — you
have to click every block.

Add two commands, "Collapse all code blocks" and "Expand all code blocks", so they
can be bound to hotkeys and reached from the command palette.

Remember that Obsidian's guidelines say a plugin must not ship a default hotkey,
so these should be unbound on install.
```

## 15. 本环境的 git 陷阱（已定位，并加了守门脚本）

**这不是仓库或代码的问题，是 WorkBuddy Bash 沙箱写入策略的漏洞。** 现象、实测证据、对策都记在这里，免得下次再靠「感觉」绕过。

### 15.1 现象

在这个环境里用默认的 `git`（PATH 上的 `/mingw64/bin/git`，也就是托管版 PortableGit 2.55.0.windows.3）操作**工作区内**的仓库时，git 会**静默地**写不进带斜杠的 ref：退出码 0、没有任何输出，但 `.git/refs/heads/feature/x` 根本没落盘。两个已经踩过的坑都由此而来：

1. `git checkout -b feature/x` 打印 `Switched to a new branch 'feature/x'`，HEAD 也指过去了，但 ref 不存在 —— 分支是 unborn 的。紧接着 `git commit` 报 `does not have any commits yet`，改动全卡在暂存区，看起来像「提交成功但历史里没有」。
2. `git merge` 在工作区脏时走 autostash，而 `git stash` **会先把工作区回退**、再写 stash 记录；记录写不进去时未提交的改动直接消失（实测还伴随 `.git` 被整个清空，当时已修好的 `tools/smoke-test.mjs` 就是这么丢的）。
3. **切换分支会把整个目录从工作区删掉。** 实测两次：`main` / `develop` 的 `.github/` 文件集合不同 → 整个 `.github/` 消失；`bugfix` 分支多一个 `tools/git-guard.mjs` → 整个 `tools/` 消失，连两个分支里**完全一样**的那 4 个文件也一起没了。git 只应该删那个真正有差异的文件，多删的部分就是沙箱干的。表现是 `git status` 里一串 ` D`，`git checkout` 本身还会打印成功的 `Switched to branch ...`。

### 15.2 实测矩阵（每个格子各 3 次，稳定复现）

| git | 仓库位置 | `refs/heads/feature/x` | `refs/remotes/origin/main` | `refs/heads/flat` |
| --- | --- | --- | --- | --- |
| PortableGit 2.55（PATH 上的 `git`） | 工作区内 | **静默丢失** | **静默丢失** | 正常 |
| Git for Windows 2.43（`/d/Git/cmd/git`） | 工作区内 | 正常 | 正常 | 正常 |
| PortableGit 2.55 | `%TEMP%` 下 | 正常 | 正常 | 正常 |
| Git for Windows 2.43 | `%TEMP%` 下 | 正常 | 正常 | 正常 |

**两个条件同时成立才触发**：新版 git 的 MSYS 运行时创建目录走的那条系统调用被沙箱拦了，而沙箱对 `.git/refs/**` 的写入白名单只覆盖到 `.git/refs/<一层>/<文件>`，再深一层就被静默丢弃。于是：

- **受影响**：`refs/heads/<a>/<b>`（GitFlow 的 `feature/*`、`bugfix/*`、`release/*`、`hotfix/*` 全中）、`refs/remotes/origin/*`（`git fetch` 之后跟踪引用永远显示 `[origin/*: gone]`）、`refs/tags/<a>/<b>`。
- **不受影响**：`refs/heads/<单层名>`、`refs/stash`、`ORIG_HEAD`、`.git/objects/**`，以及工作区里的嵌套目录（`git checkout` 能正常重建 `.github/workflows/`）。

已经逐一排除、确认无关的项：`core.fscache`、`core.protectNTFS`、`core.autocrlf`、`MSYS` / `MSYS_NO_PATHCONV` / `MSYS2_ARG_CONV_EXCL`、`.gitattributes`、OneDrive 同步、`safe-bin` 的 `rm` shim，以及「磁盘权限 / 目录不存在」这类猜测 —— bash 的 `mkdir -p .git/refs/heads/feature` 完全正常且能持久化，但 git 往这个**已经存在**的目录里写 ref 仍然失败。

### 15.3 对策：`tools/git-guard.mjs`

```bash
npm run git:check                  # 诊断：逐个探测候选 git，报告哪个可用
npm run git -- status --short      # 用可用的 git 执行（自动挑选 + 执行后校验）
```

- **诊断**（`--diagnose`）：只创建再删除一个探针 ref（`refs/heads/cbac-env-probe/x`），不碰工作区、不动 HEAD，并且一定会把探针删掉。
- **执行**：按「系统安装的 Git for Windows → PATH 上的 git」顺序，挑第一个能通过探测的；执行后校验这条命令「本应创建」的 ref 是否真的存在、HEAD 是否不是 unborn，并在 `checkout` / `switch` / `merge` / `pull` / `rebase` 之后检查工作区有没有「已跟踪文件被删」。发现不一致就退出码 1 并明确报错 —— **把静默失败变成响亮的失败**，这是这个脚本存在的全部理由。
- 只读子命令（`status` `log` `diff` `rev-parse` …）不需要探测，直接执行，避免在没有可用 git 时把只读操作也一并堵死。
- 已作为第一环进入 `npm run preflight`。

### 15.4 恢复手法

被删的文件只要**在索引里还是干净的**（`git status` 显示 ` D` 而不是 `D `），一条命令就能全部拿回来，不会丢内容：

```bash
git checkout -- .github        # 或 tools、或整个 .
git status --short             # 空输出就是恢复干净了
```

已经提交过的东西不受影响：它们在 object 库里，最多是工作区少了几份文件。真正会丢内容的只有「未提交的改动 + `git stash` / autostash」那条路径。

### 15.5 硬规则

1. **本仓库的 git 操作一律用 `D:/Git/cmd/git`（2.43），不要用 PATH 上的 `git`。** 写脚本时 `G=/d/Git/cmd/git` 再 `$G ...`。
2. **工作区脏的时候绝对不要 `git merge`。** 先提交干净 —— autostash 正是那条会把改动吃掉的路径。
3. 需要建 / 删 / 改 ref 时优先走 `npm run git --`，让执行后校验兜底。
4. **切换分支之后立刻看一眼 `git status --short`**：出现 ` D` 就是整个目录被删了，按 15.4 恢复。两个分支的同一个目录里只要文件集合不同，就有风险。
5. 沙箱拒绝写入时命令可能被 SIGTERM 打断，所以「先破坏再重建」的操作（`git stash`、`rm -rf`）不要和别的步骤挤在同一条命令里。
6. 这是沙箱策略的缺陷，不是 git 的 bug：同一个二进制在 `%TEMP%` 下完全正常。要在别处复现，照 15.2 的矩阵做即可。

## 16. 参考资料

- [Obsidian Plugin Developer Docs](https://docs.obsidian.md/Plugins)
- [Build a plugin](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)
- [Development workflow](https://docs.obsidian.md/Plugins/Getting+started/Development+workflow)
- [Obsidian TypeScript API](https://docs.obsidian.md/Reference/TypeScript+API)
- [Manifest reference](https://docs.obsidian.md/Reference/Manifest)
- [Developer policies](https://docs.obsidian.md/Community+directory/Developer+policies)
- [obsidian-sample-plugin](https://github.com/obsidianmd/obsidian-sample-plugin)
- 参考实现：[CodeGlance Pro](https://github.com/Nasller/CodeGlancePro)（JetBrains 插件，缩略图渲染与交互的对照来源）。本地不再内置该仓库，需要时用 `git clone --depth 1 https://github.com/Nasller/CodeGlancePro.git _CodeGlancePro` 临时克隆。
