import { describe, expect, it } from "vitest";
import type { GameState } from "../state/gameState";
import { createInitialGameState } from "../state/gameState";
import { installSkillTriggers } from "../ecs/installTriggers";
import { createEmptyWorld, createEntity, upsertEntity } from "../ecs/world";
import { cardSkills, lookupSkillById } from "../skills/lookup";
import { resolveSkillWindow } from "../skills/resolveSkillWindow";
import { preparedAbilityKey } from "../abilities/prepared";
import {
	collectTriggerCandidates,
	collectPromptTriggers,
	fireTrigger,
	guardPassed,
	markSkillGuardUsed,
} from "./engine";

function stateWithBarbarianAndDagger(): GameState {
	return {
		...createInitialGameState({
			heroCardIds: ["hero_crimson_barbarian"],
		}),
		heroes: [
			{
				id: "h1",
				cardId: "hero_crimson_barbarian",
				maxLife: 12,
				currentLife: 12,
				damage: 4,
				hitBonus: 5,
				dice: 1,
				impeto: 0,
				activeItems: { hand1: "item_rusty_dagger" },
				backpack: [],
				usedPowers: {},
				conditions: [],
				status: "active",
				playerIndex: 0,
				xp: 0,
			},
		],
	};
}

describe("trigger engine", () => {
	it("mantém gatilhos de catálogo fora do bus ECS para não executar duas vezes", () => {
		const world = upsertEntity(createEmptyWorld(), createEntity("h1", "hero"));
		const installed = installSkillTriggers(
			world,
			"h1",
			cardSkills("hero_crimson_barbarian"),
		);

		expect(installed).toBe(world);
		expect(installed.entities.h1?.components).toHaveLength(0);
	});

	it("coleta triggers de qualquer fonte em jogo para a mesma janela", () => {
		const candidates = collectTriggerCandidates(
			stateWithBarbarianAndDagger(),
			"evt_attack_declared",
		);

		expect(candidates.map((c) => c.definition.id)).toEqual([
			"item_skill_deadly_edge",
			"skill_crimson_fury",
		]);
		expect(candidates.map((c) => c.source.kind)).toEqual(["item", "hero"]);
		expect(candidates.every((c) => c.window === "before_attack_roll")).toBe(
			true,
		);
		expect(candidates.map((c) => c.mode)).toEqual(["auto", "prompt"]);
	});

	it("habilidade reativa não preparada segue sem confirmação", () => {
		const state = stateWithBarbarianAndDagger();
		const result = fireTrigger(state, "evt_attack_declared", {
			triggeredBy: "evt_attack_declared",
			sourceHeroId: "h1",
		});

		expect(result.pendingTriggerInterrupt).toBeUndefined();
		expect(result.heroes[0]?.currentLife).toBe(state.heroes[0]?.currentLife);
	});

	it("não oferece habilidade de ataque do herói durante ataque inimigo", () => {
		const result = fireTrigger(
			stateWithBarbarianAndDagger(),
			"evt_attack_declared",
			{
				triggeredBy: "evt_attack_declared",
				sourceEnemyId: "e1",
			},
		);

		expect(result.pendingTriggerInterrupt).toBeUndefined();
	});

	it("trigger voluntário de item exige preparação e não pausa", () => {
		const state = stateWithBarbarianAndDagger();
		const candidate = collectTriggerCandidates(
			state,
			"evt_attack_declared",
		).find((c) => c.definition.id === "item_skill_deadly_edge");
		expect(candidate).toBeDefined();
		if (!candidate) return;

		const originalInterrupt = candidate.definition.interrupt;
		(
			candidate.definition as {
				interrupt?: { mode?: "auto" | "prompt" | "passive"; prompt?: string };
			}
		).interrupt = {
			mode: "prompt",
			prompt: "A Adaga Enferrujada pode alterar esta rolagem.",
		};

		try {
			const key = preparedAbilityKey("item", "h1", "item_rusty_dagger", "item_skill_deadly_edge");
			const result = fireTrigger({ ...state, preparedAbilities: { [key]: {
				key, sourceKind: "item", sourceHeroId: "h1", sourceCardId: "item_rusty_dagger",
				abilityId: "item_skill_deadly_edge", event: "evt_attack_declared",
			} } }, "evt_attack_declared", {
				triggeredBy: "evt_attack_declared",
				sourceHeroId: "h1",
			});

			expect(result.pendingTriggerInterrupt).toBeUndefined();
			expect(result.preparedAbilities?.[key]).toBeUndefined();
		} finally {
			(
				candidate.definition as {
					interrupt?: typeof originalInterrupt;
				}
			).interrupt = originalInterrupt;
		}
	});

	it("atribui damage_taken ao herói atingido, preservando o inimigo agressor", () => {
		const state: GameState = {
			...stateWithBarbarianAndDagger(),
			heroes: [
				{
					...stateWithBarbarianAndDagger().heroes[0]!,
					cardId: "hero_broken_bastion_warrior",
				},
			],
		};

		const key = preparedAbilityKey("hero", "h1", "hero_broken_bastion_warrior", "skill_bastion_guard");
		const result = fireTrigger({ ...state, preparedAbilities: { [key]: {
			key, sourceKind: "hero", sourceHeroId: "h1", sourceCardId: "hero_broken_bastion_warrior",
			abilityId: "skill_bastion_guard", event: "evt_damage_taken",
		} } }, "evt_damage_taken", {
			triggeredBy: "evt_damage_taken",
			sourceEnemyId: "e1",
			targetHeroIds: ["h1"],
			targetEnemyIds: ["e1"],
			value: 2,
		});

		expect(result.pendingTriggerInterrupt).toBeUndefined();
		expect(result.preparedAbilities?.[key]).toBeUndefined();
		expect(result.effectStack.pending.length).toBeGreaterThan(0);
	});

	it("permite proteger aliado e não oferece a runa de outro herói", () => {
		const base = stateWithBarbarianAndDagger();
		const bastion: GameState = {
			...base,
			heroes: [
				{ ...base.heroes[0]!, id: "h1", cardId: "hero_broken_bastion_warrior" },
				{ ...base.heroes[0]!, id: "h2", cardId: "hero_broken_bastion_warrior" },
			],
		};
		const reactions = collectPromptTriggers(bastion, "evt_damage_taken", {
			triggeredBy: "evt_damage_taken",
			sourceEnemyId: "e1",
			targetHeroIds: ["h1"],
			targetEnemyIds: ["e1"],
			value: 2,
		});
		expect(reactions.map((entry) => entry.source.sourceHeroId)).toEqual(["h1", "h2"]);

		const mages: GameState = {
			...bastion,
			heroes: bastion.heroes.map((hero) => ({
				...hero,
				cardId: "hero_crimson_rune_mage",
			})),
		};
		const rollReactions = collectPromptTriggers(mages, "evt_roll", {
			triggeredBy: "evt_roll",
			sourceHeroId: "h1",
			targetEnemyIds: ["e1"],
		});
		expect(rollReactions.length).toBeGreaterThan(0);
		expect(
			rollReactions.every((entry) => entry.source.sourceHeroId === "h1"),
		).toBe(true);
	});

	it("atribui kill somente ao herói que causou o dano", () => {
		const base = stateWithBarbarianAndDagger();
		const state: GameState = {
			...base,
			heroes: [
				{
					...base.heroes[0]!,
					cardId: "hero_deep_veil_necromancer",
				},
			],
		};

		const anotherHeroKill = fireTrigger(state, "evt_kill", {
			triggeredBy: "evt_kill",
			sourceHeroId: "h2",
			targetEnemyIds: ["e1"],
		});
		expect(anotherHeroKill.pendingTriggerInterrupt).toBeUndefined();

		const key = preparedAbilityKey("hero", "h1", "hero_deep_veil_necromancer", "power_deep_veil_echo");
		const ownKill = fireTrigger({ ...state, preparedAbilities: { [key]: {
			key, sourceKind: "hero", sourceHeroId: "h1", sourceCardId: "hero_deep_veil_necromancer",
			abilityId: "power_deep_veil_echo", event: "evt_kill",
		} } }, "evt_kill", {
			triggeredBy: "evt_kill",
			sourceHeroId: "h1",
			targetEnemyIds: ["e1"],
		});
		expect(ownKill.pendingTriggerInterrupt).toBeUndefined();
		expect(ownKill.preparedAbilities?.[key]).toBeUndefined();
	});

	it("mantém cooldown de sala até a sala encerrar e permite novo uso na próxima", () => {
		const skill = lookupSkillById("skill_preserved_path");
		expect(skill).toBeDefined();
		if (!skill) return;

		const used = markSkillGuardUsed(stateWithBarbarianAndDagger(), skill, "h1");
		expect(guardPassed(used, skill, "h1")).toBe(false);

		const nextRoom = {
			...used,
			oncePer: { ...used.oncePer, room: {} },
		};
		expect(guardPassed(nextRoom, skill, "h1")).toBe(true);
	});

	it("reação sem cooldown exige nova preparação para outro evento", () => {
		const ctx = {
			triggeredBy: "evt_attack_declared",
			sourceHeroId: "h1",
			round: 1,
		};
		const base = stateWithBarbarianAndDagger();
		const key = preparedAbilityKey("hero", "h1", base.heroes[0]!.cardId, "skill_crimson_fury");
		const prepared: GameState = { ...base, preparedAbilities: { [key]: {
			key, sourceKind: "hero", sourceHeroId: "h1", sourceCardId: base.heroes[0]!.cardId,
			abilityId: "skill_crimson_fury", event: "evt_attack_declared",
		} } };
		const first = resolveSkillWindow(prepared, {
			event: "evt_attack_declared",
			ctx,
		});
		expect(first.pendingTriggerInterrupt).toBeUndefined();
		expect(first.preparedAbilities?.[key]).toBeUndefined();
		const second = resolveSkillWindow(first, {
			event: "evt_attack_declared",
			ctx,
		});
		expect(second.pendingTriggerInterrupt).toBeUndefined();
		expect(second.heroes[0]?.currentLife).toBe(first.heroes[0]?.currentLife);
	});

	it("resolve reação aninhada preparada sem pedir confirmação", () => {
		const base = stateWithBarbarianAndDagger();
		const state: GameState = {
			...base,
			heroes: [{
				...base.heroes[0]!, currentLife: 2,
				activeItems: { amulet: "item_last_defense_charm" },
			}],
			decks: {
				...base.decks,
				dungeonDeck: { available: ["room_narrow_corridor", "room_dungeon_room"], discarded: [], removed: [] },
			},
		};
		const furyKey = preparedAbilityKey("hero", "h1", state.heroes[0]!.cardId, "skill_crimson_fury");
		const charmKey = preparedAbilityKey("item", "h1", "item_last_defense_charm",
			"ability_prevent_current_destruction", "last_defense_prevent_destruction");
		const armed: GameState = { ...state, preparedAbilities: {
			[furyKey]: { key: furyKey, sourceKind: "hero", sourceHeroId: "h1",
				sourceCardId: state.heroes[0]!.cardId, abilityId: "skill_crimson_fury", event: "evt_attack_declared" },
			[charmKey]: { key: charmKey, sourceKind: "item", sourceHeroId: "h1",
				sourceCardId: "item_last_defense_charm", abilityId: "ability_prevent_current_destruction",
				grantId: "last_defense_prevent_destruction", event: "evt_would_be_destroyed" },
		} };
		const outer = resolveSkillWindow(armed, {
			event: "evt_attack_declared",
			ctx: { triggeredBy: "evt_attack_declared", sourceHeroId: "h1", round: 1 },
		});
		expect(outer.pendingTriggerInterrupt).toBeUndefined();
		expect(outer.heroes[0]?.currentLife).toBe(1);
		expect(outer.preparedAbilities?.[furyKey]).toBeUndefined();
		expect(outer.preparedAbilities?.[charmKey]).toBeUndefined();
	});
});
