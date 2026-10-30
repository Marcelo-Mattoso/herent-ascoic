import { describe, expect, it } from "vitest";
import { testEngine } from "@/core/__tests__/testEngine";
import { createAscensaoKinds } from "../../../composition";
import { createKindRegistryFrom } from "../../../../engine/kinds";
import { conditionsApply } from "../../../rules/itemEffects";
import { buildScriptCtx } from "../../../scripts/context";
import { settled } from "../../../__tests__/fixtures";
import { enemiesOf } from "../../../state/access";
import { createEmptyCombatState } from "../../../state/combatState";
import type { EnemyState } from "../../../state/enemyState";
import { createInitialGameState } from "../../../state/gameState";
import type { HeroState } from "../../../state/heroState";
import { isVoluntaryTrigger } from "../../activationMode";
import { resolveCondition } from "../resolveCondition";
import { builtinPackage } from "../kinds/builtin";
import type { ConditionNode } from "../types";
import { withGame } from "../../../../engine/state";

const hero: HeroState = {
	id: "h1",
	cardId: "hero_crimson_barbarian",
	maxLife: 10,
	currentLife: 5,
	damage: 3,
	hitBonus: 0,
	dice: 2,
	activeItems: {},
	backpack: [],
	usedPowers: {},
	conditions: [],
	status: "active",
	playerIndex: 0,
	xp: 0,
};

function foe(overrides: Partial<EnemyState>): EnemyState {
	return {
		id: "e1",
		cardId: "creature_dark_cave_goblin",
		maxLife: 5,
		currentLife: 5,
		damage: 2,
		hitBonus: 0,
		dice: 1,
		tokens: {},
		conditions: [],
		firstDamageTakenThisTurn: false,
		status: "active",
		...overrides,
	};
}

function stateWith(enemy: EnemyState) {
	return settled(withGame(createInitialGameState({ heroCardIds: ["hero_crimson_barbarian"] }), (prevGame) => ({ ...prevGame, heroes: [hero], activeEnemies: [enemy], combat: createEmptyCombatState() })));
}

const bossOrSubboss: ConditionNode = {
	kind: "has_condition",
	of: "$enemy",
	conditionType: "boss_or_subboss",
};

describe("condições de item despachadas pelo registro (F7.5 item 3)", () => {
	it("chefe e subchefe satisfazem boss_or_subboss; criatura comum não", () => {
		for (const [enemy, expected] of [
			[foe({ id: "boss" }), true],
			[foe({ isSubboss: true }), true],
			[foe({}), false],
		] as const) {
			const state = stateWith(enemy);
			expect(conditionsApply(testEngine, [bossOrSubboss], state, hero, enemy)).toBe(
				expected,
			);
			const ctx = buildScriptCtx(testEngine, state, {
				triggeredBy: "on_use",
				sourceHeroId: hero.id,
				targetEnemyIds: [enemy.id],
			});
			expect(resolveCondition(bossOrSubboss, ctx)).toBe(expected);
		}
	});

	it("$enemy sem inimigo e condição composta passam pelo mesmo registro", () => {
		const state = stateWith(foe({ id: "boss" }));
		expect(conditionsApply(testEngine, [bossOrSubboss], state, hero)).toBe(false);
		const composite: ConditionNode = {
			kind: "and",
			children: [bossOrSubboss, { kind: "not", child: { any_of: [] } }],
		};
		expect(
			conditionsApply(testEngine, [composite], state, hero, enemiesOf(state)[0]),
		).toBe(true);
	});
});

describe("vocabulário de stats e tipos de dano vem do pacote (F7.5 item 4)", () => {
	const pModifier = (stat: string) => ({
		kind: "p_modifier",
		to: "$source",
		stat,
		operation: "add",
		value: 1,
		duration: { kind: "once" },
	});

	it("aceita o stat roxo com o pacote do jogo e recusa sem ele", () => {
		const kinds = createAscensaoKinds();
		expect(() => kinds.validate(pModifier("s_purple_damage_reduction"))).not.toThrow();
		const semJogo = createKindRegistryFrom(builtinPackage);
		expect(() => semJogo.validate(pModifier("s_purple_damage_reduction"))).toThrow(
			/modifier_stat "s_purple_damage_reduction" sem resolvedor/,
		);
	});

	it("recusa stat desconhecido", () => {
		expect(() => createAscensaoKinds().validate(pModifier("s_inventado"))).toThrow(
			/s_inventado/,
		);
	});

	it("tipos de dano são registrados pelos pacotes", () => {
		const kinds = createAscensaoKinds();
		const none = undefined as never;
		expect(kinds.ref("damage_type", "physical", none)).toBe("physical");
		expect(kinds.ref("damage_type", "purple", none)).toBe("purple");
		expect(kinds.ref("damage_type", "inventado", none)).toBeUndefined();
		expect(
			createKindRegistryFrom(builtinPackage).ref("damage_type", "purple", none),
		).toBeUndefined();
	});

	it("redução de dano exige decisão do jogador pelo registro de stats", () => {
		const base = testEngine.content.ability("skill_crimson_fury");
		const withStat = (stat: string) =>
			({
				...base,
				effect: [pModifier(stat)],
				interrupt: undefined,
				category: "item_skill",
			}) as never;
		expect(isVoluntaryTrigger(withStat("s_purple_damage_reduction"), "item", "evt_damage_taken")).toBe(true);
		expect(isVoluntaryTrigger(withStat("s_damage_reduction"), "item", "evt_damage_taken")).toBe(true);
		expect(isVoluntaryTrigger(withStat("s_hit_bonus"), "item", "evt_damage_taken")).toBe(false);
	});
});
