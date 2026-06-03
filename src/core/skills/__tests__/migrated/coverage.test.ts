// Verifica que installTriggers tem cobertura para todos os triggers reativos do skills.yaml.
// Falha se uma nova skill aparecer sem mapeamento — protege regressão.
import { describe, expect, it } from "vitest";
import { SKILLS } from "../../../data/skills";
import { hasTriggerCoverage, isPassiveTrigger } from "../../../ecs/installTriggers";
import { isManuallyActivatable } from "../../useSkill";

describe("installTriggers coverage", () => {
	it("todos os triggers do skills.yaml têm cobertura no installer", () => {
		const uncovered: string[] = [];
		const seen = new Set<string>();

		for (const def of SKILLS.abilities) {
			const key = def.trigger?.event ?? def.operate_type;
			if (seen.has(key)) continue;
			seen.add(key);

			if (isManuallyActivatable(def)) continue; // op_active / op_active_buff — OK
			if (isPassiveTrigger(def)) continue;       // op_passive — OK

			if (!hasTriggerCoverage(def)) {
				uncovered.push(`${def.id} (${def.operate_type} / ${def.trigger?.event ?? "no-event"})`);
			}
		}

		if (uncovered.length > 0) {
			console.error("Triggers sem cobertura:", uncovered);
		}
		expect(uncovered).toHaveLength(0);
	});
});
