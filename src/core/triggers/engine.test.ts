import { describe, expect, it } from "vitest";
import type { GameState } from "../state/gameState";
import { createInitialGameState } from "../state/gameState";
import { installSkillTriggers } from "../ecs/installTriggers";
import { createEmptyWorld, createEntity, upsertEntity } from "../ecs/world";
import { cardSkills, lookupSkillById } from "../skills/lookup";
import { resolveSkillWindow } from "../skills/resolveSkillWindow";
import { reducerCore } from "../reducer";
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

	it("habilidade reativa de herói sempre pede aprovação", () => {
		const state = stateWithBarbarianAndDagger();
		const result = fireTrigger(state, "evt_attack_declared", {
			triggeredBy: "evt_attack_declared",
			sourceHeroId: "h1",
		});

		expect(result.pendingTriggerInterrupt).toMatchObject({
			skillId: "skill_crimson_fury",
			sourceKind: "hero",
			sourceCardId: "hero_crimson_barbarian",
			sourceHeroId: "h1",
			window: "before_attack_roll",
		});
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

	it("pausa em uma interrupção quando o trigger é prompt", () => {
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
			const result = fireTrigger(state, "evt_attack_declared", {
				triggeredBy: "evt_attack_declared",
				sourceHeroId: "h1",
			});

			expect(result.pendingTriggerInterrupt).toMatchObject({
				skillId: "item_skill_deadly_edge",
				sourceKind: "item",
				sourceCardId: "item_rusty_dagger",
				sourceHeroId: "h1",
				window: "before_attack_roll",
				reason: "A Adaga Enferrujada pode alterar esta rolagem.",
			});
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

		const result = fireTrigger(state, "evt_damage_taken", {
			triggeredBy: "evt_damage_taken",
			sourceEnemyId: "e1",
			targetHeroIds: ["h1"],
			targetEnemyIds: ["e1"],
			value: 2,
		});

		expect(result.pendingTriggerInterrupt).toMatchObject({
			skillId: "skill_bastion_guard",
			sourceHeroId: "h1",
			sourceEnemyId: "e1",
			targetHeroIds: ["h1"],
		});
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

		const ownKill = fireTrigger(state, "evt_kill", {
			triggeredBy: "evt_kill",
			sourceHeroId: "h1",
			targetEnemyIds: ["e1"],
		});
		expect(ownKill.pendingTriggerInterrupt).toMatchObject({
			skillId: "power_deep_veil_echo",
			sourceHeroId: "h1",
		});
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

	it("uma reação sem cooldown volta a ficar disponível em outro evento da mesma rodada", () => {
		const ctx = {
			triggeredBy: "evt_attack_declared",
			sourceHeroId: "h1",
			round: 1,
		};
		const first = resolveSkillWindow(stateWithBarbarianAndDagger(), {
			event: "evt_attack_declared",
			ctx,
		});
		expect(first.pendingTriggerInterrupt?.skillId).toBe("skill_crimson_fury");
		const skipped = reducerCore(first, {
			type: "SKIP_TRIGGER_INTERRUPT",
			payload: { interruptId: first.pendingTriggerInterrupt!.id },
		});
		const later = reducerCore(skipped, {
			type: "GAIN_XP",
			payload: { amount: 0 },
		});
		const second = resolveSkillWindow(later, {
			event: "evt_attack_declared",
			ctx,
		});
		expect(second.pendingTriggerInterrupt?.skillId).toBe("skill_crimson_fury");
	});

	it("retoma a janela externa depois de uma reação aberta pelo efeito interno", () => {
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
		const outer = resolveSkillWindow(state, {
			event: "evt_attack_declared",
			ctx: { triggeredBy: "evt_attack_declared", sourceHeroId: "h1", round: 1 },
			resume: { type: "discard_dungeon", count: 1, reason: "effect" },
		});
		expect(outer.pendingTriggerInterrupt?.skillId).toBe("skill_crimson_fury");
		const inner = reducerCore(outer, {
			type: "APPLY_TRIGGER_INTERRUPT", payload: { interruptId: outer.pendingTriggerInterrupt!.id },
		});
		expect(inner.pendingTriggerInterrupt?.event).toBe("evt_would_be_destroyed");
		expect(inner.pendingSkillWindow?.parent?.event).toBe("evt_attack_declared");
		const resumed = reducerCore(inner, {
			type: "APPLY_TRIGGER_INTERRUPT", payload: { interruptId: inner.pendingTriggerInterrupt!.id },
		});
		expect(resumed.pendingTriggerInterrupt).toBeUndefined();
		expect(resumed.heroes[0]?.currentLife).toBe(1);
		expect(resumed.decks.dungeonDeck.available).toHaveLength(1);
	});
});
