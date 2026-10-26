import { describe, expect, it } from "vitest";
import { reducer } from "../reducer";
import type { GameState } from "../state/gameState";
import { createInitialGameState } from "../state/gameState";
import {
	resolveSkillWindow,
} from "../skills/resolveSkillWindow";
import { executeAbilityGrant } from "./executor";
import { preparedAbilityKey } from "./prepared";
import { collectHeroHitBonusesFromItems } from "../rules/itemEffects";
import { getModifierTotal } from "../ecs/world";
import { applyDamage } from "../systems/damageSystem";
import { createEmptyCombatState } from "../state/combatState";

const HERO_CARD_ID = "hero_eternal_rest_cleric";

function startedState(): GameState {
	return reducer(createInitialGameState({ heroCardIds: [HERO_CARD_ID] }), {
		type: "START_GAME",
		payload: { heroCardIds: [HERO_CARD_ID] },
	});
}

describe("executeAbilityGrant", () => {
	it("executa cura de uma poção, descarta a fonte e não gasta a ação do herói", () => {
		const started = startedState();
		const hero = started.heroes[0]!;
		const state: GameState = {
			...started,
			heroes: [{ ...hero, currentLife: hero.currentLife - 3, activeItems: { hand1: "item_lesser_vigor_potion" } }],
		};

		const result = reducer(state, {
			type: "USE_ITEM",
			payload: {
				itemId: "item_lesser_vigor_potion",
				heroId: hero.id,
				targetHeroId: hero.id,
			},
		});

		expect(result.heroes[0]?.currentLife).toBe(hero.currentLife - 1);
		expect(result.heroes[0]?.activeItems.hand1).toBeUndefined();
		expect(result.decks.itemDeck.discarded).toContain("item_lesser_vigor_potion");
		expect(result.combat?.heroesActed).not.toContain(hero.id);
	});

	it("alvo inválido não consome a poção nem o limite de uso", () => {
		const started = startedState();
		const hero = started.heroes[0]!;
		const state: GameState = {
			...started,
			heroes: [{ ...hero, activeItems: { hand1: "item_lesser_vigor_potion" } }],
		};
		const grant = {
			id: "invalid_target_heal", abilityId: "skill_last_light_healing",
			activation: {
				kind: "manual" as const, consumeSource: "discard" as const,
				targeting: { targetType: "tgt_target" as const,
					affectScope: "scp_single" as const, affectObject: "obj_friend" as const },
			},
		};
		const result = executeAbilityGrant(state, {
			source: { kind: "item", cardId: "item_lesser_vigor_potion", sourceHeroId: hero.id },
			grant, triggeredBy: "manual", targetIds: ["missing-hero"],
		});
		expect(result.heroes[0]?.activeItems.hand1).toBe("item_lesser_vigor_potion");
		expect(result.decks.itemDeck.discarded).toEqual(state.decks.itemDeck.discarded);
		expect(result.disabled).toEqual(state.disabled);
	});

	it("aplica o limite da concessão à fonte, não à ability compartilhada", () => {
		const started = startedState();
		const hero = started.heroes[0]!;
		const state: GameState = {
			...started,
			heroes: [{ ...hero, currentLife: hero.currentLife - 6,
				activeItems: { ...hero.activeItems, hand1: "item_silent_dungeon_charm" } }],
		};
		const grant = {
			id: "test_once_per_combat_heal",
			abilityId: "skill_last_light_healing",
			params: { value: 2 },
			activation: {
				kind: "event" as const,
				event: "evt_damage_taken" as const,
				limit: { scope: "combat" as const, maxUses: 1 },
				targeting: {
					targetType: "tgt_self" as const,
					affectScope: "scp_single" as const,
					affectObject: "obj_friend" as const,
				},
			},
		};
		const source = {
			kind: "item" as const,
			cardId: "item_silent_dungeon_charm",
			sourceHeroId: hero.id,
		};

		const once = executeAbilityGrant(state, {
			source,
			grant,
			triggeredBy: "evt_damage_taken",
		});
		const twice = executeAbilityGrant(once, {
			source,
			grant,
			triggeredBy: "evt_damage_taken",
		});

		expect(once.heroes[0]?.currentLife).toBe(hero.currentLife - 4);
		expect(twice.heroes[0]?.currentLife).toBe(once.heroes[0]?.currentLife);
	});

	it("duas fontes compartilham a mesma ability sem compartilhar o limite", () => {
		const started = startedState();
		const hero = started.heroes[0]!;
		const state: GameState = {
			...started,
			heroes: [{ ...hero, currentLife: hero.currentLife - 6,
				activeItems: { ...hero.activeItems, hand1: "item_silent_dungeon_charm", amulet: "item_worn_explorer_rope" } }],
		};
		const activation = {
			kind: "event" as const,
			event: "evt_damage_taken" as const,
			limit: { scope: "combat" as const, maxUses: 1 },
			targeting: {
				targetType: "tgt_self" as const,
				affectScope: "scp_single" as const,
				affectObject: "obj_friend" as const,
			},
		};
		const sourceA = {
			kind: "item" as const,
			cardId: "item_silent_dungeon_charm",
			sourceHeroId: hero.id,
		};
		const sourceB = { ...sourceA, cardId: "item_worn_explorer_rope" };
		const grantA = {
			id: "shared_heal_a",
			abilityId: "skill_last_light_healing",
			params: { value: 2 },
			activation,
		};
		const grantB = { ...grantA, id: "shared_heal_b" };

		const afterA = executeAbilityGrant(state, {
			source: sourceA,
			grant: grantA,
			triggeredBy: "evt_damage_taken",
		});
		const afterB = executeAbilityGrant(afterA, {
			source: sourceB,
			grant: grantB,
			triggeredBy: "evt_damage_taken",
		});

		expect(afterB.heroes[0]?.currentLife).toBe(hero.currentLife - 2);
	});

	it("executa grant preparado na janela de descarte da dungeon", () => {
		const started = startedState();
		const hero = started.heroes[0]!;
		const state: GameState = {
			...started,
			heroes: [
				{
					...hero,
					activeItems: {
						...hero.activeItems,
						hand1: "item_worn_explorer_rope",
					},
				},
			],
		};
		const armed = reducer(state, { type: "USE_ITEM", payload: {
			itemId: "item_worn_explorer_rope", heroId: hero.id,
		} });
		expect(Object.values(armed.preparedAbilities ?? {})).toHaveLength(1);
		const result = resolveSkillWindow(armed, {
			event: "evt_dungeon_discard",
			ctx: { triggeredBy: "evt_dungeon_discard" },
		});
		expect(result.pendingTriggerInterrupt).toBeUndefined();
		expect(result.heroes[0]?.activeItems.hand1).toBeUndefined();
		expect(result.decks.itemDeck.discarded).toContain("item_worn_explorer_rope");
		expect(result.flags.dungeonDiscardPrevented).toBe(true);
	});

	it("Poção de Precisão soma o bônus ao acerto sem alterar os dados", () => {
		const started = startedState();
		const hero = started.heroes[0]!;
		const state: GameState = {
			...started,
			heroes: [{ ...hero, activeItems: { hand1: "item_precision_potion" } }],
		};

		const result = reducer(state, {
			type: "USE_ITEM",
			payload: { itemId: "item_precision_potion", heroId: hero.id },
		});

		expect(getModifierTotal(result.world, hero.id, "hit_bonus")).toBe(4);
		expect(result.decks.itemDeck.discarded).toContain("item_precision_potion");
		expect(result.combat?.heroesActed).not.toContain(hero.id);
	});

	it("Encanto da Chama Baixa concede +2 de acerto enquanto estiver equipado", () => {
		const started = startedState();
		const hero = started.heroes[0]!;
		const state: GameState = {
			...started,
			heroes: [
				{
					...hero,
					activeItems: { ...hero.activeItems, amulet: "item_low_flame_charm" },
				},
			],
		};

		expect(collectHeroHitBonusesFromItems(state.heroes[0]!, state)).toContainEqual({
			source: "Encanto da Chama Baixa",
			value: 2,
		});
	});

	it("Encanto da Última Defesa abre antes da destruição e mantém o herói com 1 de vida", () => {
		const started = startedState();
		const hero = started.heroes[0]!;
		const state: GameState = {
			...started,
			heroes: [
				{
					...hero,
					currentLife: 2,
					activeItems: { ...hero.activeItems, amulet: "item_last_defense_charm" },
				},
			],
		};

		const key = preparedAbilityKey("item", hero.id, "item_last_defense_charm",
			"ability_prevent_current_destruction", "last_defense_prevent_destruction");
		const result = applyDamage({ ...state, preparedAbilities: { [key]: {
			key, sourceKind: "item", sourceHeroId: hero.id, sourceCardId: "item_last_defense_charm",
			abilityId: "ability_prevent_current_destruction", grantId: "last_defense_prevent_destruction",
			event: "evt_would_be_destroyed",
		} } }, hero.id, 5);
		expect(result.pendingTriggerInterrupt).toBeUndefined();

		expect(result.heroes[0]?.currentLife).toBe(1);
		expect(result.heroes[0]?.status).toBe("active");
	});

	it("retoma um ataque letal sem aplicar o dano duas vezes após usar Última Defesa", () => {
		const started = startedState();
		const hero = started.heroes[0]!;
		const state: GameState = {
			...started,
			status: "RESOLVE_ATTACK",
			heroes: [
				{
					...hero,
					currentLife: 2,
					activeItems: { ...hero.activeItems, amulet: "item_last_defense_charm" },
				},
			],
			activeEnemies: [
				{
					id: "e1",
					cardId: "creature_dark_cave_goblin",
					maxLife: 10,
					currentLife: 10,
					damage: 5,
					hitBonus: 0,
					dice: 1,
					tokens: {},
					conditions: [],
					firstDamageTakenThisTurn: false,
					status: "active",
				},
			],
			combat: {
				...createEmptyCombatState(),
				phase: "resolving",
				selectedHeroId: hero.id,
				lastRoll: {
					heroId: hero.id,
					enemyId: "e1",
					heroResults: [1],
					heroTotal: 1,
					heroBreakdown: [],
					enemyResults: [6],
					enemyTotal: 6,
					enemyBreakdown: [],
				},
			},
		};

		const key = preparedAbilityKey("item", hero.id, "item_last_defense_charm",
			"ability_prevent_current_destruction", "last_defense_prevent_destruction");
		const result = reducer({ ...state, preparedAbilities: { [key]: {
			key, sourceKind: "item", sourceHeroId: hero.id, sourceCardId: "item_last_defense_charm",
			abilityId: "ability_prevent_current_destruction", grantId: "last_defense_prevent_destruction",
			event: "evt_would_be_destroyed",
		} } }, { type: "RESOLVE_ATTACK" });
		expect(result.pendingTriggerInterrupt).toBeUndefined();

		expect(result.heroes[0]?.currentLife).toBe(1);
		expect(result.heroes[0]?.status).toBe("active");
		expect(result.combat?.heroesActed).toContain(hero.id);
	});
});
