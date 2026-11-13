import { existsSync } from "node:fs";
import { copyFile, lstat, mkdir, readFile, realpath, rename, rm } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runtimeFiles = ["main.js", "manifest.json", "styles.css"];
const inside = (parent, child) => {
	const path = relative(parent, child);
	return path === "" || (!isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`));
};

/** 只安装三个运行时文件；data.json 和笔记由用户保留。 */
export async function installLocal(vaultPath, source = root) {
	if (!vaultPath) throw new Error('Usage: npm run install:local -- --vault "/path/to/My Vault"');
	const vault = await realpath(resolve(vaultPath));
	const config = join(vault, ".obsidian");
	if (!existsSync(config)) throw new Error("The vault must already contain an .obsidian directory. Open it in Obsidian first.");
	if (!(await lstat(config)).isDirectory()) throw new Error(".obsidian must be a directory, not a symbolic link");
	const manifest = JSON.parse(await readFile(join(source, "manifest.json"), "utf8"));
	if (!/^[a-z0-9-]+$/.test(manifest.id)) throw new Error("Invalid plugin ID");
	for (const name of runtimeFiles) {
		if (!(await lstat(join(source, name))).isFile()) throw new Error(`Missing build file: ${name}`);
	}
	const plugins = join(config, "plugins");
	await mkdir(plugins, { recursive: true });
	if (!inside(vault, await realpath(plugins))) throw new Error("The plugin directory resolves outside the vault");
	const destination = join(plugins, manifest.id);
	await mkdir(destination, { recursive: true });
	if ((await lstat(destination)).isSymbolicLink() || !inside(vault, await realpath(destination))) {
		throw new Error("The plugin destination must be a real directory inside the vault");
	}
	for (const name of runtimeFiles) {
		const target = join(destination, name);
		if (existsSync(target) && (await lstat(target)).isSymbolicLink()) throw new Error(`Refusing symbolic link: ${target}`);
	}
	for (const name of runtimeFiles) {
		const temporary = join(destination, `.${name}.${process.pid}.tmp`);
		try {
			await copyFile(join(source, name), temporary);
			await rename(temporary, join(destination, name));
		} finally {
			await rm(temporary, { force: true });
		}
	}
	return destination;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	const args = process.argv.slice(2);
	try {
		if (args.length !== 2 || args[0] !== "--vault") throw new Error('Usage: npm run install:local -- --vault "/path/to/My Vault"');
		const destination = await installLocal(args[1]);
		console.log(`Installed main.js, manifest.json and styles.css in ${destination}`);
		console.log("Reload the plugin in Obsidian. Existing settings are preserved.");
	} catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	}
}
