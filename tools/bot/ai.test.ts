import { describe, expect, it } from "vitest";
import { type AiGameResult, playAiGame, rankMoves, scoreMoves } from "./ai";
import { setupFromSeed } from "./play";
import { setupForRun } from "./profiles";
import { createHeadlessPort } from "./port";
import { gameOf } from "@/engine/state";
import type { BotObservation } from "./observe";

const SHORT_GAME = 300;

describe("IA do bot", () => {
	it("a porta só expõe tela e jogadas", () => {
		const port = createHeadlessPort(setupFromSeed(1));
		expect(Object.keys(port.observe()).sort()).toEqual(["abilities", "actions", "view"]);
	});

	it("a mesma seed reproduz a mesma partida", () => {
		const strip = ({ steps, outcome, roomsCleared }: AiGameResult) => ({ steps, outcome, roomsCleared });
		expect(strip(playAiGame(setupFromSeed(3), SHORT_GAME))).toEqual(
			strip(playAiGame(setupFromSeed(3), SHORT_GAME)),
		);
	}, 60_000);

	it("passa pelo fluxo de dado físico da interface", () => {
		const port = createHeadlessPort(setupFromSeed(1));
		const seen = new Set<string>();
		for (let step = 0; step < 200; step++) {
			for (const action of rankMoves(port.observe())) {
				if (port.act(action).kind === "applied") {
					seen.add(action.type);
					break;
				}
			}
			if (["VICTORY", "DEFEAT"].includes(gameOf(port.inspect()).status)) break;
		}
		expect(seen).toContain("PREPARE_PHYSICAL_ROLL");
		expect(seen).toContain("CONFIRM_DICE_ROLL");
		expect(seen).not.toContain("ROLL_DICE");
	});

	it("não trava no boss com Necromante, seed 1, aleatório, Fácil, Fornalha", () => {
		const setup = { ...setupForRun(1, ["hero_deep_veil_necromancer"], "easy"),
			bossCardId: "boss_azhakar" };
		const result = playAiGame(setup, 1000, undefined, "random");
		expect(result.violation?.invariant).not.toBe("no_legal_action");
	}, 60_000);

	it("prepara e confirma habilidade manual de suporte usando o novo estado", () => {
		const heroId = "cleric-test";
		const ability = {
			abilityId: "skill_last_light_healing",
			sourceCardId: "hero_eternal_rest_cleric",
			label: "Cura da Última Luz",
			kind: "skill", activation: "manual_prepare", status: "available",
			targetRequired: false, validTargetIds: [heroId],
			heals: true, modifiesDice: false,
		} as const;
		const view = {
			status: "HERO_ACTION",
			heroes: [{
				id: heroId, cardId: "hero_eternal_rest_cleric",
				status: "active", currentLife: 3, maxLife: 10,
			}],
			enemies: [], roomsCleared: 1,
			combat: { round: 1, heroesActed: [] },
		};
		const obs = (status: "available" | "prepared") => ({
			view,
			actions: [],
			abilities: { [heroId]: [{ ...ability, status }] },
		}) as unknown as BotObservation;
		expect(rankMoves(obs("available"), "casual")[0]).toMatchObject({
			type: "USE_SKILL", payload: {
				skillId: ability.abilityId, sourceId: heroId,
			},
		});
		expect(rankMoves(obs("available"), "casual")[0]).not.toHaveProperty("payload.targetIds");
		expect(rankMoves(obs("prepared"), "casual")[0]).toMatchObject({
			type: "USE_SKILL", payload: {
				skillId: ability.abilityId, sourceId: heroId, targetIds: [heroId],
			},
		});
	});

	it("cura manual compete com ataque e só toma a vez diante de risco real", () => {
		const port = createHeadlessPort({ ...setupForRun(1, ["hero_eternal_rest_cleric"], "normal"),
			bossCardId: "boss_azhakar" });
		const obs = port.observe();
		const hero = obs.view.heroes[0]!;
		const enemy = { ...hero, id: "enemy-1", cardId: "creature_deep_rift_rat",
			status: "active" as const, currentLife: 10, maxLife: 10,
			damage: 3, dice: 1, hitBonus: 0 };
		const action = { type: "CHOOSE_TARGET", payload: { heroId: hero.id, enemyId: enemy.id } } as const;
		const ability = (obs.abilities[hero.id] ?? []).find((entry) =>
			entry.abilityId === "skill_last_light_healing");
		expect(ability).toBeDefined();
		const scenario = (hp: number) => ({
			view: { ...obs.view, status: "HERO_ACTION" as const,
				heroes: [{ ...hero, currentLife: hp }],
				enemies: [enemy], combat: { round: 1, heroesActed: [], buffsByHero: {} } },
			actions: [action],
			abilities: { [hero.id]: [{ ...ability!, activation: "manual_prepare" as const,
				status: "available" as const, validTargetIds: [hero.id] }] },
		}) as unknown as BotObservation;
		const safe = scenario(hero.maxLife - 2);
		expect(rankMoves(safe, "power-player")[0]).toMatchObject(action);
		const desperate = scenario(2);
		expect(rankMoves(desperate, "power-player")[0]).toMatchObject({
			type: "USE_SKILL", payload: { skillId: "skill_last_light_healing" },
		});
		// Após três rodadas sem atingir o inimigo, até a cura de emergência
		// deixa de bloquear a progressão ofensiva indefinidamente.
		expect(scoreMoves(desperate, "power-player", 1, 0, { stagnantRounds: 3 })[0]?.action)
			.toMatchObject(action);
	});

	it("o Mago solo não abre mão de matar o inimigo para renovar um buff", () => {
		const port = createHeadlessPort({ ...setupForRun(1, ["hero_crimson_rune_mage"], "normal"),
			bossCardId: "boss_azhakar" });
		const obs = port.observe();
		const hero = obs.view.heroes[0]!;
		const enemy = { ...hero, id: "enemy-2", cardId: "creature_deep_rift_rat",
			status: "active" as const, currentLife: 1, maxLife: 8,
			damage: 2, dice: 1, hitBonus: 0 };
		const attack = { type: "CHOOSE_TARGET", payload: { heroId: hero.id, enemyId: enemy.id } } as const;
		const rune = (obs.abilities[hero.id] ?? []).find((entry) => entry.abilityId === "skill_rift_rune");
		expect(rune).toBeDefined();
		const ready = { view: { ...obs.view, status: "HERO_ACTION" as const,
			combat: { round: 1, heroesActed: [], buffsByHero: {} }, enemies: [enemy] },
			actions: [attack], abilities: { [hero.id]: [{ ...rune!, status: "available" as const,
				activation: "manual_prepare" as const, validTargetIds: [hero.id] }] },
		} as unknown as BotObservation;
		expect(rankMoves(ready, "power-player")[0]).toMatchObject(attack);
	});

	it("joga sem violar invariantes", () => {
		for (let seed = 1; seed <= 5; seed++) {
			const { violation } = playAiGame(setupFromSeed(seed), SHORT_GAME);
			if (violation?.invariant !== "max_steps_exceeded") expect(violation).toBeNull();
		}
	});
});
