import fs from "node:fs";
import path from "node:path";
import { buildCatalogBalance } from "./catalogBalance";
import { assertLocalReportExecution, LEVELING_RUNS_ROOT } from "./localLevelingReports";

/** Catálogo completo, sem simulações: não produz porcentagens de vitória. */
export function runCatalogReport(args: readonly string[] = []): string {
	assertLocalReportExecution();
	let folder: string | undefined;
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--") continue;
		if (args[i] === "--output" && args[i + 1]) folder = args[++i];
		else throw new Error("Uso: npm run bot:catalog-report -- [--output tools/bot/runs/pasta]");
	}
	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	const target = folder ? path.resolve(folder) : path.join(LEVELING_RUNS_ROOT, "catalog-" + stamp);
	if (!target.startsWith(LEVELING_RUNS_ROOT + path.sep)) {
		throw new Error("Saída deve ficar em tools/bot/runs");
	}
	if (fs.existsSync(target)) throw new Error("Diretório já existe: " + target);
	const catalog = buildCatalogBalance();
	const report = { schemaVersion: 1 as const, kind: "catalog" as const,
		generatedAt: new Date().toISOString(), catalog };
	fs.mkdirSync(target, { recursive: true });
	fs.writeFileSync(path.join(target, "report.json"), JSON.stringify(report, null, 2) + "\n");
	console.log("Auditoria de cartas: " + path.join(target, "report.json"));
	console.log("Visualize em http://localhost:5173/leveling-report (npm run dev).");
	for (const pack of catalog.expansions) {
		console.log(pack.name + ": " + pack.heroes.length + " heróis, " +
			pack.creatures.length + " criaturas, " + pack.rooms.length + " salas, " +
			pack.items.length + " itens; " + pack.roomsBelowFourEnemies +
			" salas com menos de 4 inimigos (4 heróis)");
	}
	return target;
}

if (process.env.VITEST === undefined) runCatalogReport(process.argv.slice(2));
