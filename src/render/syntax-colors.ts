import { readCssVariable } from "../util/color";

/**
 * 语法颜色采集。
 *
 * 阅读视图已经把代码渲染成 `<span class="token ...">`，直接读取这些 span 的
 * 计算颜色即可拿到与主题一致的配色。为了避免每个文本节点都触发一次样式计算，
 * 这里按 className 缓存颜色；缓存失效由插件的 css-change 事件驱动。
 */

export interface ColorRuns {
	starts: Int32Array;
	ends: Int32Array;
	colors: string[];
}

export interface Palette {
	text: string;
	keyword: string;
	string: string;
	comment: string;
	number: string;
	function: string;
}

export interface ColorLookup {
	/** 每次绘制前调用，重置游标。 */
	reset(): void;
	/** 取某个字符偏移对应的颜色；调用方需保证偏移单调递增。 */
	colorAt(offset: number): string;
}

type PaletteKey = Exclude<keyof Palette, "text">;

const EMPTY_RUNS: ColorRuns = {
	starts: new Int32Array(0),
	ends: new Int32Array(0),
	colors: [],
};

let tokenRunCache = new WeakMap<HTMLElement, ColorRuns | null>();

/** 主题变化后调用，丢弃按元素缓存的 token 颜色。 */
export function invalidateColorCache(): void {
	tokenRunCache = new WeakMap<HTMLElement, ColorRuns | null>();
}

/** 读取 `<code>` 内 token span 的颜色区间；没有可用高亮时返回 null。 */
export function collectTokenRuns(code: HTMLElement): ColorRuns | null {
	const cached = tokenRunCache.get(code);
	if (cached !== undefined) return cached;
	const runs = buildTokenRuns(code);
	tokenRunCache.set(code, runs);
	return runs;
}

function buildTokenRuns(code: HTMLElement): ColorRuns | null {
	const doc = code.ownerDocument;
	const view = doc.defaultView ?? window;
	const fallback = view.getComputedStyle(code).color;
	const classColors = new Map<string, string>();
	const colorOf = (element: Element | null): string => {
		if (!element) return fallback;
		const key = typeof element.className === "string" ? element.className : "";
		const cached = classColors.get(key);
		if (cached !== undefined) return cached;
		const color = view.getComputedStyle(element).color || fallback;
		classColors.set(key, color);
		return color;
	};

	const walker = doc.createTreeWalker(code, NodeFilter.SHOW_TEXT);
	const starts: number[] = [];
	const ends: number[] = [];
	const colors: string[] = [];
	const distinct = new Set<string>();
	let offset = 0;
	let node: Node | null = walker.nextNode();
	while (node) {
		const text = node.textContent ?? "";
		if (text.length > 0) {
			const parent = node.parentElement;
			const color = colorOf(parent ? parent.closest("span") ?? parent : null);
			const last = colors.length - 1;
			// 相邻同色文本合并，减少区间数量
			if (last >= 0 && colors[last] === color && ends[last] === offset) {
				ends[last] = offset + text.length;
			} else {
				starts.push(offset);
				ends.push(offset + text.length);
				colors.push(color);
			}
			distinct.add(color);
			offset += text.length;
		}
		node = walker.nextNode();
	}
	// 完全没有 token 或颜色单一时，交给词法兜底，效果比纯色更好
	if (offset === 0 || distinct.size <= 1) return null;
	return { starts: Int32Array.from(starts), ends: Int32Array.from(ends), colors };
}

/** 从 token class 或主题变量推断词法兜底配色。 */
export function readPalette(code: HTMLElement, fallbackText: string): Palette {
	const palette: Palette = {
		text: fallbackText,
		keyword: fallbackText,
		string: fallbackText,
		comment: fallbackText,
		number: fallbackText,
		function: fallbackText,
	};
	const view = code.ownerDocument.defaultView ?? window;
	const spans = Array.from(code.querySelectorAll("span"));
	const assign = (key: PaletteKey, needles: readonly string[]): void => {
		for (const span of spans) {
			const classes = typeof span.className === "string" ? span.className.toLowerCase() : "";
			if (classes.length === 0 || !needles.some((needle) => classes.includes(needle))) continue;
			const color = view.getComputedStyle(span).color;
			if (color) {
				palette[key] = color;
				return;
			}
		}
	};
	assign("keyword", ["keyword", "tag", "property", "builtin"]);
	assign("string", ["string", "char", "quote", "attr-value"]);
	assign("comment", ["comment", "meta"]);
	assign("number", ["number", "constant", "atom", "boolean"]);
	assign("function", ["function", "method", "class-name"]);

	const variables: Array<[PaletteKey, string]> = [
		["keyword", "--text-accent"],
		["string", "--text-success"],
		["comment", "--text-muted"],
		["number", "--text-warning"],
		["function", "--text-accent"],
	];
	for (const [key, name] of variables) {
		if (palette[key] !== fallbackText) continue;
		const value = readCssVariable(code, name, "");
		// 主题变量常常是 var() 链，canvas 无法解析，直接跳过
		if (value.length > 0 && !value.startsWith("var(")) palette[key] = value;
	}
	return palette;
}

const LEXICAL_PATTERN =
	/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\/[^\n]*|#[^\n]*|\b\d+(?:\.\d+)?\b|\b(?:class|def|function|return|import|from|const|let|var|if|else|for|while|new|public|private|protected|extends|implements|async|await|export|interface|type|struct|enum|fn|void|int|bool|boolean|null|undefined|true|false|this|self|super|try|catch|finally|throw|switch|case|break|continue|do|in|of|is|not|and|or|with|lambda|yield|static|final|override|package|namespace|using|template|typename|sizeof|delete|module|require|end)\b)/g;

/** 高亮缺失时的词法兜底：识别字符串、注释、数字和常见关键字。 */
export function collectLexicalRuns(
	lines: readonly string[],
	lineOffsets: readonly number[],
	palette: Palette
): ColorRuns {
	const starts: number[] = [];
	const ends: number[] = [];
	const colors: string[] = [];
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index];
		if (line.length === 0) continue;
		const lineStart = lineOffsets[index];
		for (const match of line.matchAll(LEXICAL_PATTERN)) {
			const value = match[0];
			const start = lineStart + (match.index ?? 0);
			const color = /^(?:"|'|`)/.test(value)
				? palette.string
				: /^(?:\/\/|#)/.test(value)
					? palette.comment
					: /^\d/.test(value)
						? palette.number
						: palette.keyword;
			starts.push(start);
			ends.push(start + value.length);
			colors.push(color);
		}
	}
	if (starts.length === 0) return EMPTY_RUNS;
	return { starts: Int32Array.from(starts), ends: Int32Array.from(ends), colors };
}

/**
 * 基于游标的颜色查询。
 * 绘制按行、按列递增访问偏移，游标只需要单向前进，整体是 O(字符数 + 区间数)。
 */
export function createColorLookup(runs: ColorRuns, fallback: string): ColorLookup {
	let index = 0;
	const count = runs.starts.length;
	return {
		reset(): void {
			index = 0;
		},
		colorAt(offset: number): string {
			while (index < count && offset >= runs.ends[index]) index++;
			if (index < count && offset >= runs.starts[index] && offset < runs.ends[index]) {
				return runs.colors[index];
			}
			// 采样跳行时可能出现小幅回退，做一次有界回溯
			if (index > 0 && offset < runs.starts[index]) {
				const limit = Math.max(0, index - 64);
				for (let probe = index - 1; probe >= limit; probe--) {
					if (offset >= runs.starts[probe] && offset < runs.ends[probe]) return runs.colors[probe];
				}
			}
			return fallback;
		},
	};
}
