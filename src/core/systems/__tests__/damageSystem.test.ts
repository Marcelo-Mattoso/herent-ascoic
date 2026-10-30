import { describe, expect, it } from "vitest";
import type {
	HealthComponent,
	ModifierComponent,
	TriggerComponent,
} from "../../ecs/types";
import {
	addComponent,
	createEntity,
	getComponent,
	upsertEntity,
} from "../../ecs/world";
import { createEmptyCombatState } from "../../state/combatState";
import type { EnemyState } from "../../state/enemyState";
import type { GameState } from "../../state/gameState";
import { createInitialGameState } from "../../state/gameState";
import type { HeroState } from "../../state/heroState";
import { applyDamage, applyDamageMin1 } from "../damageSystem";
import { collectTriggerCandidates } from "../../triggers/engine";
import { preparedAbilityKey } from "../../abilities/prepared";
import { handleResolveAttack } from "../../reducer/combat";

function makeHero(overrides: Partial<HeroState> = {}): HeroState {
	return {
		id: "h1",
		cardId: "hero_crimson_barbarian",
		maxLife: 10,
		currentLife: 10,
		damage: 4,
		hitBonus: 0,
		dice: 2,
		impeto: 0,
		activeItems: {},
		backpack: [],
		usedPowers: {},
		conditions: [],
		status: "active",
		playerIndex: 0,
		xp: 0,
		...overrides,
	};
}

function makeEnemy(overrides: Partial<EnemyState> = {}): EnemyState {
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

function makeState(
	heroOverrides: Partial<HeroState> = {},
	enemyOverrides?: Partial<EnemyState>,
): GameState {
	const base = createInitialGameState({
		heroCardIds: ["hero_crimson_barbarian"],
	});
	return {
		...base,
		heroes: [makeHero(heroOverrides)],
		activeEnemies:
			enemyOverrides !== undefined ? [makeEnemy(enemyOverrides)] : [],
		combat: createEmptyCombatState(),
	};
}

// ── applyDamage ───────────────────────────────────────────────────────────────

describe("applyDamage — herói", () => {
	it.each([0, 1, 8, 9, 20])("registra somente o dano efetivo de %i, limitado pela vida", (amount) => {
		const result = applyDamage(makeState({ currentLife: 12 }), "h1", amount);
		const expected = Math.min(amount, 12);
		expect(result.damageFeedback?.at(-1)?.amount ?? 0).toBe(expected);
		expect(result.damageFeedback?.length ?? 0).toBe(expected ? 1 : 0);
	});

	it("registra os dois alvos de dano simultâneo sem misturar os valores", () => {
		const first = applyDamage(makeState({ currentLife: 12 }, { currentLife: 5 }), "e1", 9, { sourceId: "h1" });
		const second = applyDamage(first, "h1", 8, { sourceId: "e1" });
		expect(second.damageFeedback?.map(({ side, amount }) => [side, amount])).toEqual([
			["enemy", 5], ["hero", 8],
		]);
	});

	it("registra dano letal real no chefe", () => {
		const state = makeState({}, { id: "boss", currentLife: 5, maxLife: 20 });
		const result = applyDamage(state, "boss", 20, { sourceId: "h1", damageType: "attack" });
		expect(result.damageFeedback?.at(-1)).toMatchObject({ targetId: "boss", side: "enemy", amount: 5 });
	});

	it("não registra dano anulado antes da aplicação", () => {
		const state = makeState();
		expect(applyDamage(state, "h1", 0).damageFeedback).toBeUndefined();
	});
	it("reduz vida do herói pelo valor do dano", () => {
		const state = makeState({ currentLife: 8 });
		const result = applyDamage(state, "h1", 3);
		expect(result.heroes[0]!.currentLife).toBe(5);
	});

	it("não reduz abaixo de 0", () => {
		const state = makeState({ currentLife: 3 });
		const result = applyDamage(state, "h1", 10);
		expect(result.heroes[0]!.currentLife).toBe(0);
	});

	it("define status 'defeated' quando vida chega a 0", () => {
		const state = makeState({ currentLife: 3 });
		const result = applyDamage(state, "h1", 3);
		expect(result.heroes[0]!.status).toBe("defeated");
	});

	it("não altera status se vida > 0 após dano", () => {
		const state = makeState({ currentLife: 5 });
		const result = applyDamage(state, "h1", 2);
		expect(result.heroes[0]!.status).toBe("active");
	});

	it("não altera outros heróis", () => {
		const base = createInitialGameState({
			heroCardIds: ["hero_crimson_barbarian"],
		});
		const h2: HeroState = makeHero({ id: "h2", currentLife: 7 });
		const state: GameState = {
			...base,
			heroes: [makeHero({ currentLife: 5 }), h2],
			combat: createEmptyCombatState(),
		};
		const result = applyDamage(state, "h1", 3);
		expect(result.heroes.find((h) => h.id === "h2")!.currentLife).toBe(7);
	});

	it("retorna estado inalterado para id desconhecido", () => {
		const state = makeState({ currentLife: 5 });
		const result = applyDamage(state, "unknown_id", 3);
		expect(result).toBe(state);
	});

	it("sincroniza HealthComponent no ECS world após dano ao herói", () => {
		const state = makeState({ currentLife: 8 });
		const result = applyDamage(state, "h1", 3);
		const health = getComponent<HealthComponent>(result.world, "h1", "health");
		expect(health).toBeDefined();
		expect(health?.current).toBe(5);
	});

	it("aplica redução exclusiva a dano roxo", () => {
		const state = makeState();
		const ward: ModifierComponent = {
			type: "modifier",
			target: "purple_damage_taken",
			operation: "add",
			value: -2,
			source: "skill_last_light_ward",
			duration: { kind: "while_source_in_play" },
			sourceEntityId: "h1",
		};
		const worldWithHero = upsertEntity(state.world, createEntity("h1", "hero"));
		const withWard = {
			...state,
			world: addComponent(worldWithHero, "h1", ward),
		};
		expect(
			applyDamage(withWard, "h1", 5, {
				sourceId: "e1",
				damageType: "purple",
			}).heroes[0]!.currentLife,
		).toBe(7);
		expect(
			applyDamage(withWard, "h1", 5, {
				sourceId: "e1",
				damageType: "physical",
			}).heroes[0]!.currentLife,
		).toBe(5);
	});

	it("limpa gatilhos ECS do herói derrotado e os que ele instalou", () => {
		let state = makeState({ currentLife: 2 }, { id: "e1" });
		let world = upsertEntity(state.world, createEntity("h1", "hero"));
		world = upsertEntity(world, createEntity("e1", "enemy"));
		const ownTrigger: TriggerComponent = {
			type: "trigger",
			on: "DamageDealt",
			effect: { type: "push_to_stack", innerEffect: { kind: "i_noop" } },
			source: "test_own_trigger",
			sourceEntityId: "h1",
			duration: { kind: "while_source_in_play" },
			priority: 0,
		};
		const appliedTrigger: TriggerComponent = {
			...ownTrigger,
			source: "test_applied_trigger",
		};
		world = addComponent(world, "h1", ownTrigger);
		world = addComponent(world, "e1", appliedTrigger);
		state = { ...state, world };

		const result = applyDamage(state, "h1", 2, { sourceId: "e1" });

		expect(result.heroes[0]?.status).toBe("defeated");
		expect(
			result.world.entities.h1?.components.some((c) => c.type === "trigger"),
		).toBe(false);
		expect(
			result.world.entities.e1?.components.some((c) => c.type === "trigger"),
		).toBe(false);
	});
});

describe("applyDamage — inimigo", () => {
	it("não emite dano causado quando o valor final é zero", () => {
		const state = makeState({}, { currentLife: 5 });
		const result = applyDamage(state, "e1", 0, { sourceId: "h1", damageType: "attack" });
		expect(result.activeEnemies[0]!.currentLife).toBe(5);
		expect(result.pendingTriggerInterrupt).toBeUndefined();
	});
	it("reduz vida do inimigo pelo valor do dano", () => {
		const state = makeState({}, { currentLife: 5 });
		const result = applyDamage(state, "e1", 2);
		expect(result.activeEnemies[0]!.currentLife).toBe(3);
	});

	it("define status 'defeated' quando vida do inimigo chega a 0", () => {
		const state = makeState({}, { currentLife: 3 });
		const result = applyDamage(state, "e1", 5);
		expect(result.activeEnemies[0]!.status).toBe("defeated");
	});

	it("sincroniza HealthComponent no ECS world após dano ao inimigo", () => {
		const state = makeState({}, { currentLife: 5 });
		const result = applyDamage(state, "e1", 2);
		const health = getComponent<HealthComponent>(result.world, "e1", "health");
		expect(health).toBeDefined();
		expect(health?.current).toBe(3);
	});

	it("abre a janela evt_hit para a criatura atingida, não para as outras", () => {
		const state = {
			...makeState(
				{ cardId: "hero_silver_warrior", currentLife: 10 },
				{
					cardId: "creature_wet_stone_slime",
					currentLife: 5,
				},
			),
			despertar: 4 as const,
		};
		const result = applyDamage(state, "e1", 1, {
			sourceId: "h1",
			damageType: "attack",
		});
		expect(
			collectTriggerCandidates(state, "evt_hit").map((x) => x.definition.id),
		).toContain("purple_veil_retaliation");
		// Retaliação do Véu causa 1 de dano no herói agressor, além do dano no slime.
		expect(result.activeEnemies[0]!.currentLife).toBe(4);
		expect(result.heroes[0]!.currentLife).toBe(9);
	});

	it("não trata dano direto como acerto de ataque", () => {
		const state = {
			...makeState(
				{ cardId: "hero_silver_warrior" },
				{
					cardId: "creature_wet_stone_slime",
				},
			),
			despertar: 4 as const,
		};
		const result = applyDamage(state, "e1", 1, { sourceId: "h1" });
		expect(result.heroes[0]!.currentLife).toBe(10);
	});

	it.each([false, true])("limpa criatura após dano letal com poder preparado=%s", (prepared) => {
		let state = makeState({}, { currentLife: 1 });
		state = {
			...state,
			status: "HERO_ACTION",
			world: upsertEntity(state.world, createEntity("e1", "enemy")),
		};
		const key = preparedAbilityKey("hero", "h1", "hero_crimson_barbarian", "power_mighty_crimson_fury");
		if (prepared) state = { ...state, preparedAbilities: { [key]: {
			key, sourceKind: "hero", sourceHeroId: "h1", sourceCardId: "hero_crimson_barbarian",
			abilityId: "power_mighty_crimson_fury", event: "evt_damage_dealt",
		} } };
		const result = applyDamage(state, "e1", 1, { sourceId: "h1" });
		expect(result.pendingTriggerInterrupt).toBeUndefined();
		expect(result.world.entities.e1).toBeUndefined();
		expect(result.combat?.heroesActed).toEqual([]);
		expect(result.preparedAbilities?.[key]).toBeUndefined();
	});

	it.each([false, true])("conclui ataque com poder preparado=%s", (prepared) => {
		const base = makeState({}, { currentLife: 2 });
		const state: GameState = {
			...base,
			status: "RESOLVE_ATTACK",
			combat: {
				...base.combat!,
				phase: "resolving",
				lastRoll: {
					heroId: "h1",
					enemyId: "e1",
					heroResults: [6],
					heroTotal: 10,
					heroBreakdown: [],
					enemyResults: [1],
					enemyTotal: 1,
					enemyBreakdown: [],
				},
			},
		};
		const key = preparedAbilityKey("hero", "h1", "hero_crimson_barbarian", "power_mighty_crimson_fury");
		const ready = prepared ? { ...state, preparedAbilities: { [key]: {
			key, sourceKind: "hero" as const, sourceHeroId: "h1", sourceCardId: "hero_crimson_barbarian",
			abilityId: "power_mighty_crimson_fury", event: "evt_damage_dealt" as const,
		} } } : state;
		const result = handleResolveAttack(ready);
		expect(result.pendingTriggerInterrupt).toBeUndefined();
		expect(result.combat?.heroesActed).toContain("h1");
		expect(result.status).toBe("CHECK_COMBAT_END");
	});

	it("abre evt_destroy para a criatura derrotada", () => {
		const state = {
			...makeState(
				{ cardId: "hero_silver_warrior" },
				{
					cardId: "creature_dead_passage_thief",
					currentLife: 1,
				},
			),
			despertar: 4 as const,
			decks: {
				...makeState().decks,
				dungeonDeck: {
					available: ["room_a", "room_b"],
					discarded: [],
					removed: [],
				},
			},
		};
		const result = applyDamage(state, "e1", 1, { sourceId: "h1" });
		expect(result.activeEnemies[0]!.status).toBe("defeated");
		expect(result.decks.dungeonDeck.available).toEqual(["room_b"]);
	});
});

// ── applyDamageMin1 ───────────────────────────────────────────────────────────

describe("applyDamageMin1 — herói", () => {
	it("clampeia em 1 se dano excede vida atual", () => {
		const state = makeState({ currentLife: 2 });
		const result = applyDamageMin1(state, "h1", 10);
		expect(result.heroes[0]!.currentLife).toBe(1);
	});

	it("nunca define status 'defeated' (vida mínima é 1)", () => {
		const state = makeState({ currentLife: 1 });
		const result = applyDamageMin1(state, "h1", 5);
		expect(result.heroes[0]!.status).toBe("active");
		expect(result.heroes[0]!.currentLife).toBe(1);
	});

	it("aplica dano normalmente quando não atinge o mínimo", () => {
		const state = makeState({ currentLife: 8 });
		const result = applyDamageMin1(state, "h1", 3);
		expect(result.heroes[0]!.currentLife).toBe(5);
	});

	it("sincroniza ECS world com vida clampada", () => {
		const state = makeState({ currentLife: 2 });
		const result = applyDamageMin1(state, "h1", 10);
		const health = getComponent<HealthComponent>(result.world, "h1", "health");
		expect(health?.current).toBe(1);
	});
});
