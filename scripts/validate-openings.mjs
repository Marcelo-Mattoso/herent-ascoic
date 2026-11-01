import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve("assets/expansions");
const config = JSON.parse(fs.readFileSync(path.join(root, "config.json"), "utf8"));
const locales = Object.fromEntries(
	["pt-BR", "en-US", "es-ES"].map((code) => [
		code,
		JSON.parse(fs.readFileSync(path.resolve("locales", code, "game.json"), "utf8")),
	]),
);

function hasTranslation(key) {
	assert.match(key, /^game:[A-Za-z0-9.]+$/);
	return Object.entries(locales).every(([code, catalog]) => {
		const value = key.slice(5).split(".").reduce((node, part) => node?.[part], catalog);
		assert.ok(typeof value === "string" && value.trim(), `Tradução ausente em ${code}: ${key}`);
		return true;
	});
}

let count = 0;
for (const entry of config.expansions) {
	if (!entry.enabled) continue;
	assert.match(entry.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
	const packageDir = path.join(root, entry.id);
	const pack = JSON.parse(fs.readFileSync(path.join(packageDir, "expansion.json"), "utf8"));
	assert.equal(pack.id, entry.id);
	for (const [bossId, introPath] of Object.entries(pack.openings ?? {})) {
		assert.match(introPath, /^abertura\/[a-z0-9-]+\.json$/);
		assert.ok(pack.cards.some((card) => card.id === bossId && card.type === "boss"), `Chefe ausente: ${bossId}`);
		const intro = JSON.parse(fs.readFileSync(path.join(packageDir, ...introPath.split("/")), "utf8"));
		assert.equal(intro.version, 1);
		assert.equal(intro.expansionId, entry.id);
		assert.equal(intro.bossId, bossId);
		assert.equal(intro.type, "prologue");
		assert.match(intro.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
		hasTranslation(intro.titleKey);
		if (intro.audio !== undefined) {
			assert.equal(typeof intro.audio, "object");
			assert.match(intro.audio.fileName, /^[\p{L}\p{N} _-]+\.mp3$/u);
			assert.ok(fs.existsSync(path.resolve("sounds/music", intro.audio.fileName)), `Música ausente: ${intro.audio.fileName}`);
			for (const key of ["title", "play", "pause", "volume", "blocked", "unavailable"]) hasTranslation(`game:opening.audio.${key}`);
		}
		assert.ok(Array.isArray(intro.scenes) && intro.scenes.length > 0);
		const ids = new Set();
		for (const scene of intro.scenes) {
			assert.match(scene.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
			assert.ok(!ids.has(scene.id), `Cena duplicada: ${scene.id}`);
			ids.add(scene.id);
			assert.match(scene.image, /^images\/[a-zA-Z0-9-]+\.webp$/);
			assert.ok(["none", "slow-zoom-in", "slow-zoom-out", "slow-pan-left", "slow-pan-right"].includes(scene.effect));
			assert.equal(scene.transition, "fade");
			assert.ok(Number.isInteger(scene.transitionMs) && scene.transitionMs >= 0 && scene.transitionMs <= 2000);
			hasTranslation(scene.textKey);
			const bytes = fs.readFileSync(path.join(packageDir, "abertura", ...scene.image.split("/")));
			assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
			assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
			count++;
		}
	}
}
console.log(`Aberturas válidas: ${count} cena(s).`);
