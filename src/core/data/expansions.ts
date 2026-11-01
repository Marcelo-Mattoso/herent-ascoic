import config from "../../../assets/expansions/config.json";
import type { AbilityDefinition } from "./abilityTypes";
import type { AnyCard } from "./cardTypes";
import type { SkillDefinition } from "./skillTypes";

export interface ExpansionCardMetadata {
	readonly name: string;
	readonly image?: string;
	readonly expansionId: string;
}

type ExpansionCard = AnyCard & {
	readonly name: string;
	readonly image?: string;
};

export interface ExpansionPackage {
	readonly id: string;
	readonly name: string;
	readonly version: string;
	readonly cards: readonly ExpansionCard[];
	readonly skills?: readonly SkillDefinition[];
	readonly abilities?: readonly AbilityDefinition[];
}

const discovered = import.meta.glob<ExpansionPackage>(
	"../../../assets/expansions/*/expansion.json",
	{ eager: true, import: "default" },
);
const enabled: ExpansionPackage[] = [];
const cards: AnyCard[] = [];
const metadata = new Map<string, ExpansionCardMetadata>();
const seenExpansions = new Set<string>();

if (config.version !== 1 || !Array.isArray(config.expansions)) {
	throw new Error("Configuração de expansões inválida");
}

for (const entry of config.expansions) {
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id)) {
		throw new Error("ID de expansão inválido: " + entry.id);
	}
	if (seenExpansions.has(entry.id)) {
		throw new Error("Expansão registrada mais de uma vez: " + entry.id);
	}
	seenExpansions.add(entry.id);
	if (!entry.enabled) continue;

	const file = "../../../assets/expansions/" + entry.id + "/expansion.json";
	const pack = discovered[file];
	if (!pack || pack.id !== entry.id || !pack.name || !Array.isArray(pack.cards)) {
		throw new Error("Pacote de expansão inválido ou ausente: " + entry.id);
	}
	enabled.push(pack);
	for (const card of pack.cards) {
		if (!card || typeof card.id !== "string" || !card.id ||
			typeof card.type !== "string" || typeof card.name !== "string" || !card.name ||
			!Array.isArray(card.skills)) {
			throw new Error("Carta inválida na expansão " + pack.id);
		}
		if (metadata.has(card.id)) {
			throw new Error("ID de carta duplicado entre expansões: " + card.id);
		}
		if (card.image && !/^images\/[^/]+\.webp$/.test(card.image)) {
			throw new Error("Imagem com caminho inválido: " + card.image);
		}
		metadata.set(card.id, {
			name: card.name,
			image: card.image,
			expansionId: pack.id,
		});
		const { name: _name, image: _image, ...mechanics } = card;
		cards.push(mechanics as AnyCard);
	}
}

export function getEnabledExpansions(): readonly ExpansionPackage[] {
	return enabled;
}

export function getEnabledExpansionCards(): readonly AnyCard[] {
	return cards;
}

export function getExpansionCardMetadata(cardId: string): ExpansionCardMetadata | undefined {
	return metadata.get(cardId);
}
