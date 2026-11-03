import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const UI_DIR = path.resolve(__dirname, "../../src/ui");

// Guardam o GameState como dado opaco (persistência, replay, store); nenhum outro arquivo da UI pode tocá-lo.
const ALLOWED = new Set([
	"store/persistence.ts",
	"store/elfStore.ts",
	"store/gameStore.ts",
]);

const RAW_FIELD_ACCESS =
	/\b(?:state|gameState|getElfGameState\(\))\??\.(?:heroes|combat|world|decks|despertar|activeEnemies)\b/;
const CORE_STATE_IMPORT = /from\s+["']@\/core\/state\//;

function sourceFiles(dir: string): string[] {
	return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) return sourceFiles(full);
		if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name))
			return [];
		return [full];
	});
}

const files = sourceFiles(UI_DIR)
	.map((file) => path.relative(UI_DIR, file).replaceAll("\\", "/"))
	.filter((file) => !ALLOWED.has(file));

describe("UI não lê GameState cru", () => {
	it("varre arquivos de UI", () => {
		expect(files.length).toBeGreaterThan(20);
	});

	it("nenhum acesso a state.(heroes|combat|world|decks|despertar|activeEnemies)", () => {
		const offenders = files.filter((file) =>
			RAW_FIELD_ACCESS.test(fs.readFileSync(path.join(UI_DIR, file), "utf8")),
		);
		expect(offenders).toEqual([]);
	});

	it("nenhum import de tipos de core/state fora dos arquivos de transporte", () => {
		const offenders = files.filter((file) =>
			CORE_STATE_IMPORT.test(fs.readFileSync(path.join(UI_DIR, file), "utf8")),
		);
		expect(offenders).toEqual([]);
	});
});
