import { getLanguage } from "obsidian";

/**
 * 界面文案。
 *
 * 英文为基准（提交到官方社区插件目录面向国际用户），中文按 Obsidian 的
 * 界面语言自动切换。注释与文档保持中文不变。
 *
 * 英文文案遵循 Obsidian 的 sentence case 规范：只有句首与专有名词大写。
 */
const en = {
	// 代码块上的按钮
	"block.expand": "Expand code",
	"block.collapse": "Collapse code",
	"block.expandAria": "Expand all code",
	"block.collapseAria": "Collapse code",

	// 缩略图无障碍
	"minimap.ariaLabel": "Code navigation minimap",

	// 折叠
	"collapse.heading": "Collapse",
	"collapse.minLines.name": "Minimum lines to collapse",
	"collapse.minLines.desc": "Code blocks with at least this many lines start collapsed.",
	"collapse.previewLines.name": "Preview lines",
	"collapse.previewLines.desc": "Lines kept visible in the preview while a block is collapsed.",

	// 缩略图
	"minimap.heading": "Minimap",
	"minimap.minLines.name": "Minimum lines for minimap",
	"minimap.minLines.desc": "Code blocks with at least this many lines get a minimap.",
	"minimap.maxLines.name": "Maximum lines to render",
	"minimap.maxLines.desc": "Longer blocks keep the minimap area but skip drawing the code, so huge files stay fast.",
	"minimap.outOfRangeEmpty.name": "Keep empty area out of range",
	"minimap.outOfRangeEmpty.desc": "Keep the minimap area visible but empty once a block exceeds the maximum.",
	"minimap.pixelsPerLine.name": "Pixels per line",
	"minimap.pixelsPerLine.desc": "How many pixels each source line takes in the minimap. Smaller values show more code.",
	"minimap.editorSize.name": "Height mode",
	"minimap.editorSize.desc": "Proportional keeps a stable row pitch. Fit compresses the whole block into the visible height.",
	"minimap.renderStyle.name": "Render style",
	"minimap.renderStyle.desc": "Clean is faster and flatter. Accurate uses per-character ink coverage for a texture closer to real text.",
	"minimap.alignment.name": "Alignment",
	"minimap.alignment.desc": "Which side of the code block the minimap is docked to.",
	"minimap.alignment.right": "Right",
	"minimap.alignment.left": "Left",
	"minimap.width.name": "Minimap width",
	"minimap.width.desc": "In pixels. You can also drag the inner edge of the minimap.",
	"minimap.lockWidth.name": "Lock width",
	"minimap.lockWidth.desc": "Prevent changing the minimap width by dragging.",
	"minimap.autoShrinkWidth.name": "Auto-shrink on narrow panes",
	"minimap.autoShrinkWidth.desc": "Reduce the minimap width automatically when the code block gets too narrow.",

	// 视窗
	"viewport.heading": "Viewport",
	"viewport.color.name": "Viewport color",
	"viewport.color.desc": "Fill color of the rectangle marking the visible region.",
	"viewport.borderColor.name": "Viewport border color",
	"viewport.borderColor.desc": "Border color of the viewport rectangle.",
	"viewport.borderThickness.name": "Viewport border width",
	"viewport.borderThickness.desc": "Hides the border when set to 0. Maximum 4 pixels.",

	// 交互
	"interaction.heading": "Interaction",
	"interaction.clickType.name": "Click behavior",
	"interaction.clickType.desc": "Code position jumps to the code under the pointer. Mouse position jumps by ratio, like a scrollbar.",
	"interaction.clickType.code": "Code position",
	"interaction.clickType.mouse": "Mouse position",
	"interaction.jumpOn.name": "Jump on",
	"interaction.jumpOn.desc": "When a click on the minimap should jump to that position.",
	"interaction.jumpOn.down": "Pointer down",
	"interaction.jumpOn.up": "Pointer up",
	"interaction.jumpOn.none": "Never",
	"interaction.moveOnly.name": "Scroll only",
	"interaction.moveOnly.desc": "Clicking the minimap scrolls to the target without expanding the block.",
	"interaction.enableCodeLens.name": "Hover preview",
	"interaction.enableCodeLens.desc": "Show nearby code while the pointer rests on the minimap.",
	"interaction.wheelMoveCodeLens.name": "Wheel moves preview",
	"interaction.wheelMoveCodeLens.desc": "While the preview is open, the wheel moves the preview target instead of scrolling the document.",

	// 渲染
	"rendering.heading": "Rendering",
	"rendering.syntaxHighlight.name": "Syntax highlighting",
	"rendering.syntaxHighlight.desc": "Draw the minimap with the reading view's syntax colors.",
	"rendering.enableMarkers.name": "Render markers",
	"rendering.enableMarkers.desc": "Draw marker labels such as MARK and region in the minimap.",
	"rendering.markerRegex.name": "Marker pattern",
	"rendering.markerRegex.desc": "Regular expression used to recognize markers. Defaults to MARK and region labels.",
	"rendering.markerScale.name": "Marker font scale",
	"rendering.markerScale.desc": "Marker text is drawn at three times this value. Range 1 to 6.",

	// 恢复默认
	"reset.heading": "Reset",
	"reset.desc": "Restore every option above to its default value.",
	"reset.button": "Restore defaults",
} as const;

export type MessageKey = keyof typeof en;

const zh: Record<MessageKey, string> = {
	"block.expand": "展开代码",
	"block.collapse": "收起代码",
	"block.expandAria": "展开全部代码",
	"block.collapseAria": "收起代码",

	"minimap.ariaLabel": "代码导航缩略图",

	"collapse.heading": "折叠",
	"collapse.minLines.name": "触发折叠的最少行数",
	"collapse.minLines.desc": "代码块达到此行数后默认折叠。",
	"collapse.previewLines.name": "折叠时显示的行数",
	"collapse.previewLines.desc": "折叠状态下保留在预览里的代码行数。",

	"minimap.heading": "缩略图",
	"minimap.minLines.name": "显示缩略图的最少行数",
	"minimap.minLines.desc": "代码块达到此行数后才绘制导航缩略图。",
	"minimap.maxLines.name": "渲染缩略图的最大行数",
	"minimap.maxLines.desc": "超过此行数不再绘制代码内容，避免超大文件拖慢渲染。",
	"minimap.outOfRangeEmpty.name": "超出范围保留空白区域",
	"minimap.outOfRangeEmpty.desc": "超过最大行数时保留缩略图区域但绘制空白。",
	"minimap.pixelsPerLine.name": "每行像素",
	"minimap.pixelsPerLine.desc": "每个源码行在缩略图中占用的像素；值越小能看到的代码越多。",
	"minimap.editorSize.name": "高度模式",
	"minimap.editorSize.desc": "Proportional 保持行距稳定；Fit 压缩整篇代码以适配可视高度。",
	"minimap.renderStyle.name": "渲染风格",
	"minimap.renderStyle.desc": "Clean 更快更干净；Accurate 使用字符上下半权重，纹理更接近真实文本。",
	"minimap.alignment.name": "停靠方向",
	"minimap.alignment.desc": "缩略图位于代码块的右侧还是左侧。",
	"minimap.alignment.right": "右侧",
	"minimap.alignment.left": "左侧",
	"minimap.width.name": "缩略图宽度",
	"minimap.width.desc": "单位像素；也可以直接在缩略图内边缘拖拽调整。",
	"minimap.lockWidth.name": "锁定宽度",
	"minimap.lockWidth.desc": "禁止通过拖拽调整缩略图宽度。",
	"minimap.autoShrinkWidth.name": "窄窗口自动收窄",
	"minimap.autoShrinkWidth.desc": "代码块过窄时自动减小缩略图宽度，避免挤掉正文。",

	"viewport.heading": "视窗",
	"viewport.color.name": "视窗颜色",
	"viewport.color.desc": "表示当前可见区域的矩形填充色。",
	"viewport.borderColor.name": "视窗边框颜色",
	"viewport.borderColor.desc": "视窗矩形边框颜色。",
	"viewport.borderThickness.name": "视窗边框厚度",
	"viewport.borderThickness.desc": "0 表示不显示边框，最大 4 像素。",

	"interaction.heading": "交互",
	"interaction.clickType.name": "点击定位方式",
	"interaction.clickType.desc": "Code Position 按缩略图内容定位；Mouse Position 按比例跳转，更像滚动条。",
	"interaction.clickType.code": "Code Position",
	"interaction.clickType.mouse": "Mouse Position",
	"interaction.jumpOn.name": "触发跳转时机",
	"interaction.jumpOn.desc": "按下、松开或仅在拖拽时触发跳转。",
	"interaction.jumpOn.down": "按下时",
	"interaction.jumpOn.up": "松开时",
	"interaction.jumpOn.none": "不跳转",
	"interaction.moveOnly.name": "只滚动不展开",
	"interaction.moveOnly.desc": "点击缩略图时只滚动到目标位置，不自动展开代码块。",
	"interaction.enableCodeLens.name": "悬停显示代码预览",
	"interaction.enableCodeLens.desc": "鼠标停在缩略图上时显示附近代码。",
	"interaction.wheelMoveCodeLens.name": "滚轮移动代码预览",
	"interaction.wheelMoveCodeLens.desc": "预览打开时用滚轮移动预览目标，而不是滚动文档。",

	"rendering.heading": "渲染",
	"rendering.syntaxHighlight.name": "语法高亮",
	"rendering.syntaxHighlight.desc": "使用阅读视图的语法颜色绘制缩略图。",
	"rendering.enableMarkers.name": "渲染标记",
	"rendering.enableMarkers.desc": "在缩略图中渲染 MARK、region 等标记文本。",
	"rendering.markerRegex.name": "标记正则",
	"rendering.markerRegex.desc": "用于识别标记的正则表达式，默认匹配 MARK 与 region。",
	"rendering.markerScale.name": "标记字体缩放",
	"rendering.markerScale.desc": "标记文字大小为该值的 3 倍，范围 1 到 6。",

	"reset.heading": "恢复默认设置",
	"reset.desc": "把以上所有选项恢复为默认值。",
	"reset.button": "恢复默认",
};

let cached: Record<MessageKey, string> | null = null;

function dictionary(): Record<MessageKey, string> {
	if (!cached) {
		cached = getLanguage().toLowerCase().startsWith("zh") ? zh : en;
	}
	return cached;
}

/** 取当前界面语言下的一条文案。 */
export function t(key: MessageKey): string {
	return dictionary()[key];
}
