import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installLocal } from "./install-local.mjs";

async function fixture(t) {
	const root = await mkdtemp(join(tmpdir(), "cbac-install-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const vault = join(root, "中文 My Vault"), source = join(root, "build");
	await mkdir(join(vault, ".obsidian"), { recursive: true });
	await mkdir(source);
	await writeFile(join(source, "manifest.json"), '{"id":"code-block-auto-collapse"}');
	await writeFile(join(source, "main.js"), "// build");
	await writeFile(join(source, "styles.css"), "/* styles */");
	return { root, vault, source };
}

test("installs in Unicode/space paths and preserves notes and settings on update", async (t) => {
	const { vault, source } = await fixture(t);
	await writeFile(join(vault, "Note.md"), "# My note");
	const destination = await installLocal(vault, source);
	await writeFile(join(destination, "data.json"), '{"previewLines":7}');
	await installLocal(vault, source);
	assert.equal(await readFile(join(destination, "main.js"), "utf8"), "// build");
	assert.equal(await readFile(join(destination, "data.json"), "utf8"), '{"previewLines":7}');
	assert.equal(await readFile(join(vault, "Note.md"), "utf8"), "# My note");
});

test("rejects a non-vault and an escaping plugin directory", async (t) => {
	const { root, vault, source } = await fixture(t);
	await assert.rejects(installLocal(root, source), /must already contain/);
	const external = join(root, "external"); await mkdir(external);
	await symlink(external, join(vault, ".obsidian", "plugins"), "dir");
	await assert.rejects(installLocal(vault, source), /outside the vault/);
});
