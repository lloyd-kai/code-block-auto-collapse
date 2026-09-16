/** 代码文本解析：一次遍历同时得到行、行首偏移和视觉宽度。 */

export interface ParsedCodeText {
	/** 源码行（已去掉 CR 与首尾多余的换行）。 */
	lines: string[];
	/** 每行在原始 textContent 中的起始偏移，用于查语法颜色。 */
	lineOffsets: number[];
	/** 每行的视觉宽度，TAB 记为 4 列。 */
	lineWidths: number[];
	/** 最长一行的视觉宽度，至少为 1。 */
	maxColumns: number;
}

const TAB_WIDTH = 4;
const LINE_FEED = 10;
const CARRIAGE_RETURN = 13;

/** 计算一行的视觉宽度，TAB 展开为 4 列。 */
export function visualWidth(line: string): number {
	let width = 0;
	for (let index = 0; index < line.length; index++) {
		width += line.charCodeAt(index) === 9 ? TAB_WIDTH : 1;
	}
	return width;
}

/** 解析 `<code>` 的 textContent。 */
export function parseCodeText(raw: string): ParsedCodeText {	const lines: string[] = [];
	const lineOffsets: number[] = [];
	const lineWidths: number[] = [];
	let maxColumns = 1;
	// 部分渲染器会在 <code> 开头补一个换行，需要整体后移一位。
	let lineStart = raw.startsWith("\n") ? 1 : 0;
	for (let index = lineStart; index <= raw.length; index++) {
		if (index < raw.length && raw.charCodeAt(index) !== LINE_FEED) continue;
		let lineEnd = index;
		if (lineEnd > lineStart && raw.charCodeAt(lineEnd - 1) === CARRIAGE_RETURN) lineEnd--;
		const line = raw.slice(lineStart, lineEnd);
		lines.push(line);
		lineOffsets.push(lineStart);
		const width = visualWidth(line);
		lineWidths.push(width);
		if (width > maxColumns) maxColumns = width;
		lineStart = index + 1;
	}
	// 文本以换行结尾时会多出一个空行，去掉它。
	if (lines.length > 1 && lines[lines.length - 1].length === 0 && lineStart > raw.length) {
		lines.pop();
		lineOffsets.pop();
		lineWidths.pop();
	}
	return { lines, lineOffsets, lineWidths, maxColumns };
}

/** 只统计行数，避免为了一次判断做完整解析。 */
export function countLines(raw: string): number {
	if (raw.length === 0) return 1;
	let count = 1;
	for (let index = 0; index < raw.length; index++) {
		if (raw.charCodeAt(index) === LINE_FEED) count++;
	}
	// 以换行结尾时不算多出一行
	if (raw.charCodeAt(raw.length - 1) === LINE_FEED) count--;
	return Math.max(1, count);
}
