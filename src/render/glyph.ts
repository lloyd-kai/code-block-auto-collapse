import { bottomWeight, topWeight } from "./character-weights";
import type { RenderStyle } from "../types";
import { clamp } from "../util/helpers";

/**
 * 字符栅格化，移植自 CodeGlance Pro 的 BaseMinimap.renderImage。
 *
 * 参考实现把每个字符映射成 `pixelsPerLine` 个物理行，并按权重逐行填充：
 * Clean 只用「可打印 / 非可打印」两档权重，Accurate 使用 Courier 字体的
 * 上下半墨迹覆盖率。行权重里第一个权重为 0 的情况（4 行模式）天然形成
 * 行间空隙，这正是 CodeGlance 系列缩略图的纹理来源。
 */
const ALPHA_SCALE = 0.85;
const WEIGHT_BUFFER = new Float64Array(4);
const PRINTABLE_MIN = 33;
const PRINTABLE_MAX = 126;

function cleanWeights(charCode: number, count: number): number {
	// Clean 只用单档权重，返回值代表该字符的墨迹强度。
	return charCode >= PRINTABLE_MIN && charCode <= PRINTABLE_MAX ? 0.8 : 0.4;
}

/** 计算每个物理行的权重，写入共享缓冲区并返回权重个数。 */
function fillWeights(style: RenderStyle, charCode: number, count: number): number {
	if (style === "clean") {
		const weight = cleanWeights(charCode, count);
		switch (count) {
			case 1:
				WEIGHT_BUFFER[0] = weight * 0.6;
				break;
			case 2:
				WEIGHT_BUFFER[0] = weight * 0.3;
				WEIGHT_BUFFER[1] = weight * 0.6;
				break;
			case 3:
				WEIGHT_BUFFER[0] = weight * 0.1;
				WEIGHT_BUFFER[1] = weight * 0.6;
				WEIGHT_BUFFER[2] = weight * 0.6;
				break;
			default:
				WEIGHT_BUFFER[0] = 0;
				WEIGHT_BUFFER[1] = weight * 0.6;
				WEIGHT_BUFFER[2] = weight * 0.6;
				WEIGHT_BUFFER[3] = weight * 0.6;
				break;
		}
		return count;
	}

	const top = topWeight(charCode);
	const bottom = bottomWeight(charCode);
	switch (count) {
		case 1:
			WEIGHT_BUFFER[0] = (top + bottom) / 2;
			break;
		case 2:
			WEIGHT_BUFFER[0] = top * 0.5;
			WEIGHT_BUFFER[1] = bottom;
			break;
		case 3:
			WEIGHT_BUFFER[0] = top * 0.3;
			WEIGHT_BUFFER[1] = (top + bottom) / 2;
			WEIGHT_BUFFER[2] = bottom * 0.7;
			break;
		default:
			WEIGHT_BUFFER[0] = 0;
			WEIGHT_BUFFER[1] = top;
			WEIGHT_BUFFER[2] = (top + bottom) / 2;
			WEIGHT_BUFFER[3] = bottom;
			break;
	}
	return count;
}

/**
 * 画一个字符色块。
 * 调用方负责设置 fillStyle；这里只改 globalAlpha，并在结束时复原。
 */
export function paintGlyph(
	context: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	rowPitch: number,
	charCode: number,
	style: RenderStyle
): void {
	const count = clamp(Math.round(rowPitch), 1, 4);
	fillWeights(style, charCode, count);
	const bandHeight = rowPitch / count;
	for (let index = 0; index < count; index++) {
		const weight = WEIGHT_BUFFER[index];
		if (weight <= 0) continue;
		context.globalAlpha = weight * ALPHA_SCALE;
		context.fillRect(x, y + index * bandHeight, width, bandHeight);
	}
	context.globalAlpha = 1;
}
