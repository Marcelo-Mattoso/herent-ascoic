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
	kind: "boards" | "backcards" | "cards" | "ui",
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

function writeAssetManifests() {
	writeBoardManifest();
	writeBackCardManifest();
	writeCardImageManifest();
	writeUiAssetManifest();
}

function watchAssetSources(server: ViteDevServer) {
	if (fs.existsSync(boardSourceDir)) server.watcher.add(boardSourceDir);
	if (fs.existsSync(backCardSourceDir)) server.watcher.add(backCardSourceDir);
	if (fs.existsSync(cardSourceDir)) server.watcher.add(cardSourceDir);
	if (fs.existsSync(uiAssetSourceDir)) server.watcher.add(uiAssetSourceDir);
	server.watcher.on("all", (_event, filePath) => {
		const resolvedFilePath = path.resolve(filePath);
		if (
			!resolvedFilePath.startsWith(boardSourceDir) &&
			!resolvedFilePath.startsWith(backCardSourceDir) &&
			!resolvedFilePath.startsWith(cardSourceDir) &&
			!resolvedFilePath.startsWith(uiAssetSourceDir)
		) {
			return;
		}
		writeAssetManifests();
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
