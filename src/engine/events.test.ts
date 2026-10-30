import { describe, expect, it } from "vitest";
import {
	appendEvent,
	type EngineEvent,
	eventsOfType,
	lastEventOfType,
	stampEvent,
} from "./events";

type NanoMap = {
	golpe: { alvo: string; valor: number };
	fim: { vencedor: string };
};

describe("eventos genéricos", () => {
	it("appendEvent acrescenta com seq crescente sem mutar a lista original", () => {
		const base: readonly EngineEvent<NanoMap>[] = [];
		const one = appendEvent(base, "golpe", { alvo: "a", valor: 2 });
		const two = appendEvent(one, "fim", { vencedor: "x" });
		expect(base).toHaveLength(0);
		expect(one).toEqual([
			{ seq: 0, type: "golpe", payload: { alvo: "a", valor: 2 } },
		]);
		expect(two.map((e) => e.seq)).toEqual([0, 1]);
	});

	it("preserva cause, actor e visibleTo apenas quando informados", () => {
		const events = appendEvent(
			appendEvent<NanoMap, "golpe">([], "golpe", { alvo: "a", valor: 1 }),
			"fim",
			{ vencedor: "p1" },
			{ cause: 0, actor: "p1", visibleTo: ["p1"] },
		);
		expect(events[0]).not.toHaveProperty("cause");
		expect(events[1]).toEqual({
			seq: 1,
			type: "fim",
			payload: { vencedor: "p1" },
			cause: 0,
			actor: "p1",
			visibleTo: ["p1"],
		});
	});

	it("stampEvent numera rascunhos preservando a ordem", () => {
		const events = stampEvent(
			stampEvent<NanoMap>([], { type: "fim", payload: { vencedor: "a" } }),
			{ type: "golpe", payload: { alvo: "b", valor: 1 }, cause: 0 },
		);
		expect(events.map((e) => [e.seq, e.type, e.cause])).toEqual([
			[0, "fim", undefined],
			[1, "golpe", 0],
		]);
	});

	it("eventsOfType filtra por tipo preservando ordem e payload tipado", () => {
		let events: readonly EngineEvent<NanoMap>[] = [];
		events = appendEvent(events, "golpe", { alvo: "a", valor: 1 });
		events = appendEvent(events, "fim", { vencedor: "x" });
		events = appendEvent(events, "golpe", { alvo: "b", valor: 3 });
		expect(eventsOfType(events, "golpe").map((e) => e.payload.valor)).toEqual([
			1, 3,
		]);
		expect(eventsOfType(events, "fim")).toHaveLength(1);
	});

	it("lastEventOfType devolve o mais recente ou undefined", () => {
		const events = appendEvent<NanoMap, "golpe">([], "golpe", {
			alvo: "a",
			valor: 1,
		});
		expect(lastEventOfType(events, "golpe")?.payload.alvo).toBe("a");
		expect(lastEventOfType(events, "fim")).toBeUndefined();
	});
});
