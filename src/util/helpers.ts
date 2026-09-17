/** 通用工具：数值约束、节流、DOM 度量。 */

/** 把数值限制在闭区间内，非有限值回落到下界。 */
export function clamp(value: number, min: number, max: number): number {
	if (!Number.isFinite(value)) return min;
	if (value < min) return min;
	if (value > max) return max;
	return value;
}

/** 把任意输入转成有限数值，失败时使用兜底值。 */
export function toNumber(value: unknown, fallback: number): number {
	const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
	return Number.isFinite(parsed) ? parsed : fallback;
}

/** 可取消的调用器。 */
export interface Cancellable {
	(): void;
	cancel(): void;
}

/** 额外支持立即结算的调用器，用于卸载时把待执行的调用补上。 */
export interface Schedulable extends Cancellable {
	/** 立即执行尚未触发的调用；当前没有待执行的调用时什么都不做。 */
	flush(): void;
}

/** 延迟执行，重复调用会重置计时。 */
export function debounce(fn: () => void, wait: number, ownerWindow: Window): Schedulable {
	let handle: number | null = null;
	const invoke = (): void => {
		handle = null;
		fn();
	};
	const debounced = ((): void => {
		if (handle !== null) ownerWindow.clearTimeout(handle);
		handle = ownerWindow.setTimeout(invoke, wait);
	}) as Schedulable;
	debounced.cancel = (): void => {
		if (handle !== null) {
			ownerWindow.clearTimeout(handle);
			handle = null;
		}
	};
	debounced.flush = (): void => {
		if (handle === null) return;
		ownerWindow.clearTimeout(handle);
		invoke();
	};
	return debounced;
}

/** 每帧最多执行一次，用于滚动等高频事件。 */
export function throttleFrame(fn: () => void, ownerWindow: Window): Cancellable {
	let handle: number | null = null;
	const invoke = (): void => {
		handle = null;
		fn();
	};
	const throttled = ((): void => {
		if (handle !== null) return;
		handle = ownerWindow.requestAnimationFrame(invoke);
	}) as Cancellable;
	throttled.cancel = (): void => {
		if (handle !== null) {
			ownerWindow.cancelAnimationFrame(handle);
			handle = null;
		}
	};
	return throttled;
}

/** 编译用户输入的正则，非法时返回 null。 */
export function safeRegex(pattern: string): RegExp | null {
	try {
		return new RegExp(pattern, "u");
	} catch {
		try {
			return new RegExp(pattern);
		} catch {
			return null;
		}
	}
}

/** 取元素所属窗口的 computed style，兼容弹出窗口。 */
export function computedStyle(element: Element): CSSStyleDeclaration {
	const view = element.ownerDocument.defaultView;
	return (view ?? window).getComputedStyle(element);
}

/** 滚动容器的可视区域，坐标与 getBoundingClientRect 一致。 */
export interface ClientRect {
	top: number;
	bottom: number;
	height: number;
}

/**
 * 计算滚动容器的可视区域。
 * 根元素（html/body）代表窗口本身，此时可视区域就是视口。
 */
export function clientRectOf(container: HTMLElement, ownerWindow: Window): ClientRect {
	const doc = container.ownerDocument;
	if (container === doc.documentElement || container === doc.body) {
		const height = ownerWindow.innerHeight || doc.documentElement.clientHeight;
		return { top: 0, bottom: height, height };
	}
	const rect = container.getBoundingClientRect();
	const top = rect.top + container.clientTop;
	const height = container.clientHeight;
	return { top, bottom: top + height, height };
}

/** 容器可滚动的最大 scrollTop。 */
export function maxScrollTop(container: HTMLElement): number {
	return Math.max(0, container.scrollHeight - container.clientHeight);
}

/** 占位用的空实现，便于字段先初始化、onload 时再替换。 */
export function noopSchedulable(): Schedulable {
	const fn = ((): void => undefined) as Schedulable;
	fn.cancel = (): void => undefined;
	fn.flush = (): void => undefined;
	return fn;
}
