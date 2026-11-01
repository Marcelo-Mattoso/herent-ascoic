import fs from "node:fs";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import type { Plugin, ViteDevServer } from "vite";
import { configDefaults, defineConfig } from "vitest/config";

const boardSourceDir = path.resolve(__dirname, "assets/webp/boards");
const boardPublicDir = path.resolve(__dirname, "public/generated/boards");
const boardAssetDir = path.join(boardPublicDir, "assets");
const boardManifestPath = path.join(boardPublicDir, "manifest.json");
const backCardSourceDir = path.resolve(__dirname, "assets/webp/backcards");
const backCardPublicDir = path.resolve(__dirname, "public/generated/backcards");
const backCardAssetDir = path.join(backCardPublicDir, "assets");
const backCardManifestPath = path.join(backCardPublicDir, "manifest.json");
const cardSourceDir = path.resolve(__dirname, "assets/webp/cards");
const cardPublicDir = path.resolve(__dirname, "public/generated/cards");
const cardAssetDir = path.join(cardPublicDir, "assets");
const cardManifestPath = path.join(cardPublicDir, "manifest.json");
const uiAssetSourceDir = path.resolve(__dirname, "assets/webp/ui");
const uiAssetPublicDir = path.resolve(__dirname, "public/generated/ui");
const uiAssetDir = path.join(uiAssetPublicDir, "assets");
const uiAssetManifestPath = path.join(uiAssetPublicDir, "manifest.json");
const musicSourceDir = path.resolve(__dirname, "sounds/music");
const sfxSourceDir = path.resolve(__dirname, "sounds/sfx");
const sfxPublicDir = path.resolve(__dirname, "public/generated/sfx");
const musicPublicDir = path.resolve(__dirname, "public/generated/music");
const musicAssetDir = path.join(musicPublicDir, "assets");
const musicManifestPath = path.join(musicPublicDir, "manifest.json");
const localeSourceDir = path.resolve(__dirname, "locales");
const expansionSourceDir = path.resolve(__dirname, "assets/expansions");
const localePublicDir = path.resolve(__dirname, "public/generated/locales");
const musicMimeTypes: Record<string, string> = {
	".mp3": "audio/mpeg",
	".ogg": "audio/ogg",
	".wav": "audio/wav",
	".m4a": "audio/mp4",
};
const imageExtensions = new Set([
	".apng",
	".avif",
	".gif",
	".jpeg",
	".jpg",
	".png",
	".svg",
	".webp",
]);

interface BoardManifestEntry {
	readonly id: string;
	readonly name: string;
	readonly fileName: string;
	readonly url: string;
	readonly sizeBytes: number;
}

interface BoardManifest {
	readonly version: 1;
	readonly source: "imagedata/tabuleiros";
	readonly boards: readonly BoardManifestEntry[];
}

interface BackCardManifestEntry {
	readonly id: string;
	readonly fileName: string;
	readonly url: string;
	readonly sizeBytes: number;
}

interface BackCardManifest {
	readonly version: 1;
	readonly source: "imagedata/backcard";
	readonly backCards: readonly BackCardManifestEntry[];
}

interface CardImageManifestEntry {
	readonly id: string;
	readonly fileName: string;
	readonly url: string;
	readonly sizeBytes: number;
}

interface CardImageManifest {
	readonly version: 1;
	readonly source: "assets/expansions";
	readonly cards: readonly CardImageManifestEntry[];
}

interface UiAssetManifestEntry {
	readonly id: string;
	readonly name: string;
	readonly fileName: string;
	readonly url: string;
	readonly sizeBytes: number;
}

interface UiAssetManifest {
	readonly version: 1;
	readonly source: "imagedata/ui";
	readonly assets: readonly UiAssetManifestEntry[];
}

function toBoardId(relativeFile: string) {
	return relativeFile
		.replace(path.extname(relativeFile), "")
		.split(path.sep)
		.join("_")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-zA-Z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "")
		.toLowerCase();
}

function toBoardName(relativeFile: string) {
	const baseName = path.basename(relativeFile, path.extname(relativeFile));
	return baseName
		.replace(/[_-]+/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function toPublicUrl(
	kind: "boards" | "backcards" | "cards" | "ui" | "music",
	relativeFile: string,
) {
	return `/generated/${kind}/assets/${relativeFile
		.split(path.sep)
		.map((part) => encodeURIComponent(part))
		.join("/")}`;
}

function listImageFiles(dir: string): string[] {
	if (!fs.existsSync(dir)) return [];

	return fs
		.readdirSync(dir, { withFileTypes: true })
		.flatMap((entry) => {
			const fullPath = path.join(dir, entry.name);
			if (entry.isDirectory()) return listImageFiles(fullPath);
			if (!entry.isFile()) return [];
			return imageExtensions.has(path.extname(entry.name).toLowerCase())
				? [fullPath]
				: [];
		})
		.sort((a, b) => a.localeCompare(b));
}

function copyImageAsset(sourcePath: string, targetPath: string) {
	fs.mkdirSync(path.dirname(targetPath), { recursive: true });

	const sourceStat = fs.statSync(sourcePath);
	if (fs.existsSync(targetPath)) {
		const targetStat = fs.statSync(targetPath);
		const alreadyCurrent =
			targetStat.size === sourceStat.size &&
			targetStat.mtimeMs >= sourceStat.mtimeMs - 1000;
		if (alreadyCurrent) return;
	}

	try {
		fs.copyFileSync(sourcePath, targetPath);
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if ((code === "EBUSY" || code === "EPERM") && fs.existsSync(targetPath)) {
			return;
		}
		throw error;
	}
}

function pruneGeneratedImages(directory: string, validRelativeFiles: readonly string[]) {
	const keep = new Set(validRelativeFiles);
	if (!fs.existsSync(directory)) return;
	function visit(folder: string) {
		for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
			const fullPath = path.join(folder, entry.name);
			if (entry.isDirectory()) {
				visit(fullPath);
				if (fs.readdirSync(fullPath).length === 0) fs.rmdirSync(fullPath);
			} else if (!keep.has(path.relative(directory, fullPath).split(path.sep).join("/"))) {
				fs.rmSync(fullPath, { force: true });
			}
		}
	}
	visit(directory);
}

// Prevent old PNG copies from leaking into dist after switching to WebP.
function writeBoardManifest() {
	fs.mkdirSync(boardAssetDir, { recursive: true });

	const boards = listImageFiles(boardSourceDir).map((filePath) => {
		const relativeFile = path.relative(boardSourceDir, filePath);
		const targetPath = path.join(boardAssetDir, relativeFile);
		copyImageAsset(filePath, targetPath);

		return {
			id: toBoardId(relativeFile),
			name: toBoardName(relativeFile),
			fileName: relativeFile.split(path.sep).join("/"),
			url: toPublicUrl("boards", relativeFile),
			sizeBytes: fs.statSync(filePath).size,
		};
	});

	pruneGeneratedImages(boardAssetDir, boards.map((asset) => asset.fileName));

	const manifest: BoardManifest = {
		version: 1,
		source: "imagedata/tabuleiros",
		boards,
	};
	fs.writeFileSync(boardManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function writeBackCardManifest() {
	fs.mkdirSync(backCardAssetDir, { recursive: true });

	const backCards = listImageFiles(backCardSourceDir).map((filePath) => {
		const relativeFile = path.relative(backCardSourceDir, filePath);
		const targetPath = path.join(backCardAssetDir, relativeFile);
		copyImageAsset(filePath, targetPath);

		return {
			id: toBoardId(relativeFile),
			fileName: relativeFile.split(path.sep).join("/"),
			url: toPublicUrl("backcards", relativeFile),
			sizeBytes: fs.statSync(filePath).size,
		};
	});

	pruneGeneratedImages(backCardAssetDir, backCards.map((asset) => asset.fileName));

	const manifest: BackCardManifest = {
		version: 1,
		source: "imagedata/backcard",
		backCards,
	};
	fs.writeFileSync(
		backCardManifestPath,
		`${JSON.stringify(manifest, null, 2)}\n`,
	);
}

function writeCardImageManifest() {
	fs.mkdirSync(cardAssetDir, { recursive: true });
	const expansionRoot = path.resolve(__dirname, "assets/expansions");
	const config = JSON.parse(
		fs.readFileSync(path.join(expansionRoot, "config.json"), "utf8"),
	) as { version: number; expansions: Array<{ id: string; enabled: boolean }> };
	if (config.version !== 1 || !Array.isArray(config.expansions)) {
		throw new Error("Registro de expansões inválido");
	}
	const ids = new Set<string>();
	const cards: CardImageManifestEntry[] = [];
	for (const entry of config.expansions) {
		if (!entry.enabled) continue;
		if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id)) {
			throw new Error("ID de expansão inválido: " + entry.id);
		}
		const packageDir = path.join(expansionRoot, entry.id);
		const pack = JSON.parse(
			fs.readFileSync(path.join(packageDir, "expansion.json"), "utf8"),
		) as { id: string; cards: Array<{ id: string; image?: string }> };
		if (pack.id !== entry.id || !Array.isArray(pack.cards)) {
			throw new Error("Pacote inválido: " + entry.id);
		}
		for (const card of pack.cards) {
			if (ids.has(card.id)) throw new Error("ID de carta duplicado: " + card.id);
			ids.add(card.id);
			if (!card.image) continue;
			const relative = card.image.split("/");
			if (!/^images\/[^/]+\.webp$/.test(card.image)) {
				throw new Error("Imagem inválida para " + card.id);
			}
			const source = path.join(packageDir, ...relative);
			if (!fs.existsSync(source)) throw new Error("Imagem ausente: " + source);
			const fileName = [entry.id, ...relative].join("/");
			const target = path.join(cardAssetDir, ...fileName.split("/"));
			copyImageAsset(source, target);
			cards.push({
				id: card.id,
				fileName,
				url: toPublicUrl("cards", fileName),
				sizeBytes: fs.statSync(source).size,
			});
		}
	}
	pruneGeneratedImages(cardAssetDir, cards.map((card) => card.fileName));
	const manifest: CardImageManifest = {
		version: 1,
		source: "assets/expansions",
		cards,
	};
	fs.writeFileSync(cardManifestPath, JSON.stringify(manifest, null, 2) + "\n");
}

function writeUiAssetManifest() {
	fs.mkdirSync(uiAssetDir, { recursive: true });

	const assets = listImageFiles(uiAssetSourceDir).map((filePath) => {
		const relativeFile = path.relative(uiAssetSourceDir, filePath);
		const targetPath = path.join(uiAssetDir, relativeFile);
		copyImageAsset(filePath, targetPath);

		return {
			id: toBoardId(relativeFile),
			name: toBoardName(relativeFile),
			fileName: relativeFile.split(path.sep).join("/"),
			url: toPublicUrl("ui", relativeFile),
			sizeBytes: fs.statSync(filePath).size,
		};
	});

	pruneGeneratedImages(uiAssetDir, assets.map((asset) => asset.fileName));

	const manifest: UiAssetManifest = {
		version: 1,
		source: "imagedata/ui",
		assets,
	};
	fs.writeFileSync(
		uiAssetManifestPath,
		`${JSON.stringify(manifest, null, 2)}\n`,
	);
}

function listMusicFiles(dir: string): string[] {
	if (!fs.existsSync(dir)) return [];
	return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) return listMusicFiles(fullPath);
		return entry.isFile() && musicMimeTypes[path.extname(entry.name).toLowerCase()]
			? [fullPath]
			: [];
	}).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function writeMusicManifest() {
	fs.rmSync(musicPublicDir, { recursive: true, force: true });
	fs.mkdirSync(musicAssetDir, { recursive: true });
	const ids = new Set<string>();
	const tracks = listMusicFiles(musicSourceDir).map((filePath, order) => {
		const relativeFile = path.relative(musicSourceDir, filePath);
		const id = toBoardId(relativeFile);
		if (ids.has(id)) throw new Error(`ID de música duplicado: ${id}`);
		ids.add(id);
		const targetPath = path.join(musicAssetDir, relativeFile);
		fs.mkdirSync(path.dirname(targetPath), { recursive: true });
		fs.copyFileSync(filePath, targetPath);
		return {
			id,
			title: path.basename(relativeFile, path.extname(relativeFile)).replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim(),
			fileName: relativeFile.split(path.sep).join("/"),
			url: toPublicUrl("music", relativeFile),
			format: path.extname(filePath).slice(1).toLowerCase(),
			mimeType: musicMimeTypes[path.extname(filePath).toLowerCase()],
			sizeBytes: fs.statSync(filePath).size,
			order,
		};
	});
	fs.writeFileSync(musicManifestPath, `${JSON.stringify({ version: 1, source: "sounds/music", tracks }, null, 2)}\n`);
}

function writeSfxAssets() {
	fs.rmSync(sfxPublicDir, { recursive: true, force: true });
	fs.mkdirSync(sfxPublicDir, { recursive: true });
	if (!fs.existsSync(sfxSourceDir)) return;
	for (const file of fs.readdirSync(sfxSourceDir)) {
		if (!file.endsWith(".wav")) continue;
		fs.copyFileSync(path.join(sfxSourceDir, file), path.join(sfxPublicDir, file));
	}
}

function writeLocaleAssets() {
	fs.rmSync(localePublicDir, { recursive: true, force: true });
	fs.mkdirSync(localePublicDir, { recursive: true });
	const namespaces = fs.readdirSync(path.join(localeSourceDir, "pt-BR"))
		.filter((file) => file.endsWith(".json") && file !== "meta.json")
		.map((file) => path.basename(file, ".json"))
		.sort();
	const locales = fs.readdirSync(localeSourceDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => ({ code: entry.name, meta: JSON.parse(fs.readFileSync(path.join(localeSourceDir, entry.name, "meta.json"), "utf8")) }))
		.filter(({ meta }) => meta.status === "published")
		.map(({ code, meta }) => {
			const resources: Record<string, string> = {};
			for (const namespace of namespaces) {
				const fileName = `${namespace}.json`;
				const source = path.join(localeSourceDir, code, fileName);
				const target = path.join(localePublicDir, code, fileName);
				fs.mkdirSync(path.dirname(target), { recursive: true });
				fs.copyFileSync(source, target);
				resources[namespace] = `/generated/locales/${encodeURIComponent(code)}/${fileName}`;
			}
			return { code, name: meta.name, nativeName: meta.nativeName, direction: meta.direction, resources };
		});
	fs.writeFileSync(path.join(localePublicDir, "manifest.json"), `${JSON.stringify({ version: 1, locales }, null, 2)}\n`);
}

function writeAssetManifests() {
	// Copy optimized WebP only. Encoding is a separate incremental dev step.
	writeBoardManifest();
	writeBackCardManifest();
	writeCardImageManifest();
	writeUiAssetManifest();
	writeMusicManifest();
	writeSfxAssets();
	writeLocaleAssets();
}

function watchAssetSources(server: ViteDevServer) {
	if (fs.existsSync(boardSourceDir)) server.watcher.add(boardSourceDir);
	if (fs.existsSync(backCardSourceDir)) server.watcher.add(backCardSourceDir);
	if (fs.existsSync(cardSourceDir)) server.watcher.add(cardSourceDir);
	if (fs.existsSync(uiAssetSourceDir)) server.watcher.add(uiAssetSourceDir);
	if (fs.existsSync(musicSourceDir)) server.watcher.add(musicSourceDir);
	if (fs.existsSync(sfxSourceDir)) server.watcher.add(sfxSourceDir);
	if (fs.existsSync(localeSourceDir)) server.watcher.add(localeSourceDir);
	if (fs.existsSync(expansionSourceDir)) server.watcher.add(expansionSourceDir);
	server.watcher.on("all", (_event, filePath) => {
		const resolvedFilePath = path.resolve(filePath);
		if (resolvedFilePath.startsWith(expansionSourceDir + path.sep)) {
			writeCardImageManifest();
			return;
		}
		if (resolvedFilePath.startsWith(musicSourceDir)) {
			writeMusicManifest();
			return;
		}
		if (resolvedFilePath.startsWith(sfxSourceDir)) {
			writeSfxAssets();
			return;
		}
		if (resolvedFilePath.startsWith(localeSourceDir)) {
			writeLocaleAssets();
			return;
		}
		if (
			!resolvedFilePath.startsWith(boardSourceDir) &&
			!resolvedFilePath.startsWith(backCardSourceDir) &&
			!resolvedFilePath.startsWith(cardSourceDir) &&
			!resolvedFilePath.startsWith(uiAssetSourceDir)
		) {
			return;
		}
		writeBoardManifest();
		writeBackCardManifest();
		writeCardImageManifest();
		writeUiAssetManifest();
	});
}

function assetManifestsPlugin(): Plugin {
	return {
		name: "ascensao-asset-manifests",
		buildStart() {
			writeAssetManifests();
		},
		configureServer(server) {
			writeAssetManifests();
			watchAssetSources(server);
		},
	};
}

export default defineConfig({
	base: process.env.PAGES_BASE_PATH || "/",
	plugins: [assetManifestsPlugin(), react(), tailwindcss()],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	test: {
		environment: "node",
		exclude: [...configDefaults.exclude, "e2e/**"],
		passWithNoTests: true,
		coverage: {
			provider: "v8",
			reporter: ["text", "json-summary"],
			include: ["src/core/**/*.ts"],
			exclude: ["src/core/index.ts"],
			thresholds: {
				// Baseline global do núcleo: incrementos abaixo disso falham no CI.
				branches: 65,
				functions: 80,
				lines: 78,
				statements: 75,
			},
		},
	},
});
