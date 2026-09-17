// 本环境 git 陷阱的守门脚本。
//
// 背景（已实测复现，3/3 稳定）：
// 在 WorkBuddy 的 Bash 沙箱里，用托管版 PortableGit（2.55.0.windows.3，
// /mingw64/bin/git）操作**工作区内**的仓库时，git 会「静默地」写不进带斜杠的
// ref：退出码 0、没有任何输出，但 .git/refs/heads/feature/x 根本不存在。
// 同一份命令在 %TEMP% 下、或换成系统安装的 Git for Windows 2.43（/d/Git/cmd/git）
// 就完全正常。两个 git 的差别在 MSYS 运行时创建目录用的系统调用，沙箱只拦住了
// 新版那个 —— 所以这是环境策略的漏洞，不是仓库或代码的问题。
//
// 三个已经踩过的坑都由它引起：
//   1. `git checkout -b feature/x` 打印 "Switched to a new branch"，但 ref 没落盘，
//      HEAD 指向 unborn 分支；接着 `git commit` 报 "does not have any commits yet"，
//      改动全卡在暂存区，看起来像「提交成功但历史里没有」。
//   2. `git merge` 在工作区脏时走 autostash，而 `git stash` 会**先把工作区回退**，
//      再写 stash 记录；记录写不进去时，未提交的改动直接消失（实测还伴随 .git 被清空）。
//   3. 切换分支时 git 会把**整个目录**从工作区删掉，而不是只删那个真正有差异的文件。
//      实测两次：main / develop 的 .github/ 文件集合不同 → 整个 .github/ 消失；
//      bugfix 分支多一个 tools/git-guard.mjs → 整个 tools/ 消失，连两个分支里完全
//      一样的文件也一起没了。`git status` 里是一串 ` D`，用 `git checkout -- <目录>`
//      就能恢复。所以只要工作区出现「已跟踪文件被删」，就值得立刻停下来查。
//
// 受影响范围（工作区内 + 托管 git）：refs/heads/<a>/<b>、refs/remotes/origin/*、
// refs/tags/<a>/<b>。不受影响：refs/heads/<单层名>、refs/stash、ORIG_HEAD。
//
// 本脚本做两件事：
//   node tools/git-guard.mjs --diagnose        逐个探测候选 git，报告当前目录下哪个可用
//   node tools/git-guard.mjs <git 参数...>      用可用的 git 执行，并在执行后校验结果
//
// 探测只动 ref，不碰工作区，且一定会把探针 ref 删掉。
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** 探针 ref：名字里带斜杠才能触发这个陷阱，前缀一眼能看出是临时产物。 */
const PROBE_REF = "refs/heads/cbac-env-probe/x";

/**
 * 候选 git，按「先系统安装、后 PATH」排序。
 * PATH 上的 git 在这个环境里恰好是坏的那个，所以放最后。
 */
const CANDIDATES = [
	process.env.CBAC_GIT,
	"D:/Git/cmd/git.exe",
	"C:/Program Files/Git/cmd/git.exe",
	"git",
].filter((value) => typeof value === "string" && value.length > 0);

function run(git, args, options = {}) {
	return spawnSync(git, args, {
		cwd: repoRoot,
		encoding: "utf8",
		stdio: options.inherit ? "inherit" : "pipe",
		windowsHide: true,
	});
}

function versionOf(git) {
	const result = run(git, ["--version"]);
	if (result.error || result.status !== 0) return null;
	return (result.stdout ?? "").trim();
}

function gitDirOf(git) {
	const result = run(git, ["rev-parse", "--absolute-git-dir"]);
	if (result.error || result.status !== 0) return null;
	return (result.stdout ?? "").trim();
}

/**
 * 探测一个 git 能不能在当前目录写出带斜杠的 ref。
 * 只创建再删除一个 ref，不动工作区、不动 HEAD。
 */
function probe(git) {
	const gitDir = gitDirOf(git);
	if (!gitDir) return { ok: false, reason: "不是 git 仓库，或该 git 无法读取仓库" };

	const head = run(git, ["rev-parse", "--verify", "--quiet", "HEAD"]);
	if (head.status !== 0) {
		return { ok: false, reason: "仓库还没有提交，HEAD 无法解析，无法探测" };
	}
	const sha = (head.stdout ?? "").trim();

	run(git, ["update-ref", PROBE_REF, sha]);
	// 直接看磁盘：陷阱的表现就是「命令成功但文件不存在」，
	// 用 rev-parse 复核会走同一套读取逻辑，不如看文件本身直接。
	const refFile = join(gitDir, ...PROBE_REF.split("/"));
	const onDisk = existsSync(refFile);
	const seen = run(git, ["rev-parse", "--verify", "--quiet", PROBE_REF]).status === 0;

	// 无论如何都尝试删掉探针；写不进去时删除是空操作，无害。
	run(git, ["update-ref", "-d", PROBE_REF]);

	return { ok: onDisk && seen, onDisk, seen, refFile };
}

function diagnose() {
	console.log(`仓库根目录：${repoRoot}`);
	console.log(`探针 ref：  ${PROBE_REF}\n`);

	const usable = [];
	for (const git of CANDIDATES) {
		const version = versionOf(git);
		if (!version) {
			console.log(`  [跳过] ${git} —— 不可执行`);
			continue;
		}
		const result = probe(git);
		if (result.ok) {
			usable.push(git);
			console.log(`  [可用] ${git}  (${version})`);
		} else {
			console.log(`  [危险] ${git}  (${version})`);
			console.log(`         斜杠 ref 写不进磁盘${result.reason ? ` —— ${result.reason}` : ""}`);
			if (result.refFile) console.log(`         期望落盘位置：${result.refFile}`);
		}
	}

	console.log("");
	if (usable.length === 0) {
		console.error("没有任何可用的 git：当前目录下所有候选都会静默丢失带斜杠的 ref。");
		console.error("不要在此环境下执行 checkout -b / branch / merge / fetch，会丢改动。");
		process.exitCode = 1;
		return;
	}
	console.log(`建议使用：${usable[0]}`);
	console.log("用 `node tools/git-guard.mjs <参数>` 代替直接调 git，可自动选它并校验结果。");
}

/**
 * 只读子命令：它们不会写 ref，即使 git 有陷阱也能安全执行。
 * 故意列得保守 —— 拿不准的一律当写操作处理。
 */
const READ_ONLY_COMMANDS = new Set([
	"status", "log", "diff", "show", "rev-parse", "for-each-ref", "ls-files", "ls-tree",
	"cat-file", "shortlog", "describe", "blame", "grep", "whatchanged", "name-rev",
	"merge-base", "count-objects", "version", "help", "check-ignore", "verify-commit",
]);

function isReadOnly(args) {
	for (const arg of args) {
		if (arg.startsWith("-")) continue;
		return READ_ONLY_COMMANDS.has(arg);
	}
	return false;
}

/**
 * 删除 / 移动类选项：出现它们时，参数里的名字是「执行后不该存在」的 ref，
 * 不能拿去做「必须存在」的校验。
 */
const DESTRUCTIVE_FLAGS = new Set(["-d", "-D", "-m", "-M", "--delete", "--move"]);

/** 从参数里挑出这条命令「本应创建」的 ref，用于执行后校验。 */
function expectedRefs(args) {
	const refs = [];
	const take = (index) => {
		const value = args[index + 1];
		if (value && !value.startsWith("-")) refs.push(value);
	};
	for (let index = 0; index < args.length; index++) {
		const arg = args[index];
		if (DESTRUCTIVE_FLAGS.has(arg)) return [];
		if (arg === "-b" || arg === "-B" || arg === "-c" || arg === "-C" || arg === "--create" || arg === "--orphan") {
			take(index);
			continue;
		}
		if (arg === "branch" || arg === "tag") {
			// `git branch` 可能跟一串选项，取第一个非选项参数当分支名
			for (let next = index + 1; next < args.length; next++) {
				if (!args[next].startsWith("-")) {
					refs.push(args[next]);
					break;
				}
			}
			continue;
		}
		if (arg === "update-ref" || arg === "symbolic-ref") {
			take(index);
		}
	}
	return refs;
}

/** 执行后校验：ref 真的存在、HEAD 不是 unborn。 */
function verifyAfter(git, args, beforeHead) {
	const problems = [];

	for (const name of expectedRefs(args)) {
		// 允许简写：先按原样找，再试 refs/heads/ 与 refs/tags/ 前缀
		const found = [name, `refs/heads/${name}`, `refs/tags/${name}`].some(
			(candidate) => run(git, ["rev-parse", "--verify", "--quiet", candidate]).status === 0
		);
		if (!found) problems.push(`ref「${name}」执行后并不存在 —— 这条命令的写入被静默丢弃了`);
	}

	// HEAD 必须是能解析的提交（unborn 分支是陷阱 1 的典型表现）
	if (run(git, ["rev-parse", "--verify", "--quiet", "HEAD"]).status !== 0) {
		const branch = run(git, ["symbolic-ref", "--quiet", "HEAD"]);
		const name = branch.status === 0 ? (branch.stdout ?? "").trim() : "HEAD";
		if (name !== beforeHead) {
			problems.push(`HEAD 现在指向 ${name}，但该 ref 无法解析（unborn 分支）—— 后续 commit 会失败`);
		}
	}

	return problems;
}

function currentHead(git) {
	const result = run(git, ["symbolic-ref", "--quiet", "HEAD"]);
	return result.status === 0 ? (result.stdout ?? "").trim() : "";
}

/**
 * 会重写工作区的子命令。切换分支后出现「已跟踪文件被删」一定是陷阱而不是意图：
 * 分支切换会同时更新 HEAD 和索引，正常结果在 status 里是空的。
 */
const WORKTREE_COMMANDS = new Set([
	"checkout", "switch", "merge", "pull", "rebase", "cherry-pick", "revert", "reset",
]);

function touchesWorktree(args) {
	for (const arg of args) {
		if (arg.startsWith("-")) continue;
		return WORKTREE_COMMANDS.has(arg);
	}
	return false;
}

/** 工作区里有没有「已跟踪文件被删」。有就说明沙箱把整个目录删掉了。 */
function verifyWorktree(git) {
	const result = run(git, ["status", "--porcelain"]);
	if (result.status !== 0) return [];
	const deleted = (result.stdout ?? "")
		.split("\n")
		.filter((line) => /^ D /.test(line))
		.map((line) => line.slice(3).trim());
	if (deleted.length === 0) return [];

	// 恢复要按目录来 —— 被删的往往是整个目录，而不是这几个文件
	const dirs = [...new Set(deleted.map((path) => (path.includes("/") ? path.split("/")[0] : path)))];
	return [
		`工作区里这些已跟踪文件被删掉了：${deleted.join("、")}`,
		`沙箱在切换分支时会把整个目录删掉，用 \`git checkout -- ${dirs.join(" ")}\` 恢复`,
	];
}

/** 挑第一个「能用」的 git；requireProbe 为真时必须通过斜杠 ref 探测。 */
function pickGit(requireProbe) {
	for (const candidate of CANDIDATES) {
		if (!versionOf(candidate)) continue;
		if (!requireProbe) return candidate;
		if (probe(candidate).ok) return candidate;
	}
	return null;
}

function main() {
	const args = process.argv.slice(2);

	if (args.length === 0 || args[0] === "--diagnose") {
		diagnose();
		return;
	}

	const readOnly = isReadOnly(args);
	const git = pickGit(!readOnly);
	if (!git) {
		console.error("没有可用的 git：所有候选都会静默丢失带斜杠的 ref，已拒绝执行。");
		console.error("先跑 `npm run git:check` 看诊断结果。");
		process.exitCode = 1;
		return;
	}

	const beforeHead = readOnly ? "" : currentHead(git);
	const result = run(git, args, { inherit: true });
	if (result.error) {
		console.error(`执行失败：${result.error.message}`);
		process.exitCode = 1;
		return;
	}

	// 只有「git 自己说成功」才需要复核 —— 退出码非 0 时错误信息已经打出来了，
	// 那不是静默失败，不该再报一次沙箱的账。
	const problems =
		readOnly || result.status !== 0
			? []
			: [...verifyAfter(git, args, beforeHead), ...(touchesWorktree(args) ? verifyWorktree(git) : [])];
	if (problems.length > 0) {
		console.error("");
		console.error("⚠️  git 命令返回了成功，但结果不对：");
		for (const problem of problems) console.error(`   - ${problem}`);
		console.error("   这是沙箱静默丢弃写入的典型表现，请勿继续提交或合并。");
		console.error(`   换用：${git} 之外再试 \`npm run git:check\`；必要时在无沙箱环境下重跑。`);
		process.exitCode = 1;
		return;
	}

	process.exitCode = result.status ?? 0;
}

main();
