// Script one-off: extrai campos pt-BR de cards.yaml → cards.locale.pt-BR.yaml
// e regrava cards.yaml sem esses campos.
// Uso: node scripts/extract-card-locale.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { parse, stringify } from "yaml";

const YAML_PATH = "src/data/cards.yaml";
const LOCALE_PATH = "src/data/cards.locale.pt-BR.yaml";

const LOCALE_FIELDS_BY_TYPE = {
	hero: ["name", "style"],
	creature: ["name"],
	subboss: ["name"],
	room: ["name"],
	subboss_room: ["name"],
	item: ["name", "tags"],
	artifact: ["name"],
	boss: ["name", "dice", "condition", "artifactBonus", "dungeonScaling", "victory"],
};

const raw = readFileSync(YAML_PATH, "utf8");
const cards = parse(raw);

const locale = {};
const cleaned = [];

for (const card of cards) {
	const fields = LOCALE_FIELDS_BY_TYPE[card.type] ?? [];
	const entry = {};
	const cleanCard = { ...card };

	for (const field of fields) {
		if (card[field] !== undefined) {
			entry[field] = card[field];
			delete cleanCard[field];
		}
	}

	if (Object.keys(entry).length > 0) {
		locale[card.id] = entry;
	}
	cleaned.push(cleanCard);
}

writeFileSync(LOCALE_PATH, stringify(locale, { lineWidth: 0 }));
writeFileSync(YAML_PATH, stringify(cleaned, { lineWidth: 0 }));

console.log(`Extracted locale entries: ${Object.keys(locale).length}`);
console.log(`Cleaned cards: ${cleaned.length}`);
