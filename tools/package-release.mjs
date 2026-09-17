// 把根目录的构建产物同步到 release/<pluginId>/，并打成发布 ZIP。
//
// 之所以要脚本化：手工复制时很容易忘记同步 release/，导致打出来的包
// 装着上一次构建的 main.js（早期版本就踩过一次）。这里强制「先读根目录
// 产物、再写 release/、再从同一份内存数据打 ZIP」，三者不可能不一致。
//
// 运行：npm run release（先 build，再跑本脚本）
// ZIP 条目路径用正斜杠（符合 APPNOTE 规范），层级为 <pluginId>/<file>。
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// crc32 是 Node 20.15 / 22.2 才加进 node:zlib 的导出。静态 import 在旧版 Node 上
// 会在模块解析期直接抛 SyntaxError（"does not provide an export named 'crc32'"），
// 看不出是版本问题；动态 import 只会得到 undefined，能给出可读的提示。
// 这是发版路径，报错必须直接告诉人该做什么。
const { crc32, deflateRawSync } = await import("node:zlib");
if (typeof crc32 !== "function" || typeof deflateRawSync !== "function") {
	console.error(`当前 Node ${process.version} 的 node:zlib 里没有 crc32 / deflateRawSync。`);
	console.error("打包 ZIP 需要 Node 20.15 或 22.2 及以上，升级 Node 后重跑 npm run release。");
	process.exit(1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

const pluginId = manifest.id;
const version = manifest.version;
if (pkg.version !== version) {
	console.warn(
		`警告：package.json 版本 ${pkg.version} 与 manifest.json 版本 ${version} 不一致`
	);
}

/** Obsidian 加载插件必需的三件套。 */
const FILES = ["main.js", "manifest.json", "styles.css"];

const releaseDir = join(root, "release", pluginId);
const zipPath = join(root, `${pluginId}-${version}.zip`);

/** 从根目录读取产物，同时写入 release/<pluginId>/。 */
function collect() {
	mkdirSync(releaseDir, { recursive: true });
	return FILES.map((name) => {
		const data = readFileSync(join(root, name));
		writeFileSync(join(releaseDir, name), data);
		return { path: `${pluginId}/${name}`, data };
	});
}

function dosDateTime(date) {
	const time =
		(date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
	const day =
		((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
	return { time, day };
}

function buildZip(entries) {
	const { time, day } = dosDateTime(new Date());
	const locals = [];
	const centrals = [];
	let offset = 0;

	const push = (name, data, isDir) => {
		const nameBuf = Buffer.from(name, "utf8");
		const crc = isDir ? 0 : crc32(data) >>> 0;
		const deflated = isDir ? Buffer.alloc(0) : deflateRawSync(data, { level: 9 });
		// 压缩没变小就退回 store，避免负收益
		const stored = isDir || deflated.length >= data.length;
		const body = isDir ? Buffer.alloc(0) : stored ? data : deflated;
		const method = stored ? 0 : 8;

		const local = Buffer.alloc(30);
		local.writeUInt32LE(0x04034b50, 0);
		local.writeUInt16LE(20, 4); // 解压所需版本
		local.writeUInt16LE(0x0800, 6); // 文件名为 UTF-8
		local.writeUInt16LE(method, 8);
		local.writeUInt16LE(time, 10);
		local.writeUInt16LE(day, 12);
		local.writeUInt32LE(crc, 14);
		local.writeUInt32LE(body.length, 18);
		local.writeUInt32LE(isDir ? 0 : data.length, 22);
		local.writeUInt16LE(nameBuf.length, 26);
		local.writeUInt16LE(0, 28);
		locals.push(local, nameBuf, body);

		const central = Buffer.alloc(46);
		central.writeUInt32LE(0x02014b50, 0);
		central.writeUInt16LE(20, 4); // 生成方版本
		central.writeUInt16LE(20, 6); // 解压所需版本
		central.writeUInt16LE(0x0800, 8);
		central.writeUInt16LE(method, 10);
		central.writeUInt16LE(time, 12);
		central.writeUInt16LE(day, 14);
		central.writeUInt32LE(crc, 16);
		central.writeUInt32LE(body.length, 20);
		central.writeUInt32LE(isDir ? 0 : data.length, 24);
		central.writeUInt16LE(nameBuf.length, 28);
		central.writeUInt16LE(0, 30); // extra
		central.writeUInt16LE(0, 32); // comment
		central.writeUInt16LE(0, 34); // 起始磁盘
		central.writeUInt16LE(0, 36); // 内部属性
		central.writeUInt32LE(((isDir ? 0o40755 : 0o100644) << 16) >>> 0, 38); // 外部属性
		central.writeUInt32LE(offset, 42);
		centrals.push(central, nameBuf);

		offset += local.length + nameBuf.length + body.length;
	};

	push(`${pluginId}/`, Buffer.alloc(0), true);
	for (const entry of entries) push(entry.path, entry.data, false);

	const centralBuf = Buffer.concat(centrals);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(0, 4);
	end.writeUInt16LE(0, 6);
	end.writeUInt16LE(entries.length + 1, 8);
	end.writeUInt16LE(entries.length + 1, 10);
	end.writeUInt32LE(centralBuf.length, 12);
	end.writeUInt32LE(offset, 16);
	end.writeUInt16LE(0, 20);

	return Buffer.concat([...locals, centralBuf, end]);
}

const entries = collect();
const archive = buildZip(entries);
writeFileSync(zipPath, archive);

const kb = (buffer) => (buffer.length / 1024).toFixed(1);
console.log(`已同步 ${entries.length} 个文件到 release/${pluginId}/`);
for (const entry of entries) {
	console.log(`  ${entry.path}  ${kb(entry.data)}kb`);
}
console.log(`已生成 ${pluginId}-${version}.zip（${kb(archive)}kb）`);
