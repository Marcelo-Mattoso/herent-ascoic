import fs from "node:fs";
import path from "node:path";
import { buildCatalogBalance, renderCatalogCsv, renderCatalogHtml, renderCatalogMarkdown } from "./catalogBalance";

const RUNS_ROOT = path.resolve("tools/bot/runs");

export function runCatalogReport(args: readonly string[] = []): string {
	let folder: string | undefined;
	let expansions: string[] | undefined;
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--") continue;
		if (args[i] === "--output" && args[i + 1]) folder = args[++i];
		else if (args[i] === "--expansions" && args[i + 1]) {
			expansions = args[++i]!.split(",").map((x) => x.trim());
			if (expansions.some((x) => !x)) throw new Error("--expansions exige IDs válidos");
		} else throw new Error("Uso: npm run bot:catalog-report -- [--expansions id1,id2] [--output tools/bot/runs/pasta]");
	}
	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	const target = folder ? path.resolve(folder) : path.join(RUNS_ROOT, "catalog-" + stamp);
	if (!target.startsWith(RUNS_ROOT + path.sep)) throw new Error("Saída deve ficar em tools/bot/runs");
	if (fs.existsSync(target)) throw new Error("Diretório já existe: " + target);
	const full = buildCatalogBalance();
	if (expansions?.some((x) => !full.expansions.some((p) => p.id === x))) {
		throw new Error("Expansão desconhecida: " + expansions.filter((x) => !full.expansions.some((p) => p.id === x)).join(", "));
	}
	const data = expansions ? buildCatalogBalance(expansions) : full;
	fs.mkdirSync(target, { recursive: true });
	fs.writeFileSync(path.join(target, "catalog.json"), JSON.stringify(data, null, 2) + "\n");
	fs.writeFileSync(path.join(target, "catalog.md"), renderCatalogMarkdown(data));
	fs.writeFileSync(path.join(target, "catalog.csv"), renderCatalogCsv(data));
	// Static viewer can open directly from disk; no web server needed.
	const html = renderCatalogHtml(data).replace('href="index.html"', 'href="catalog.html"');
	fs.writeFileSync(path.join(target, "catalog.html"), html);
	console.log("Auditoria de cartas: " + path.join(target, "catalog.html"));
	for (const pack of data.expansions) {
		console.log(pack.name + ": " + pack.heroes.length + " heróis, " +
			pack.creatures.length + " criaturas, " + pack.rooms.length + " salas, " +
			pack.items.length + " itens; " + pack.roomsBelowFourEnemies + " salas com menos de 4 inimigos (4p)");
	}
	return target;
}

if (process.env.VITEST === undefined) runCatalogReport(process.argv.slice(2));
