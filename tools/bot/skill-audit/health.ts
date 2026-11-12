import type { AuditReport } from "./catalog";

/** Bloqueadores observáveis. Falta de cobertura continua visível, não vira falso FAIL. */
export function auditBlockers(report: AuditReport): string[] {
	const messages: string[] = [];
	for (const finding of report.findings.filter((entry) => entry.status === "FAIL")) {
		messages.push(`STRUCTURAL ${finding.sourceCardId}/${finding.abilityId} [${finding.code}]: ${finding.detail}`);
	}
	for (const scenario of report.runtimeScenarios.filter((entry) => entry.status === "FAIL")) {
		messages.push(`RUNTIME ${scenario.id} [${scenario.abilityId}]: ${scenario.detail}`);
	}
	for (const scenario of report.groupProjectionScenarios.filter((entry) => entry.status === "FAIL")) {
		messages.push(`GROUP_PROJECTION ${scenario.id} [${scenario.heroCardIds.join(",")}]: ${scenario.detail}`);
	}
	for (const scenario of report.groupCombatScenarios.filter((entry) => entry.status === "FAIL")) {
		messages.push(`GROUP_COMBAT ${scenario.partySize} [${scenario.abilityIds.join(",")}]: ${scenario.detail}`);
	}
	return messages;
}
