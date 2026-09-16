// 提交到官方社区插件目录前的自动校验。
//
// 把 PLUGIN_DEVELOPMENT.md 第 13.4 节的检查清单变成可执行的断言，覆盖三类容易翻车的问题：
//   1. manifest.json 的字段约束（id/name/version/description 的官方硬性要求）；
//   2. 版本在 manifest / package / versions.json / ZIP 名之间的一致性；
//   3. 根目录构建产物、release/ 目录、ZIP 内的 main.js 是否真的是同一份。
//
// 运行：npm run validate（需先 npm run release 生成 ZIP）
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";
import { createHash } from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const warnings = [];

const fail = (message) => errors.push(message);
const warn = (message) => warnings.push(message);

function readJson(name) {
	const path = join(root, name);
	if (!existsSync(path)) {
		fail(`缺少 ${name}`);
		return null;
	}
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	} catch (error) {
		fail(`${name} 不是合法 JSON：${error.message}`);
		return null;
	}
}

/* ---------- 最小 ZIP 读取：列出条目 + 取出指定文件 ---------- */

function readCentralDirectory(buffer) {
	let eocd = -1;
	for (let i = buffer.length - 22; i >= 0; i -= 1) {
		if (buffer.readUInt32LE(i) === 0x06054b50) {
			eocd = i;
			break;
		}
	}
	if (eocd < 0) throw new Error("找不到 EOCD，不是有效的 ZIP");

	const total = buffer.readUInt16LE(eocd + 10);
	let offset = buffer.readUInt32LE(eocd + 16);
	const entries = [];
	for (let i = 0; i < total; i += 1) {
		if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("中央目录损坏");
		const nameLength = buffer.readUInt16LE(offset + 28);
		const extraLength = buffer.readUInt16LE(offset + 30);
		const commentLength = buffer.readUInt16LE(offset + 32);
		entries.push({
			name: buffer.toString("utf8", offset + 46, offset + 46 + nameLength),
			method: buffer.readUInt16LE(offset + 10),
			compressedSize: buffer.readUInt32LE(offset + 20),
			localOffset: buffer.readUInt32LE(offset + 42),
		});
		offset += 46 + nameLength + extraLength + commentLength;
	}
	return entries;
}

function extractEntry(buffer, entry) {
	const nameLength = buffer.readUInt16LE(entry.localOffset + 26);
	const extraLength = buffer.readUInt16LE(entry.localOffset + 28);
	const start = entry.localOffset + 30 + nameLength + extraLength;
	const raw = buffer.subarray(start, start + entry.compressedSize);
	return entry.method === 8 ? inflateRawSync(raw) : raw;
}

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

/* ---------- 1. manifest.json ---------- */

const manifest = readJson("manifest.json");
const pkg = readJson("package.json");
const versions = readJson("versions.json");

if (manifest) {
	const required = ["id", "name", "version", "minAppVersion", "description", "author", "isDesktopOnly"];
	for (const field of required) {
		if (manifest[field] === undefined) fail(`manifest.json 缺少必填字段 ${field}`);
	}

	if (!/^[a-z0-9-]+$/.test(manifest.id ?? "")) {
		fail(`manifest.id 只能是小写字母、数字和连字符，当前为 ${JSON.stringify(manifest.id)}`);
	}
	if ((manifest.id ?? "").includes("obsidian")) {
		fail("manifest.id 不能包含 obsidian");
	}
	if (/obsidian|plugin/i.test(manifest.name ?? "")) {
		fail(`manifest.name 不应包含 Obsidian 或 plugin 字样，当前为 ${JSON.stringify(manifest.name)}`);
	}
	if (!/^\d+\.\d+\.\d+$/.test(manifest.version ?? "")) {
		fail(`manifest.version 必须是三段式 SemVer 且只用数字和点，当前为 ${JSON.stringify(manifest.version)}`);
	}
	if (!/^\d+\.\d+\.\d+$/.test(manifest.minAppVersion ?? "")) {
		fail(`manifest.minAppVersion 必须是三段式版本号，当前为 ${JSON.stringify(manifest.minAppVersion)}`);
	}

	const description = manifest.description ?? "";
	if (description.length > 250) fail(`manifest.description 超过 250 字符（当前 ${description.length}）`);
	if (!description.endsWith(".")) fail("manifest.description 必须以句号结尾");
	// eslint-disable-next-line no-misleading-character-class
	if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u.test(description)) {
		fail("manifest.description 不能包含 emoji");
	}
	if (/^this is a plugin/i.test(description)) fail("manifest.description 不要以「this is a plugin」开头");

	if (manifest.fundingUrl === undefined) {
		// 不接受捐赠就不要写 fundingUrl，这里无需处理
	} else if (typeof manifest.fundingUrl !== "string") {
		warn("manifest.fundingUrl 建议写成单个字符串，多平台可用对象形式");
	}

	for (const field of ["author", "authorUrl"]) {
		if (typeof manifest[field] === "string" && manifest[field].includes("YOUR_GITHUB_USERNAME")) {
			fail(`manifest.${field} 仍是占位符，提交前必须替换成真实的 GitHub 用户名`);
		}
	}
}

/* ---------- 2. 版本一致性 ---------- */

if (manifest && pkg && manifest.version !== pkg.version) {
	fail(`package.json 版本 ${pkg.version} 与 manifest.json 版本 ${manifest.version} 不一致`);
}
if (manifest && versions && !versions[manifest.version]) {
	fail(`versions.json 缺少 ${manifest.version} 的条目`);
} else if (manifest && versions && versions[manifest.version] !== manifest.minAppVersion) {
	fail(
		`versions.json 中 ${manifest.version} 对应 ${versions[manifest.version]}，` +
			`与 manifest.minAppVersion ${manifest.minAppVersion} 不一致`
	);
}

/* ---------- 3. 必需文件 ---------- */

for (const name of ["README.md", "LICENSE", "manifest.json", "versions.json", "styles.css"]) {
	if (!existsSync(join(root, name))) fail(`仓库根目录缺少 ${name}`);
}
if (existsSync(join(root, "README.md"))) {
	const readme = readFileSync(join(root, "README.md"), "utf8");
	if (readme.includes("YOUR_GITHUB_USERNAME")) {
		fail("README.md 仍是占位符，提交前必须替换成真实的 GitHub 用户名");
	}
}

/* ---------- 4. 构建产物一致性 ---------- */

const pluginId = manifest?.id ?? "code-block-auto-collapse";
const version = manifest?.version ?? "0.0.0";
const runtimeFiles = ["main.js", "manifest.json", "styles.css"];
const rootMain = join(root, "main.js");
const releaseDir = join(root, "release", pluginId);
const zipPath = join(root, `${pluginId}-${version}.zip`);

if (!existsSync(rootMain)) {
	fail("根目录缺少 main.js，先跑 npm run build");
} else {
	for (const name of runtimeFiles) {
		const file = join(releaseDir, name);
		if (!existsSync(file)) {
			fail(`缺少 ${join("release", pluginId, name)}，先跑 npm run release`);
		}
	}
	if (existsSync(join(releaseDir, "main.js"))) {
		const a = readFileSync(rootMain);
		const b = readFileSync(join(releaseDir, "main.js"));
		if (sha256(a) !== sha256(b)) {
			fail("release/ 里的 main.js 与根目录构建产物不一致，说明发布目录落后于构建");
		}
	}
}

if (!existsSync(zipPath)) {
	fail(`缺少 ${pluginId}-${version}.zip，先跑 npm run release`);
} else {
	try {
		const buffer = readFileSync(zipPath);
		const entries = readCentralDirectory(buffer);
		const names = entries.map((entry) => entry.name);

		for (const name of runtimeFiles) {
			const wanted = `${pluginId}/${name}`;
			if (!names.includes(wanted)) fail(`ZIP 内缺少 ${wanted}（Obsidian 需要插件目录层级）`);
		}
		for (const name of names) {
			if (name.includes("\\")) fail(`ZIP 条目 ${name} 用了反斜杠，应为正斜杠`);
			if (name.includes("..")) fail(`ZIP 条目 ${name} 含 ..，存在目录穿越风险`);
		}

		const mainEntry = entries.find((entry) => entry.name === `${pluginId}/main.js`);
		if (mainEntry && existsSync(rootMain)) {
			const packed = extractEntry(buffer, mainEntry);
			if (sha256(packed) !== sha256(readFileSync(rootMain))) {
				fail("ZIP 内的 main.js 与根目录构建产物不一致，发布包装的是旧产物");
			}
		}
	} catch (error) {
		fail(`无法读取 ${pluginId}-${version}.zip：${error.message}`);
	}
}

/* ---------- 5. 源码目录卫生 ---------- */

if (existsSync(join(root, "_CodeGlancePro"))) {
	warn("_CodeGlancePro/ 存在于仓库内，确认它已被 .gitignore 排除，不要提交");
}
if (existsSync(join(root, "data.json"))) {
	warn("根目录有 data.json（插件本地设置），确认不要提交");
}

/* ---------- 输出 ---------- */

const size = (path) => (statSync(path).size / 1024).toFixed(1);
console.log(`校验目标：${pluginId} ${version}（最低 Obsidian ${manifest?.minAppVersion ?? "?"}）`);
if (existsSync(zipPath)) console.log(`发布包：${pluginId}-${version}.zip（${size(zipPath)}kb）`);
console.log("");

for (const message of warnings) console.log(`  ! ${message}`);
for (const message of errors) console.log(`  x ${message}`);

if (errors.length > 0) {
	console.log(`\n校验未通过：${errors.length} 个错误、${warnings.length} 个提醒`);
	process.exit(1);
}
console.log(`校验通过：0 个错误、${warnings.length} 个提醒`);
