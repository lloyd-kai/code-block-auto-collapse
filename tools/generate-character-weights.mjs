// 从 CodeGlance Pro 的 CharacterWeight.kt 生成 src/render/character-weights.ts。
//
// CodeGlancePro 用 Courier 字体测量每个 ASCII 字符上半 / 下半的墨迹覆盖率，
// 生成静态权重表（见其 core/src/main/python/CharacterWeight.py）。
// 这里直接解析上游 Kotlin 源码，保证数值与参考实现逐位一致，
// 避免手工誊写引入误差。运行：node tools/generate-character-weights.mjs
//
// 上游源码不在本仓库内（体积大且与本插件无关），需要时按下述命令临时克隆：
//   git clone --depth 1 https://github.com/Nasller/CodeGlancePro.git _CodeGlancePro
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const UPSTREAM_REPO = "https://github.com/Nasller/CodeGlancePro.git";
const REFERENCE_DIR = "_CodeGlancePro";
const REFERENCE_FILE =
	"src/main/kotlin/com/nasller/codeglance/render/CharacterWeight.kt";
const source = resolve(root, REFERENCE_DIR, REFERENCE_FILE);
const target = resolve(root, "src/render/character-weights.ts");

if (!existsSync(source)) {
	console.error(
		[
			`找不到上游源码：${source}`,
			"",
			"该文件属于参考实现仓库，默认不随本仓库分发。请先克隆：",
			`  git clone --depth 1 ${UPSTREAM_REPO} ${REFERENCE_DIR}`,
			"",
			"权重表 src/render/character-weights.ts 已提交到仓库，",
			"日常开发无需重新生成；只有在需要复核数值时才跑这个脚本。",
		].join("\n")
	);
	process.exit(1);
}

const text = readFileSync(source, "utf8");
const [bottomSection, topSection] = text.split("fun getTopWeight");
if (!topSection) throw new Error("未找到 getTopWeight，请检查上游文件是否变更");

const parse = (section) => {
	const table = new Map();
	for (const match of section.matchAll(/(\d+)\s*->\s*return\s+([0-9.]+)f/g)) {
		table.set(Number(match[1]), Number(match[2]));
	}
	return table;
};

const bottom = parse(bottomSection);
const top = parse(topSection);

const FIRST = 33;
const LAST = 126;
const values = (table) => {
	const out = [];
	for (let code = FIRST; code <= LAST; code += 1) {
		if (!table.has(code)) throw new Error(`缺少字符 ${code} 的权重`);
		out.push(table.get(code));
	}
	return out;
};

const format = (list) => {
	const rows = [];
	for (let i = 0; i < list.length; i += 8) {
		const chunk = list.slice(i, i + 8);
		rows.push("\t" + chunk.map((value) => value.toFixed(4)).join(", ") + ",");
	}
	return rows.join("\n");
};

const output = `// 本文件由 tools/generate-character-weights.mjs 生成，请勿手工修改。
// 数据来源：CodeGlance Pro 上游仓库（https://github.com/Nasller/CodeGlancePro）
//          src/main/kotlin/com/nasller/codeglance/render/CharacterWeight.kt
// 含义：Courier 字体下每个 ASCII 字符上半 / 下半的墨迹覆盖率（0..1），
// 用于 Accurate 渲染风格把字符还原成接近真实文本的纹理。

export const FIRST_CHAR_CODE = ${FIRST};
export const LAST_CHAR_CODE = ${LAST};

/** 表外字符（含中文、制表符等）使用的兜底权重，与参考实现一致。 */
export const DEFAULT_WEIGHT = 0.4;

const TOP_WEIGHTS: readonly number[] = [
${format(values(top))}
];

const BOTTOM_WEIGHTS: readonly number[] = [
${format(values(bottom))}
];

function lookup(table: readonly number[], code: number): number {
	const index = code - FIRST_CHAR_CODE;
	return index >= 0 && index < table.length ? table[index] : DEFAULT_WEIGHT;
}

/** 字符上半部分的墨迹权重。 */
export function topWeight(code: number): number {
	return lookup(TOP_WEIGHTS, code);
}

/** 字符下半部分的墨迹权重。 */
export function bottomWeight(code: number): number {
	return lookup(BOTTOM_WEIGHTS, code);
}
`;

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, output, "utf8");
console.log(`已生成 ${target}（top ${top.size} 项 / bottom ${bottom.size} 项）`);
