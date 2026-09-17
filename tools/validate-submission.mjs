// 提交到官方社区插件目录前的自动校验。
//
// 把 PLUGIN_DEVELOPMENT.md 第 13.4 节的检查清单变成可执行的断言，覆盖五类容易翻车的问题：
//   1. manifest.json 的字段约束（id/name/version/description 的官方硬性要求）；
//   2. 版本在 manifest / package / versions.json / ZIP 名之间的一致性；
//   3. 根目录构建产物、release/ 目录、ZIP 内的 main.js 是否真的是同一份，
//      以及 README 中英两半的版本引用是否都跟上了（只改一半是常见事故）；
//   4. 社区目录新流程的约束（main.js 不得进仓库、README 必须有披露章节、
//      package.json 必须有扫描器能识别的生产构建脚本）；
//   5. 发布工作流是否存在（打 tag 自动建 Release，官方推荐并启用产物溯源证明）。
//
// 运行：npm run validate（需先 npm run release 生成 ZIP）
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

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

/* ---------- git 跟踪状态查询 ---------- */

// 返回被 git 跟踪的路径列表；不是 git 仓库或环境里没有 git 时返回 null。
// 只读操作（ls-files），不会碰 .git 里的引用文件。
function gitTracked(names) {
	try {
		const out = execFileSync("git", ["ls-files", "--", ...names], {
			cwd: root,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		});
		return out
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean);
	} catch {
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
	if ((manifest.id ?? "").toLowerCase().endsWith("plugin")) {
		fail(`manifest.id 不能以 plugin 结尾，当前为 ${JSON.stringify(manifest.id)}`);
	}
	if (/obsidian|plugin/i.test(manifest.name ?? "")) {
		fail(`manifest.name 不应包含 Obsidian 或 plugin 字样，当前为 ${JSON.stringify(manifest.name)}`);
	}
	// 官方要求：只用基本拉丁字符，标点仅允许连字符、加号、括号。
	const pluginName = manifest.name ?? "";
	if (!/^[\x20-\x7E]+$/.test(pluginName)) {
		fail(`manifest.name 只能使用基本拉丁字符（ASCII），当前为 ${JSON.stringify(pluginName)}`);
	} else {
		const stray = pluginName.replace(/[A-Za-z0-9 +()-]/g, "");
		if (stray) {
			fail(
				`manifest.name 含不允许的字符 ${JSON.stringify(stray)}，` +
					"只允许字母、数字、空格、连字符、加号和括号"
			);
		}
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

	// fundingUrl 可以是单个 URL 字符串，也可以是「服务名 → URL」的对象（官方 Manifest 文档）。
	if (manifest.fundingUrl !== undefined) {
		const entries =
			typeof manifest.fundingUrl === "string"
				? [["fundingUrl", manifest.fundingUrl]]
				: typeof manifest.fundingUrl === "object" && manifest.fundingUrl !== null
					? Object.entries(manifest.fundingUrl)
					: null;
		if (entries === null) {
			fail("manifest.fundingUrl 只能是 URL 字符串，或「服务名 → URL」的对象");
		} else {
			for (const [key, value] of entries) {
				if (typeof value !== "string" || !/^https?:\/\//.test(value)) {
					fail(`manifest.fundingUrl 的 ${key} 不是 http(s) URL：${JSON.stringify(value)}`);
				}
			}
		}
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

const readmePath = join(root, "README.md");
const readme = existsSync(readmePath) ? readFileSync(readmePath, "utf8") : "";
if (readme.includes("YOUR_GITHUB_USERNAME")) {
	fail("README.md 仍是占位符，提交前必须替换成真实的 GitHub 用户名");
}
// 开发者政策：账号、付费、网络使用、vault 外文件访问、广告、遥测、闭源
// 每一项都要在 README 里写明（没有也要写「无」）。
if (readme && !/disclosur|披露/i.test(readme)) {
	fail("README.md 里找不到披露章节（Disclosures）。开发者政策要求逐项声明账号、付费、网络服务、vault 外文件访问、广告、遥测、闭源，没有也要写明「无」");
}

// README 有中英两半，版本号在两半各写一次。只改一半是很容易发生的事故 ——
// 中文半篇曾长期停在 1.0.0，还让读者去解压一个根本不存在的 ZIP。
// 两半都断言一遍，并把正文里出现的发布包名一起查掉。
if (readme && manifest) {
	const wanted = manifest.version;

	for (const [label, pattern] of [
		["英文半篇", /^\*\*Version (\d+\.\d+\.\d+)\*\*/m],
		["中文半篇", /^\*\*版本 (\d+\.\d+\.\d+)\*\*/m],
	]) {
		const found = readme.match(pattern);
		if (!found) {
			fail(`README.md 的${label}找不到版本行（形如 **Version ${wanted}** / **版本 ${wanted}**）`);
		} else if (found[1] !== wanted) {
			fail(`README.md 的${label}版本行写的是 ${found[1]}，应为 ${wanted} —— 版本提升时两半都要改`);
		}
	}

	for (const [, mentioned] of readme.matchAll(/code-block-auto-collapse-(\d+\.\d+\.\d+)\.zip/g)) {
		if (mentioned !== wanted) {
			fail(`README.md 引用了 code-block-auto-collapse-${mentioned}.zip，但当前版本是 ${wanted}`);
		}
	}
}

// 条目页会展示 README 的摘录，并把其中的相对链接与图片重写为指向仓库。
// 所以写错的相对路径不是「文档小瑕疵」，而是公开页面上的断链。
// 覆盖所有被跟踪的 .md：`.github/SECURITY.md` 曾经用 `README.md` 指自己所在目录，应为 `../README.md`。
const docFiles = gitTracked(["*.md"]);
if (docFiles === null) {
	warn("环境里没有 git，跳过文档相对链接检查");
} else {
	for (const file of docFiles) {
		const text = readFileSync(join(root, file), "utf8");
		for (const match of text.matchAll(/!?\[[^\]]*\]\(([^)\s]+?)\)/g)) {
			const target = match[1];
			if (/^(https?:|mailto:|#)/.test(target)) continue;
			const relative = decodeURIComponent(target.split("#")[0]);
			if (!relative) continue;
			if (!existsSync(resolve(root, dirname(file), relative))) {
				fail(`${file} 里的相对链接指向不存在的路径：${target}`);
			}
		}
	}
}

/* ---------- 4. 新流程约束（community.obsidian.md） ---------- */

// 社区目录的扫描器按顺序取第一个存在的构建命令。
const buildScript = ["build", "build:plugin", "compile"].find(
	(key) => typeof pkg?.scripts?.[key] === "string"
);
if (!buildScript) {
	fail("package.json 里没有 build / build:plugin / compile 脚本，社区目录的扫描器无法构建插件");
} else if (buildScript !== "build") {
	warn(`扫描器会优先使用 "${buildScript}" 而不是 "build"，确认它确实是生产构建命令`);
}

// 官方要求 main.js 只作为 Release 附件，不进仓库。其余几项是本地工作产物，
// 同样不该出现在公开仓库里；.gitignore 已经排除了它们，这里再断言一次 ——
// .gitignore 拦不住 `git add -f`，而误提交的东西一旦推上去就很难悄悄收回。
const localOnly = [
	["main.js", "官方要求 main.js 不进仓库，只作为 GitHub Release 附件分发"],
	["main.js.map", "构建产物"],
	["data.json", "插件写进 vault 的本地设置"],
	["_CodeGlancePro", "缩略图算法的参考实现，需要时临时克隆"],
	["_ref", "官方文档镜像与本地参考资料"],
	["release", "由 npm run release 生成"],
	["AGENTS.md", "给本地 AI 助手的工作交接说明"],
	["PLUGIN_SUBMISSION_ZH.md", "官方文档的中文整理稿，版权属 Obsidian"],
	[".workbuddy-ai", "本地助手的工作记忆"],
];
const tracked = gitTracked(localOnly.map(([name]) => name));
if (tracked === null) {
	warn("查不到 git 跟踪状态（不是 git 仓库或环境里没有 git），跳过「本地产物是否被误提交」检查");
} else {
	for (const [name, reason] of localOnly) {
		const hit = tracked.find((path) => path === name || path.startsWith(`${name}/`));
		if (hit) fail(`${hit} 被 git 跟踪了（${reason}），不应提交`);
	}
}

// 打 tag 自动建 Release 的工作流（官方文档推荐，并会生成产物溯源证明）。
const workflowPath = join(root, ".github", "workflows", "release.yml");
if (!existsSync(workflowPath)) {
	warn("缺少 .github/workflows/release.yml：目前只能手工建 Release，容易漏传附件或 tag 与版本对不上");
}

/* ---------- 5. 构建产物一致性 ---------- */

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

/* ---------- 6. 源码目录卫生 ---------- */

if (existsSync(join(root, "_CodeGlancePro"))) {
	warn("_CodeGlancePro/ 存在于仓库内，确认它已被 .gitignore 排除，不要提交");
}
if (existsSync(join(root, "_ref"))) {
	warn("_ref/ 存在于仓库内（官方文档镜像），确认它已被 .gitignore 排除，不要提交");
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
