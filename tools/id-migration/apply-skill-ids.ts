import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const proposedPath = resolve(import.meta.dirname, "proposed-ids.json");
const skillsPath = resolve(root, "src/data/skills.json");

const { skills: proposals } = JSON.parse(
	readFileSync(proposedPath, "utf8"),
) as {
	skills: {
		name: string;
		category: string;
		currentId: string;
		proposedId: string;
	}[];
};

const idByCurrentId = new Map(
	proposals.map((p) => [p.currentId, p.proposedId]),
);

const raw = JSON.parse(readFileSync(skillsPath, "utf8")) as {
	abilities: { id: string; [key: string]: unknown }[];
	[key: string]: unknown;
};

let missing = 0;
for (const ability of raw.abilities) {
	const newId = idByCurrentId.get(ability.id);
	if (!newId) {
		console.error(`MISSING new id for skill current id: "${ability.id}"`);
		missing++;
		continue;
	}
	ability.id = newId;
}

if (missing > 0) {
	console.error(`\n${missing} skill(s) sem id proposto. Abortando.`);
	process.exit(1);
}

writeFileSync(skillsPath, JSON.stringify(raw, null, 2) + "\n");
console.log(
	`OK: ${raw.abilities.length} skills com id reescrito em src/data/skills.json`,
);
