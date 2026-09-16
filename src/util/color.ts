/** 颜色工具：把主题色安全地转换成 canvas 可用的颜色字符串。 */

const HEX_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
const RGB_PATTERN = /^rgba?\(([^)]+)\)$/i;

function parseHex(value: string): [number, number, number] | null {
	const match = HEX_PATTERN.exec(value.trim());
	if (!match) return null;
	const hex = match[1];
	if (hex.length === 3) {
		return [
			Number.parseInt(hex[0] + hex[0], 16),
			Number.parseInt(hex[1] + hex[1], 16),
			Number.parseInt(hex[2] + hex[2], 16),
		];
	}
	const numeric = Number.parseInt(hex, 16);
	return [(numeric >> 16) & 0xff, (numeric >> 8) & 0xff, numeric & 0xff];
}

function parseRgb(value: string): [number, number, number] | null {
	const match = RGB_PATTERN.exec(value.trim());
	if (!match) return null;
	const parts = match[1].split(",").map((part) => Number.parseFloat(part));
	if (parts.length < 3 || parts.some((part) => !Number.isFinite(part))) return null;
	return [parts[0], parts[1], parts[2]];
}

function toRgbTuple(value: string): [number, number, number] | null {
	return parseHex(value) ?? parseRgb(value);
}

/** 给颜色附加透明度；无法解析时原样返回，避免产生非法颜色。 */
export function withAlpha(value: string, alpha: number): string {
	const rgb = toRgbTuple(value);
	if (!rgb) return value;
	return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

/** 读取 CSS 变量的原始值（可能是 var(...) 链），拿不到就使用兜底。 */
export function readCssVariable(element: HTMLElement, name: string, fallback: string): string {
	const value = element.ownerDocument.defaultView?.getComputedStyle(element).getPropertyValue(name).trim() ?? "";
	return value.length > 0 ? value : fallback;
}
