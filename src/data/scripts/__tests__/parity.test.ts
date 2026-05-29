// Guard rail — Fase 8 (Patch-12):
// Valida paridade entre scripts declarados em skills.json e arquivos em src/data/scripts/.
// Quebra no CI se:
//   1. skill.script = "x" existe em skills.json mas src/data/scripts/x.ts não existe (ou não exporta `run`)
//   2. src/data/scripts/x.ts existe mas nenhuma skill em skills.json declara script = "x"
//      (exceto prefixo _ e arquivos legados conhecidos)

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { getScript } from "@/core/scripts/registry";

const SKILLS_JSON = path.join(import.meta.dirname, "../../../data/skills.json");
const SCRIPTS_DIR = path.join(import.meta.dirname, "..");

// Arquivos que existem mas NÃO precisam de entrada skills.json:
// - _smoke_test.ts: utilitário de teste
// - item_incendiary_oil_flask.ts: legado patch-10, mantido por compat histórica
const EXEMPTED_FILES = new Set([
	"_smoke_test",
	"item_incendiary_oil_flask",
	"example",
]);

function getScriptIdsFromJson(): string[] {
	const data = JSON.parse(fs.readFileSync(SKILLS_JSON, "utf8"));
	return (data.abilities as Array<{ script?: string }>)
		.filter((a) => a.script)
		.map((a) => a.script as string);
}

function getScriptFilesOnDisk(): string[] {
	return fs
		.readdirSync(SCRIPTS_DIR)
		.filter((f) => f.endsWith(".ts") && !f.startsWith("__"))
		.map((f) => f.replace(/\.ts$/, ""));
}

// ── Teste 1: cada script declarado no JSON tem arquivo com export `run` ────────

describe("paridade skills.json → arquivos de script", () => {
	const scriptIds = getScriptIdsFromJson();

	it("skills.json tem pelo menos 1 entrada com script field", () => {
		expect(scriptIds.length).toBeGreaterThan(0);
	});

	for (const id of scriptIds) {
		it(`skills.json[script=${id}] → src/data/scripts/${id}.ts existe e exporta run`, () => {
			const filePath = path.join(SCRIPTS_DIR, `${id}.ts`);
			expect(fs.existsSync(filePath), `Arquivo ${id}.ts não encontrado`).toBe(
				true,
			);
			// Verifica que o registry carregou o run
			const fn = getScript(`${id}.run`);
			expect(
				fn,
				`${id}.ts não exporta 'run' ou não foi carregado pelo registry`,
			).not.toBeNull();
		});
	}
});

// ── Teste 2: cada arquivo de script tem entrada no JSON (exceto isentos) ───────

describe("paridade arquivos de script → skills.json", () => {
	const scriptIds = new Set(getScriptIdsFromJson());
	const filesOnDisk = getScriptFilesOnDisk();

	for (const fileId of filesOnDisk) {
		if (EXEMPTED_FILES.has(fileId)) continue;
		it(`src/data/scripts/${fileId}.ts → skills.json tem entrada script="${fileId}"`, () => {
			expect(
				scriptIds.has(fileId),
				`Arquivo ${fileId}.ts existe mas nenhuma skill declara script="${fileId}". ` +
					`Adicione à skills.json ou inclua em EXEMPTED_FILES se for utilitário.`,
			).toBe(true);
		});
	}
});
