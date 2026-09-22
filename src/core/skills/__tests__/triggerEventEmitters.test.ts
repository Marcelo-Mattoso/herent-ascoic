import { describe, expect, it } from "vitest";
import { getAllCards } from "../../data/cards";
import { cardAbilityGrants } from "../../data/abilities";
import type { EventName } from "../dsl/types";
import { TRIGGER_EVENT_EMITTERS } from "../resolveSkillWindow";

describe("contrato catálogo → emissor de trigger", () => {
	function declaredEvents(): Set<EventName> {
		return new Set<EventName>([
			...getAllCards().flatMap((card) =>
				cardAbilityGrants(card.id).flatMap((grant) =>
					grant.activation.kind === "event" && grant.activation.event
						? [grant.activation.event]
						: [],
				),
			),
		]);
	}

	it("todo evt_* declarado por uma skill possui emissor real registrado", () => {
		const declared = declaredEvents();

		for (const event of declared) {
			expect(
				TRIGGER_EVENT_EMITTERS[event],
				`${event} está em skills.yaml, mas não tem fluxo emissor registrado.`,
			).toBeDefined();
			expect(TRIGGER_EVENT_EMITTERS[event]).not.toHaveLength(0);
		}
	});

	it("mantém emissores para janelas reservadas mesmo antes de uma fonte usá-las", () => {
		for (const [event, emitters] of Object.entries(TRIGGER_EVENT_EMITTERS)) {
			expect(emitters, `${event} deve ter um emissor concreto`).not.toHaveLength(0);
		}
	});
});
