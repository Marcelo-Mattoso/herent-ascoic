import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const proposedPath = resolve(import.meta.dirname, "proposed-ids.json");
const skillsPath = resolve(root, "src/data/skills.json");

const { cards: cardProposals } = JSON.parse(
	readFileSync(proposedPath, "utf8"),
) as {
	cards: { name: string; type: string; proposedId: string }[];
};

const cardIdByName = new Map(cardProposals.map((p) => [p.name, p.proposedId]));

const raw = JSON.parse(readFileSync(skillsPath, "utf8")) as {
	abilities: {
		id: string;
		usedBy: {
			card?: string;
			cardId?: string;
			cardType: string;
			field: string;
			value: unknown;
		}[];
		[key: string]: unknown;
	}[];
	[key: string]: unknown;
};

let missing = 0;
for (const ability of raw.abilities) {
	for (const usage of ability.usedBy) {
		if ("card" in usage) {
			const cardName = usage.card as string;
			const cardId = cardIdByName.get(cardName);
			if (!cardId) {
				console.error(
					`MISSING card id for usedBy card: "${cardName}" (skill: ${ability.id})`,
				);
				missing++;
				continue;
			}
			// rename card → cardId
			const { card: _, ...rest } = usage;
			Object.assign(usage, { cardId, ...rest });
			delete (usage as Record<string, unknown>).card;
		}
	}
}

if (missing > 0) {
	console.error(`\n${missing} usedBy entries sem cardId. Abortando.`);
	process.exit(1);
}

writeFileSync(skillsPath, JSON.stringify(raw, null, 2) + "\n");
console.log(
	"OK: usedBy[].card → usedBy[].cardId migrado em src/data/skills.json",
);
