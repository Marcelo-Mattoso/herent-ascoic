import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const groups = ["cards", "backcards", "boards", "ui"];

function listFiles(directory, root = directory) {
	if (!fs.existsSync(directory)) return [];
	return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const full = path.join(directory, entry.name);
		if (entry.isDirectory()) return listFiles(full, root);
		return [path.relative(root, full).split(path.sep).join("/")];
	});
}

export function verifyWebpAssets(root = process.cwd(), { release = false } = {}) {
	const directory = path.join(root, "assets", "webp");
	const catalogFile = path.join(directory, "catalog.json");
	const catalog = JSON.parse(fs.readFileSync(catalogFile, "utf8"));
	assert.equal(catalog.version, 1, "Unexpected WebP catalog version");
	assert.ok(catalog.entries && typeof catalog.entries === "object" && !Array.isArray(catalog.entries), "Invalid WebP catalog");
	const entries = Object.entries(catalog.entries);
	assert.ok(entries.length > 0, "Empty WebP catalog");
	const seen = new Set();
	let bytes = 0;
	for (const [key, meta] of entries) {
		assert.ok(/^(cards|backcards|boards|ui)\/[^\\/]+(?:\/[^\\/]+)*\.webp$/u.test(key), "Invalid WebP path: " + key);
		assert.ok(!key.split("/").includes(".."), "Unsafe WebP path: " + key);
		assert.ok(/^[0-9a-f]{64}$/u.test(meta.sha256), "Invalid source hash: " + key);
		assert.ok(meta.options && typeof meta.options === "object", "Missing compression options: " + key);
		const file = path.join(directory, ...key.split("/"));
		const body = fs.readFileSync(file);
		assert.equal(body.length, meta.bytes, "Mismatched WebP size: " + key);
		assert.equal(body.toString("ascii", 0, 4), "RIFF", "Invalid WebP RIFF header: " + key);
		assert.equal(body.toString("ascii", 8, 12), "WEBP", "Invalid WebP container: " + key);
		seen.add(key);
		bytes += body.length;
	}
	for (const group of groups) {
		assert.ok(entries.some(([key]) => key.startsWith(group + "/")), "Missing optimized group: " + group);
	}
	const actual = groups.flatMap((group) =>
		listFiles(path.join(directory, group)).map((file) => group + "/" + file),
	);
	assert.deepEqual(actual.sort(), [...seen].sort(), "Missing, obsolete or non-WebP files in optimized assets");
	if (release) {
		const tracked = execFileSync("git", ["ls-files", "--", "imagedata"], { cwd: root, encoding: "utf8" }).trim();
		assert.equal(tracked, "", "A release branch must never track imagedata PNG masters");
		const ignored = execFileSync("git", ["check-ignore", "--no-index", "imagedata/check.png"], { cwd: root, encoding: "utf8" }).trim();
		assert.ok(ignored, "Release branch must ignore imagedata/");
	}
	return { count: entries.length, bytes };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		const result = verifyWebpAssets(process.cwd(), { release: process.argv.includes("--release") });
		console.log("Verified " + result.count + " optimized WebP assets (" + (result.bytes / 1048576).toFixed(1) + " MiB)");
	} catch (error) {
		console.error(error);
		process.exitCode = 1;
	}
}
