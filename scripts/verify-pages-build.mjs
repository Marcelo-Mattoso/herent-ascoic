import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const dist = path.resolve("dist");
const base = process.argv.includes("--base")
	? process.argv[process.argv.indexOf("--base") + 1]
	: "/";
assert.ok(base?.startsWith("/") && base.endsWith("/"), "Base inválida");

const file = (relativePath) => {
	const target = path.resolve(dist, relativePath);
	assert.ok(target.startsWith(`${dist}${path.sep}`), `Path fora do build: ${relativePath}`);
	assert.ok(fs.statSync(target).isFile(), `Arquivo ausente: ${relativePath}`);
	return target;
};

const html = fs.readFileSync(file("index.html"), "utf8");
file(".nojekyll");
for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
	const url = match[1];
	if (!url.startsWith("/")) continue;
	assert.ok(url.startsWith(base), `URL fora do caminho-base: ${url}`);
	file(decodeURIComponent(url.slice(base.length)));
}

for (const kind of ["boards", "backcards", "cards", "ui"]) {
	const manifest = JSON.parse(fs.readFileSync(file(`generated/${kind}/manifest.json`), "utf8"));
	const entries = manifest.boards ?? manifest.backCards ?? manifest.cards ?? manifest.assets;
	assert.ok(Array.isArray(entries) && entries.length > 0, `Manifesto vazio: ${kind}`);
	for (const entry of entries) {
		assert.ok(entry.url.startsWith(`/generated/${kind}/assets/`), `URL inválida: ${entry.url}`);
		file(decodeURIComponent(entry.url.slice(1)));
	}
}

assert.equal(fs.readFileSync(file("rules/ascensao-heroica-manual.pdf")).subarray(0, 4).toString(), "%PDF");
console.log(`Build íntegro para base ${base}`);
