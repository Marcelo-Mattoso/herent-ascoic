import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const proposedPath = resolve(import.meta.dirname, "proposed-ids.json");
const cardsPath = resolve(root, "src/data/cards.json");

const { cards: proposals } = JSON.parse(readFileSync(proposedPath, "utf8")) as {
	cards: { name: string; type: string; proposedId: string }[];
};

const idByName = new Map(proposals.map((p) => [p.name, p.proposedId]));

const rawCards = JSON.parse(readFileSync(cardsPath, "utf8")) as Record<
	string,
	unknown
>[];

let missing = 0;
const updated = rawCards.map((card) => {
	const name = card.name as string;
	const proposedId = idByName.get(name);
	if (!proposedId) {
		console.error(`MISSING id for card: "${name}"`);
		missing++;
		return card;
	}
	// inject id as first key
	return { id: proposedId, ...card };
});

if (missing > 0) {
	console.error(`\n${missing} card(s) sem id proposto. Abortando.`);
	process.exit(1);
}

writeFileSync(cardsPath, JSON.stringify(updated, null, 2) + "\n");
console.log(`OK: ${updated.length} cartas com id injetado em src/data/cards.json`);
