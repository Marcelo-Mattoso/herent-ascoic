#!/usr/bin/env node
// Generates a merge commit on a temporary branch off hml. Never touches dev/hml/main.
// All conflicts outside imagedata/ abort the promotion; masters are always removed.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, appendFileSync } from "node:fs";

const temporaryBranch = "promotion/dev-to-hml";
const remote = "origin";
const source = "origin/dev";
const target = "origin/hml";

function git(...args) {
	return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
function attempt(...args) {
	return spawnSync("git", args, { encoding: "utf8" });
}
function output(changed) {
	if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, "changed=" + String(changed) + "\n");
	console.log("promotion_changed=" + changed);
}
function main() {
	if (git("status", "--porcelain")) throw new Error("The checkout must be clean before promotion.");
	git("fetch", "--no-tags", remote,
		"+refs/heads/dev:refs/remotes/origin/dev",
		"+refs/heads/hml:refs/remotes/origin/hml");
	if (attempt("merge-base", "--is-ancestor", source, target).status === 0) {
		console.log("hml already includes all dev commits. Nothing to promote.");
		output(false);
		return;
	}
	git("switch", "-C", temporaryBranch, target);
	const merge = attempt("merge", "--no-commit", "--no-ff", source);
	const mergeHead = git("rev-parse", "--git-path", "MERGE_HEAD");
	if (!existsSync(mergeHead)) {
		throw new Error("Merge did not start: " + (merge.stderr || merge.stdout));
	}
	const unmerged = git("ls-files", "-u", "-z")
		.split("\0").filter(Boolean)
		.map((line) => line.slice(line.indexOf("\t") + 1));
	const unexpected = [...new Set(unmerged.filter((file) => !file.startsWith("imagedata/")))];
	if (unexpected.length) {
		throw new Error("Manual merge required outside image masters: " + unexpected.join(", "));
	}
	// Resolves modify/delete conflicts and removes newly added PNGs too.
	const drop = attempt("rm", "-r", "-f", "--ignore-unmatch", "--", "imagedata");
	if (drop.status !== 0) throw new Error("Cannot strip PNG masters: " + drop.stderr);
	if (git("ls-files", "-u", "-z")) throw new Error("Unresolved merge conflicts remain.");
	if (git("ls-files", "--", "imagedata")) throw new Error("PNG masters leaked into promotion.");
	if (attempt("check-ignore", "--no-index", "-q", "imagedata/example.png").status !== 0) {
		throw new Error("Target must ignore imagedata/.");
	}
	// Never allow a stale WebP from hml to silently override an updated dev WebP.
	const webpDifference = git("diff", "--name-only", source, "--", "assets/webp");
	if (webpDifference) throw new Error("WebP differs from dev: " + webpDifference);
	if (attempt("diff", "--quiet", target, "--").status === 0) {
		console.log("The sanitized release tree already matches hml.");
		output(false);
		return;
	}
	git("-c", "user.name=github-actions[bot]",
		"-c", "user.email=41898282+github-actions[bot]@users.noreply.github.com",
		"commit", "-m", "chore(hml): promote dev with WebP only");
	console.log("Promotion commit: " + git("rev-parse", "HEAD"));
	output(true);
}
try {
	main();
} catch (error) {
	console.error(error);
	process.exitCode = 1;
}
