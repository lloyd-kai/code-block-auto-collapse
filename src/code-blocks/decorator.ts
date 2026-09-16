import { CodeBlockView, type CodeBlockHost } from "./code-block-view";
import { countLines } from "../util/text";

/** 阅读视图里 frontmatter / 属性面板的容器，这些位置的 `<pre>` 不是代码块。 */
const METADATA_SELECTOR = ".metadata-container, .frontmatter, .cm-hmd-frontmatter, [data-property-key]";

/** 已包装的代码块标记，避免重复包装。 */
const WRAPPER_CLASS = "code-block-auto-collapse";

function isMetadata(pre: HTMLElement): boolean {
	return Boolean(pre.closest(METADATA_SELECTOR));
}

/**
 * 扫描渲染结果并把符合条件的代码块包装成可折叠视图。
 *
 * 只操作当前渲染片段的 DOM，不修改 Markdown 源文件；后处理器可能对同一区域
 * 重复触发，因此需要判断是否已经包装过。
 */
export function decorateCodeBlocks(root: HTMLElement, host: CodeBlockHost): CodeBlockView[] {
	const settings = host.settings;
	const views: CodeBlockView[] = [];
	const blocks = Array.from(root.querySelectorAll<HTMLElement>("pre"));
	for (const pre of blocks) {
		if (pre.parentElement?.classList.contains(WRAPPER_CLASS)) continue;
		if (isMetadata(pre)) continue;
		const code = pre.querySelector<HTMLElement>("code") ?? pre;
		const text = code.textContent ?? "";
		const lineCount = countLines(text);
		// 既不需要折叠也不需要缩略图时保持原样
		if (lineCount < settings.minimumLines && lineCount < settings.minimapMinLines) continue;
		views.push(new CodeBlockView(host, pre, code, text, lineCount));
	}
	return views;
}
