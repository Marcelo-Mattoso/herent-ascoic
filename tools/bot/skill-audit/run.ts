import { mkdir, writeFile } from "node:fs/promises";
import { resolve, sep, join } from "node:path";
import { LEVELING_RUNS_ROOT } from "../localLevelingReports";
import { createSkillAuditReport } from "./catalog";
import { reportProvenance } from "../reportProvenance";
import { auditBlockers } from "./health";

function escapeHtml(value: string): string {
	return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export function auditRunDirectory(args: readonly string[] = [], now = new Date()): string {
	const flags = args.filter((arg) => arg !== "--");
	if (flags.length === 0) {
		return join(LEVELING_RUNS_ROOT, "skill-audit-" + now.toISOString().replace(/[:.]/g, "-"));
	}
	if (flags.length !== 2 || flags[0] !== "--output" || !flags[1]) {
		throw new Error("Uso: npm run bot:skills-audit -- --output tools/bot/runs/<pasta>");
	}
	const directory = resolve(flags[1]);
	if (!directory.startsWith(LEVELING_RUNS_ROOT + sep)) {
		throw new Error("Auditoria deve ser salva em tools/bot/runs.");
	}
	return directory;
}

export async function writeAudit(outputDirectory = auditRunDirectory()): Promise<{
	json: string;
	html: string;
	blockers: readonly string[];
}> {
	const base = createSkillAuditReport();
	const provenance = reportProvenance({ inventory: base.inventory, findings: base.findings });
	const report = { ...base, provenance };
	const blockers = auditBlockers(base);
	const directory = resolve(outputDirectory);
	await mkdir(directory, { recursive: true });
	const json = resolve(directory, "skill-audit.json");
	const html = resolve(directory, "skill-audit.html");
	await writeFile(json, JSON.stringify(report, null, 2), "utf8");
	const rows = report.inventory.map((entry) => `<tr><td>${escapeHtml(entry.expansion)}</td><td>${escapeHtml(entry.sourceCardId)}</td><td>${escapeHtml(entry.abilityId)}</td><td>${escapeHtml(entry.activation)}</td><td>${escapeHtml(entry.actionCost)}</td><td>${escapeHtml(entry.runtimeStatus)}</td></tr>`).join("\n");
	const failures = blockers.map((message) => `<li>${escapeHtml(message)}</li>`).join("\n");
	const groupResults = report.groupCombatScenarios.map((entry) =>
		`<li>${entry.partySize} heróis — <strong>${escapeHtml(entry.status)}</strong>: ${escapeHtml(entry.detail)}</li>`).join("\n");
	await writeFile(html, `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Ascensão Heróica — Auditoria de habilidades</title><style>body{font:15px system-ui,sans-serif;margin:2rem;line-height:1.5}table{border-collapse:collapse;width:100%}td,th{border:1px solid #aaa;padding:.5rem;text-align:left}thead{background:#ddd}@media(prefers-color-scheme:dark){body{background:#181818;color:#eee}thead{background:#333}}</style></head><body><h1>Auditoria de habilidades</h1><p>Gerado em ${escapeHtml(report.generatedAt)}. Commit: ${escapeHtml(provenance.gitCommit ?? "desconhecido")} (${provenance.comparable ? "limpo" : "não comparável"}). Cenário parcial não é aprovação integral de uma habilidade.</p><p>Grants descobertos: ${report.summary.discoveredGrants}; habilidades únicas: ${report.summary.uniqueAbilities}; falhas estruturais: ${report.summary.structuralFail}; execução parcial: ${report.summary.runtimePartial}; falhas de cenário: ${report.summary.runtimeFail}; sem cobertura: ${report.summary.runtimeNotCovered}; grupos projetados: ${report.summary.groupProjectionPass} OK / ${report.summary.groupProjectionFail} falhas; combos: ${report.summary.groupCombatPartial} parcial / ${report.summary.groupCombatFail} falhas.</p><h2>Problemas estruturais</h2><ul>${failures || "<li>Nenhum problema detectado pelos verificadores implementados.</li>"}</ul><h2>Cenários de execução real</h2><ul>${report.runtimeScenarios.map((scenario) => `<li><strong>${escapeHtml(scenario.status)}</strong> — ${escapeHtml(scenario.sourceCardId)} / ${escapeHtml(scenario.abilityId)}: ${escapeHtml(scenario.detail)}</li>`).join("")}</ul><h2>Combates cooperativos</h2><ul>${groupResults}</ul><h2>Projeção de grupos</h2><p>${report.groupProjectionScenarios.length} composições verificadas; ${report.summary.groupProjectionFail} falhas. Detalhes por seed em report.json.</p><h2>Inventário</h2><table><thead><tr><th>Expansão</th><th>Fonte</th><th>Habilidade</th><th>Ativação</th><th>Custo de ação</th><th>Status de execução</th></tr></thead><tbody>${rows}</tbody></table></body></html>`, "utf8");
	return { json, html, blockers };
}

// vite-node não garante que process.argv[1] seja o script de entrada.
// A checagem anterior por /run.ts/ fazia o comando terminar sem executar.
// Executar em toda invocação CLI; importar este módulo pelo Vitest é seguro.
if (process.env.VITEST === undefined) {
	console.info("Iniciando auditoria de habilidades (P0)...");
	writeAudit(auditRunDirectory(process.argv.slice(2))).then(({ json, html, blockers }) => {
		console.info("Relatório JSON:", json);
		console.info("Relatório HTML:", html);
		if (blockers.length) {
			console.error(`AUDITORIA REPROVADA: ${blockers.length} bloqueador(es). A simulação longa não será iniciada por npm run audit.`);
			for (const message of blockers.slice(0, 30)) console.error(" - " + message);
			if (blockers.length > 30) console.error(` - ... +${blockers.length - 30} bloqueadores no JSON.`);
			process.exitCode = 1;
		} else {
			console.info("Auditoria de contratos/cenários sem falhas; cobertura total de efeitos ainda NÃO está comprovada.");
		}
	}).catch((error: unknown) => {
		console.error(error);
		process.exitCode = 1;
	});
}
