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

const HERO = "hero_crimson_barbarian";

function buildStartedState() {
	const base = createInitialGameState({ heroCardIds: [HERO] });
	return reducer(base, {
		type: "START_GAME",
		payload: { heroCardIds: [HERO] },
	});
}

describe("playerView — contrato da projeção", () => {
	it("retorna campos do estado bruto sem perda de informação", () => {
		const state = buildStartedState();
		const view = playerView(state);

		expect(view.status).toBe(state.status);
		expect(view.heroes).toBe(state.heroes);
		expect(view.enemies).toBe(state.activeEnemies);
		expect(view.currentRoom).toBe(state.currentRoom);
		expect(view.groupXp).toBe(state.groupXp);
		expect(view.despertar).toBe(state.despertar);
	});

	it("view.combat expõe heroesActed e powersUsedThisRoom do estado de combate", () => {
		const state = buildStartedState();
		const view = playerView(state);
		// combat nunca é null — começa com createEmptyCombatState()
		expect(view.combat).not.toBeNull();
		expect(view.combat?.heroesActed).toEqual(state.combat?.heroesActed);
		expect(view.combat?.powersUsedThisRoom).toEqual(
			state.combat?.powersUsedThisRoom,
		);
	});

	it("view.combat expõe phase, selectedHeroId, round e lastRoll do estado de combate", () => {
		const state = buildStartedState();
		const view = playerView(state);
		expect(view.combat).not.toBeNull();
		expect(view.combat?.phase).toBe(state.combat?.phase);
		expect(view.combat?.selectedHeroId).toBe(state.combat?.selectedHeroId);
		expect(view.combat?.round).toBe(state.combat?.round);
		expect(view.combat?.lastRoll).toBe(state.combat?.lastRoll);
	});

	it("view.decks expõe os campos necessários aos selectors", () => {
		const state = buildStartedState();
		const view = playerView(state);
		expect(view.decks.dungeonDeck.discarded).toEqual(
			state.decks.dungeonDeck.discarded,
		);
		expect(view.decks.artifactDeck.available).toEqual(
			state.decks.artifactDeck.available,
		);
		expect(view.decks.itemDeck.available).toEqual(
			state.decks.itemDeck.available,
		);
	});

	it("mesma referência de arrays — projeção não clona", () => {
		const state = buildStartedState();
		const view = playerView(state);
		expect(view.heroes).toBe(state.heroes);
		expect(view.enemies).toBe(state.activeEnemies);
	});
});

describe("selectors via projeção — spot-checks", () => {
	it("selectActiveHero retorna herói ativo", () => {
		const state = buildStartedState();
		const view = playerView(state);
		const hero = selectActiveHero(view);
		expect(hero).not.toBeNull();
		expect(hero?.cardId).toBe(HERO);
	});

	it("selectAvailableActions em REVEAL_ROOM retorna ['reveal_room']", () => {
		const state = buildStartedState();
		const view = playerView(state);
		expect(view.status).toBe("REVEAL_ROOM");
		expect(selectAvailableActions(view)).toEqual(["reveal_room"]);
	});

	it("selectXpSpendOptions retorna entradas para todas as opções", () => {
		const state = buildStartedState();
		const view = playerView(state);
		const options = selectXpSpendOptions(view);
		expect(options.length).toBeGreaterThan(0);
		expect(options.every((o) => typeof o.cost === "number")).toBe(true);
	});

	it("selectHeroesAvailableForRound retorna herói antes de agir", () => {
		const state = buildStartedState();
		const view = playerView(state);
		const available = selectHeroesAvailableForRound(view);
		expect(available.some((h) => h.cardId === HERO)).toBe(true);
	});

	it("selectEnemiesAvailableAsTargets retorna array vazio fora de combate", () => {
		const state = buildStartedState();
		const view = playerView(state);
		expect(selectEnemiesAvailableAsTargets(view)).toEqual([]);
	});

	it("selectFocusedHero com id válido retorna herói correto", () => {
		const state = buildStartedState();
		const view = playerView(state);
		const hero = view.heroes[0];
		const focused = selectFocusedHero(view, hero.id);
		expect(focused?.id).toBe(hero.id);
	});

	it("selectFocusedHero com id inválido faz fallback pro primeiro ativo", () => {
		const state = buildStartedState();
		const view = playerView(state);
		const fallback = selectFocusedHero(view, "id-que-nao-existe");
		expect(fallback?.status).toBe("active");
	});
});
