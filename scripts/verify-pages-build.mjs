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
		assert.ok(entry.fileName.endsWith(".webp"), `Not WebP: ${entry.fileName}`);
		const bytes = fs.readFileSync(file(decodeURIComponent(entry.url.slice(1))));
		assert.ok(bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP", `Invalid WebP: ${entry.fileName}`);
	}
}

const expansionConfig = JSON.parse(fs.readFileSync(path.resolve("assets/expansions/config.json"), "utf8"));
let openingScenes = 0;
for (const entry of expansionConfig.expansions) {
	if (!entry.enabled) continue;
	const packageDir = path.resolve("assets/expansions", entry.id);
	const pack = JSON.parse(fs.readFileSync(path.join(packageDir, "expansion.json"), "utf8"));
	for (const introPath of Object.values(pack.openings ?? {})) {
		const intro = JSON.parse(fs.readFileSync(path.join(packageDir, introPath), "utf8"));
		for (const scene of intro.scenes) {
			const relative = `${entry.id}/abertura/${scene.image}`;
			const built = fs.readFileSync(file(`generated/openings/assets/${relative}`));
			const source = fs.readFileSync(path.join(packageDir, "abertura", scene.image));
			assert.deepEqual(built, source, `Imagem da abertura divergente: ${relative}`);
			openingScenes++;
		}
	}
}

const musicManifest = JSON.parse(fs.readFileSync(file("generated/music/manifest.json"), "utf8"));
assert.equal(musicManifest.version, 1);
assert.equal(musicManifest.source, "sounds/music");
assert.ok(Array.isArray(musicManifest.tracks) && musicManifest.tracks.length > 0, "Playlist vazia");
const musicIds = new Set();
const musicFiles = new Set();
let musicBytes = 0;
for (const [order, track] of musicManifest.tracks.entries()) {
	assert.equal(track.order, order, `Ordem inválida: ${track.fileName}`);
	assert.ok(track.id && !musicIds.has(track.id), `ID de música duplicado: ${track.id}`);
	musicIds.add(track.id);
	assert.ok(track.fileName && !musicFiles.has(track.fileName), `Música duplicada: ${track.fileName}`);
	musicFiles.add(track.fileName);
	assert.ok(track.title && track.sizeBytes > 0, `Metadados inválidos: ${track.fileName}`);
	assert.ok(track.url.startsWith("/generated/music/assets/"), `URL inválida: ${track.url}`);
	const asset = file(decodeURIComponent(track.url.slice(1)));
	assert.equal(fs.statSync(asset).size, track.sizeBytes, `Tamanho divergente: ${track.fileName}`);
	const expectedMime = { mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav", m4a: "audio/mp4" }[track.format];
	assert.equal(track.mimeType, expectedMime, `Formato não suportado: ${track.fileName}`);
	musicBytes += track.sizeBytes;
}
const sourceMusic = [];
function scanMusic(dir) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) scanMusic(fullPath);
		else if (entry.isFile() && /\.(mp3|ogg|wav|m4a)$/i.test(entry.name))
			sourceMusic.push(path.relative(path.resolve("sounds/music"), fullPath).split(path.sep).join("/"));
	}
}
scanMusic(path.resolve("sounds/music"));
assert.deepEqual([...musicFiles].sort(), sourceMusic.sort(), "Playlist não corresponde aos arquivos originais");

const sfxNames = [
	"dice_launch", "dice_surface", "dice_collision", "dice_tumble", "dice_settle",
	"attack_whoosh", "attack_impact", "attack_defend", "attack_draw",
	"room_reveal", "enemy_reveal", "reward_gain", "heal_gain",
];
for (const name of sfxNames) {
	const built = fs.readFileSync(file(`generated/sfx/${name}.wav`));
	assert.equal(built.toString("ascii", 0, 4), "RIFF", `WAV inválido: ${name}`);
	assert.equal(built.toString("ascii", 8, 12), "WAVE", `WAV inválido: ${name}`);
	assert.deepEqual(built, fs.readFileSync(path.resolve(`sounds/sfx/${name}.wav`)), `Efeito divergente: ${name}`);
}

const localeManifest = JSON.parse(fs.readFileSync(file("generated/locales/manifest.json"), "utf8"));
assert.equal(localeManifest.version, 1);
const publishedCodes = fs.readdirSync("locales", { withFileTypes: true })
	.filter((entry) => entry.isDirectory())
	.filter((entry) => JSON.parse(fs.readFileSync(path.join("locales", entry.name, "meta.json"), "utf8")).status === "published")
	.map((entry) => entry.name).sort();
assert.deepEqual(localeManifest.locales.map((entry) => entry.code).sort(), publishedCodes, "Catálogo de idiomas publicados divergente");
const namespaces = fs.readdirSync("locales/pt-BR").filter((name) => name.endsWith(".json") && name !== "meta.json").map((name) => path.basename(name, ".json")).sort();
for (const locale of localeManifest.locales) {
	assert.deepEqual(Object.keys(locale.resources).sort(), namespaces, `Namespaces incompletos: ${locale.code}`);
	for (const url of Object.values(locale.resources)) {
		assert.ok(url.startsWith(`/generated/locales/${encodeURIComponent(locale.code)}/`), `URL de idioma inválida: ${url}`);
		assert.ok(fs.statSync(file(decodeURIComponent(url.slice(1)))).size > 0, `Recurso de idioma vazio: ${url}`);
	}
}

assert.equal(fs.readFileSync(file("rules/ascensao-heroica-manual.pdf")).subarray(0, 4).toString(), "%PDF");
console.log(`Build íntegro para base ${base}; ${openingScenes} cenas de abertura; ${musicManifest.tracks.length} músicas, ${(musicBytes / 1024 / 1024).toFixed(2)} MiB de áudio; ${publishedCodes.length} idioma(s) publicado(s)`);
