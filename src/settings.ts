import type { ClickType, EditorSizeMode, JumpOn, MinimapAlignment, RenderStyle } from "./types";
import { clamp, toNumber } from "./util/helpers";

/**
 * 插件设置。
 * 字段命名与分组刻意对齐 CodeGlance Pro 的配置项，便于对照参考实现。
 */
export interface CodeBlockSettings {
	/* 折叠 */
	/** 达到该行数才折叠代码块。 */
	minimumLines: number;
	/** 折叠时保留在预览中的行数。 */
	previewLines: number;

	/* 缩略图 */
	/** 达到该行数才绘制缩略图。 */
	minimapMinLines: number;
	/** 超过该行数不再绘制缩略图。 */
	minimapMaxLines: number;
	/** 超出可渲染范围时保留空白缩略图区域，而不是完全隐藏。 */
	outOfRangeEmpty: boolean;
	/** 每个源码行在缩略图中占用的像素（Proportional 模式下生效）。 */
	pixelsPerLine: number;
	/** 缩略图高度计算方式。 */
	editorSize: EditorSizeMode;
	/** 字符栅格化方式。 */
	renderStyle: RenderStyle;
	/** 缩略图停靠方向。 */
	alignment: MinimapAlignment;
	/** 缩略图宽度（px）。 */
	minimapWidth: number;
	/** 锁定宽度，禁止拖拽调整。 */
	lockWidth: boolean;
	/** 代码块过窄时自动收窄缩略图。 */
	autoShrinkWidth: boolean;

	/* 视窗 */
	/** 视窗矩形填充色（#rrggbb）。 */
	viewportColor: string;
	/** 视窗矩形边框色（#rrggbb）。 */
	viewportBorderColor: string;
	/** 视窗矩形边框厚度，0 表示不画边框。 */
	viewportBorderThickness: number;

	/* 交互 */
	/** 点击缩略图的定位方式。 */
	clickType: ClickType;
	/** 何时触发跳转。 */
	jumpOn: JumpOn;
	/** 只滚动到目标位置，不自动展开代码块。 */
	moveOnly: boolean;
	/** 悬停缩略图时显示附近代码预览。 */
	enableCodeLens: boolean;
	/** 预览打开时用滚轮移动预览目标。 */
	wheelMoveCodeLens: boolean;

	/* 渲染 */
	/** 使用阅读视图的语法高亮颜色。 */
	syntaxHighlight: boolean;
	/** 在缩略图中渲染 MARK/region 标记。 */
	enableMarkers: boolean;
	/** 标记识别正则。 */
	markerRegex: string;
	/** 标记字体缩放，最终字号为 3 倍该值。 */
	markerScale: number;
}

export const DEFAULT_SETTINGS: CodeBlockSettings = {
	minimumLines: 4,
	previewLines: 8,

	minimapMinLines: 101,
	minimapMaxLines: 20000,
	outOfRangeEmpty: true,
	pixelsPerLine: 4,
	editorSize: "proportional",
	renderStyle: "clean",
	alignment: "right",
	minimapWidth: 120,
	lockWidth: false,
	autoShrinkWidth: true,

	viewportColor: "#a0a0a0",
	viewportBorderColor: "#00ff00",
	viewportBorderThickness: 0,

	clickType: "code",
	jumpOn: "down",
	moveOnly: false,
	enableCodeLens: true,
	wheelMoveCodeLens: false,

	syntaxHighlight: true,
	enableMarkers: true,
	markerRegex: "\\bMARK:(?: -)?(?=\\s|$)|#?region\\b",
	markerScale: 3,
};

/** 缩略图宽度的合法区间。 */
export const MINIMAP_WIDTH_RANGE: readonly [number, number] = [60, 480];

function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
	return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function pickHex(value: unknown, fallback: string): string {
	return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
}

/**
 * 校验并补齐设置。
 * 逐字段收敛，避免历史 data.json 里的非法值（NaN、越界、错类型）破坏渲染。
 */
export function normalizeSettings(raw: unknown): CodeBlockSettings {
	const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
	const num = (key: keyof CodeBlockSettings, min: number, max: number, fallback: number): number =>
		Math.round(clamp(toNumber(source[key], fallback), min, max));
	const bool = (key: keyof CodeBlockSettings, fallback: boolean): boolean =>
		typeof source[key] === "boolean" ? source[key] : fallback;
	const markerRegex =
		typeof source.markerRegex === "string" && source.markerRegex.trim().length > 0
			? source.markerRegex
			: DEFAULT_SETTINGS.markerRegex;

	return {
		minimumLines: num("minimumLines", 2, 500, DEFAULT_SETTINGS.minimumLines),
		previewLines: num("previewLines", 1, 100, DEFAULT_SETTINGS.previewLines),

		minimapMinLines: num("minimapMinLines", 0, 100000, DEFAULT_SETTINGS.minimapMinLines),
		minimapMaxLines: num("minimapMaxLines", 100, 1000000, DEFAULT_SETTINGS.minimapMaxLines),
		outOfRangeEmpty: bool("outOfRangeEmpty", DEFAULT_SETTINGS.outOfRangeEmpty),
		pixelsPerLine: num("pixelsPerLine", 1, 8, DEFAULT_SETTINGS.pixelsPerLine),
		editorSize: pickEnum(source.editorSize, ["proportional", "fit"] as const, DEFAULT_SETTINGS.editorSize),
		renderStyle: pickEnum(source.renderStyle, ["clean", "accurate"] as const, DEFAULT_SETTINGS.renderStyle),
		alignment: pickEnum(source.alignment, ["right", "left"] as const, DEFAULT_SETTINGS.alignment),
		minimapWidth: num("minimapWidth", MINIMAP_WIDTH_RANGE[0], MINIMAP_WIDTH_RANGE[1], DEFAULT_SETTINGS.minimapWidth),
		lockWidth: bool("lockWidth", DEFAULT_SETTINGS.lockWidth),
		autoShrinkWidth: bool("autoShrinkWidth", DEFAULT_SETTINGS.autoShrinkWidth),

		viewportColor: pickHex(source.viewportColor, DEFAULT_SETTINGS.viewportColor),
		viewportBorderColor: pickHex(source.viewportBorderColor, DEFAULT_SETTINGS.viewportBorderColor),
		viewportBorderThickness: num("viewportBorderThickness", 0, 4, DEFAULT_SETTINGS.viewportBorderThickness),

		clickType: pickEnum(source.clickType, ["code", "mouse"] as const, DEFAULT_SETTINGS.clickType),
		jumpOn: pickEnum(source.jumpOn, ["down", "up", "none"] as const, DEFAULT_SETTINGS.jumpOn),
		moveOnly: bool("moveOnly", DEFAULT_SETTINGS.moveOnly),
		enableCodeLens: bool("enableCodeLens", DEFAULT_SETTINGS.enableCodeLens),
		wheelMoveCodeLens: bool("wheelMoveCodeLens", DEFAULT_SETTINGS.wheelMoveCodeLens),

		syntaxHighlight: bool("syntaxHighlight", DEFAULT_SETTINGS.syntaxHighlight),
		enableMarkers: bool("enableMarkers", DEFAULT_SETTINGS.enableMarkers),
		markerRegex,
		markerScale: Math.round(clamp(toNumber(source.markerScale, DEFAULT_SETTINGS.markerScale), 1, 6) * 2) / 2,
	};
}
