import { Plugin } from "obsidian";
import { CodeBlockView, type CodeBlockHost } from "./code-blocks/code-block-view";
import { decorateCodeBlocks } from "./code-blocks/decorator";
import { invalidateColorCache } from "./render/syntax-colors";
import { WindowContext } from "./platform/window-context";
import { CodeBlockAutoCollapseSettingTab } from "./settings-tab";
import {
	DEFAULT_SETTINGS,
	MINIMAP_WIDTH_RANGE,
	normalizeSettings,
	type CodeBlockSettings,
} from "./settings";
import { clamp, computedStyle, debounce, noopSchedulable, type Cancellable, type Schedulable } from "./util/helpers";

/** 设置变化后如何刷新已有代码块。 */
export type SettingsUpdateMode = "rebuild" | "layout" | "content";

/**
 * Code Block Auto Collapse。
 *
 * 阅读视图里折叠长代码块，并为超长代码块提供 CodeGlance 风格的导航缩略图。
 * 插件只改渲染结果，不修改 Markdown 源文件。
 */
export default class CodeBlockAutoCollapsePlugin extends Plugin implements CodeBlockHost {
	settings: CodeBlockSettings = { ...DEFAULT_SETTINGS };

	private readonly views = new Set<CodeBlockView>();
	private readonly windows = new Map<Document, WindowContext>();
	private readonly viewCleanups = new Map<CodeBlockView, () => void>();
	private scheduleSave: Schedulable = noopSchedulable();
	private scheduleRebuild: Cancellable = noopSchedulable();

	async onload(): Promise<void> {
		await this.loadSettings();

		this.scheduleSave = debounce(() => {
			void this.saveData(this.settings);
		}, 400, window);
		this.scheduleRebuild = debounce(() => this.rebuildAllViews(), 250, window);

		this.registerMarkdownPostProcessor((element) => {
			this.decorate(element);
		});
		this.watchDocument(document);

		this.registerEvent(this.app.workspace.on("css-change", () => this.handleCssChange()));
		this.registerEvent(this.app.workspace.on("layout-change", () => {
			for (const context of this.windows.values()) context.scheduleUpdate();
		}));
		this.registerEvent(this.app.workspace.on("window-open", (_workspaceWindow, win) => this.watchDocument(win.document)));
		this.registerEvent(this.app.workspace.on("window-close", (_workspaceWindow, win) => this.unwatchDocument(win.document)));
		this.app.workspace.onLayoutReady(() => {
			// 插件热重载时，弹出窗口和阅读视图可能已经存在。
			this.app.workspace.iterateAllLeaves((leaf) => {
				if (leaf.view.getViewType() !== "markdown") return;
				this.watchDocument(leaf.view.containerEl.ownerDocument);
				for (const root of leaf.view.containerEl.querySelectorAll<HTMLElement>(".markdown-preview-view")) {
					this.decorate(root);
				}
			});
		});

		this.addSettingTab(new CodeBlockAutoCollapseSettingTab(this.app, this));
	}

	onunload(): void {
		// 先结算待保存的设置，再停掉其它定时器。
		// 设置写入是 400ms 防抖的，直接 cancel 会把最后一次改动一起丢掉 ——
		// 改完设置（或拖完缩略图宽度）马上重载插件就会复现。
		this.scheduleSave.flush();
		this.scheduleRebuild.cancel();
		for (const view of [...this.views]) {
			view.destroy();
			this.dropView(view);
		}
		for (const context of this.windows.values()) context.destroy();
		this.windows.clear();
	}

	/* ---------- CodeBlockHost ---------- */

	getScrollContainer(element: HTMLElement): HTMLElement {
		let parent = element.parentElement;
		while (parent) {
			const style = computedStyle(parent);
			if (
				(style.overflowY === "auto" || style.overflowY === "scroll") &&
				parent.scrollHeight > parent.clientHeight
			) {
				return parent;
			}
			parent = parent.parentElement;
		}
		const doc = element.ownerDocument;
		const scrolling = doc.scrollingElement;
		return scrolling && scrolling.nodeType === 1 ? (scrolling as HTMLElement) : doc.documentElement;
	}

	requestMinimapWidth(width: number, persist: boolean): void {
		this.settings.minimapWidth = Math.round(clamp(width, MINIMAP_WIDTH_RANGE[0], MINIMAP_WIDTH_RANGE[1]));
		for (const view of this.views) view.refreshWidth();
		if (persist) this.scheduleSave();
	}

	/* ---------- 设置 ---------- */

	async loadSettings(): Promise<void> {
		this.settings = normalizeSettings(await this.loadData());
	}

	/**
	 * 修改设置并保存。
	 * - `rebuild`：按新设置重新包装代码块；
	 * - `content`：只刷新缩略图内容（标记、语法颜色）；
	 * - `layout`：只刷新尺寸与颜色，不销毁正在交互的 DOM。
	 */
	updateSettings(mutate: (settings: CodeBlockSettings) => void, mode: SettingsUpdateMode): void {
		mutate(this.settings);
		this.scheduleSave();
		if (mode === "rebuild") {
			this.scheduleRebuild();
			return;
		}
		for (const view of this.views) {
			if (mode === "content") view.applySettings();
			else view.refreshWidth();
		}
	}

	/**
	 * 恢复默认设置。
	 *
	 * 直接换掉整个对象而不是就地改字段：视图通过 getter 读 `host.settings`，
	 * 所以换引用同样立即生效，同时避免 `Object.assign` 的逐字段写入。
	 */
	restoreDefaultSettings(): void {
		this.settings = { ...DEFAULT_SETTINGS };
		this.scheduleSave();
		this.scheduleRebuild();
	}

	/* ---------- 内部 ---------- */

	private decorate(root: HTMLElement): void {
		for (const view of decorateCodeBlocks(root, this)) this.trackView(view);
	}

	private trackView(view: CodeBlockView): void {
		this.views.add(view);
		let context = this.watchDocument(view.wrapper.ownerDocument);
		context?.observe(view.wrapper);
		const stopMigration = view.wrapper.onWindowMigrated((win) => {
			context?.unobserve(view.wrapper);
			context = this.watchDocument(win.document);
			view.refreshWindow();
			context?.observe(view.wrapper);
			context?.scheduleUpdate();
		});
		this.viewCleanups.set(view, () => {
			stopMigration();
			context?.unobserve(view.wrapper);
		});
	}

	private dropView(view: CodeBlockView): void {
		this.views.delete(view);
		this.viewCleanups.get(view)?.();
		this.viewCleanups.delete(view);
	}

	private updateViews(doc: Document): void {
		for (const view of [...this.views]) {
			if (!view.wrapper.isConnected) {
				view.destroy();
				this.dropView(view);
				continue;
			}
			if (view.wrapper.ownerDocument === doc) view.update();
		}
	}

	/** 按当前设置重新包装所有已装饰的代码块。 */
	private rebuildAllViews(): void {
		const roots = new Set<HTMLElement>();
		for (const view of [...this.views]) {
			const root = view.wrapper.parentElement;
			view.destroy();
			this.dropView(view);
			if (root && root.isConnected) roots.add(root);
		}
		for (const root of roots) this.decorate(root);
	}

	private handleCssChange(): void {
		invalidateColorCache();
		for (const view of this.views) view.refreshColors();
	}

	private watchDocument(doc: Document): WindowContext | null {
		const existing = this.windows.get(doc);
		if (existing) return existing;
		if (!doc.defaultView) return null;
		const context = new WindowContext(doc, () => this.updateViews(doc));
		this.windows.set(doc, context);
		return context;
	}

	private unwatchDocument(doc: Document): void {
		for (const view of [...this.views]) {
			if (view.wrapper.ownerDocument !== doc) continue;
			view.destroy();
			this.dropView(view);
		}
		this.windows.get(doc)?.destroy();
		this.windows.delete(doc);
	}
}
