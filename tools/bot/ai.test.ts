import { describe, expect, it } from "vitest";
import { type AiGameResult, playAiGame, rankMoves } from "./ai";
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

	it("joga sem violar invariantes", () => {
		for (let seed = 1; seed <= 5; seed++) {
			const { violation } = playAiGame(setupFromSeed(seed), SHORT_GAME);
			if (violation?.invariant !== "max_steps_exceeded") expect(violation).toBeNull();
		}
	});
});
