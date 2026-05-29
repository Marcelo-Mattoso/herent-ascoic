import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const skillsPath = resolve(root, "src/data/skills.json");
const cardsPath = resolve(root, "src/data/cards.json");

const rawSkills = JSON.parse(readFileSync(skillsPath, "utf8")) as {
	abilities: { id: string; name: string }[];
};

// Build lookup: skill name → skill canonical id
const skillIdByName = new Map(rawSkills.abilities.map((a) => [a.name, a.id]));

const rawCards = JSON.parse(readFileSync(cardsPath, "utf8")) as Record<
	string,
	unknown
>[];

const SKILL_FIELDS = ["skill", "power", "effect"] as const;

let injected = 0;
let missing = 0;

for (const card of rawCards) {
	for (const field of SKILL_FIELDS) {
		const abilityObj = card[field] as Record<string, unknown> | undefined;
		if (!abilityObj || typeof abilityObj !== "object") continue;
		if ("skillId" in abilityObj) continue; // already done

		const skillName = abilityObj.name as string | undefined;
		if (!skillName) continue;

		const skillId = skillIdByName.get(skillName);
		if (!skillId) {
			// Boss abilities are nested differently (abilities[].effect) — skip those here
			if (field !== "skill" && field !== "power" && field !== "effect")
				continue;
			console.error(
				`MISSING skillId for: "${skillName}" (card: ${card.name}, field: ${field})`,
			);
			missing++;
			continue;
		}

		// rebuild the object with skillId as first key
		card[field] = { skillId, ...abilityObj };
		injected++;
	}
}

// Boss abilities: card.abilities[].effect
for (const card of rawCards) {
	if (card.type !== "boss") continue;
	const abilities = card.abilities as
		| { name: string; effect: Record<string, unknown> }[]
		| undefined;
	if (!abilities) continue;
	for (const bossAbility of abilities) {
		const eff = bossAbility.effect;
		if (!eff || "skillId" in eff) continue;
		const skillName = eff.name as string;
		const skillId = skillIdByName.get(skillName);
		if (!skillId) {
			console.error(`MISSING skillId for boss ability: "${skillName}"`);
			missing++;
			continue;
		}
		bossAbility.effect = { skillId, ...eff };
		injected++;
	}
}

if (missing > 0) {
	console.error(
		`\n${missing} inline skill(s) sem skillId. Verifique os erros acima.`,
	);
	process.exit(1);
}

writeFileSync(cardsPath, JSON.stringify(rawCards, null, 2) + "\n");
console.log(
	`OK: ${injected} referências inline com skillId injetado em src/data/cards.json`,
);
