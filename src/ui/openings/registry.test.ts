import { describe, expect, it } from "vitest";
import { getOpeningForBoss, parseOpening } from "./registry";

describe("aberturas registradas por chefe", () => {
	it("resolve as doze cenas de Azhakar com URLs compatíveis com BASE_URL", () => {
		const opening = getOpeningForBoss("boss_azhakar");
		expect(opening?.scenes).toHaveLength(12);
		expect(opening?.musicFileName).toBe("Antes das Cinzas.mp3");
		expect(opening?.scenes[0]).toMatchObject({ id: "scene-01", textKey: "game:opening.fornalha.scene01" });
		expect(opening?.scenes[11]).toMatchObject({ id: "scene-12", textKey: "game:opening.fornalha.scene12" });
		expect(opening?.scenes[0]?.imageUrl).toContain("/generated/openings/assets/fornalha-sombria/abertura/images/scene-01.webp");
	});

	it("não bloqueia chefes sem abertura ou dados inválidos", () => {
		expect(getOpeningForBoss("boss_sem_abertura")).toBeNull();
		expect(parseOpening({ version: 1, type: "prologue", scenes: [] }, "fornalha-sombria", "boss_azhakar")).toBeNull();
	});
	it("carrega as doze cenas da Bruxa com seu próprio roteiro", () => {
		const opening = getOpeningForBoss("boss_great_cauldron_witch");
		expect(opening?.titleKey).toBe("game:opening.bruxa.title");
		expect(opening?.musicFileName).toBe("O Sussurro da Lua Verde.mp3");
		expect(opening?.scenes).toHaveLength(12);
		expect(opening?.scenes.map((scene) => scene.textKey)).toEqual(
			Array.from({ length: 12 }, (_, index) => `game:opening.bruxa.scene${String(index + 1).padStart(2, "0")}`),
		);
		expect(opening?.scenes[0]?.imageUrl).toContain("/generated/openings/assets/torre-grande-bruxa-caldeirao/abertura/images/scene-01.webp");
		expect(opening?.scenes[11]?.imageUrl).toContain("/generated/openings/assets/torre-grande-bruxa-caldeirao/abertura/images/scene-12.webp");
	});

});
