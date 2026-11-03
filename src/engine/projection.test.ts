import { describe, expect, it } from "vitest";
import { seededDice } from "./dice";
import { appendEvent } from "./events";
import { project } from "./projection";
import {
	createEngineState,
	type EngineEventMap,
	moveCard,
	recordEvent,
} from "./state";

type Mapa = EngineEventMap & { nota: { texto: string } };

function mesa() {
	let state = createEngineState<Mapa>({
		dice: seededDice(1),
		players: ["p1", "p2"],
		cards: [
			{ id: "x#1", defId: "x", owner: "p1" },
			{ id: "y#1", defId: "y", owner: "p2" },
			{ id: "z#1", defId: "z" },
			{ id: "w#1", defId: "w" },
		],
		zones: [
			{ id: "mao:p1", owner: "p1", visibility: "owner", cards: ["x#1"] },
			{ id: "mao:p2", owner: "p2", visibility: "owner", cards: ["y#1"] },
			{ id: "aberta", visibility: "public", cards: ["z#1"] },
			{ id: "pilha", visibility: "hidden", cards: ["w#1"] },
			{ id: "fora", visibility: "count", cards: [] },
		],
	});
	state = moveCard(state, "w#1", "pilha", "mao:p2");
	return state;
}

describe("project", () => {
	it("mostra a mão só ao dono e as zonas públicas a todos", () => {
		const state = mesa();
		const p1 = project(state, "p1");
		expect(p1.zones["mao:p1"]?.cards?.map((c) => c.id)).toEqual(["x#1"]);
		expect(p1.zones["mao:p2"]?.cards).toBeNull();
		expect(p1.zones["mao:p2"]?.count).toBe(2);
		expect(p1.zones.aberta?.cards?.map((c) => c.id)).toEqual(["z#1"]);
		expect(Object.keys(p1.cards).sort()).toEqual(["x#1", "z#1"]);
		const p2 = project(state, "p2");
		expect(Object.keys(p2.cards).sort()).toEqual(["w#1", "y#1", "z#1"]);
	});

	it("zona hidden não mostra nem a contagem; count mostra só o número", () => {
		const state = moveCard(mesa(), "z#1", "aberta", "fora");
		const view = project(state, "p1");
		expect(view.zones.pilha).toMatchObject({ cards: null, count: null });
		expect(view.zones.fora).toMatchObject({ cards: null, count: 1 });
	});

	it("o estado projetado não carrega dado nem instâncias ocultas", () => {
		const json = JSON.stringify(project(mesa(), "p1"));
		expect(json).not.toContain("y#1");
		expect(json).not.toContain("w#1");
		expect(json).not.toContain("seed");
	});

	it("filtra eventos por visibleTo e oculta a carta de movimentos ocultos", () => {
		let state = mesa();
		state = {
			...state,
			events: appendEvent(
				state.events,
				"nota",
				{ texto: "privada" },
				{ visibleTo: ["p2"] },
			) as never,
		};
		state = recordEvent(state, "zona.embaralhada", { zone: "aberta" });
		const p1 = project(state, "p1").events;
		const p2 = project(state, "p2").events;
		expect(p1.some((e) => (e.type as string) === "nota")).toBe(false);
		expect(p2.some((e) => (e.type as string) === "nota")).toBe(true);
		const move1 = p1.find((e) => e.type === "carta.movida");
		const move2 = p2.find((e) => e.type === "carta.movida");
		expect(move1?.payload).toMatchObject({ card: "?" });
		expect(move2?.payload).toMatchObject({ card: "w#1" });
	});

	it("a opção zoneVisibility reclassifica zonas por observador", () => {
		const view = project(mesa(), "p1", {
			zoneVisibility: (zone) =>
				zone.id === "pilha" ? "public" : zone.visibility,
		});
		expect(view.zones.pilha?.visibility).toBe("public");
	});

	it("escolha pendente só mostra as opções a quem decide", () => {
		const state = {
			...mesa(),
			pending: {
				choice: { id: "c", player: "p2", options: ["a", "b"], min: 1, max: 1 },
				stack: [],
			},
		};
		expect(project(state, "p1").pending).toMatchObject({
			id: "c",
			options: null,
		});
		expect(project(state, "p2").pending?.options).toEqual(["a", "b"]);
	});
});
