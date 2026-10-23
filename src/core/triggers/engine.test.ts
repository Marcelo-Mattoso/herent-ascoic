import { describe, expect, it } from "vitest";
import type { GameState } from "../state/gameState";
import { createInitialGameState } from "../state/gameState";
import { installSkillTriggers } from "../ecs/installTriggers";
import { createEmptyWorld, createEntity, upsertEntity } from "../ecs/world";
import { cardSkills, lookupSkillById } from "../skills/lookup";
import {
	collectTriggerCandidates,
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
		const world = upsertEntity(
			createEmptyWorld(),
			createEntity("h1", "hero"),
		);
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
		const result = fireTrigger(stateWithBarbarianAndDagger(), "evt_attack_declared", {
			triggeredBy: "evt_attack_declared",
			sourceEnemyId: "e1",
		});

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

		const used = markSkillGuardUsed(
			stateWithBarbarianAndDagger(),
			skill,
			"h1",
		);
		expect(guardPassed(used, skill, "h1")).toBe(false);

		const nextRoom = {
			...used,
			oncePer: { ...used.oncePer, room: {} },
		};
		expect(guardPassed(nextRoom, skill, "h1")).toBe(true);
	});
});
