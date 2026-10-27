import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "prepare-hml-promotion.mjs");
function git(cwd, ...args) {
	return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}
function put(root, name, body) {
	const file = path.join(root, name);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, body);
}
test("promotes code and changed/new WebP while stripping modified and new PNG originals", () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "promotion-git-"));
	try {
		const seed = path.join(root, "seed");
		const remote = path.join(root, "remote.git");
		const work = path.join(root, "work");
		fs.mkdirSync(seed);
		git(seed, "init", "-b", "main");
		git(seed, "config", "user.email", "test@example.com");
		git(seed, "config", "user.name", "Test");
		put(seed, ".gitignore", "public/generated/\n");
		put(seed, "imagedata/cards/hero.png", "old master");
		put(seed, "assets/webp/cards/hero.webp", "old webp");
		put(seed, "game.txt", "base");
		git(seed, "add", ".");
		git(seed, "commit", "-m", "Initial");
		git(seed, "branch", "dev");
		git(seed, "branch", "hml");
		git(root, "init", "--bare", "-b", "main", remote);
		git(seed, "remote", "add", "origin", remote);
		git(seed, "push", "origin", "main", "dev", "hml");
		git(root, "clone", remote, work);
		git(work, "config", "user.email", "test@example.com");
		git(work, "config", "user.name", "Test");
		git(work, "switch", "hml");
		fs.rmSync(path.join(work, "imagedata"), { recursive: true });
		put(work, ".gitignore", "public/generated/\nimagedata/\n");
		git(work, "add", "-A");
		git(work, "commit", "-m", "Exclude PNG masters from hml");
		git(work, "push", "origin", "hml");
		git(work, "switch", "dev");
		put(work, "imagedata/cards/hero.png", "updated master");
		put(work, "imagedata/cards/new.png", "new master");
		put(work, "assets/webp/cards/hero.webp", "new optimized webp");
		put(work, "assets/webp/cards/new.webp", "new webp");
		put(work, "game.txt", "updated game");
		git(work, "add", "-A");
		git(work, "commit", "-m", "New art and gameplay");
		git(work, "push", "origin", "dev");
		const result = spawnSync(process.execPath, [script], { cwd: work, encoding: "utf8" });
		assert.equal(result.status, 0, result.stderr || result.stdout);
		assert.match(result.stdout, /promotion_changed=true/u);
		assert.equal(git(work, "branch", "--show-current"), "promotion/dev-to-hml");
		assert.equal(git(work, "ls-files", "--", "imagedata"), "");
		assert.equal(git(work, "diff", "--name-only", "origin/dev", "--", "assets/webp"), "");
		assert.equal(fs.readFileSync(path.join(work, "game.txt"), "utf8"), "updated game");
		assert.equal(git(work, "rev-list", "--parents", "-n", "1", "HEAD").split(" ").length, 3);
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
});
