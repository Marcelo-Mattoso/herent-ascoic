// Verifica que TRIGGER_TO_INSTALL cobre todos os triggers reativos do skills.json.
// Falha se uma nova skill aparecer sem mapeamento — protege regressão.
import { describe, expect, it } from "vitest";
import { SKILLS } from "../../../data/skills";
import { hasTriggerCoverage } from "../../../ecs/installTriggers";
import { isManuallyActivatable } from "../../useSkill";

const PASSIVE_TRIGGERS = new Set([
	"while_equipped",
	"while_in_play",
	"while_active",
	"while_room_active",
	"while_room_active_first_combat",
	"room_passive",
]);

describe("installTriggers coverage", () => {
	it("todos os triggers do skills.json têm cobertura no installer", () => {
		const uncovered: string[] = [];
		const seen = new Set<string>();

		for (const def of SKILLS.abilities) {
			const t = def.trigger;
			if (seen.has(t)) continue;
			seen.add(t);

			if (isManuallyActivatable(def)) continue; // on_use path — OK
			if (PASSIVE_TRIGGERS.has(t)) continue; // passivos — OK

			if (!hasTriggerCoverage(t)) {
				uncovered.push(t);
			}
		}

		if (uncovered.length > 0) {
			console.error("Triggers sem cobertura:", uncovered);
		}
		expect(uncovered).toHaveLength(0);
	});
});
