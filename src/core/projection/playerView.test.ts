import { describe, expect, it } from "vitest";
import {
	selectActiveHero,
	selectAvailableActions,
	selectEnemiesAvailableAsTargets,
	selectFocusedHero,
	selectHeroesAvailableForRound,
	selectXpSpendOptions,
} from "../../ui/store/selectors";
import { reducer } from "../reducer/index";
import { createInitialGameState } from "../state/gameState";
import { playerView } from "./playerView";
import { testEngine } from "@/core/__tests__/testEngine";
import { awakeningOf, deckOf, enemiesOf, heroesOf, impetoOf, withPowerUsedThisRoom } from "@/core/state/access";
import { gameOf } from "../../engine/state";

const HERO = "hero_crimson_barbarian";

function buildStartedState() {
	const base = createInitialGameState({ heroCardIds: [HERO] });
	return reducer(testEngine, base, {
		type: "START_GAME",
		payload: { heroCardIds: [HERO] },
	});
}

describe("playerView — contrato da projeção", () => {
	it("retorna campos do estado bruto sem perda de informação", () => {
		const state = buildStartedState();
		const view = playerView(testEngine, state);

		expect(view.status).toBe(gameOf(state).status);
		expect(view.heroes.map(({ impeto: _, ...hero }) => hero)).toEqual(heroesOf(state));
		expect(view.heroes.map((hero) => hero.impeto)).toEqual(
			heroesOf(state).map((hero) => impetoOf(state, hero.id)),
		);
		expect(view.enemies).toBe(enemiesOf(state));
		expect(view.currentRoom).toBe(gameOf(state).currentRoom);
		expect(view.groupXp).toBe(gameOf(state).groupXp);
		expect(view.despertar).toBe(awakeningOf(state));
	});

	it("view.combat expõe heroesActed e powersUsedThisRoom do estado de combate", () => {
		const state = buildStartedState();
		const view = playerView(testEngine, state);
		// combat nunca é null — começa com createEmptyCombatState()
		expect(view.combat).not.toBeNull();
		expect(view.combat?.heroesActed).toEqual(gameOf(state).combat?.heroesActed);
		expect(view.combat?.powersUsedThisRoom).toEqual({});
		const hero = heroesOf(state)[0]!;
		const used = playerView(testEngine, withPowerUsedThisRoom(state, hero.id));
		expect(used.combat?.powersUsedThisRoom).toEqual({ [hero.id]: true });
	});

	it("view.combat expõe phase, selectedHeroId, round e lastRoll do estado de combate", () => {
		const state = buildStartedState();
		const view = playerView(testEngine, state);
		expect(view.combat).not.toBeNull();
		expect(view.combat?.phase).toBe(gameOf(state).combat?.phase);
		expect(view.combat?.selectedHeroId).toBe(gameOf(state).combat?.selectedHeroId);
		expect(view.combat?.round).toBe(gameOf(state).combat?.round);
		expect(view.combat?.lastRoll).toBe(gameOf(state).combat?.lastRoll);
	});

	it("view.decks expõe os campos necessários aos selectors", () => {
		const state = buildStartedState();
		const view = playerView(testEngine, state);
		expect(view.decks.dungeonDeck.discarded).toEqual(
			deckOf(state, "dungeonDeck").discarded,
		);
		expect(view.decks.artifactDeck.available).toEqual(
			deckOf(state, "artifactDeck").available,
		);
		expect(view.decks.itemDeck.available).toEqual(
			deckOf(state, "itemDeck").available,
		);
	});

	it("mesma referência de arrays — projeção não clona", () => {
		const state = buildStartedState();
		const view = playerView(testEngine, state);
		expect(playerView(testEngine, state).heroes).toBe(view.heroes);
		expect(view.enemies).toBe(enemiesOf(state));
	});
});

describe("selectors via projeção — spot-checks", () => {
	it("selectActiveHero retorna herói ativo", () => {
		const state = buildStartedState();
		const view = playerView(testEngine, state);
		const hero = selectActiveHero(view);
		expect(hero).not.toBeNull();
		expect(hero?.cardId).toBe(HERO);
	});

	it("selectAvailableActions em ROOM_EFFECT não oferece revelar sala", () => {
		const state = buildStartedState();
		const view = playerView(testEngine, state);
		expect(view.status).toBe("ROOM_EFFECT");
		expect(selectAvailableActions(view)).toEqual([]);
	});

	it("selectXpSpendOptions retorna entradas para todas as opções", () => {
		const state = buildStartedState();
		const view = playerView(testEngine, state);
		const options = selectXpSpendOptions(view);
		expect(options.length).toBeGreaterThan(0);
		expect(options.every((o) => typeof o.cost === "number")).toBe(true);
	});

	it("selectHeroesAvailableForRound retorna herói antes de agir", () => {
		const state = buildStartedState();
		const view = playerView(testEngine, state);
		const available = selectHeroesAvailableForRound(view);
		expect(available.some((h) => h.cardId === HERO)).toBe(true);
	});

	it("selectEnemiesAvailableAsTargets retorna array vazio fora de combate", () => {
		const state = buildStartedState();
		const view = playerView(testEngine, state);
		expect(selectEnemiesAvailableAsTargets(view)).toEqual([]);
	});

	it("selectFocusedHero com id válido retorna herói correto", () => {
		const state = buildStartedState();
		const view = playerView(testEngine, state);
		const hero = view.heroes[0];
		const focused = selectFocusedHero(view, hero.id);
		expect(focused?.id).toBe(hero.id);
	});

	it("selectFocusedHero com id inválido faz fallback pro primeiro ativo", () => {
		const state = buildStartedState();
		const view = playerView(testEngine, state);
		const fallback = selectFocusedHero(view, "id-que-nao-existe");
		expect(fallback?.status).toBe("active");
	});
});
