import type { EditorSizeMode } from "../types";
import { clamp } from "../util/helpers";

/**
 * 缩略图几何计算。
 *
 * 与参考实现的对应关系：
 * - `pixelsPerLine` ≈ CodeGlance Pro 的 Pixels Per Line；
 * - `documentHeight` 是整篇代码映射到缩略图后的高度；
 * - `viewportStart / viewportHeight` 是视窗矩形，语义为「代码块在滚动容器中
 *   可见的那一段」；
 * - `windowStart` 是缩略图当前展示的窗口起点。文档比缩略图高时（Proportional
 *   模式），窗口跟随视窗平移，这正是参考实现 `visibleStart/visibleEnd` 的行为。
 */

export interface MinimapGeometryInput {
	lineCount: number;
	/** DOM 中每行的高度（px）。 */
	lineHeight: number;
	pixelsPerLine: number;
	mode: EditorSizeMode;
	/** 缩略图允许的最大逻辑高度。 */
	maxHeight: number;
	/** 代码块完整内容高度（px，折叠时取 scrollHeight）。 */
	blockHeight: number;
	/** 代码块可见部分的顶部（相对代码块，px）。 */
	visibleTop: number;
	/** 代码块可见部分的高度（px）。 */
	visibleHeight: number;
	/** 折叠状态：强制把整篇代码压进可用的缩略图高度。 */
	forceFit: boolean;
}

export interface MinimapGeometry {
	lineCount: number;
	lineHeight: number;
	/** 每个源码行占用的缩略图像素，Fit 模式下可能小于 1。 */
	pitch: number;
	/** 每个绘制行覆盖的源码行数（pitch < 1 时大于 1）。 */
	linesPerRow: number;
	/** 绘制行之间的实际间距，始终 >= 1。 */
	rowPitch: number;
	/** 每个字符色块占用的物理行数（1..4）。 */
	weightCount: number;
	/** 缩略图逻辑高度。 */
	canvasHeight: number;
	/** 绘制行总数。 */
	rowCount: number;
	/** 整篇代码在缩略图中的高度。 */
	documentHeight: number;
	/** 缩略图像素 / DOM 像素。 */
	scale: number;
	/** 视窗矩形高度（缩略图像素）。 */
	viewportHeight: number;
	/** 视窗矩形顶部（相对整篇文档）。 */
	viewportStart: number;
	/** 当前窗口起点（相对整篇文档）。 */
	windowStart: number;
}

/** 缩略图最小高度，避免极短代码块出现负高度。 */
export const MIN_CANVAS_HEIGHT = 48;
/** 视窗矩形的最小高度，保证仍然可拖拽。 */
const MIN_VIEWPORT_HEIGHT = 10;

/** 源码行 → 绘制行。 */
export function rowOfLine(line: number, linesPerRow: number): number {
	return Math.floor(line / linesPerRow);
}

/** 缩略图文档坐标 → 最近的源码行。 */
export function lineAtDocY(docY: number, geometry: MinimapGeometry): number {
	const row = Math.floor(docY / geometry.rowPitch);
	const offset = geometry.linesPerRow > 1 ? Math.floor(geometry.linesPerRow / 2) : 0;
	return clamp(row * geometry.linesPerRow + offset, 0, Math.max(0, geometry.lineCount - 1));
}

/** 源码行 → 缩略图文档坐标（该行所在绘制行的顶部）。 */
export function docYOfLine(line: number, geometry: MinimapGeometry): number {
	return rowOfLine(line, geometry.linesPerRow) * geometry.rowPitch;
}

export function computeGeometry(input: MinimapGeometryInput): MinimapGeometry {
	const lineCount = Math.max(0, input.lineCount);
	const lineHeight = Math.max(1, input.lineHeight);
	const pixelsPerLine = clamp(input.pixelsPerLine, 1, 8);
	const limit = Math.max(MIN_CANVAS_HEIGHT, input.maxHeight);

	const rawDocumentHeight = Math.max(lineHeight, lineCount * pixelsPerLine);
	const mode: EditorSizeMode = input.forceFit ? "fit" : input.mode;
	// Proportional 保持 1:1；Fit 把整篇代码压进可用高度
	const minimapScale = mode === "fit" ? Math.min(1, limit / rawDocumentHeight) : 1;
	const documentHeight = Math.max(1, rawDocumentHeight * minimapScale);
	const canvasHeight = clamp(documentHeight, MIN_CANVAS_HEIGHT, limit);

	const pitch = pixelsPerLine * minimapScale;
	// pitch 小于 1px 时按组采样，保证每个绘制行至少占 1px
	const linesPerRow = Math.max(1, Math.ceil(1 / Math.max(pitch, 0.0001)));
	const rowPitch = Math.max(1, pitch * linesPerRow);
	const rowCount = Math.max(1, Math.ceil(lineCount / linesPerRow));
	const weightCount = clamp(Math.round(rowPitch), 1, 4);

	const blockHeight = Math.max(lineHeight, input.blockHeight);
	const scale = documentHeight / blockHeight;
	const visibleTop = clamp(input.visibleTop, 0, blockHeight);
	const visibleHeight = clamp(input.visibleHeight, 0, blockHeight - visibleTop);
	const maxViewportHeight = Math.max(MIN_VIEWPORT_HEIGHT, Math.min(documentHeight, canvasHeight));
	const viewportHeight = clamp(
		visibleHeight * scale,
		Math.min(MIN_VIEWPORT_HEIGHT, maxViewportHeight),
		maxViewportHeight
	);
	const maxViewportStart = Math.max(0, documentHeight - viewportHeight);
	const viewportStart = clamp(visibleTop * scale, 0, maxViewportStart);

	// 窗口跟随视窗：优先让视窗落在窗口内，同时尽量少移动
	const maxWindowStart = Math.max(0, documentHeight - canvasHeight);
	let windowStart = 0;
	if (maxWindowStart > 0) {
		const maxStartForViewport = Math.min(viewportStart, maxWindowStart);
		const minStartForViewport = Math.min(
			Math.max(0, viewportStart + viewportHeight - canvasHeight),
			maxStartForViewport
		);
		windowStart = clamp(viewportStart, minStartForViewport, maxStartForViewport);
	}

	return {
		lineCount,
		lineHeight,
		pitch,
		linesPerRow,
		rowPitch,
		weightCount,
		canvasHeight,
		rowCount,
		documentHeight,
		scale,
		viewportHeight,
		viewportStart,
		windowStart,
	};
}
