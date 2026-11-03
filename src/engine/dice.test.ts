import { describe, expect, it } from "vitest";
import {
	type Dice,
	float,
	id,
	int,
	remainingScripted,
	roll,
	scriptedDice,
	seededDice,
	shuffleWith,
} from "./dice";

function sequence(start: Dice, faces: number, count: number): number[] {
	let dice = start;
	const out: number[] = [];
	for (let i = 0; i < count; i++) {
		const r = roll(dice, faces);
		out.push(r.value);
		dice = r.next;
	}
	return out;
}

describe("scriptedDice", () => {
	it("entrega os valores na ordem e conta o que sobra", () => {
		const a = roll(scriptedDice([3, 6]), 6);
		expect(a.value).toBe(3);
		const b = roll(a.next, 6);
		expect(b.value).toBe(6);
		expect(remainingScripted(b.next)).toBe(0);
	});

	it("não muta o dado anterior", () => {
		const dice = scriptedDice([2, 2]);
		roll(dice, 6);
		expect(remainingScripted(dice)).toBe(2);
	});

	it("falha com mensagem clara quando a fila acaba", () => {
		const { next } = roll(scriptedDice([1]), 6);
		expect(() => roll(next, 6)).toThrow(/esgotados.*rolagem 2 de d6/);
	});

	it("falha quando o valor está fora de 1..faces", () => {
		expect(() => roll(scriptedDice([7]), 6)).toThrow(/fora da faixa.*1\.\.6/);
		expect(() => roll(scriptedDice([0]), 6)).toThrow(/fora da faixa/);
	});

	it("rejeita faces inválidas", () => {
		expect(() => roll(scriptedDice([1]), 0)).toThrow(/Dado inválido/);
	});
});

describe("seededDice", () => {
	it("é determinístico e sobrevive a JSON", () => {
		const restored = JSON.parse(JSON.stringify(seededDice(42))) as Dice;
		expect(sequence(restored, 6, 8)).toEqual(sequence(seededDice(42), 6, 8));
		expect(sequence(seededDice(42), 6, 50).every((v) => v >= 1 && v <= 6)).toBe(
			true,
		);
	});

	it("seeds diferentes dão sequências diferentes", () => {
		expect(sequence(seededDice(1), 1000, 12)).not.toEqual(
			sequence(seededDice(2), 1000, 12),
		);
	});
});

describe("shuffleWith", () => {
	it("usa uma rolagem por posição, de trás para frente", () => {
		const { items, next } = shuffleWith(scriptedDice([1, 1, 1]), [
			"a",
			"b",
			"c",
			"d",
		]);
		expect(items).toEqual(["b", "c", "d", "a"]);
		expect(remainingScripted(next)).toBe(0);
	});

	it("preserva os elementos com dados semeados", () => {
		const { items } = shuffleWith(seededDice(7), [1, 2, 3, 4, 5]);
		expect([...items].sort()).toEqual([1, 2, 3, 4, 5]);
	});
});

describe("operações puras", () => {
	it("int e roll são consistentes (roll = int + 1) e avançam o contador", () => {
		for (const seed of [0, 1, 42, -7, 2 ** 31]) {
			let a: Dice = seededDice(seed);
			let b: Dice = seededDice(seed);
			for (let i = 0; i < 20; i++) {
				const x: { value: number; next: Dice } = int(a, 10);
				const y: { value: number; next: Dice } = roll(b, 10);
				expect(y.value).toBe(x.value + 1);
				a = x.next;
				b = y.next;
			}
		}
	});

	it("float entrega [0, 1) e não muta o dado original", () => {
		const dice = seededDice(5);
		const drawn = float(dice);
		expect(drawn.value).toBeGreaterThanOrEqual(0);
		expect(drawn.value).toBeLessThan(1);
		expect(dice.counter).toBe(0);
		expect(drawn.next.counter).toBe(1);
	});

	it("id usa duas rolagens e é estável por seed e contador", () => {
		const a = id(seededDice(9), "h");
		const b = id(seededDice(9), "h");
		expect(a.value).toBe(b.value);
		expect(a.value).toMatch(/^h-[0-9a-z]+-[0-9a-z]+$/);
		expect(a.next.counter).toBe(2);
		expect(id(a.next, "h").value).not.toBe(a.value);
	});

	it("int roteirizado devolve valor-1 e valida a faixa", () => {
		const drawn = int(scriptedDice([4]), 6);
		expect(drawn.value).toBe(3);
		expect(() => int(scriptedDice([9]), 6)).toThrow(/fora da faixa/);
	});
});
