import { throttleFrame, type Cancellable } from "../util/helpers";

/** 一个文档一套帧调度和观察器，主窗口最小化时弹出窗口仍能独立刷新。 */
export class WindowContext {
	readonly scheduleUpdate: Cancellable;
	private readonly observer: ResizeObserver;
	private readonly ownerWindow: Window;
	private resolutionQuery: MediaQueryList | null = null;
	private destroyed = false;

	constructor(readonly doc: Document, onUpdate: () => void) {
		const win = doc.defaultView;
		if (!win) throw new Error("Cannot watch a document without a window");
		this.ownerWindow = win;
		this.scheduleUpdate = throttleFrame(onUpdate, win);
		this.observer = new win.ResizeObserver(() => this.scheduleUpdate());
		doc.addEventListener("scroll", this.scheduleUpdate, { capture: true, passive: true });
		win.addEventListener("resize", this.scheduleUpdate, { passive: true });
		win.addEventListener("focus", this.scheduleUpdate);
		this.watchResolution();
	}

	observe(element: HTMLElement): void {
		this.observer.observe(element);
	}

	unobserve(element: HTMLElement): void {
		this.observer.unobserve(element);
	}

	destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;
		this.scheduleUpdate.cancel();
		this.observer.disconnect();
		this.doc.removeEventListener("scroll", this.scheduleUpdate, { capture: true });
		this.ownerWindow.removeEventListener("resize", this.scheduleUpdate);
		this.ownerWindow.removeEventListener("focus", this.scheduleUpdate);
		this.resolutionQuery?.removeEventListener("change", this.onResolutionChange);
		this.resolutionQuery = null;
	}

	private readonly onResolutionChange = (): void => {
		if (this.destroyed) return;
		// Mac 内屏与外接屏的 DPR 可以不同；尺寸不变也必须重新光栅化 canvas。
		this.watchResolution();
		this.scheduleUpdate();
	};

	private watchResolution(): void {
		this.resolutionQuery?.removeEventListener("change", this.onResolutionChange);
		const win = this.ownerWindow;
		this.resolutionQuery = win.matchMedia(`(resolution: ${win.devicePixelRatio || 1}dppx)`);
		this.resolutionQuery.addEventListener("change", this.onResolutionChange);
	}
}
