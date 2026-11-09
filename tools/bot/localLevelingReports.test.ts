import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { listSavedReports, readSavedReport } from "./localLevelingReports";

describe("histórico privado de relatórios JSON", () => {
	it("descobre apenas relatórios de leveling válidos e ordena por data", () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "ascensao-leveling-"));
		const write = (id: string, document: unknown) => {
			const folder = path.join(root, id);
			fs.mkdirSync(folder, { recursive: true });
			fs.writeFileSync(path.join(folder, "report.json"), JSON.stringify(document));
		};
		try {
			write("dungeon-old", { schemaVersion: 1, kind: "simulation",
				generatedAt: "2026-11-07T10:00:00.000Z", completed: 3000, expected: 3000,
				catalog: { expansions: [] }, options: {}, trials: [] });
			write("catalog-new", { schemaVersion: 1, kind: "catalog",
				generatedAt: "2026-11-09T11:00:00.000Z", catalog: { expansions: [] } });
			write("legacy-ignored", { generatedAt: "2026-11-08T11:00:00.000Z", trials: [] });
			write("bad-schema", { schemaVersion: 99, kind: "catalog",
				generatedAt: "2026-11-09T12:00:00.000Z", catalog: { expansions: [] } });
			expect(listSavedReports(root).map((entry) => entry.id)).toEqual(["catalog-new", "dungeon-old"]);
			expect(listSavedReports(root)[1]).toMatchObject({ kind: "simulation", completed: 3000 });
			expect(readSavedReport(root, "catalog-new")?.kind).toBe("catalog");
			expect(readSavedReport(root, "../catalog-new")).toBeNull();
			expect(readSavedReport(root, "legacy-ignored")).toBeNull();
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("não lê relatórios fora da pasta permitida", () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "ascensao-leveling-"));
		try {
			expect(readSavedReport(root, "..")).toBeNull();
			expect(readSavedReport(root, "%2e%2e")).toBeNull();
			expect(readSavedReport(root, "nested/folder")).toBeNull();
			expect(listSavedReports(root)).toEqual([]);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});
