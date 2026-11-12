import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createSkillAuditReport } from "./catalog";
import { reportProvenance } from "../reportProvenance";

function escapeHtml(value: string): string {
	return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export async function writeAudit(outputDirectory = "reports/skill-audit"): Promise<{
	json: string;
	html: string;
}> {
	const base = createSkillAuditReport();
	const provenance = reportProvenance({ inventory: base.inventory, findings: base.findings });
	const report = { ...base, provenance };
	const directory = resolve(outputDirectory);
	await mkdir(directory, { recursive: true });
	const json = resolve(directory, "report.json");
	const html = resolve(directory, "report.html");
	await writeFile(json, JSON.stringify(report, null, 2), "utf8");
	const rows = report.inventory.map((entry) => `<tr><td>${escapeHtml(entry.expansion)}</td><td>${escapeHtml(entry.sourceCardId)}</td><td>${escapeHtml(entry.abilityId)}</td><td>${escapeHtml(entry.activation)}</td><td>${escapeHtml(entry.actionCost)}</td><td>${escapeHtml(entry.runtimeStatus)}</td></tr>`).join("\n");
	const failures = report.findings.filter((entry) => entry.status === "FAIL")
		.map((entry) => `<li>${escapeHtml(entry.sourceCardId)} / ${escapeHtml(entry.abilityId)}: ${escapeHtml(entry.detail)}</li>`).join("\n");
	await writeFile(html, `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Ascensão Heróica — Auditoria de habilidades</title><style>body{font:15px system-ui,sans-serif;margin:2rem;line-height:1.5}table{border-collapse:collapse;width:100%}td,th{border:1px solid #aaa;padding:.5rem;text-align:left}thead{background:#ddd}@media(prefers-color-scheme:dark){body{background:#181818;color:#eee}thead{background:#333}}</style></head><body><h1>Auditoria de habilidades</h1><p>Gerado em ${escapeHtml(report.generatedAt)}. Commit: ${escapeHtml(provenance.gitCommit ?? "desconhecido")} (${provenance.comparable ? "limpo" : "não comparável"}). Cenário parcial não é aprovação integral de uma habilidade.</p><p>Grants descobertos: ${report.summary.discoveredGrants}; habilidades únicas: ${report.summary.uniqueAbilities}; falhas estruturais: ${report.summary.structuralFail}; execução parcial: ${report.summary.runtimePartial}; falhas de cenário: ${report.summary.runtimeFail}; sem cobertura: ${report.summary.runtimeNotCovered}.</p><h2>Problemas estruturais</h2><ul>${failures || "<li>Nenhum problema detectado pelos verificadores implementados.</li>"}</ul><h2>Cenários de execução real</h2><ul>${report.runtimeScenarios.map((scenario) => `<li><strong>${escapeHtml(scenario.status)}</strong> — ${escapeHtml(scenario.sourceCardId)} / ${escapeHtml(scenario.abilityId)}: ${escapeHtml(scenario.detail)}</li>`).join("")}</ul><h2>Inventário</h2><table><thead><tr><th>Expansão</th><th>Fonte</th><th>Habilidade</th><th>Ativação</th><th>Custo de ação</th><th>Status de execução</th></tr></thead><tbody>${rows}</tbody></table></body></html>`, "utf8");
	return { json, html };
}

if (process.argv[1] && /(?:^|[/\\])run\.(?:ts|js)$/.test(process.argv[1])) {
	writeAudit(process.argv[2]).then(({ json, html }) => {
		console.info("Relatório JSON:", json);
		console.info("Relatório HTML:", html);
	}).catch((error: unknown) => {
		console.error(error);
		process.exitCode = 1;
	});
}
