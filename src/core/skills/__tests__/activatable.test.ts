import { describe, expect, it } from "vitest";
import { SKILLS } from "../../data/skills";
import { reducer } from "../../reducer/index";
import { createInitialGameState } from "../../state/gameState";
import { fireOnUseSkill, isManuallyActivatable } from "../useSkill";
import { testEngine } from "@/core/__tests__/testEngine";
import { gameOf } from "../../../engine/state";

const HERO = "hero_crimson_barbarian";

function buildBaseState() {
	const base = createInitialGameState({ heroCardIds: [HERO] });
	return reducer(testEngine, base, {
		type: "START_GAME",
		payload: { heroCardIds: [HERO] },
	});
}

describe("isManuallyActivatable — asserts diretos", () => {
	it("Ladino das Fendas (once_per_room_on_dungeon_discard) → false", () => {
		const def = SKILLS.abilities.find((a) => a.id === "skill_preserved_path");
		expect(def).toBeDefined();
		expect(isManuallyActivatable(def!)).toBe(false);
	});

	it("Clérigo skill on_use → true", () => {
		const def = SKILLS.abilities.find(
			(a) => a.id === "skill_last_light_healing",
		);
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
		const heroId = gameOf(state).heroes[0]?.id ?? "";

		for (const def of SKILLS.abilities) {
			const result = fireOnUseSkill(testEngine, state, {
				skillId: def.id,
				sourceId: heroId,
			});
			const lastLog = gameOf(result).eventLog[gameOf(result).eventLog.length - 1] ?? "";
			const wasRejected = lastLog.includes("não é ativável manualmente");

			if (!isManuallyActivatable(def)) {
				expect(
					wasRejected,
					`skill ${def.id} (${def.trigger}) deveria ser rejeitada`,
				).toBe(true);
			} else {
				expect(
					wasRejected,
					`skill ${def.id} (${def.trigger}) não deveria ser rejeitada`,
				).toBe(false);
			}
		}
	});
});
