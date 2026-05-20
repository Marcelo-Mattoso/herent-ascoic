import { describe, expect, it } from "vitest";
import { resolveSkillFor, resolveSkillValue } from "../lookup";

describe("resolveSkillFor", () => {
	it("resolve habilidade do Bárbaro Rubro (skill)", () => {
		const def = resolveSkillFor("Bárbaro Rubro", "skill");
		expect(def).not.toBeNull();
		expect(def?.id).toBe("habilidade-furia-rubra");
		expect(def?.type).toBe("damage_bonus");
	});

	it("resolve poder do Mago das Runas Rubras (power)", () => {
		const def = resolveSkillFor("Mago das Runas Rubras", "power");
		expect(def).not.toBeNull();
		expect(def?.id).toBe("poder_heroi-runa-suprema-das-fendas");
	});

	it("retorna null para carta inexistente", () => {
		const def = resolveSkillFor("Carta Fantasma", "skill");
		expect(def).toBeNull();
	});

	it("retorna null para field inválido no contexto", () => {
		const def = resolveSkillFor("Bárbaro Rubro", "effect");
		expect(def).toBeNull();
	});
});

describe("resolveSkillValue", () => {
	it("retorna 2 para skill do Bárbaro Rubro", () => {
		expect(resolveSkillValue("Bárbaro Rubro", "skill")).toBe(2);
	});

	it("retorna null para carta sem habilidade catalogada", () => {
		expect(resolveSkillValue("Carta Fantasma", "skill")).toBeNull();
	});
});
