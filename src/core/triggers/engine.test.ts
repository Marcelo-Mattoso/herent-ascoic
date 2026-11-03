import { describe, expect, it } from "vitest";
import type { GameState } from "../state/gameState";
import { createInitialGameState } from "../state/gameState";
import { installSkillTriggers } from "../ecs/installTriggers";
import { createEmptyWorld, createEntity, upsertEntity } from "../ecs/world";

import { resolveSkillWindow } from "../skills/resolveSkillWindow";
import { preparedAbilityKey } from "../abilities/prepared";
import {
	collectTriggerCandidates,
	collectPromptTriggers,
	fireTrigger,
	guardPassed,
	markSkillGuardUsed,
} from "./engine";
import { skillById, skillsOf } from "@/core/gameEngine";
import { testEngine } from "@/core/__tests__/testEngine";
import { decksOf, heroesOf, withDecks } from "@/core/state/access";
import { settled } from "../__tests__/fixtures";
import { beginRoom } from "../state/lifecycle";
import { pendingTriggerInterruptOf, effectStackOf } from "../state/access";
import { withGame, gameOf } from "../../engine/state";

function stateWithBarbarianAndDagger(): GameState {
	return settled(withGame(createInitialGameState({
			heroCardIds: ["hero_crimson_barbarian"],
		}), (prevGame) => ({ ...prevGame, heroes: [
			{
				id: "h1",
				cardId: "hero_crimson_barbarian",
				maxLife: 12,
				currentLife: 12,
				damage: 4,
				hitBonus: 5,
				dice: 1,
				activeItems: { hand1: "item_rusty_dagger" },
				backpack: [],
				usedPowers: {},
				conditions: [],
				status: "active",
				playerIndex: 0,
				xp: 0,
			},
		] })));
}

describe("trigger engine", () => {
	it("mantém gatilhos de catálogo fora do bus ECS para não executar duas vezes", () => {
		const world = upsertEntity(createEmptyWorld(), createEntity("h1", "hero"));
		const installed = installSkillTriggers(
			world,
			"h1",
			skillsOf(testEngine, "hero_crimson_barbarian"),
		);

		expect(installed).toBe(world);
		expect(installed.entities.h1?.components).toHaveLength(0);
	});

	it("coleta triggers de qualquer fonte em jogo para a mesma janela", () => {
		const candidates = collectTriggerCandidates(testEngine, 
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
		const result = fireTrigger(testEngine, state, "evt_attack_declared", {
			triggeredBy: "evt_attack_declared",
			sourceHeroId: "h1",
		});

		expect(pendingTriggerInterruptOf(result)).toBeUndefined();
		expect(heroesOf(result)[0]?.currentLife).toBe(heroesOf(state)[0]?.currentLife);
	});

	it("não oferece habilidade de ataque do herói durante ataque inimigo", () => {
		const result = fireTrigger(testEngine, 
			stateWithBarbarianAndDagger(),
			"evt_attack_declared",
			{
				triggeredBy: "evt_attack_declared",
				sourceEnemyId: "e1",
			},
		);

		expect(pendingTriggerInterruptOf(result)).toBeUndefined();
	});

	it("trigger voluntário de item exige preparação e não pausa", () => {
		const promptInterrupt = {
			mode: "prompt" as const,
			prompt: "A Adaga Enferrujada pode alterar esta rolagem.",
		};
		const withPrompt = <T extends { id: string }>(def: T): T =>
			def.id === "item_skill_deadly_edge"
				? { ...def, interrupt: promptInterrupt }
				: def;
		const promptEngine: typeof testEngine = {
			...testEngine,
			content: {
				...testEngine.content,
				abilitiesOf: (cardId: string) =>
					testEngine.content
						.abilitiesOf(cardId)
						.map((entry) => ({ ...entry, def: withPrompt(entry.def) })),
				ability: (id: string) => withPrompt(testEngine.content.ability(id)),
			},
		};
		const state = stateWithBarbarianAndDagger();
		const candidate = collectTriggerCandidates(
			promptEngine,
			state,
			"evt_attack_declared",
		).find((c) => c.definition.id === "item_skill_deadly_edge");
		expect(candidate?.definition.interrupt).toEqual(promptInterrupt);

		const key = preparedAbilityKey("item", "h1", "item_rusty_dagger", "item_skill_deadly_edge");
		const result = fireTrigger(promptEngine, withGame(state, (prevGame) => ({ ...prevGame, preparedAbilities: { [key]: {
			key, sourceKind: "item", sourceHeroId: "h1", sourceCardId: "item_rusty_dagger",
			abilityId: "item_skill_deadly_edge", event: "evt_attack_declared",
		} } })), "evt_attack_declared", {
			triggeredBy: "evt_attack_declared",
			sourceHeroId: "h1",
		});

		expect(pendingTriggerInterruptOf(result)).toBeUndefined();
		expect(gameOf(result).preparedAbilities?.[key]).toBeUndefined();
	});

	it("atribui damage_taken ao herói atingido, preservando o inimigo agressor", () => {
		const state: GameState = settled(withGame(stateWithBarbarianAndDagger(), (prevGame) => ({ ...prevGame, heroes: [
				{
					...gameOf(stateWithBarbarianAndDagger()).heroes[0]!,
					cardId: "hero_broken_bastion_warrior",
				},
			] })));

		const key = preparedAbilityKey("hero", "h1", "hero_broken_bastion_warrior", "skill_bastion_guard");
		const result = fireTrigger(testEngine, withGame(state, (prevGame) => ({ ...prevGame, preparedAbilities: { [key]: {
			key, sourceKind: "hero", sourceHeroId: "h1", sourceCardId: "hero_broken_bastion_warrior",
			abilityId: "skill_bastion_guard", event: "evt_damage_taken",
		} } })), "evt_damage_taken", {
			triggeredBy: "evt_damage_taken",
			sourceEnemyId: "e1",
			targetHeroIds: ["h1"],
			targetEnemyIds: ["e1"],
			value: 2,
		});

		expect(pendingTriggerInterruptOf(result)).toBeUndefined();
		expect(gameOf(result).preparedAbilities?.[key]).toBeUndefined();
		expect(effectStackOf(result).pending.length).toBeGreaterThan(0);
	});

	it("permite proteger aliado e não oferece a runa de outro herói", () => {
		const base = stateWithBarbarianAndDagger();
		const bastion: GameState = settled(withGame(base, (prevGame) => ({ ...prevGame, heroes: [
				{ ...heroesOf(base)[0]!, id: "h1", cardId: "hero_broken_bastion_warrior" },
				{ ...heroesOf(base)[0]!, id: "h2", cardId: "hero_broken_bastion_warrior" },
			] })));
		const reactions = collectPromptTriggers(testEngine, bastion, "evt_damage_taken", {
			triggeredBy: "evt_damage_taken",
			sourceEnemyId: "e1",
			targetHeroIds: ["h1"],
			targetEnemyIds: ["e1"],
			value: 2,
		});
		expect(reactions.map((entry) => entry.source.sourceHeroId)).toEqual(["h1", "h2"]);

		const mages: GameState = settled(withGame(bastion, (prevGame) => ({ ...prevGame, heroes: heroesOf(bastion).map((hero) => ({
				...hero,
				cardId: "hero_crimson_rune_mage",
			})) })));
		const rollReactions = collectPromptTriggers(testEngine, mages, "evt_roll", {
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
		const state: GameState = settled(withGame(base, (prevGame) => ({ ...prevGame, heroes: [
				{
					...heroesOf(base)[0]!,
					cardId: "hero_deep_veil_necromancer",
				},
			] })));

		const anotherHeroKill = fireTrigger(testEngine, state, "evt_kill", {
			triggeredBy: "evt_kill",
			sourceHeroId: "h2",
			targetEnemyIds: ["e1"],
		});
		expect(pendingTriggerInterruptOf(anotherHeroKill)).toBeUndefined();

		const key = preparedAbilityKey("hero", "h1", "hero_deep_veil_necromancer", "power_deep_veil_echo");
		const ownKill = fireTrigger(testEngine, withGame(state, (prevGame) => ({ ...prevGame, preparedAbilities: { [key]: {
			key, sourceKind: "hero", sourceHeroId: "h1", sourceCardId: "hero_deep_veil_necromancer",
			abilityId: "power_deep_veil_echo", event: "evt_kill",
		} } })), "evt_kill", {
			triggeredBy: "evt_kill",
			sourceHeroId: "h1",
			targetEnemyIds: ["e1"],
		});
		expect(pendingTriggerInterruptOf(ownKill)).toBeUndefined();
		expect(gameOf(ownKill).preparedAbilities?.[key]).toBeUndefined();
	});

	it("mantém três cargas de Caminho Preservado por jogo, inclusive entre salas", () => {
		const skill = skillById(testEngine, "skill_preserved_path");
		expect(skill).toBeDefined();
		if (!skill) return;

		const first = markSkillGuardUsed(stateWithBarbarianAndDagger(), skill, "h1");
		expect(guardPassed(first, skill, "h1")).toBe(true);
		const second = markSkillGuardUsed(first, skill, "h1");
		expect(guardPassed(second, skill, "h1")).toBe(true);
		const third = markSkillGuardUsed(second, skill, "h1");
		expect(guardPassed(third, skill, "h1")).toBe(false);

		const nextRoom = beginRoom(testEngine, third);
		expect(guardPassed(nextRoom, skill, "h1")).toBe(false);
	});

	it("reação sem cooldown exige nova preparação para outro evento", () => {
		const ctx = {
			triggeredBy: "evt_attack_declared",
			sourceHeroId: "h1",
			round: 1,
		};
		const base = stateWithBarbarianAndDagger();
		const key = preparedAbilityKey("hero", "h1", heroesOf(base)[0]!.cardId, "skill_crimson_fury");
		const prepared: GameState = withGame(base, (prevGame) => ({ ...prevGame, preparedAbilities: { [key]: {
			key, sourceKind: "hero", sourceHeroId: "h1", sourceCardId: heroesOf(base)[0]!.cardId,
			abilityId: "skill_crimson_fury", event: "evt_attack_declared",
		} } }));
		const first = resolveSkillWindow(testEngine, prepared, {
			event: "evt_attack_declared",
			ctx,
		});
		expect(pendingTriggerInterruptOf(first)).toBeUndefined();
		expect(gameOf(first).preparedAbilities?.[key]).toBeUndefined();
		const second = resolveSkillWindow(testEngine, first, {
			event: "evt_attack_declared",
			ctx,
		});
		expect(pendingTriggerInterruptOf(second)).toBeUndefined();
		expect(heroesOf(second)[0]?.currentLife).toBe(heroesOf(first)[0]?.currentLife);
	});

	it("resolve reação aninhada preparada sem pedir confirmação", () => {
		const base = stateWithBarbarianAndDagger();
		const state: GameState = withDecks(settled(withGame(base, (prevGame) => ({ ...prevGame, heroes: [{
				...heroesOf(base)[0]!, currentLife: 2,
				activeItems: { amulet: "item_last_defense_charm" },
			}] }))), {
				...decksOf(base),
				dungeonDeck: { available: ["room_narrow_corridor", "room_dungeon_room"], discarded: [], removed: [] },
			});
		const furyKey = preparedAbilityKey("hero", "h1", heroesOf(state)[0]!.cardId, "skill_crimson_fury");
		const charmKey = preparedAbilityKey("item", "h1", "item_last_defense_charm",
			"ability_prevent_current_destruction", "last_defense_prevent_destruction");
		const armed: GameState = withGame(state, (prevGame) => ({ ...prevGame, preparedAbilities: {
			[furyKey]: { key: furyKey, sourceKind: "hero", sourceHeroId: "h1",
				sourceCardId: heroesOf(state)[0]!.cardId, abilityId: "skill_crimson_fury", event: "evt_attack_declared" },
			[charmKey]: { key: charmKey, sourceKind: "item", sourceHeroId: "h1",
				sourceCardId: "item_last_defense_charm", abilityId: "ability_prevent_current_destruction",
				grantId: "last_defense_prevent_destruction", event: "evt_would_be_destroyed" },
		} }));
		const outer = resolveSkillWindow(testEngine, armed, {
			event: "evt_attack_declared",
			ctx: { triggeredBy: "evt_attack_declared", sourceHeroId: "h1", round: 1 },
		});
		expect(pendingTriggerInterruptOf(outer)).toBeUndefined();
		expect(heroesOf(outer)[0]?.currentLife).toBe(1);
		expect(gameOf(outer).preparedAbilities?.[furyKey]).toBeUndefined();
		expect(gameOf(outer).preparedAbilities?.[charmKey]).toBeUndefined();
	});
});
