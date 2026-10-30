import { describe, expect, it } from "vitest";
import { createRng } from "../ports/random";
import { shuffleRng } from "../reducer/utils";
import { deckOf, discardDeckTop, shuffleDeck, withDeck } from "./access";
import { createInitialGameState } from "./gameState";
import {
	createDeckEngine,
	dealDecks,
	DECK_NAMES,
	EMPTY_PILES,
	readPiles,
	writePiles,
	zoneName,
	zoneViolation,
} from "./zones";

const base = () => createInitialGameState({ heroCardIds: [] });

describe("zonas dos baralhos", () => {
	it("cria as 12 zonas com visibilidade por pilha", () => {
		const engine = createDeckEngine();
		expect(Object.keys(engine.zones)).toHaveLength(12);
		expect(engine.zones["dungeon.available"].visibility).toBe("hidden");
		expect(engine.zones["item.discarded"].visibility).toBe("public");
		expect(engine.zones["artifact.removed"].visibility).toBe("count");
	});

	it("instâncias têm ids determinísticos defId#n e topo é o índice 0", () => {
		const engine = writePiles(createDeckEngine(), "itemDeck", {
			...EMPTY_PILES,
			available: ["a", "b", "a"],
		});
		expect(engine.zones["item.available"].cards).toEqual(["a#0", "b#0", "a#1"]);
		expect(readPiles(engine, "itemDeck").available).toEqual(["a", "b", "a"]);
		expect(zoneViolation(engine)).toBeNull();
	});

	it("escrever pilhas move instâncias existentes em vez de recriá-las", () => {
		const start = writePiles(createDeckEngine(), "itemDeck", {
			...EMPTY_PILES,
			available: ["a", "b", "c"],
		});
		const next = writePiles(start, "itemDeck", {
			available: ["c", "a"],
			discarded: ["b"],
			removed: [],
		});
		expect(next.zones["item.available"].cards).toEqual(["c#0", "a#0"]);
		expect(next.zones["item.discarded"].cards).toEqual(["b#0"]);
		expect(zoneViolation(next)).toBeNull();
		expect(writePiles(next, "itemDeck", readPiles(next, "itemDeck"))).toBe(next);
	});

	it("carta que sai do baralho some das instâncias e volta com id novo", () => {
		let engine = writePiles(createDeckEngine(), "itemDeck", {
			...EMPTY_PILES,
			available: ["a"],
		});
		engine = writePiles(engine, "itemDeck", EMPTY_PILES);
		expect(Object.keys(engine.cards)).toEqual([]);
		engine = writePiles(engine, "itemDeck", { ...EMPTY_PILES, discarded: ["a"] });
		expect(engine.zones["item.discarded"].cards).toEqual(["a#1"]);
		expect(zoneViolation(engine)).toBeNull();
	});

	it("não registra eventos da engine no estado do jogo", () => {
		let state = withDeck(base(), "dungeonDeck", {
			...EMPTY_PILES,
			available: ["x", "y", "z"],
		});
		state = discardDeckTop(shuffleDeck(state, "dungeonDeck"), "dungeonDeck", 2);
		expect(state.engine.events).toEqual([]);
	});

	it("dealDecks embaralha cada baralho com o mesmo consumo de RNG do jogo", () => {
		const lists = {
			dungeonDeck: Array.from({ length: 30 }, (_, i) => `r${i}`),
			enemyDeck: Array.from({ length: 12 }, (_, i) => `e${i}`),
			itemDeck: Array.from({ length: 20 }, (_, i) => `i${i}`),
			artifactDeck: Array.from({ length: 7 }, (_, i) => `a${i}`),
		};
		for (const seed of [1, 42, 999]) {
			const dealt = dealDecks(createRng(seed), lists);
			let rng = createRng(seed);
			for (const name of DECK_NAMES) {
				const { value, next } = shuffleRng(lists[name], rng);
				rng = next;
				expect(readPiles(dealt.engine, name).available).toEqual(value);
			}
			expect(dealt.rng).toEqual(rng);
			expect(zoneViolation(dealt.engine)).toBeNull();
		}
	});

	it("discardDeckTop move o topo para o descarte na ordem", () => {
		let state = withDeck(base(), "dungeonDeck", {
			...EMPTY_PILES,
			available: ["x", "y", "z"],
			discarded: ["w"],
		});
		state = discardDeckTop(state, "dungeonDeck", 2);
		expect(deckOf(state, "dungeonDeck")).toEqual({
			available: ["z"],
			discarded: ["w", "x", "y"],
			removed: [],
		});
	});

	it("zoneViolation acusa instância em duas zonas, fantasma e órfã", () => {
		const engine = writePiles(createDeckEngine(), "itemDeck", {
			...EMPTY_PILES,
			available: ["a"],
		});
		const dup = {
			...engine,
			zones: {
				...engine.zones,
				"item.discarded": { ...engine.zones["item.discarded"], cards: ["a#0"] },
			},
		};
		expect(zoneViolation(dup)).toMatch(/mais de uma zona/);
		const ghost = {
			...engine,
			zones: {
				...engine.zones,
				"item.discarded": { ...engine.zones["item.discarded"], cards: ["fantasma"] },
			},
		};
		expect(zoneViolation(ghost)).toMatch(/inexistente/);
		const orphan = {
			...engine,
			cards: { ...engine.cards, "b#0": { id: "b#0", defId: "b" } },
		};
		expect(zoneViolation(orphan)).toMatch(/fora de qualquer zona/);
		expect(zoneName("itemDeck", "removed")).toBe("item.removed");
	});
});
