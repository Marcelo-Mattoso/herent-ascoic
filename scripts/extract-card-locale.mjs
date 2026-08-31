// Script one-off: extrai campos pt-BR de cards.yaml → cards.locale.pt-BR.yaml
// e regrava cards.yaml sem esses campos.
// Uso: node scripts/extract-card-locale.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { parse, parseDocument, stringify, visit } from "yaml";

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
	boss: [
		"name",
		"dice",
		"condition",
		"artifactBonus",
		"dungeonScaling",
		"victory",
	],
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

// Stringify cleaned cards preserving flow style for numeric arrays
function toFlowYaml(data) {
	const doc = parseDocument(stringify(data, { lineWidth: 0 }));
	visit(doc, {
		Seq(_, node) {
			// Use flow style when all items are numbers
			if (
				node.items.length > 0 &&
				node.items.every((item) => typeof item.value === "number")
			) {
				node.flow = true;
			}
		},
	});
	return doc.toString({ lineWidth: 0 });
}

writeFileSync(LOCALE_PATH, stringify(locale, { lineWidth: 0 }));
writeFileSync(YAML_PATH, toFlowYaml(cleaned));

console.log(`Extracted locale entries: ${Object.keys(locale).length}`);
console.log(`Cleaned cards: ${cleaned.length}`);
