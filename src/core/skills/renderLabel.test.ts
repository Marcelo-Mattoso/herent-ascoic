import { afterEach, describe, expect, it } from "vitest";
import enSkills from "../../../locales/en-US/skills.json";
import { i18n } from "@/i18n";
import { renderSkillLabel, renderSkillText } from "./renderLabel";

afterEach(async () => {
	await i18n.changeLanguage("pt-BR");
});

describe("renderização localizada de habilidades", () => {
	it("acompanha o idioma selecionado e interpola os parâmetros da carta", async () => {
		const ref = { skillId: "skill_last_light_healing", params: { value: 3 } };
		i18n.addResourceBundle("en-US", "skills", enSkills, true, true);

		await i18n.changeLanguage("pt-BR");
		expect(renderSkillLabel(ref)).toContain("Cura da Última Luz (3)");

		await i18n.changeLanguage("en-US");
		expect(renderSkillLabel(ref)).toBe(
			"Last Light Healing (3): heal 3 Health on one hero or allied creature.",
		);
		expect(renderSkillText(ref)).toBe("heal 3 Health on one hero or allied creature.");

		await i18n.changeLanguage("pt-BR");
		expect(renderSkillLabel(ref)).toContain("Cura da Última Luz (3)");
	});
});
