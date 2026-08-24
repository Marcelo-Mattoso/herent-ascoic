import { describe, expect, it } from "vitest";
import { SKILL_LOCALE } from "../skillLocale";
import { SKILLS } from "../skills";

describe("skills.locale.pt-BR — cobertura", () => {
	it("toda skill.id em skills.yaml tem entrada no locale pt-BR", () => {
		const missing: string[] = [];
		for (const ability of SKILLS.abilities) {
			if (!SKILL_LOCALE[ability.id]) {
				missing.push(ability.id);
			}
		}
		expect(
			missing,
			`Skills sem entrada no locale pt-BR:\n${missing.join("\n")}`,
		).toEqual([]);
	});

	it("toda entrada no locale tem ao menos name ou label", () => {
		for (const [id, entry] of Object.entries(SKILL_LOCALE)) {
			expect(
				entry.name ?? entry.label,
				`${id} sem name nem label no locale`,
			).toBeDefined();
		}
	});
});
