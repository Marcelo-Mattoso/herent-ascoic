import { describe, expect, it } from "vitest";
import { calculateTotal, resolveAttack } from "./combat";

describe("calculateTotal", () => {
	it("soma dados sem bônus", () => {
		const result = calculateTotal([3, 4], []);
		expect(result.dice).toBe(7);
		expect(result.bonus).toBe(0);
		expect(result.total).toBe(7);
	});

	it("soma dados com múltiplos bônus discriminados", () => {
		const result = calculateTotal(
			[5],
			[
				{ source: "Adaga Enferrujada", value: 1 },
				{ source: "habilidade", value: 3 },
			],
		);
		expect(result.dice).toBe(5);
		expect(result.bonus).toBe(4);
		expect(result.total).toBe(9);
		expect(result.breakdown).toHaveLength(2);
	});

	it("aceita array de dados vazio", () => {
		const result = calculateTotal([], [{ source: "bônus fixo", value: 2 }]);
		expect(result.total).toBe(2);
	});
});

describe("resolveAttack", () => {
	it("herói ganha: inimigo sofre o dano do herói", () => {
		const result = resolveAttack(10, 7, 3, 5);
		expect(result.outcome).toBe("hero_wins");
		expect(result.enemyDamageTaken).toBe(3);
		expect(result.heroDamageTaken).toBe(0);
	});

	it("inimigo ganha: herói sofre o dano do inimigo", () => {
		const result = resolveAttack(6, 9, 3, 5);
		expect(result.outcome).toBe("enemy_wins");
		expect(result.heroDamageTaken).toBe(5);
		expect(result.enemyDamageTaken).toBe(0);
	});

	it("empate: ambos sofrem 1 de dano", () => {
		const result = resolveAttack(8, 8, 3, 5);
		expect(result.outcome).toBe("tie");
		expect(result.heroDamageTaken).toBe(1);
		expect(result.enemyDamageTaken).toBe(1);
	});

	it("empate com totais zero também aplica 1 de dano a cada lado", () => {
		const result = resolveAttack(0, 0, 4, 4);
		expect(result.outcome).toBe("tie");
		expect(result.heroDamageTaken).toBe(1);
		expect(result.enemyDamageTaken).toBe(1);
	});
});
