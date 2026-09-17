import { t } from "../i18n";
import { CodeMinimap, type MinimapHost } from "../minimap/code-minimap";
import type { CodeBlockSettings } from "../settings";
import { computedStyle } from "../util/helpers";
import { countLines } from "../util/text";

/** 视图向插件请求的能力。 */
export interface CodeBlockHost {
	readonly settings: CodeBlockSettings;
	getScrollContainer(element: HTMLElement): HTMLElement;
	/** 调整所有缩略图宽度，persist 为 true 时写入设置。 */
	requestMinimapWidth(width: number, persist: boolean): void;
}

/** 折叠时按钮与遮罩共用的最小行高兜底值。 */
const FALLBACK_LINE_HEIGHT = 21;

/** 离视口这么远就整帧跳过重算（px）。 */
const OFFSCREEN_MARGIN = 200;

/**
 * 一个代码块的视图：负责折叠状态、按钮、遮罩，并持有缩略图。
 *
 * 与参考实现一致，缩略图在折叠状态下依然可用（高度收敛到预览高度），
 * 点击即可展开并跳转。
 */
export class CodeBlockView implements MinimapHost {
	readonly wrapper: HTMLElement;
	readonly pre: HTMLElement;
	private readonly code: HTMLElement;
	private readonly host: CodeBlockHost;
	private readonly button: HTMLButtonElement;
	private readonly fade: HTMLElement;
	private minimap: CodeMinimap | null = null;
	private collapsed = false;
	private collapsible: boolean;
	private previewHeight: number;
	private lineCount: number;
	private contentLength: number;

	constructor(host: CodeBlockHost, pre: HTMLElement, code: HTMLElement, text: string, lineCount: number) {
		this.host = host;
		this.pre = pre;
		this.code = code;
		this.lineCount = lineCount;
		this.contentLength = text.length;

		const doc = pre.ownerDocument;
		const settings = host.settings;
		// 用 doc.createDiv() 而不是 document.createElement()：元素会落在
		// 该代码块所属的 document 上，弹出窗口里也能正常工作
		const wrapper = doc.createDiv({ cls: "code-block-auto-collapse" });
		pre.replaceWith(wrapper);
		wrapper.appendChild(pre);
		this.wrapper = wrapper;

		this.button = doc.createEl("button", { cls: "code-block-auto-collapse__expand" });
		this.button.type = "button";
		this.button.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			this.setCollapsed(!this.collapsed);
		});
		wrapper.appendChild(this.button);

		// 用真实元素代替伪元素，移动端也能点到
		this.fade = doc.createDiv({ cls: "code-block-auto-collapse__fade" });
		wrapper.appendChild(this.fade);

		wrapper.addEventListener("click", (event) => {
			if (!this.collapsed) return;
			const target = event.target as HTMLElement | null;
			// 缩略图与按钮有自己的点击语义
			if (target?.closest(".code-block-auto-collapse__minimap")) return;
			if (target === this.button) return;
			const selection = doc.getSelection();
			if (selection && selection.toString().length > 0) return;
			this.setCollapsed(false);
		});

		this.collapsible = lineCount >= settings.minimumLines;
		this.previewHeight = this.computePreviewHeight(settings.previewLines);
		wrapper.style.setProperty("--cbac-preview-height", `${this.previewHeight}px`);

		if (this.shouldHaveMinimap(settings)) {
			this.minimap = new CodeMinimap(this, wrapper, pre, code);
			this.minimap.setEmpty(lineCount > settings.minimapMaxLines);
			this.minimap.setContent(text);
			wrapper.classList.add("has-code-minimap");
		}

		if (this.collapsible) this.setCollapsed(true);
		else wrapper.classList.add("is-expanded");
		this.updateButton();
		this.minimap?.update();
	}

	/* ---------- MinimapHost ---------- */

	get settings(): CodeBlockSettings {
		return this.host.settings;
	}

	isCollapsed(): boolean {
		return this.collapsed;
	}

	getPreviewHeight(): number {
		return this.previewHeight;
	}

	expand(): void {
		this.setCollapsed(false);
	}

	getScrollContainer(): HTMLElement {
		return this.host.getScrollContainer(this.wrapper);
	}

	requestWidth(width: number, persist: boolean): void {
		this.host.requestMinimapWidth(width, persist);
	}

	/* ---------- 对外方法 ---------- */

	/** 跟随滚动 / 尺寸变化刷新视窗与画面。 */
	update(): void {
		if (!this.wrapper.isConnected) return;
		// 视口之外的代码块整帧跳过。下面的 textContent 读取是 O(全文) 的字符串
		// 构建，而滚动时每一帧都会对所有已跟踪的代码块调用一次 update()；
		// 长文档里绝大多数代码块都不在视口内，跳过它们能省掉大量无谓分配。
		if (this.isFarOffscreen()) return;
		const text = this.code.textContent ?? "";
		if (text.length !== this.contentLength) {
			this.contentLength = text.length;
			this.lineCount = countLines(text);
			this.collapsible = this.lineCount >= this.host.settings.minimumLines;
			this.minimap?.setContent(text);
		}
		this.minimap?.update();
	}

	/**
	 * 是否远离视口。
	 * 用窗口视口而不是真实滚动容器：前者更大，所以判断只会偏保守（多算几次），
	 * 不会把真正可见的代码块漏掉；而拿到真实滚动容器需要沿祖先链逐个读计算样式，
	 * 那正是这里最想避免的开销。
	 */
	private isFarOffscreen(): boolean {
		const rect = this.pre.getBoundingClientRect();
		const viewHeight = this.pre.ownerDocument.defaultView?.innerHeight ?? 0;
		return rect.bottom < -OFFSCREEN_MARGIN || rect.top > viewHeight + OFFSCREEN_MARGIN;
	}

	/** 宽度变化后只刷新布局，不重建 DOM。 */
	refreshWidth(): void {
		this.minimap?.refreshWidth();
	}

	/** 内容相关设置（标记、语法高亮）变化后刷新。 */
	applySettings(): void {
		this.minimap?.applySettings();
	}

	/** 主题变化后刷新颜色。 */
	refreshColors(): void {
		this.minimap?.refreshColors();
	}

	/** 卸载或重建前调用，把 DOM 还原成原始的 `<pre>`。 */
	destroy(): void {
		this.minimap?.destroy();
		this.minimap = null;
		if (this.wrapper.isConnected) this.wrapper.replaceWith(this.pre);
	}

	private shouldHaveMinimap(settings: CodeBlockSettings): boolean {
		if (this.lineCount < settings.minimapMinLines) return false;
		return this.lineCount <= settings.minimapMaxLines || settings.outOfRangeEmpty;
	}

	private computePreviewHeight(previewLines: number): number {
		const style = computedStyle(this.code);
		const fontSize = Number.parseFloat(style.fontSize);
		const lineHeight = Number.parseFloat(style.lineHeight);
		const resolved =
			Number.isFinite(lineHeight) && lineHeight > 0
				? lineHeight
				: Number.isFinite(fontSize)
					? fontSize * 1.5
					: FALLBACK_LINE_HEIGHT;
		// 用像素而非 lh 单位：lh 需要 Chromium 109+，旧版 Electron 会让整条声明失效
		return Math.max(resolved, resolved * previewLines);
	}

	private setCollapsed(value: boolean): void {
		const next = this.collapsible ? value : false;
		this.collapsed = next;
		this.wrapper.classList.toggle("is-collapsed", next);
		this.wrapper.classList.toggle("is-expanded", !next);
		this.updateButton();
		this.minimap?.update();
	}

	private updateButton(): void {
		this.button.textContent = t(this.collapsed ? "block.expand" : "block.collapse");
		this.button.setAttribute("aria-label", t(this.collapsed ? "block.expandAria" : "block.collapseAria"));
		this.button.setAttribute("aria-expanded", String(!this.collapsed));
	}
}
