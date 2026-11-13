// Node 中的 DOM 回归：布局数据由夹具提供，测试真实组件的事件与生命周期。
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildSync } from "esbuild";
import { Window, NodeFilter } from "happy-dom";

globalThis.NodeFilter = NodeFilter;
after(() => { delete globalThis.NodeFilter; });

const temporary = mkdtempSync(join(tmpdir(), "cbac-platform-"));
const source = (path) => fileURLToPath(new URL(path, import.meta.url));
const stub = join(temporary, "obsidian.ts");
writeFileSync(stub, `
export const getLanguage = () => "en";
export class PluginSettingTab {}
export class Plugin {
  cleanups = [];
  constructor(app) { this.app = app; }
  async loadData() { return null; }
  async saveData() {}
  registerEvent(ref) { this.cleanups.push(ref); }
  registerMarkdownPostProcessor(callback) { this.processor = callback; }
  addSettingTab() {}
}
`);
const bundle = join(temporary, "platform.cjs");
buildSync({
	stdin: { contents: [
		`export { default as Plugin } from ${JSON.stringify(source("../src/main.ts"))};`,
		...[
			"../src/platform/window-context.ts", "../src/platform/wheel-steps.ts",
			"../src/minimap/code-minimap.ts", "../src/settings.ts",
		].map((path) => `export * from ${JSON.stringify(source(path))};`),
	].join("\n"), resolveDir: temporary },
	alias: { obsidian: stub }, bundle: true, platform: "node", format: "cjs", outfile: bundle,
});
const { Plugin, WindowContext, WheelSteps, CodeMinimap, DEFAULT_SETTINGS } = await import(pathToFileURL(bundle).href);
after(() => rmSync(temporary, { recursive: true, force: true }));

const migrations = new WeakMap();
function fixture(t, dpr = 1) {
	const win = new Window({ width: 1200, height: 800 });
	t.after(() => win.happyDOM.abort());
	const frames = new Map();
	let frame = 0;
	win.requestAnimationFrame = (callback) => { frames.set(++frame, callback); return frame; };
	win.cancelAnimationFrame = (id) => frames.delete(id);
	const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach((callback) => callback(0)); };
	Object.defineProperty(win, "devicePixelRatio", { value: dpr, writable: true });
	const queries = [];
	win.matchMedia = (media) => {
		const query = new win.EventTarget();
		query.media = media;
		query.matches = false;
		queries.push(query);
		return query;
	};
	const observers = [];
	win.ResizeObserver = class {
		observed = new Set();
		constructor(callback) { this.callback = callback; observers.push(this); }
		observe(element) { this.observed.add(element); }
		unobserve(element) { this.observed.delete(element); }
		disconnect() { this.observed.clear(); }
	};
	const createEl = function(tag, options = {}) {
		const doc = this.nodeType === 9 ? this : this.ownerDocument;
		const element = doc.createElement(tag);
		if (options.cls) element.className = options.cls;
		if (options.text) element.textContent = options.text;
		if (this.nodeType !== 9) this.appendChild(element);
		return element;
	};
	for (const prototype of [win.Document.prototype, Object.getPrototypeOf(win.document), win.HTMLElement.prototype]) {
		prototype.createEl = createEl;
		prototype.createDiv = function(options) { return createEl.call(this, "div", options); };
		prototype.createSpan = function(options) { return createEl.call(this, "span", options); };
	}
	win.HTMLElement.prototype.empty = function() { this.replaceChildren(); };
	win.HTMLElement.prototype.onWindowMigrated = function(callback) {
		migrations.set(this, callback);
		return () => migrations.delete(this);
	};
	win.HTMLElement.prototype.setPointerCapture = function(id) { this.captured = id; };
	win.HTMLElement.prototype.releasePointerCapture = function() { this.captured = null; };
	win.HTMLCanvasElement.prototype.getContext = () => ({ setTransform() {}, clearRect() {}, fillRect() {}, fillText() {} });
	const size = (element, values) => Object.entries(values).forEach(([name, value]) => {
		Object.defineProperty(element, name, { configurable: true, value });
	});
	const rect = { top: 0, bottom: 500, height: 500, left: 0, right: 120, width: 120 };
	win.HTMLElement.prototype.getBoundingClientRect = () => rect;
	size(win.document.body, { clientHeight: 500, scrollHeight: 5000 });
	win.document.body.scrollTo = (options) => { win.document.body.lastScroll = options; };
	return { win, doc: win.document, frames, flush, queries, observers, size };
}

function minimap(t, settings = {}) {
	const f = fixture(t);
	const wrapper = f.doc.createDiv();
	const pre = wrapper.createEl("pre");
	const code = pre.createEl("code");
	code.style.lineHeight = "21px";
	code.style.fontSize = "14px";
	code.textContent = Array.from({ length: 150 }, (_, index) => `const line${index} = ${index};`).join("\n");
	f.doc.body.appendChild(wrapper);
	f.size(wrapper, { clientWidth: 600 });
	f.size(pre, { scrollHeight: 3150, clientHeight: 210 });
	const host = {
		settings: { ...DEFAULT_SETTINGS, ...settings }, collapsed: true, widths: [], expansions: 0,
		isCollapsed() { return this.collapsed; }, getPreviewHeight() { return 210; },
		expand() { this.collapsed = false; this.expansions++; },
		getScrollContainer: () => f.doc.body,
		requestWidth(width, persist) { this.widths.push({ width, persist }); },
	};
	const component = new CodeMinimap(host, wrapper, pre, code);
	component.setContent(code.textContent);
	component.update();
	t.after(() => component.destroy());
	const element = wrapper.querySelector(".code-block-auto-collapse__minimap");
	const pointer = (type, options = {}) => element.dispatchEvent(new f.win.PointerEvent(type, {
		bubbles: true, cancelable: true, pointerId: 1, button: 0, clientX: 60, clientY: 100, ...options,
	}));
	return { ...f, wrapper, component, element, host, pointer };
}

test("popout frames run even when the main window does not flush", (t) => {
	const main = fixture(t), popout = fixture(t);
	let updates = 0;
	const a = new WindowContext(main.doc, () => assert.fail("Main window must not update"));
	const b = new WindowContext(popout.doc, () => updates++);
	t.after(() => { a.destroy(); b.destroy(); });
	popout.doc.dispatchEvent(new popout.win.Event("scroll"));
	popout.win.dispatchEvent(new popout.win.Event("resize"));
	assert.equal(popout.frames.size, 1);
	popout.flush();
	assert.equal(updates, 1);
	assert.equal(main.frames.size, 0);
	assert.equal(popout.observers.length, 1);
});

test("moving between Retina and external displays repaints and re-arms the DPR query", (t) => {
	const f = fixture(t, 2);
	let updates = 0;
	const context = new WindowContext(f.doc, () => updates++);
	t.after(() => context.destroy());
	const previous = f.queries[0];
	f.win.devicePixelRatio = 1;
	previous.dispatchEvent(new f.win.Event("change"));
	assert.equal(f.queries.at(-1).media, "(resolution: 1dppx)");
	f.flush();
	assert.equal(updates, 1);
	previous.dispatchEvent(new f.win.Event("change"));
	assert.equal(f.frames.size, 0, "Old DPR listener must be removed");
});

test("closing a context cancels pending frames, observers and all event listeners", (t) => {
	const f = fixture(t);
	const context = new WindowContext(f.doc, () => assert.fail("Closed context updated"));
	context.observe(f.doc.body);
	context.scheduleUpdate();
	context.destroy(); context.destroy();
	f.doc.dispatchEvent(new f.win.Event("scroll"));
	f.win.dispatchEvent(new f.win.Event("resize"));
	f.win.dispatchEvent(new f.win.Event("focus"));
	f.queries[0].dispatchEvent(new f.win.Event("change"));
	assert.equal(f.frames.size, 0);
	assert.equal(f.observers[0].observed.size, 0);
});

test("fractional trackpad deltas accumulate and direction changes immediately", () => {
	const steps = new WheelSteps();
	assert.equal(steps.consume(8, 0), 0);
	assert.equal(steps.consume(8, 0), 0);
	assert.equal(steps.consume(8, 0), 1);
	steps.consume(12, 0);
	assert.equal(steps.consume(-24, 0), -1);
	assert.equal(steps.consume(3, 1), 3);
	assert.equal(steps.consume(1, 2), 9);
	assert.equal(steps.consume(Number.NaN, 0), 0);
});

test("Control-click and a lone pointerup do not expand code", (t) => {
	const f = minimap(t, { jumpOn: "up" });
	f.pointer("pointerdown", { ctrlKey: true });
	f.pointer("pointerup", { ctrlKey: true });
	f.pointer("pointerup");
	assert.equal(f.host.expansions, 0);
});

test("pointer cancellation and lost capture never jump or leave a stale drag", (t) => {
	const f = minimap(t, { jumpOn: "up" });
	f.pointer("pointerdown"); f.pointer("pointercancel"); f.pointer("pointerup");
	assert.equal(f.host.expansions, 0);
	f.pointer("pointerdown", { clientX: 1 });
	assert(f.element.classList.contains("is-resizing"));
	f.pointer("lostpointercapture");
	assert(!f.element.classList.contains("is-resizing"));
	assert.equal(f.host.widths.at(-1).persist, true);
});

test("a valid release expands code; destroy cancels the queued navigation", (t) => {
	const f = minimap(t, { jumpOn: "up" });
	f.pointer("pointerdown"); f.pointer("pointerup");
	assert.equal(f.host.expansions, 1);
	f.component.destroy();
	assert.equal(f.frames.size, 0);
	assert.equal(f.doc.body.lastScroll, undefined);
});

test("canvas backing size follows the owning window DPR", (t) => {
	const f = minimap(t);
	f.win.devicePixelRatio = 2;
	f.flush();
	const canvas = f.wrapper.querySelector("canvas");
	assert.equal(canvas.width, 240);
	f.win.devicePixelRatio = 1;
	f.component.update(); f.flush();
	assert.equal(canvas.width, 120);
});

test("pinch and horizontal wheel gestures remain native while a preview is visible", (t) => {
	const f = minimap(t, { wheelMoveCodeLens: true });
	f.component.lens.show(["a", "b", "c"], 1, 100);
	for (const options of [{ deltaY: 20, ctrlKey: true }, { deltaX: 30, deltaY: 2 }]) {
		const event = new f.win.WheelEvent("wheel", { cancelable: true, ...options });
		// Happy DOM 的 WheelEvent 暂未实现 MouseEvent 的修饰键字段。
		Object.defineProperty(event, "ctrlKey", { value: options.ctrlKey ?? false });
		f.element.dispatchEvent(event);
		assert.equal(event.defaultPrevented, false);
	}
});

test("window migration cancels old frames and renders on the new window", (t) => {
	const f = minimap(t), other = fixture(t, 2);
	other.doc.body.appendChild(other.doc.adoptNode(f.wrapper));
	f.component.refreshWindow();
	assert.equal(f.frames.size, 0);
	assert(other.frames.size > 0);
	other.flush();
	assert.equal(f.wrapper.querySelector("canvas").width, 240);
});

test("plugin reload finds existing popouts, migrates observations and releases closed documents", async (t) => {
	const main = fixture(t), popout = fixture(t);
	globalThis.window = main.win; globalThis.document = main.doc;
	t.after(() => { delete globalThis.window; delete globalThis.document; });
	const root = popout.doc.createDiv({ cls: "markdown-preview-view" });
	root.innerHTML = "<pre><code>a\nb\nc\nd\ne</code></pre>";
	popout.doc.body.appendChild(root);
	const handlers = new Map();
	const workspace = {
		on(name, callback) { handlers.set(name, callback); return () => handlers.delete(name); },
		onLayoutReady(callback) { callback(); },
		iterateAllLeaves(callback) { callback({ view: { getViewType: () => "markdown", containerEl: popout.doc.body } }); },
	};
	const plugin = new Plugin({ workspace });
	await plugin.onload();
	const wrapper = root.querySelector(".code-block-auto-collapse");
	assert(wrapper);
	assert.equal(plugin.windows.size, 2);
	assert(popout.observers[0].observed.has(wrapper));
	main.doc.body.appendChild(main.doc.adoptNode(wrapper));
	migrations.get(wrapper)(main.win);
	assert(!popout.observers[0].observed.has(wrapper));
	assert(main.observers[0].observed.has(wrapper));
	handlers.get("window-close")(null, popout.win);
	assert.equal(plugin.windows.size, 1);
	plugin.onunload(); plugin.cleanups.forEach((cleanup) => cleanup());
	assert.equal(plugin.windows.size, 0);
	assert.equal(plugin.views.size, 0);
	assert.equal(migrations.has(wrapper), false);
	assert(main.doc.querySelector("pre"));
});
