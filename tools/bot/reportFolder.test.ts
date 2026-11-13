import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { prepareSimulationDirectory } from "./dungeonReport";

describe("consolidação do relatório na pasta da auditoria", () => {
	const temporary = (test: (root: string) => void) => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "ascensao-run-folder-"));
		try {
			test(path.join(root, "audit-2026-11-13"));
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	};

	it("cria pasta nova para leveling isolado", () => temporary((dir) => {
		prepareSimulationDirectory(dir);
		expect(fs.statSync(dir).isDirectory()).toBe(true);
		expect(fs.readdirSync(dir)).toEqual([]);
	}));

	it("permite somente os dois arquivos da auditoria antes de criar os checkpoints", () => temporary((dir) => {
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(path.join(dir, "skill-audit.json"), "{}");
		fs.writeFileSync(path.join(dir, "skill-audit.html"), "<html></html>");
		expect(() => prepareSimulationDirectory(dir)).not.toThrow();
		expect(fs.readdirSync(dir).sort()).toEqual(["skill-audit.html", "skill-audit.json"]);
	}));

	it.each([
		["diretório vazio", []],
		["arquivo desconhecido", ["skill-audit.json", "skill-audit.html", "extra.txt"]],
		["relatório já existente", ["skill-audit.json", "skill-audit.html", "report.json"]],
		["auditoria incompleta", ["skill-audit.json"]],
	])("recusa reutilizar %s", (_label, names) => temporary((dir) => {
		fs.mkdirSync(dir, { recursive: true });
		for (const name of names) fs.writeFileSync(path.join(dir, name), "{}");
		expect(() => prepareSimulationDirectory(dir)).toThrow(/Pasta de relatório já existe/);
	}));

	it("não usa pasta apontando para arquivo", () => temporary((dir) => {
		fs.writeFileSync(dir, "{}");
		expect(() => prepareSimulationDirectory(dir)).toThrow(/Pasta de relatório inválida/);
	}));
});
