import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { inspectLocales } from "./i18n-check.mjs";

const roots: string[] = [];
function fixture() {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "heroic-i18n-"));
	roots.push(root);
	const base = path.join(root, "locales", "pt-BR");
	fs.mkdirSync(base, { recursive: true });
	fs.writeFileSync(path.join(base, "meta.json"), JSON.stringify({ code: "pt-BR", name: "Portuguese (Brazil)", nativeName: "Português (Brasil)", direction: "ltr", status: "published", version: 1 }));
	fs.writeFileSync(path.join(base, "common.json"), JSON.stringify({ greeting: "Olá {{hero}}", heroes_one: "{{count}} herói", heroes_other: "{{count}} heróis", heroes_many: "{{count}} heróis" }));
	return { root, base };
}
function addLocale(root: string, code: string, status: string, common: string) {
	const dir = path.join(root, "locales", code);
	fs.mkdirSync(dir);
	fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify({ code, name: "English", nativeName: "English", direction: "ltr", status, version: 1 }));
	fs.writeFileSync(path.join(dir, "common.json"), common);
	return dir;
}
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

test("draft pode ficar incompleto e published exige tradução completa", () => {
	const { root } = fixture();
	const dir = addLocale(root, "en-US", "draft", JSON.stringify({ greeting: "", heroes_one: "", heroes_other: "" }));
	let result = inspectLocales(root);
	expect(result.errors).toEqual([]);
	expect(result.report.find((entry) => entry.code === "en-US")?.pending).toBe(3);
	const meta = JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8"));
	fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify({ ...meta, status: "published" }));
	result = inspectLocales(root);
	expect(result.errors.join(" ")).toContain("textos obrigatórios pendentes");
	fs.writeFileSync(path.join(dir, "common.json"), JSON.stringify({ greeting: "Hello {{hero}}", heroes_one: "{{count}} hero", heroes_other: "{{count}} heroes" }));
	expect(inspectLocales(root).errors).toEqual([]);
});

test("rejeita parâmetro perdido, chave extra, JSON duplicado e metadados inválidos", () => {
	const { root } = fixture();
	const dir = addLocale(root, "en-US", "review", JSON.stringify({ greeting: "Hello", surprise: "Extra" }));
	let errors = inspectLocales(root).errors.join(" ");
	expect(errors).toContain("parâmetros divergentes");
	expect(errors).toContain("chave extra");
	fs.writeFileSync(path.join(dir, "common.json"), '{"greeting":"Hello","greeting":"Again"}');
	expect(inspectLocales(root).errors.join(" ")).toContain("chave JSON duplicada");
	fs.writeFileSync(path.join(dir, "common.json"), "{");
	expect(inspectLocales(root).errors.length).toBeGreaterThan(0);
	fs.writeFileSync(path.join(dir, "common.json"), "{}");
	const meta = JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8"));
	fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify({ ...meta, code: "fr-FR" }));
	errors = inspectLocales(root).errors.join(" ");
	expect(errors).toContain("code deve coincidir");
});
