import { paintGlyph } from "./glyph";
import type { ColorLookup } from "./syntax-colors";
import { rowOfLine, type MinimapGeometry } from "../minimap/geometry";
import type { RenderStyle } from "../types";

/** 一次绘制所需的全部输入。 */
export interface MinimapRenderModel {
	geometry: MinimapGeometry;
	/** 源码行。 */
	lines: readonly string[];
	/** 每行的起始偏移，用于查语法颜色。 */
	lineOffsets: readonly number[];
	/** 每个绘制行选出的代表行索引。 */
	representatives: Int32Array;
	/** 源码行索引 → 标记文本。 */
	markers: ReadonlyMap<number, string>;
	/** 最长一行的视觉宽度。 */
	maxColumns: number;
	style: RenderStyle;
	/** 缩略图逻辑宽高（CSS px）。 */
	width: number;
	height: number;
	dpr: number;
	lookup: ColorLookup;
	markerFontSize: number;
	markerBandColor: string;
	markerTextColor: string;
	markerFontFamily: string;
}

export const EMPTY_MARKERS: ReadonlyMap<number, string> = new Map<number, string>();

/** 水平方向最多每字符占 1px，超宽的行按比例压缩，与参考实现一致。 */
function resolveColumnPitch(width: number, maxColumns: number): number {
	return Math.min(1, (width - 4) / Math.max(1, maxColumns));
}

/** 绘制标记文本的最大字符数。 */
const MARKER_MAX_CHARS = 24;

/**
 * 把当前窗口内的代码画到 canvas。
 * 只绘制 [windowStart, windowStart + canvasHeight] 范围内的绘制行，
 * 因此长文档滚动时每帧的绘制量是常数级。
 */
export function renderMinimap(canvas: HTMLCanvasElement, model: MinimapRenderModel): void {
	const width = Math.max(1, Math.round(model.width));
	const height = Math.max(1, Math.round(model.height));
	const dpr = model.dpr > 0 ? model.dpr : 1;
	const rasterWidth = Math.max(1, Math.round(width * dpr));
	const rasterHeight = Math.max(1, Math.round(height * dpr));
	if (canvas.width !== rasterWidth) canvas.width = rasterWidth;
	if (canvas.height !== rasterHeight) canvas.height = rasterHeight;

	const context = canvas.getContext("2d");
	if (!context) return;
	// 每次重绘都重置变换，避免累积缩放或残留旧内容
	context.setTransform(1, 0, 0, 1, 0, 0);
	context.clearRect(0, 0, canvas.width, canvas.height);
	context.setTransform(dpr, 0, 0, dpr, 0, 0);
	context.textBaseline = "top";

	const { geometry, lines, lineOffsets, representatives } = model;
	if (geometry.lineCount === 0 || representatives.length === 0) return;

	const pitchX = resolveColumnPitch(width, model.maxColumns);
	const cellWidth = Math.max(0.5, pitchX);
	const { rowPitch, windowStart, canvasHeight } = geometry;
	const maxX = width - 1;

	model.lookup.reset();
	let currentColor = "";
	const firstRow = Math.max(0, Math.floor(windowStart / rowPitch));
	const lastRow = Math.min(representatives.length - 1, Math.ceil((windowStart + canvasHeight) / rowPitch));

	for (let row = firstRow; row <= lastRow; row++) {
		const lineIndex = representatives[row];
		if (lineIndex < 0 || lineIndex >= lines.length) continue;
		const line = lines[lineIndex];
		const lineStart = lineOffsets[lineIndex];
		const y = row * rowPitch - windowStart;
		let x = 2;
		for (let column = 0; column < line.length; column++) {
			if (x > maxX) break;
			const charCode = line.charCodeAt(column);
			// TAB 展开为 4 列，与参考实现一致
			if (charCode === 9) {
				x += 4 * pitchX;
				continue;
			}
			if (charCode === 32) {
				x += pitchX;
				continue;
			}
			const color = model.lookup.colorAt(lineStart + column);
			if (color !== currentColor) {
				context.fillStyle = color;
				currentColor = color;
			}
			paintGlyph(context, x, y, cellWidth, rowPitch, charCode, model.style);
			x += pitchX;
		}
	}

	if (model.markers.size === 0) return;
	const fontFamily = model.markerFontFamily || "monospace";
	context.font = `bold ${model.markerFontSize}px ${fontFamily}`;
	for (const [line, text] of model.markers) {
		const y = rowOfLine(line, geometry.linesPerRow) * rowPitch - windowStart;
		if (y + rowPitch < 0 || y > canvasHeight) continue;
		context.globalAlpha = 0.85;
		context.fillStyle = model.markerBandColor;
		context.fillRect(0, y, width, Math.max(2, rowPitch));
		context.globalAlpha = 1;
		context.fillStyle = model.markerTextColor;
		context.fillText(text.length > MARKER_MAX_CHARS ? text.slice(0, MARKER_MAX_CHARS) : text, 2, y + 0.5);
	}
}
