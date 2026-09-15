import { describe, expect, it } from "vitest";
import { SKILLS } from "../../data/skills";
import type { EventName } from "../dsl/types";
import { TRIGGER_EVENT_EMITTERS } from "../resolveSkillWindow";

describe("contrato catálogo → emissor de trigger", () => {
	it("todo evt_* declarado por uma skill possui emissor real registrado", () => {
		const declared = new Set<EventName>(
			SKILLS.abilities.flatMap((skill) =>
				skill.trigger?.event ? [skill.trigger.event] : [],
			),
		);

		for (const event of declared) {
			expect(
				TRIGGER_EVENT_EMITTERS[event],
				`${event} está em skills.yaml, mas não tem fluxo emissor registrado.`,
			).toBeDefined();
			expect(TRIGGER_EVENT_EMITTERS[event]).not.toHaveLength(0);
		}
	});

	it("não mantém emissor para evento fora do vocabulário DSL", () => {
		const vocabulary = new Set<EventName>(
			SKILLS.abilities.flatMap((skill) =>
				skill.trigger?.event ? [skill.trigger.event] : [],
			),
		);
		for (const event of Object.keys(TRIGGER_EVENT_EMITTERS) as EventName[]) {
			expect(vocabulary.has(event), `${event} não é declarado no catálogo.`).toBe(
				true,
			);
		}
	});
});
