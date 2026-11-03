import { describe, expect, it } from "vitest";
import { scriptedDice } from "./dice";
import {
	addCard,
	addToCounter,
	cardsOf,
	counterOf,
	createEngineState,
	drawCards,
	engineOf,
	gameOf,
	instanceOf,
	moveCard,
	removeCard,
	reorderZone,
	rollInto,
	shuffleZone,
	withEngine,
	withGame,
	zoneHolding,
	zoneOf,
} from "./state";

const base = (dados = [1, 1, 4]) =>
	createEngineState({
		dice: scriptedDice(dados),
		players: ["p1", "p2"],
		cards: [
			{ id: "x1", defId: "copia" },
			{ id: "x2", defId: "copia" },
			{ id: "y1", defId: "outra", owner: "p1" },
		],
		zones: [
			{ id: "a", cards: ["x1", "x2", "y1"] },
			{ id: "b", owner: "p1", visibility: "owner", ordered: false },
			{ id: "d" },
		],
	});

describe("estado da engine", () => {
	it("compra do topo e emite eventos com seq", () => {
		const s = drawCards(base(), "a", "b", 2);
		expect(cardsOf(s, "a")).toEqual(["y1"]);
		expect(cardsOf(s, "b")).toEqual(["x1", "x2"]);
		expect(s.events.map((e) => [e.seq, e.type])).toEqual([
			[0, "carta.movida"],
			[1, "carta.movida"],
		]);
	});

	it("zonas guardam metadados", () => {
		expect(zoneOf(base(), "b")).toEqual({
			id: "b",
			owner: "p1",
			visibility: "owner",
			ordered: false,
			cards: [],
		});
		expect(zoneOf(base(), "a")).toMatchObject({
			visibility: "public",
			ordered: true,
		});
		expect(base().players).toEqual(["p1", "p2"]);
	});

	it("duas cópias da mesma definição se movem de forma independente", () => {
		const s = moveCard(base(), "x2", "a", "b");
		expect(cardsOf(s, "a")).toEqual(["x1", "y1"]);
		expect(cardsOf(s, "b")).toEqual(["x2"]);
		expect(instanceOf(s, "x2").defId).toBe(instanceOf(s, "x1").defId);
	});

	it("falha ao mover carta ausente, instância/zona inexistente e compra em zona vazia", () => {
		expect(() => moveCard(base(), "x1", "b", "a")).toThrow(/não está/);
		expect(() => moveCard(base(), "nada", "a", "b")).toThrow(/Instância/);
		expect(() => zoneOf(base(), "nada")).toThrow(/Zona desconhecida/);
		expect(() => drawCards(base(), "b", "a", 1)).toThrow(/vazia/);
	});

	it("valida a criação do estado", () => {
		const dice = scriptedDice([]);
		expect(() =>
			createEngineState({ dice, zones: [{ id: "a", cards: ["z"] }] }),
		).toThrow(/inexistente/);
		expect(() =>
			createEngineState({
				dice,
				cards: [{ id: "z", defId: "d" }],
				zones: [
					{ id: "a", cards: ["z"] },
					{ id: "b", cards: ["z"] },
				],
			}),
		).toThrow(/mais de uma zona/);
	});

	it("drawCards com política stop encerra sem erro", () => {
		const vazio = drawCards(base(), "d", "b", 2, { onEmpty: "stop" });
		expect(cardsOf(vazio, "b")).toEqual([]);
		const parcial = drawCards(base(), "a", "b", 5, { onEmpty: "stop" });
		expect(cardsOf(parcial, "b")).toEqual(["x1", "x2", "y1"]);
	});

	it("drawCards com reshuffle-from reabastece a partir do descarte", () => {
		const start = moveCard(
			moveCard(base([1, 1]), "x1", "a", "d"),
			"x2",
			"a",
			"d",
		);
		const s = drawCards(start, "a", "b", 2, {
			onEmpty: "reshuffle-from",
			source: "d",
		});
		expect(cardsOf(s, "b")).toHaveLength(2);
		expect(cardsOf(s, "d")).toEqual([]);
		expect(s.events.some((e) => e.type === "zona.embaralhada")).toBe(true);
	});

	it("reshuffle-from sem nada na origem também para", () => {
		const s = drawCards(base(), "d", "b", 1, {
			onEmpty: "reshuffle-from",
			source: "b",
		});
		expect(cardsOf(s, "b")).toEqual([]);
	});

	it("embaralha via dados e rola com evento", () => {
		const s = shuffleZone(base(), "a");
		expect(cardsOf(s, "a")).toEqual(["x2", "y1", "x1"]);
		const r = rollInto(s, 6);
		expect(r.value).toBe(4);
		expect(r.state.events.at(-1)).toEqual({
			seq: 1,
			type: "dado.rolado",
			payload: { faces: 6, value: 4 },
		});
	});

	it("contadores têm escopo e acumulam", () => {
		const pts = { scope: "jogador", id: "p1", name: "pontos" };
		const s = addToCounter(addToCounter(base(), pts, 2), pts, 3);
		expect(counterOf(s, pts)).toBe(5);
		expect(counterOf(s, { ...pts, id: "p2" })).toBe(0);
		expect(s.events.at(-1)?.payload).toEqual({
			counter: pts,
			delta: 3,
			value: 5,
		});
	});

	it("acessores leem e atualizam engine e jogo", () => {
		const pts = { scope: "partida", id: "-", name: "n" };
		const state = { engine: base(), game: { fase: 1 } };
		const next = withGame(
			withEngine(state, (e) => addToCounter(e, pts, 1)),
			(g) => ({ fase: g.fase + 1 }),
		);
		expect(counterOf(engineOf(next), pts)).toBe(1);
		expect(gameOf(next)).toEqual({ fase: 2 });
		expect(gameOf(state)).toEqual({ fase: 1 });
	});
});

describe("criar, remover e reordenar instâncias", () => {
	it("addCard registra a instância no fim da zona sem emitir evento", () => {
		const s = addCard(base(), { id: "z1", defId: "nova" }, "d");
		expect(cardsOf(s, "d")).toEqual(["z1"]);
		expect(instanceOf(s, "z1").defId).toBe("nova");
		expect(s.events).toEqual([]);
		expect(() => addCard(s, { id: "z1", defId: "nova" }, "d")).toThrow(/duplicada/);
	});

	it("removeCard apaga a instância e a tira da zona", () => {
		const s = removeCard(base(), "x1");
		expect(cardsOf(s, "a")).toEqual(["x2", "y1"]);
		expect(s.cards["x1"]).toBeUndefined();
		expect(() => removeCard(s, "x1")).toThrow(/desconhecida/);
	});

	it("reorderZone aceita só permutações do conteúdo", () => {
		const s = reorderZone(base(), "a", ["y1", "x1", "x2"]);
		expect(cardsOf(s, "a")).toEqual(["y1", "x1", "x2"]);
		expect(() => reorderZone(base(), "a", ["y1", "x1"])).toThrow(/permutação/);
		expect(() => reorderZone(base(), "a", ["y1", "x1", "x1"])).toThrow(/permutação/);
	});

	it("zoneHolding diz onde a instância está", () => {
		const s = moveCard(base(), "x1", "a", "b");
		expect(zoneHolding(s, "x1")).toBe("b");
		expect(zoneHolding(s, "nada")).toBeUndefined();
	});
});
