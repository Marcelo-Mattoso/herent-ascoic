import { describe, expect, it } from "vitest";
import { reducer } from "@/core/reducer";
import { withUnitStats } from "@/core/state/access";
import { gameOf, withGame } from "@/engine/state";
import { removePreparedAbility } from "@/core/abilities/prepared";
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
	it("não conta a limpeza de uma preparação como ativação ou efeito", () => {
		const initial = combat("hero_eternal_rest_cleric");
		const id = gameOf(initial).heroes[0]!.id;
		const prepared = reducer(auditEngine, initial, { type: "USE_SKILL", payload: {
			skillId: "skill_last_light_healing", sourceId: id,
		} });
		const preparedKey = Object.keys(gameOf(prepared).preparedAbilities ?? {})[0];
		expect(preparedKey).toBeDefined();
		const cleared = removePreparedAbility(prepared, preparedKey!);
		expect(observe(prepared, cleared, { type: "CHECK_COMBAT_END" })).toEqual([]);
	});

	it("dano externo na mesma etapa não vira dano de uma habilidade de cura", () => {
		const initial = combat("hero_eternal_rest_cleric");
		const id = gameOf(initial).heroes[0]!.id;
		const wounded = withUnitStats(initial, id, { currentLife: 5 });
		const prepared = reducer(auditEngine, wounded, { type: "USE_SKILL", payload: {
			skillId: "skill_last_light_healing", sourceId: id,
		} });
		const action = { type: "USE_SKILL", payload: {
			skillId: "skill_last_light_healing", sourceId: id, targetIds: [id],
		} } as const;
		const healed = reducer(auditEngine, prepared, action);
		const enemy = gameOf(healed).activeEnemies[0];
		expect(enemy).toBeDefined();
		const withParallelDamage = withUnitStats(healed, enemy!.id, {
			currentLife: Math.max(0, enemy!.currentLife - 1),
		});
		const [record] = observe(prepared, withParallelDamage, action);
		expect(record?.effectKinds).toContain("healing");
		expect(record?.effectKinds).not.toContain("damage");
		expect(record?.affectedIds).not.toContain(enemy!.id);
	});

	it("uma carga de poder automático produz uma confirmação, sem inventar efeito", () => {
		const initial = combat("hero_crimson_rune_mage");
		const id = gameOf(initial).heroes[0]!.id;
		const abilityId = "power_supreme_rift_rune";
		const committed = withGame(initial, (game) => ({
			...game,
			oncePer: { ...game.oncePer, game: {
				...game.oncePer.game, [`${abilityId}::${id}`]: true,
			} },
		}));
		const records = observe(initial, committed, { type: "CHECK_COMBAT_END" });
		expect(records).toHaveLength(1);
		expect(records[0]).toMatchObject({
			abilityId, attempted: false, prepared: false, confirmed: true,
			chargeConsumed: true, effectKinds: [],
		});
	});

});
