import { describe, expect, it } from "vitest";
import { reducer } from "@/core/reducer";
import { withUnitStats } from "@/core/state/access";
import { gameOf } from "@/engine/state";
import { playerView } from "@/core/projection/playerView";
import type { AiStep } from "./ai";
import { observeAbilityStep } from "./abilityTelemetry";
import { auditEngine, combat } from "./skill-audit/runtime";

function observe(beforeState: ReturnType<typeof combat>,
	afterState: ReturnType<typeof combat>, action: AiStep["chosen"]["action"]) {
	return observeAbilityStep({
		beforeState, afterState, before: playerView(auditEngine, beforeState),
		after: playerView(auditEngine, afterState), chosen: { action, score: 1 },
	} as AiStep, auditEngine);
}

describe("telemetria P0: ciclo de vida e efeitos reais", () => {
	it("distingue preparação de cura confirmada e cura que realmente recuperou PV", () => {
		const starting = combat("hero_eternal_rest_cleric");
		const id = gameOf(starting).heroes[0]!.id;
		const wounded = withUnitStats(starting, id, { currentLife: 5 });
		const prepareAction = { type: "USE_SKILL", payload: {
			skillId: "skill_last_light_healing", sourceId: id,
		} } as const;
		const prepared = reducer(auditEngine, wounded, prepareAction);
		const [preparation] = observe(wounded, prepared, prepareAction);
		expect(preparation).toMatchObject({
			attempted: true, prepared: true, confirmed: false,
			chargeConsumed: false, effectKinds: [],
		});
		const commit = { type: "USE_SKILL", payload: {
			skillId: "skill_last_light_healing", sourceId: id, targetIds: [id],
		} } as const;
		const healed = reducer(auditEngine, prepared, commit);
		const [execution] = observe(prepared, healed, commit);
		expect(execution).toMatchObject({ attempted: true, prepared: false, confirmed: true });
		expect(execution?.effectKinds).toContain("healing");
		expect(execution?.targetIds).toContain(id);
	});

	it("não registra o Milagre como gasto quando apenas abre a escolha", () => {
		const initial = combat("hero_eternal_rest_cleric");
		const id = gameOf(initial).heroes[0]!.id;
		const wounded = withUnitStats(initial, id, { currentLife: 3 });
		const open = { type: "USE_POWER", payload: { heroId: id } } as const;
		const pending = reducer(auditEngine, wounded, open);
		const [opened] = observe(wounded, pending, open);
		expect(opened).toMatchObject({
			attempted: true, confirmed: false, chargeConsumed: false, effectKinds: [],
		});
		const choose = { type: "SKILL_CHOICE", payload: {
			skillId: "power_greater_last_light_miracle", choice: "full_heal",
		} } as const;
		const resolved = reducer(auditEngine, pending, choose);
		const [done] = observe(pending, resolved, choose);
		expect(done).toMatchObject({
			confirmed: true, chargeConsumed: true,
			abilityId: "power_greater_last_light_miracle",
		});
		expect(done?.effectKinds).toContain("healing");
	});

	it("identifica o buff e a carga do Guerreiro sem confundir o custo de ação com efeito", () => {
		const initial = combat("hero_broken_bastion_warrior");
		const id = gameOf(initial).heroes[0]!.id;
		const action = { type: "USE_POWER", payload: { heroId: id } } as const;
		const used = reducer(auditEngine, initial, action);
		const [evidence] = observe(initial, used, action);
		expect(evidence).toMatchObject({
			attempted: true, confirmed: true, chargeConsumed: true,
		});
		expect(evidence?.effectKinds).toContain("modifier");
	});
});
