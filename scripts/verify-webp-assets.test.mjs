import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { verifyWebpAssets } from "./verify-webp-assets.mjs";

function fixture(run) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "webp-assets-"));
	try {
		const entries = {};
		for (const group of ["cards", "backcards", "boards", "ui"]) {
			const name = group + "/sample.webp";
			const content = Buffer.concat([Buffer.from("RIFF"), Buffer.from([4, 0, 0, 0]), Buffer.from("WEBP"), Buffer.from("DATA")]);
			const dest = path.join(root, "assets", "webp", name);
			fs.mkdirSync(path.dirname(dest), { recursive: true });
			fs.writeFileSync(dest, content);
			entries[name] = { sha256: "a".repeat(64), options: { quality: 86 }, bytes: content.length };
		}
		const catalog = path.join(root, "assets", "webp", "catalog.json");
		fs.writeFileSync(catalog, JSON.stringify({ version: 1, entries }));
		run({ root, entries, catalog });
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
}
test("catalog with all required groups and WebP signatures passes", () => {
	fixture(({ root }) => assert.equal(verifyWebpAssets(root).count, 4));
});
test("a missing file is rejected", () => {
	fixture(({ root }) => {
		fs.rmSync(path.join(root, "assets/webp/cards/sample.webp"));
		assert.throws(() => verifyWebpAssets(root));
	});
});
test("a PNG masquerading as WebP is rejected", () => {
	fixture(({ root }) => {
		fs.writeFileSync(path.join(root, "assets/webp/cards/sample.webp"), "fake content size");
		assert.throws(() => verifyWebpAssets(root), /WebP|size/u);
	});
});
test("unindexed or unexpected files are rejected", () => {
	fixture(({ root }) => {
		fs.writeFileSync(path.join(root, "assets/webp/cards/extra.png"), "extra");
		assert.throws(() => verifyWebpAssets(root), /Missing, obsolete or non-WebP/u);
	});
});
