// 纯逻辑冒烟测试：几何映射、文本解析、字符权重表。
// 这些模块不依赖 DOM，可以直接在 Node 里跑，用来守住重构后的关键换算。
// 运行：node tools/smoke-test.mjs
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import esbuild from "esbuild";

// 转路径一律走 fileURLToPath / pathToFileURL，不要手写 `new URL(...).pathname`。
// Windows 下 pathname 是 `/C:/Users/...`，砍掉首斜杠碰巧还是绝对路径，本地全绿；
// Linux 下是 `/home/runner/work/...`，砍掉首斜杠就成了不以 ./ 开头的裸说明符，
// esbuild 会当包名去 node_modules 里找，直接 "Could not resolve" 报错退出。
// 这个差异曾在 CI 上让 npm test 挂掉（同一份代码本地 38/38 通过）。
const srcPath = (relative) => fileURLToPath(new URL(relative, import.meta.url));

const tempDir = mkdtempSync(join(tmpdir(), "cbac-smoke-"));
const entry = join(tempDir, "entry.ts");
writeFileSync(
	entry,
	[
		`export * from ${JSON.stringify(srcPath("../src/minimap/geometry.ts"))};`,
		`export * from ${JSON.stringify(srcPath("../src/util/text.ts"))};`,
		`export * from ${JSON.stringify(srcPath("../src/render/character-weights.ts"))};`,
	].join("\n"),
	"utf8"
);

const outfile = join(tempDir, "bundle.cjs");
esbuild.buildSync({
	entryPoints: [entry],
	bundle: true,
	format: "cjs",
	platform: "node",
	target: "es2020",
	outfile,
	logLevel: "warning",
});

// 同理：`file://${path}` 拼出来的 URL 在 Windows 上会变成 file://C:/...（少一个斜杠、
// 且盘符被当成主机名）。pathToFileURL 两个平台都对。
const mod = await import(pathToFileURL(outfile).href);

let failures = 0;
let checks = 0;
const check = (name, condition, detail = "") => {
	checks += 1;
	if (!condition) {
		failures += 1;
		console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
	}
};
const near = (name, actual, expected, tolerance = 1e-6) =>
	check(name, Math.abs(actual - expected) <= tolerance, `实际 ${actual}，期望 ${expected}`);

/* ---------- 文本解析 ---------- */
const crlf = mod.parseCodeText("a\r\nbb\r\n");
check("CRLF 行数", crlf.lines.length === 2, `实际 ${crlf.lines.length}`);
check("CRLF 去掉回车", crlf.lines[1] === "bb", JSON.stringify(crlf.lines[1]));
const leading = mod.parseCodeText("\nfoo\nbar");
check("忽略首行换行", leading.lines.length === 2 && leading.lines[0] === "foo");
const tabs = mod.parseCodeText("\ta\tb");
near("TAB 计为 4 列", tabs.maxColumns, 1 + 4 + 4 + 1);
near("行首偏移", tabs.lineOffsets[0], 0);
const multi = mod.parseCodeText("one\ntwo\nthree");
check("多行偏移", multi.lineOffsets[1] === 4 && multi.lineOffsets[2] === 8);
near("countLines 末行换行", mod.countLines("a\nb\n"), 2);
near("countLines 空串", mod.countLines(""), 1);

/* ---------- 几何：Proportional ---------- */
const base = {
	lineCount: 1000,
	lineHeight: 21,
	pixelsPerLine: 4,
	mode: "proportional",
	maxHeight: 900,
	blockHeight: 1000 * 21,
	visibleTop: 0,
	visibleHeight: 800,
	forceFit: false,
};
const top = mod.computeGeometry(base);
near("Proportional 文档高度", top.documentHeight, 4000);
near("Proportional 画布高度", top.canvasHeight, 900);
near("Proportional 行距", top.rowPitch, 4);
near("Proportional 每行一组", top.linesPerRow, 1);
near("Proportional 行数", top.rowCount, 1000);
near("顶部窗口起点", top.windowStart, 0);
near("顶部视窗高度", top.viewportHeight, (800 * 4000) / 21000);
check("视窗不越界", top.viewportStart >= 0 && top.viewportStart + top.viewportHeight <= top.documentHeight + 1e-6);

const bottom = mod.computeGeometry({ ...base, visibleTop: 20200 });
check("滚动到底部窗口跟随", bottom.windowStart > 0, `实际 ${bottom.windowStart}`);
check(
	"视窗始终落在窗口内",
	bottom.viewportStart >= bottom.windowStart - 1e-6 &&
		bottom.viewportStart + bottom.viewportHeight <= bottom.windowStart + bottom.canvasHeight + 1e-6
);

const middle = mod.computeGeometry({ ...base, visibleTop: 10500 });
check("中段窗口跟随", middle.windowStart > 0 && middle.windowStart < 4000 - 900);

/* ---------- 几何：Fit ---------- */
const fit = mod.computeGeometry({ ...base, mode: "fit" });
near("Fit 压缩到可用高度", fit.canvasHeight, 900);
near("Fit 文档高度", fit.documentHeight, 900);
near("Fit 行距", fit.pitch, 0.9);
near("Fit 两行一组", fit.linesPerRow, 2);
near("Fit 行数减半", fit.rowCount, 500);
near("Fit 权重行数", fit.weightCount, 2);

/* ---------- 行 ↔ 坐标 ---------- */
const line = 250;
const docY = mod.docYOfLine(line, top);
near("行转坐标", docY, 1000);
near("坐标转行", mod.lineAtDocY(docY + 1, top), line);
near("坐标转行（Fit 取组中间）", mod.lineAtDocY(mod.docYOfLine(250, fit) + 0.5, fit), 251);
check("行号被限制在范围内", mod.lineAtDocY(1e9, top) === 999 && mod.lineAtDocY(-100, top) === 0);

/* ---------- 极值 ---------- */
const empty = mod.computeGeometry({ ...base, lineCount: 0, blockHeight: 21 });
check("空文档不产生 NaN", Number.isFinite(empty.documentHeight) && Number.isFinite(empty.viewportStart));
const tiny = mod.computeGeometry({ ...base, lineCount: 3, blockHeight: 63, maxHeight: 900 });
near("短文档保持 1:1", tiny.pitch, 4);
near("短文档画布不小于下限", tiny.canvasHeight, mod.MIN_CANVAS_HEIGHT);
const huge = mod.computeGeometry({ ...base, lineCount: 100000, blockHeight: 100000 * 21 });
near("超长文档画布封顶", huge.canvasHeight, 900);
check("超长文档行距不小于 1", huge.rowPitch >= 1);

/* ---------- 字符权重表 ---------- */
near("'a' 上半权重", mod.topWeight(97), 0.2439, 1e-4);
near("'g' 下半权重", mod.bottomWeight(103), 0.9927, 1e-4);
near("表外字符兜底", mod.topWeight(20013), mod.DEFAULT_WEIGHT);
near("空格兜底", mod.bottomWeight(32), mod.DEFAULT_WEIGHT);

rmSync(tempDir, { recursive: true, force: true });
console.log(`冒烟测试完成：${checks - failures}/${checks} 通过`);
if (failures > 0) process.exitCode = 1;
