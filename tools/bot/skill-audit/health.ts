import type { AuditReport } from "./catalog";
import coverageBaseline from "./coverageBaseline.json";

const historicalGrantKeys = new Set(coverageBaseline.grants);

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
	for (const probe of report.autoContracts ?? []) {
		if (probe.status === "FAIL") messages.push(`AUTO_CONTRACT ${probe.sourceCardId}/${probe.abilityId}: ${probe.detail}`);
	}
  // Baseline incremental: não reprovar retroativamente 311 concessões antigas,
  // mas impedir que uma concessão NOVA entre sem nenhuma execução observável.
  for (const entry of report.inventory) {
    const key = entry.sourceCardId + "::" + entry.grantId;
    if (!historicalGrantKeys.has(key) && entry.runtimeStatus === "NOT_COVERED")
      messages.push(`NEW_GRANT_UNCOVERED ${key} (${entry.expansion}): ${entry.reason}`);
  }
	return messages;
}
