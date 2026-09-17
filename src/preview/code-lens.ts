import { clamp } from "../util/helpers";

/**
 * 悬停代码预览（对应 CodeGlance Pro 的 code lens）。
 * 显示鼠标指向位置附近的若干行源码，并高亮当前行。
 */
const WINDOW_LINES = 9;

export class CodeLens {
	private readonly el: HTMLElement;
	private readonly bodyEl: HTMLElement;
	private lines: readonly string[] = [];
	private currentLine = 0;
	private anchorY = 0;
	private visible = false;

	constructor(parent: HTMLElement) {
		const doc = parent.ownerDocument;
		this.el = doc.createDiv({ cls: "code-block-auto-collapse__lens" });
		this.el.setAttribute("aria-hidden", "true");
		this.bodyEl = this.el.createDiv({ cls: "code-block-auto-collapse__lens-body" });
		parent.appendChild(this.el);
	}

	isVisible(): boolean {
		return this.visible;
	}

	show(lines: readonly string[], currentLine: number, anchorClientY: number): void {
		const count = lines.length;
		if (count === 0) {
			this.hide();
			return;
		}
		this.lines = lines;
		this.currentLine = clamp(currentLine, 0, count - 1);
		this.anchorY = anchorClientY;
		const size = Math.min(WINDOW_LINES, count);
		const start = clamp(this.currentLine - Math.floor(size / 2), 0, Math.max(0, count - size));
		// 直接在 bodyEl 里重建，省掉 DocumentFragment 这一层
		this.bodyEl.empty();
		for (let index = start; index < start + size; index++) {
			const row = this.bodyEl.createDiv({ cls: "code-block-auto-collapse__lens-line" });
			if (index === this.currentLine) row.classList.add("is-current");
			row.createSpan({
				cls: "code-block-auto-collapse__lens-number",
				text: String(index + 1),
			});
			const content = lines[index].replace(/\t/g, "    ");
			row.createSpan({
				cls: "code-block-auto-collapse__lens-text",
				text: content.length > 0 ? content : " ",
			});
		}
		this.visible = true;
		this.el.classList.add("is-visible");
		this.position();
	}

	/** 滚轮移动预览目标。 */
	move(delta: number, lineCount: number): void {
		if (!this.visible) return;
		this.show(this.lines, this.currentLine + delta, this.anchorY);
	}

	hide(): void {
		if (!this.visible) return;
		this.visible = false;
		this.el.classList.remove("is-visible");
	}

	destroy(): void {
		// 丢掉对整份源码的引用，别让预览比代码块活得久
		this.lines = [];
		this.visible = false;
		this.el.remove();
	}

	/** 垂直方向跟随鼠标，并限制在代码块范围内。 */
	private position(): void {
		const parent = this.el.parentElement;
		if (!parent) return;
		const rect = parent.getBoundingClientRect();
		const height = this.el.offsetHeight;
		const top = clamp(this.anchorY - rect.top - height / 2, 0, Math.max(0, rect.height - height));
		this.el.style.top = `${Math.round(top)}px`;
	}
}
