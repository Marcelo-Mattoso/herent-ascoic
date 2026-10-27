import fs from "node:fs";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import type { Plugin, ViteDevServer } from "vite";
import { configDefaults, defineConfig } from "vitest/config";

const boardSourceDir = path.resolve(__dirname, "imagedata/tabuleiros");
const boardPublicDir = path.resolve(__dirname, "public/generated/boards");
const boardAssetDir = path.join(boardPublicDir, "assets");
const boardManifestPath = path.join(boardPublicDir, "manifest.json");
const backCardSourceDir = path.resolve(__dirname, "imagedata/backcard");
const backCardPublicDir = path.resolve(__dirname, "public/generated/backcards");
const backCardAssetDir = path.join(backCardPublicDir, "assets");
const backCardManifestPath = path.join(backCardPublicDir, "manifest.json");
const cardSourceDir = path.resolve(__dirname, "imagedata/cards");
const cardPublicDir = path.resolve(__dirname, "public/generated/cards");
const cardAssetDir = path.join(cardPublicDir, "assets");
const cardManifestPath = path.join(cardPublicDir, "manifest.json");
const uiAssetSourceDir = path.resolve(__dirname, "imagedata/ui");
const uiAssetPublicDir = path.resolve(__dirname, "public/generated/ui");
const uiAssetDir = path.join(uiAssetPublicDir, "assets");
const uiAssetManifestPath = path.join(uiAssetPublicDir, "manifest.json");
const musicSourceDir = path.resolve(__dirname, "sounds/music");
const musicPublicDir = path.resolve(__dirname, "public/generated/music");
const musicAssetDir = path.join(musicPublicDir, "assets");
const musicManifestPath = path.join(musicPublicDir, "manifest.json");
const localeSourceDir = path.resolve(__dirname, "locales");
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
	readonly source: "imagedata/cards";
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

	const cards = listImageFiles(cardSourceDir).map((filePath) => {
		const relativeFile = path.relative(cardSourceDir, filePath);
		const targetPath = path.join(cardAssetDir, relativeFile);
		copyImageAsset(filePath, targetPath);

		return {
			id: toBoardId(relativeFile),
			fileName: relativeFile.split(path.sep).join("/"),
			url: toPublicUrl("cards", relativeFile),
			sizeBytes: fs.statSync(filePath).size,
		};
	});

	const manifest: CardImageManifest = {
		version: 1,
		source: "imagedata/cards",
		cards,
	};
	fs.writeFileSync(cardManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
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
	writeBoardManifest();
	writeBackCardManifest();
	writeCardImageManifest();
	writeUiAssetManifest();
	writeMusicManifest();
	writeLocaleAssets();
}

function watchAssetSources(server: ViteDevServer) {
	if (fs.existsSync(boardSourceDir)) server.watcher.add(boardSourceDir);
	if (fs.existsSync(backCardSourceDir)) server.watcher.add(backCardSourceDir);
	if (fs.existsSync(cardSourceDir)) server.watcher.add(cardSourceDir);
	if (fs.existsSync(uiAssetSourceDir)) server.watcher.add(uiAssetSourceDir);
	if (fs.existsSync(musicSourceDir)) server.watcher.add(musicSourceDir);
	if (fs.existsSync(localeSourceDir)) server.watcher.add(localeSourceDir);
	server.watcher.on("all", (_event, filePath) => {
		const resolvedFilePath = path.resolve(filePath);
		if (resolvedFilePath.startsWith(musicSourceDir)) {
			writeMusicManifest();
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
