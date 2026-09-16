import { t } from "../i18n";
import { CodeLens } from "../preview/code-lens";
import { EMPTY_MARKERS, renderMinimap } from "../render/minimap-renderer";
import {
	collectLexicalRuns,
	collectTokenRuns,
	createColorLookup,
	readPalette,
	type ColorLookup,
} from "../render/syntax-colors";
import { MINIMAP_WIDTH_RANGE, type CodeBlockSettings } from "../settings";
import { clamp, clientRectOf, computedStyle, maxScrollTop, safeRegex, throttleFrame, type Cancellable } from "../util/helpers";
import { withAlpha } from "../util/color";
import { parseCodeText } from "../util/text";
import { computeGeometry, docYOfLine, lineAtDocY, type MinimapGeometry } from "./geometry";

/** 缩略图与代码块交互时用到的宿主能力，由 CodeBlockView 提供。 */
export interface MinimapHost {
	readonly settings: CodeBlockSettings;
	isCollapsed(): boolean;
	/** 折叠时保留的预览高度（px）。 */
	getPreviewHeight(): number;
	expand(): void;
	getScrollContainer(): HTMLElement;
	/** 调整缩略图宽度，persist 为 true 时写入设置。 */
	requestWidth(width: number, persist: boolean): void;
}

interface DragState {
	pointerId: number;
	startY: number;
	startScroll: number;
}

interface ResizeState {
	pointerId: number;
	startX: number;
	startWidth: number;
	lastWidth: number;
}

/** 悬停多久后显示代码预览。 */
const LENS_DELAY = 400;
/** 内边缘宽度调整热区宽度。 */
const RESIZE_GUTTER = 7;

/**
 * 单个代码块的缩略图。
 *
 * 结构：容器（position: sticky）内是 canvas 和视窗矩形；代码块比缩略图高时，
 * canvas 只画当前窗口，窗口跟随视窗平移，因此长文档的每帧绘制量是常数级。
 */
export class CodeMinimap {
	private readonly host: MinimapHost;
	private readonly wrapperEl: HTMLElement;
	private readonly preEl: HTMLElement;
	private readonly codeEl: HTMLElement;
	private readonly ownerWindow: Window;
	private readonly containerEl: HTMLElement;
	private readonly canvasEl: HTMLCanvasElement;
	private readonly viewportEl: HTMLElement;
	private readonly lens: CodeLens;
	private readonly renderFrame: Cancellable;

	private lines: readonly string[] = [];
	private lineOffsets: readonly number[] = [];
	private lineWidths: readonly number[] = [];
	private maxColumns = 1;
	private representatives = new Int32Array(0);
	private rowsLinesPerRow = 0;
	private markers: ReadonlyMap<number, string> = EMPTY_MARKERS;
	private lookup: ColorLookup | null = null;
	private lookupCode: HTMLElement | null = null;
	private geometry: MinimapGeometry;
	private width = 0;
	private empty = false;
	private lensTimer: number | null = null;
	private drag: DragState | null = null;
	private resize: ResizeState | null = null;
	private themeKey = "";

	constructor(host: MinimapHost, wrapperEl: HTMLElement, preEl: HTMLElement, codeEl: HTMLElement) {
		this.host = host;
		this.wrapperEl = wrapperEl;
		this.preEl = preEl;
		this.codeEl = codeEl;
		const doc = wrapperEl.ownerDocument;
		this.ownerWindow = doc.defaultView ?? window;

		this.containerEl = doc.createDiv({ cls: "code-block-auto-collapse__minimap" });
		this.containerEl.tabIndex = 0;
		this.containerEl.setAttribute("role", "scrollbar");
		this.containerEl.setAttribute("aria-orientation", "vertical");
		this.containerEl.setAttribute("aria-label", t("minimap.ariaLabel"));
		this.containerEl.setAttribute("aria-valuemin", "0");
		this.containerEl.setAttribute("aria-valuemax", "100");
		this.canvasEl = doc.createEl("canvas", { cls: "code-block-auto-collapse__minimap-canvas" });
		this.viewportEl = doc.createDiv({ cls: "code-block-auto-collapse__minimap-viewport" });
		this.containerEl.append(this.canvasEl, this.viewportEl);
		wrapperEl.appendChild(this.containerEl);

		this.lens = new CodeLens(wrapperEl);
		this.renderFrame = throttleFrame(() => this.draw(), this.ownerWindow);
		this.geometry = computeGeometry({
			lineCount: 0,
			lineHeight: 16,
			pixelsPerLine: 4,
			mode: "proportional",
			maxHeight: 200,
			blockHeight: 16,
			visibleTop: 0,
			visibleHeight: 16,
			forceFit: false,
		});

		this.containerEl.addEventListener("pointerdown", this.onPointerDown);
		this.containerEl.addEventListener("pointermove", this.onPointerMove);
		this.containerEl.addEventListener("pointerup", this.onPointerUp);
		this.containerEl.addEventListener("pointercancel", this.onPointerUp);
		this.containerEl.addEventListener("pointerleave", this.onPointerLeave);
		this.containerEl.addEventListener("wheel", this.onWheel, { passive: false });
		this.containerEl.addEventListener("keydown", this.onKeyDown);
	}

	/** 更新源码文本，重建行缓存与标记。 */
	setContent(text: string): void {
		const parsed = parseCodeText(text);
		this.lines = parsed.lines;
		this.lineOffsets = parsed.lineOffsets;
		this.lineWidths = parsed.lineWidths;
		this.maxColumns = parsed.maxColumns;
		this.representatives = new Int32Array(0);
		this.rowsLinesPerRow = 0;
		this.markers = this.collectMarkers(parsed.lines);
		this.lookup = null;
		this.lookupCode = null;
	}

	/** 超出可渲染范围时保留区域但画空白。 */
	setEmpty(value: boolean): void {
		this.empty = value;
	}

	/** 设置变化后重新应用（标记、颜色、尺寸）。 */
	applySettings(): void {
		this.markers = this.collectMarkers(this.lines);
		this.lookup = null;
		this.lookupCode = null;
		this.update();
	}

	/** 主题变化后丢弃颜色缓存。 */
	refreshColors(): void {
		this.lookup = null;
		this.lookupCode = null;
		this.scheduleRender();
	}

	/** 宽度变化后重新布局。 */
	refreshWidth(): void {
		this.applyGeometry();
		this.scheduleRender();
	}

	/** 重新测量布局，刷新视窗位置与画面。 */
	update(): void {
		if (!this.containerEl.isConnected) return;
		const settings = this.host.settings;
		const style = computedStyle(this.codeEl);
		const fontSize = Number.parseFloat(style.fontSize);
		const parsedLineHeight = Number.parseFloat(style.lineHeight);
		const lineHeight =
			Number.isFinite(parsedLineHeight) && parsedLineHeight > 0
				? parsedLineHeight
				: (Number.isFinite(fontSize) ? fontSize * 1.5 : 21);
		const collapsed = this.host.isCollapsed();
		const blockHeight = Math.max(lineHeight, this.preEl.scrollHeight);
		const container = this.host.getScrollContainer();
		const containerRect = clientRectOf(container, this.ownerWindow);
		const blockRect = this.preEl.getBoundingClientRect();
		// 完全离开可视区域的代码块跳过重算，滚动时只处理眼前的内容
		const margin = 200;
		if (blockRect.bottom < containerRect.top - margin || blockRect.top > containerRect.bottom + margin) return;
		const visibleTop = clamp(containerRect.top - blockRect.top, 0, blockHeight);
		const visibleBottom = clamp(containerRect.bottom - blockRect.top, 0, blockHeight);

		this.geometry = computeGeometry({
			lineCount: this.lines.length,
			lineHeight,
			pixelsPerLine: settings.pixelsPerLine,
			mode: settings.editorSize,
			maxHeight: this.resolveMaxHeight(containerRect.height, lineHeight, collapsed),
			blockHeight,
			visibleTop,
			visibleHeight: Math.max(0, visibleBottom - visibleTop),
			forceFit: collapsed,
		});
		this.ensureRows();
		this.applyGeometry();
		this.scheduleRender();
	}

	destroy(): void {
		this.renderFrame.cancel();
		this.clearLensTimer();
		this.lens.destroy();
		this.containerEl.remove();
	}

	private scheduleRender(): void {
		this.renderFrame();
	}

	private resolveMaxHeight(containerHeight: number, lineHeight: number, collapsed: boolean): number {
		const limit = clamp(containerHeight * 0.85, 160, 1200);
		if (!collapsed) return limit;
		// 折叠时缩略图不能超过代码块的可见高度，否则会撑破折叠区域
		const available = this.preEl.clientHeight || this.host.getPreviewHeight();
		return Math.max(lineHeight * 2, Math.min(limit, available));
	}

	private resolveWidth(settings: CodeBlockSettings): number {
		const configured = clamp(settings.minimapWidth, MINIMAP_WIDTH_RANGE[0], MINIMAP_WIDTH_RANGE[1]);
		if (!settings.autoShrinkWidth) return configured;
		const available = this.wrapperEl.clientWidth;
		if (available <= 0) return configured;
		// 代码块本体至少保留约 2/3 宽度，窄窗口下不让缩略图挤掉正文
		const limit = Math.max(MINIMAP_WIDTH_RANGE[0], Math.floor(available / 3));
		return clamp(Math.min(configured, limit), MINIMAP_WIDTH_RANGE[0], MINIMAP_WIDTH_RANGE[1]);
	}

	private ensureRows(): void {
		const linesPerRow = this.geometry.linesPerRow;
		const rowCount = this.geometry.rowCount;
		if (this.rowsLinesPerRow === linesPerRow && this.representatives.length === rowCount) return;
		const representatives = new Int32Array(rowCount);
		const { lines, lineWidths } = this;
		for (let row = 0; row < rowCount; row++) {
			const start = row * linesPerRow;
			const end = Math.min(lines.length, start + linesPerRow);
			// 每组取视觉宽度最长的一行，避免长行被空行吞掉
			let best = start;
			let bestWidth = lineWidths[start] ?? 0;
			for (let index = start + 1; index < end; index++) {
				const width = lineWidths[index] ?? 0;
				if (width > bestWidth) {
					bestWidth = width;
					best = index;
				}
			}
			representatives[row] = best;
		}
		this.representatives = representatives;
		this.rowsLinesPerRow = linesPerRow;
	}

	private applyGeometry(): void {
		const settings = this.host.settings;
		const geometry = this.geometry;
		const width = this.resolveWidth(settings);
		this.width = width;
		// 变量挂在 wrapper 上：遮罩和代码预览也要读同一个宽度
		this.wrapperEl.style.setProperty("--cbac-minimap-width", `${width}px`);
		this.wrapperEl.style.setProperty("--cbac-canvas-height", `${geometry.canvasHeight}px`);
		this.containerEl.classList.toggle("is-empty", this.empty);

		const viewportHeight = geometry.viewportHeight;
		const top = clamp(
			geometry.viewportStart - geometry.windowStart,
			0,
			Math.max(0, geometry.canvasHeight - viewportHeight)
		);
		this.viewportEl.style.height = `${viewportHeight}px`;
		this.viewportEl.style.top = `${Math.round(top)}px`;

		const themeKey = `${settings.alignment}|${settings.viewportColor}|${settings.viewportBorderColor}|${settings.viewportBorderThickness}`;
		if (themeKey !== this.themeKey) {
			this.themeKey = themeKey;
			this.wrapperEl.classList.toggle("is-minimap-left", settings.alignment === "left");
			this.viewportEl.style.setProperty("--cbac-viewport-color", withAlpha(settings.viewportColor, 0.2));
			this.viewportEl.style.setProperty("--cbac-viewport-color-strong", withAlpha(settings.viewportColor, 0.35));
			this.viewportEl.style.setProperty("--cbac-viewport-border", settings.viewportBorderColor);
			this.viewportEl.style.setProperty(
				"--cbac-viewport-border-width",
				`${settings.viewportBorderThickness}px`
			);
		}

		const scrollable = Math.max(1, geometry.documentHeight - viewportHeight);
		const progress = geometry.documentHeight > viewportHeight ? geometry.viewportStart / scrollable : 0;
		this.containerEl.setAttribute("aria-valuenow", String(Math.round(clamp(progress, 0, 1) * 100)));
	}

	private collectMarkers(lines: readonly string[]): ReadonlyMap<number, string> {
		const settings = this.host.settings;
		if (!settings.enableMarkers) return EMPTY_MARKERS;
		const pattern = safeRegex(settings.markerRegex);
		if (!pattern) return EMPTY_MARKERS;
		const markers = new Map<number, string>();
		for (let index = 0; index < lines.length; index++) {
			const line = lines[index];
			if (line.trim().length === 0) continue;
			pattern.lastIndex = 0;
			if (pattern.test(line)) markers.set(index, line.trim());
		}
		return markers.size > 0 ? markers : EMPTY_MARKERS;
	}

	private createLookup(settings: CodeBlockSettings): ColorLookup {
		const textColor = computedStyle(this.codeEl).color || "#888888";
		const palette = readPalette(this.codeEl, textColor);
		if (settings.syntaxHighlight) {
			const runs = collectTokenRuns(this.codeEl);
			if (runs) return createColorLookup(runs, palette.text);
		}
		return createColorLookup(collectLexicalRuns(this.lines, this.lineOffsets, palette), palette.text);
	}

	private draw(): void {
		if (!this.containerEl.isConnected) return;
		const settings = this.host.settings;
		if (this.lookup === null || this.lookupCode !== this.codeEl) {
			this.lookup = this.createLookup(settings);
			this.lookupCode = this.codeEl;
		}
		const geometry = this.geometry;
		// 网格列可能因为窄窗口收窄，以实际渲染尺寸为准
		const width = this.canvasEl.clientWidth || this.width || this.containerEl.clientWidth;
		const height = this.canvasEl.clientHeight || geometry.canvasHeight;
		if (this.empty || geometry.lineCount === 0) {
			const context = this.canvasEl.getContext("2d");
			if (context) {
				context.setTransform(1, 0, 0, 1, 0, 0);
				context.clearRect(0, 0, this.canvasEl.width, this.canvasEl.height);
			}
			return;
		}
		const style = computedStyle(this.codeEl);
		const fallbackColor = style.color || "#888888";
		renderMinimap(this.canvasEl, {
			geometry,
			lines: this.lines,
			lineOffsets: this.lineOffsets,
			representatives: this.representatives,
			markers: this.markers,
			maxColumns: this.maxColumns,
			style: settings.renderStyle,
			width,
			height,
			dpr: this.ownerWindow.devicePixelRatio || 1,
			lookup: this.lookup ?? createColorLookup(EMPTY_MARKERS_RUNS, fallbackColor),
			markerFontSize: clamp(settings.markerScale * 3, 6, 16),
			markerBandColor: withAlpha(fallbackColor, 0.18),
			markerTextColor: fallbackColor,
			markerFontFamily: style.fontFamily,
		});
	}

	private readonly onPointerDown = (event: PointerEvent): void => {
		if (event.button !== 0) return;
		const settings = this.host.settings;
		const rect = this.containerEl.getBoundingClientRect();
		const y = event.clientY - rect.top;
		if (!settings.lockWidth && this.isInResizeGutter(event, rect)) {
			this.resize = { pointerId: event.pointerId, startX: event.clientX, startWidth: this.width, lastWidth: this.width };
			this.containerEl.classList.add("is-resizing");
			this.capture(event.pointerId);
			event.preventDefault();
			return;
		}
		const viewportTop = this.viewportEl.offsetTop;
		const insideViewport = y >= viewportTop && y <= viewportTop + this.viewportEl.offsetHeight;
		// 折叠状态下视窗几乎铺满缩略图，此时点击语义是「展开并跳转」而不是拖拽
		const collapsed = this.host.isCollapsed();
		if (settings.jumpOn === "none" || (insideViewport && !collapsed)) {
			this.drag = {
				pointerId: event.pointerId,
				startY: event.clientY,
				startScroll: this.host.getScrollContainer().scrollTop,
			};
			this.viewportEl.classList.add("is-dragging");
			this.capture(event.pointerId);
			event.preventDefault();
			return;
		}
		if (settings.jumpOn === "down") {
			event.preventDefault();
			this.navigateAt(y);
		}
	};

	private readonly onPointerMove = (event: PointerEvent): void => {
		if (this.resize && event.pointerId === this.resize.pointerId) {
			const settings = this.host.settings;
			const dx = event.clientX - this.resize.startX;
			const delta = settings.alignment === "left" ? dx : -dx;
			const width = clamp(this.resize.startWidth + delta, MINIMAP_WIDTH_RANGE[0], MINIMAP_WIDTH_RANGE[1]);
			this.resize.lastWidth = width;
			this.host.requestWidth(width, false);
			event.preventDefault();
			return;
		}
		if (this.drag && event.pointerId === this.drag.pointerId) {
			const container = this.host.getScrollContainer();
			const scale = this.geometry.scale;
			if (scale > 0) {
				const delta = (event.clientY - this.drag.startY) / scale;
				container.scrollTop = clamp(this.drag.startScroll + delta, 0, maxScrollTop(container));
			}
			event.preventDefault();
			return;
		}
		const rect = this.containerEl.getBoundingClientRect();
		this.updateCursor(event, rect);
		this.updateLens(event, rect);
	};

	private readonly onPointerUp = (event: PointerEvent): void => {
		if (this.resize && event.pointerId === this.resize.pointerId) {
			this.containerEl.classList.remove("is-resizing");
			this.release(event.pointerId);
			this.host.requestWidth(this.resize.lastWidth, true);
			this.resize = null;
			return;
		}
		if (this.drag && event.pointerId === this.drag.pointerId) {
			this.drag = null;
			this.viewportEl.classList.remove("is-dragging");
			this.release(event.pointerId);
			return;
		}
		const settings = this.host.settings;
		if (settings.jumpOn === "up") {
			const rect = this.containerEl.getBoundingClientRect();
			const y = event.clientY - rect.top;
			if (y >= 0 && y <= rect.height) this.navigateAt(y);
		}
	};

	private readonly onPointerLeave = (): void => {
		this.containerEl.classList.remove("is-resize-hover");
		this.hideLens();
	};

	private readonly onWheel = (event: WheelEvent): void => {
		const settings = this.host.settings;
		if (settings.wheelMoveCodeLens && this.lens.isVisible()) {
			const delta = event.deltaY > 0 ? 1 : event.deltaY < 0 ? -1 : 0;
			if (delta !== 0) {
				this.lens.move(delta, this.lines.length);
				event.preventDefault();
				event.stopPropagation();
			}
			return;
		}
		// 其余情况不拦截滚轮，交给滚动容器原生处理
		this.hideLens();
	};

	private readonly onKeyDown = (event: KeyboardEvent): void => {
		const container = this.host.getScrollContainer();
		const geometry = this.geometry;
		const page = Math.max(1, Math.floor(container.clientHeight / geometry.lineHeight));
		let lines = 0;
		switch (event.key) {
			case "ArrowUp":
				lines = -1;
				break;
			case "ArrowDown":
				lines = 1;
				break;
			case "PageUp":
				lines = -page;
				break;
			case "PageDown":
				lines = page;
				break;
			case "Home":
				event.preventDefault();
				container.scrollTo({ top: 0 });
				return;
			case "End":
				event.preventDefault();
				container.scrollTo({ top: maxScrollTop(container) });
				return;
			default:
				return;
		}
		event.preventDefault();
		container.scrollTop = clamp(container.scrollTop + lines * geometry.lineHeight, 0, maxScrollTop(container));
	};

	private isInResizeGutter(event: PointerEvent, rect: DOMRect): boolean {
		// 代码块太窄时不给宽度调整热区，避免误触
		if (this.wrapperEl.clientWidth < MINIMAP_WIDTH_RANGE[0] * 2) return false;
		const x = event.clientX - rect.left;
		return this.host.settings.alignment === "left" ? x >= rect.width - RESIZE_GUTTER : x <= RESIZE_GUTTER;
	}

	private updateCursor(event: PointerEvent, rect: DOMRect): void {
		const inGutter = !this.host.settings.lockWidth && this.isInResizeGutter(event, rect);
		this.containerEl.classList.toggle("is-resize-hover", inGutter);
		this.containerEl.classList.toggle("can-jump", !inGutter && this.host.settings.jumpOn !== "none");
	}

	private updateLens(event: PointerEvent, rect: DOMRect): void {
		const settings = this.host.settings;
		const y = event.clientY - rect.top;
		if (!settings.enableCodeLens || y < 0 || y > rect.height) {
			this.hideLens();
			return;
		}
		const line = lineAtDocY(this.ratioAt(y) * this.geometry.documentHeight, this.geometry);
		if (this.lens.isVisible()) {
			this.lens.show(this.lines, line, event.clientY);
			return;
		}
		if (this.lensTimer !== null) return;
		// 首次悬停延迟显示，避免鼠标扫过时闪烁
		this.lensTimer = this.ownerWindow.setTimeout(() => {
			this.lensTimer = null;
			this.lens.show(this.lines, line, event.clientY);
		}, LENS_DELAY);
	}

	private clearLensTimer(): void {
		if (this.lensTimer === null) return;
		this.ownerWindow.clearTimeout(this.lensTimer);
		this.lensTimer = null;
	}

	private hideLens(): void {
		this.clearLensTimer();
		this.lens.hide();
	}

	private ratioAt(y: number): number {
		const geometry = this.geometry;
		if (geometry.documentHeight <= 0) return 0;
		return clamp((y + geometry.windowStart) / geometry.documentHeight, 0, 1);
	}

	private navigateAt(y: number): void {
		const settings = this.host.settings;
		const ratio = this.ratioAt(y);
		this.hideLens();
		if (this.host.isCollapsed() && !settings.moveOnly) {
			// 展开会改变布局，下一帧重新测量后再滚动
			this.host.expand();
			this.ownerWindow.requestAnimationFrame(() => {
				this.update();
				this.scrollToRatio(ratio, settings);
			});
			return;
		}
		this.scrollToRatio(ratio, settings);
	}

	private scrollToRatio(ratio: number, settings: CodeBlockSettings): void {
		const container = this.host.getScrollContainer();
		const geometry = this.geometry;
		const docY =
			settings.clickType === "mouse"
				? ratio * geometry.documentHeight
				: docYOfLine(lineAtDocY(ratio * geometry.documentHeight, geometry), geometry);
		const containerRect = clientRectOf(container, this.ownerWindow);
		const blockRect = this.preEl.getBoundingClientRect();
		const blockTop = blockRect.top - containerRect.top + container.scrollTop;
		const lineTop = geometry.scale > 0 ? docY / geometry.scale : 0;
		const target = blockTop + lineTop - containerRect.height / 2;
		container.scrollTo({ top: clamp(target, 0, maxScrollTop(container)), behavior: "smooth" });
	}

	private capture(pointerId: number): void {
		try {
			this.containerEl.setPointerCapture(pointerId);
		} catch {
			// 指针已释放时忽略
		}
	}

	private release(pointerId: number): void {
		try {
			this.containerEl.releasePointerCapture(pointerId);
		} catch {
			// 指针已释放时忽略
		}
	}
}

const EMPTY_MARKERS_RUNS = { starts: new Int32Array(0), ends: new Int32Array(0), colors: [] as string[] };
