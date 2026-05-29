import { describe, expect, it } from "vitest";
import { SKILLS } from "../../data/skills";
import { createInitialGameState } from "../../state/gameState";
import { reducer } from "../../reducer/index";
import { fireOnUseSkill } from "../useSkill";
import { isManuallyActivatable } from "../useSkill";

const HERO = "Bárbaro Rubro";

function buildBaseState() {
	const base = createInitialGameState({ heroCardNames: [HERO] });
	return reducer(base, { type: "START_GAME", payload: { heroCardNames: [HERO] } });
}

describe("isManuallyActivatable — asserts diretos", () => {
	it("Ladino das Fendas (once_per_room_on_dungeon_discard) → false", () => {
		const def = SKILLS.abilities.find((a) => a.id === "skill_preserved_path");
		expect(def).toBeDefined();
		expect(isManuallyActivatable(def!)).toBe(false);
	});

	it("Clérigo skill on_use → true", () => {
		const def = SKILLS.abilities.find((a) => a.id === "skill_last_light_healing");
		expect(def).toBeDefined();
		expect(isManuallyActivatable(def!)).toBe(true);
	});

	it("Necromante once_per_room → true", () => {
		const def = SKILLS.abilities.find((a) => a.id === "skill_return_rite");
		expect(def).toBeDefined();
		expect(isManuallyActivatable(def!)).toBe(true);
	});
});

describe("fireOnUseSkill rejeita iff !isManuallyActivatable", () => {
	it("para toda def em SKILLS.abilities, fireOnUseSkill loga aviso se e somente se !isManuallyActivatable", () => {
		const state = buildBaseState();
		const heroId = state.heroes[0]?.id ?? "";

		for (const def of SKILLS.abilities) {
			const result = fireOnUseSkill(state, { skillId: def.id, sourceId: heroId });
			const lastLog = result.eventLog[result.eventLog.length - 1] ?? "";
			const wasRejected = lastLog.includes("não é ativável manualmente");

			if (!isManuallyActivatable(def)) {
				expect(wasRejected, `skill ${def.id} (${def.trigger}) deveria ser rejeitada`).toBe(true);
			} else {
				expect(wasRejected, `skill ${def.id} (${def.trigger}) não deveria ser rejeitada`).toBe(false);
			}
		}
	});
});
