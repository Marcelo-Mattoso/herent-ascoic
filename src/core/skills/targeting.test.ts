import { describe, expect, it } from "vitest";
import type { SkillContext, SkillDefinition } from "../data/skillTypes";
import type { EnemyState } from "../state/enemyState";
import type { GameState } from "../state/gameState";
import { createInitialGameState } from "../state/gameState";
import type { HeroState } from "../state/heroState";
import { resolveManualSkillTarget, resolveTarget } from "./targeting";

function state(): GameState {
	const base = createInitialGameState({
		heroCardIds: ["hero_crimson_barbarian", "hero_silver_warrior"],
	});
	const enemy = {
		id: "e1", cardId: "creature_dark_cave_goblin", maxLife: 5,
		currentLife: 3, damage: 1, hitBonus: 0, dice: 1, tokens: {},
		conditions: [], firstDamageTakenThisTurn: false, status: "active",
	} satisfies EnemyState;
	const activeHeroes = ["h1", "h2"].map((id, index) => ({
		id, cardId: index ? "hero_silver_warrior" : "hero_crimson_barbarian",
		maxLife: 10, currentLife: 10, damage: 3, hitBonus: 0, dice: 2, impeto: 0,
		activeItems: {}, backpack: [], usedPowers: {}, conditions: [], status: "active",
		playerIndex: 0, xp: 0,
	}) satisfies HeroState);
	return { ...base, heroes: activeHeroes, activeEnemies: [enemy] };
}

const context: SkillContext = { triggeredBy: "test", sourceHeroId: "h1" };
const neutralContext: SkillContext = { triggeredBy: "test" };
const definition = (overrides: Record<string, unknown>) => ({
	id: "test", category: "hero_skill", operate_type: "op_active", target_type: "tgt_target",
	affect_scope: "scp_single", affect_object: "obj_friend", affect_limit: { min: 1, max: 1 },
	effect: [{ to: "$target" }], ...overrides,
	}) as unknown as SkillDefinition;

describe("targeting — resolução de alvo declarada", () => {
	it("resolve todos os alvos automáticos e pede escolha quando há múltiplos", () => {
		const s = state();
		expect(resolveTarget(s, "self", context)).toMatchObject({ kind: "resolved", heroIds: ["h1"] });
		expect(resolveTarget(s, "heroes", context)).toMatchObject({ heroIds: ["h1", "h2"] });
		expect(resolveTarget(s, "all_heroes", context)).toMatchObject({ heroIds: ["h1", "h2"] });
		expect(resolveTarget(s, "creature_in_room", context)).toMatchObject({ enemyIds: ["e1"] });
		expect(resolveTarget(s, "dungeon", context)).toEqual({ kind: "resolved" });
		expect(resolveTarget(s, "die_with_value_1", context)).toEqual({ kind: "needs_selection", candidates: [] });
		expect(resolveTarget(s, "hero_or_ally", neutralContext)).toMatchObject({ kind: "needs_selection" });
	});

	it("respeita vida mais baixa, ausência de entidades e origem inimiga", () => {
		const s = state();
		const wounded = { ...s, heroes: s.heroes.map((hero, index) => ({ ...hero, currentLife: index ? 1 : 5 })) };
		expect(resolveTarget(wounded, "lowest_life_hero", neutralContext)).toMatchObject({ heroIds: ["h2"] });
		expect(resolveTarget({ ...s, heroes: [] }, "lowest_life_hero", neutralContext)).toEqual({ kind: "none" });
		expect(resolveTarget(s, "self", { triggeredBy: "test", sourceEnemyId: "e1" })).toMatchObject({ enemyIds: ["e1"] });
		expect(resolveTarget(s, "hero", neutralContext)).toMatchObject({ kind: "needs_selection" });
		expect(resolveTarget(s, "unknown" as never, neutralContext)).toEqual({ kind: "none" });
	});
});

describe("targeting — habilidade manual", () => {
	it("resolve autoalvo, grupo, aliados derrotados e filtra ids inválidos", () => {
		const s = state();
		expect(resolveManualSkillTarget(s, definition({ target_type: "tgt_self" }), "h1")).toEqual({ kind: "ready", targetIds: ["h1"] });
		expect(resolveManualSkillTarget(s, definition({ affect_scope: "scp_party_full" }), "h1")).toEqual({ kind: "ready", targetIds: ["h1", "h2"] });
		expect(resolveManualSkillTarget(s, definition({ target_type: "tgt_self" }), "h1", ["h2"])).toEqual({ kind: "unavailable", reason: "Alvo inválido." });
		const dead = { ...s, defeatedHeroes: [{ ...s.heroes[1]!, id: "dead", status: "defeated" as const }] };
		expect(resolveManualSkillTarget(dead, definition({ affect_scope: "scp_dead_party" }), "h1")).toEqual({ kind: "ready", targetIds: ["dead"] });
	});

	it("pede seleção para vários candidatos, escolhe o único e rejeita lista vazia", () => {
		const s = state();
		expect(resolveManualSkillTarget(s, definition({ target_type: "tgt_enemy", affect_object: "obj_not_friend" }), "h1")).toMatchObject({ kind: "ready", targetIds: ["e1"] });
		expect(resolveManualSkillTarget(s, definition({ target_type: "tgt_others" }), "h1")).toMatchObject({ kind: "ready", targetIds: ["h2"] });
		const noEnemies = { ...s, activeEnemies: [] };
		expect(resolveManualSkillTarget(noEnemies, definition({ target_type: "tgt_enemy" }), "h1")).toEqual({ kind: "unavailable", reason: "Nenhum alvo válido disponível." });
	});
});
