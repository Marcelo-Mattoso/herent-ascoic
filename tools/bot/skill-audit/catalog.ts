import { ABILITIES, cardAbilityGrants } from "../../../src/core/data/abilities";
import { getAllCards } from "../../../src/core/data/cards";
import { getExpansionCardMetadata } from "../../../src/core/data/expansions";
import { TRIGGER_EVENT_EMITTERS } from "../../../src/core/skills/resolveSkillWindow";

export type AuditStatus = "PASS" | "FAIL" | "NOT_COVERED";
export type AuditFinding = {
	code: string;
	status: AuditStatus;
	sourceCardId: string;
	abilityId: string;
	grantId: string;
	detail: string;
};
export type AuditEntry = {
	sourceCardId: string;
	sourceType: string;
	expansion: string;
	abilityId: string;
	grantId: string;
	activation: string;
	event: string | null;
	actionCost: string;
	cost: { hp?: number; mp?: number } | null;
	limit: { scope: string; maxUses: number } | null;
	effect: string;
	runtimeStatus: "NOT_COVERED";
	reason: string;
};
export type GroupInteraction = {
	partySize: number;
	abilityIds: string[];
	sourceCardIds: string[];
	status: "NOT_COVERED";
	reason: string;
};
export type AuditReport = {
	version: 1;
	generatedAt: string;
	summary: {
		discoveredGrants: number;
		uniqueAbilities: number;
		structuralPass: number;
		structuralFail: number;
		runtimePass: number;
		runtimeFail: number;
		runtimeNotCovered: number;
	};
	inventory: AuditEntry[];
	findings: AuditFinding[];
	groupInteractions: GroupInteraction[];
};

export function discoverAbilityInventory(): AuditEntry[] {
	const definitions = new Map(ABILITIES.abilities.map((def) => [def.id, def]));
	return getAllCards().flatMap((card) =>
		cardAbilityGrants(card.id).map((grant) => {
			const definition = definitions.get(grant.abilityId);
			return {
				sourceCardId: card.id,
				sourceType: card.type,
				expansion: getExpansionCardMetadata(card.id)?.expansionId ?? "unknown",
				abilityId: grant.abilityId,
				grantId: grant.id,
				activation: grant.activation.kind,
				event: grant.activation.event ?? null,
				actionCost: grant.activation.actionCost ?? "none",
				cost: grant.activation.cost ?? null,
				limit: grant.activation.limit ?? null,
				effect: definition?.effect ? "dsl" : definition?.script ? "script" : "missing",
				runtimeStatus: "NOT_COVERED" as const,
				reason: "Ainda não existe um cenário determinístico que prove ativação, efeito, custo e recuperação",
			};
		}),
	).sort((a, b) => a.sourceCardId.localeCompare(b.sourceCardId) ||
		a.abilityId.localeCompare(b.abilityId));
}

export function auditDefinitions(inventory: readonly AuditEntry[]): AuditFinding[] {
	const emitted = TRIGGER_EVENT_EMITTERS as Record<string, readonly unknown[] | undefined>;
	return inventory.flatMap((entry) => {
		const result: AuditFinding[] = [];
		const report = (code: string, status: AuditStatus, detail: string) => result.push({
			code, status, detail,
			sourceCardId: entry.sourceCardId,
			abilityId: entry.abilityId,
			grantId: entry.grantId,
		});
		report("definition_exists", entry.effect === "missing" ? "FAIL" : "PASS",
			entry.effect === "missing" ? "Definição ou executor ausente" : "Efeito ou script declarado");
		if (entry.activation === "event") {
			const hasEmitter = !!entry.event && (emitted[entry.event]?.length ?? 0) > 0;
			report("event_emitter", hasEmitter ? "PASS" : "FAIL",
				hasEmitter ? "Evento possui emissor conhecido" : "Evento sem emissor reconhecido");
		}
		if (entry.limit) {
			report("limit_valid", Number.isInteger(entry.limit.maxUses) && entry.limit.maxUses > 0
				? "PASS" : "FAIL", "Limite deve ser inteiro positivo");
		}
		if (entry.activation === "manual" || entry.activation === "event") {
			report("action_cost_declared", "PASS",
				`Custo efetivo declarado pela ativação: ${entry.actionCost}`);
		}
		return result;
	});
}

/** Seleção combinatória de candidatos, NÃO testes de execução. */
export function discoverGroupCandidates(inventory: readonly AuditEntry[]): GroupInteraction[] {
	const heroAbilities = inventory.filter((entry) => entry.sourceType === "hero" &&
		(entry.activation === "manual" || entry.activation === "event"));
	const heroes = [...new Set(heroAbilities.map((entry) => entry.sourceCardId))];
	const result: GroupInteraction[] = [];
	for (const partySize of [2, 3, 4]) {
		if (heroes.length < partySize) continue;
		const selected = heroes.slice(0, partySize);
		result.push({
			partySize,
			sourceCardIds: selected,
			abilityIds: selected.flatMap((id) => heroAbilities.filter((entry) => entry.sourceCardId === id)
				.map((entry) => entry.abilityId)),
			status: "NOT_COVERED",
			reason: "Interação candidata descoberta; ainda requer execução no reducer e asserções do estado",
		});
	}
	return result;
}

export function createSkillAuditReport(now = new Date().toISOString()): AuditReport {
	const inventory = discoverAbilityInventory();
	const findings = auditDefinitions(inventory);
	return {
		version: 1,
		generatedAt: now,
		summary: {
			discoveredGrants: inventory.length,
			uniqueAbilities: new Set(inventory.map((entry) => entry.abilityId)).size,
			structuralPass: findings.filter((entry) => entry.status === "PASS").length,
			structuralFail: findings.filter((entry) => entry.status === "FAIL").length,
			runtimePass: 0,
			runtimeFail: 0,
			runtimeNotCovered: inventory.length,
		},
		inventory,
		findings,
		groupInteractions: discoverGroupCandidates(inventory),
	};
}
