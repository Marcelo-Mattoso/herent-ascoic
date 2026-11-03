import config from "../../../assets/expansions/config.json";
import type { AbilityDefinition } from "./abilityTypes";
import type { AnyCard, BossCard } from "./cardTypes";
import type { SkillDefinition } from "./skillTypes";

export interface ExpansionCardMetadata {
	readonly name: string;
	readonly image?: string;
	readonly expansionId: string;
}
type ExpansionCard = AnyCard & { readonly name: string; readonly image?: string };
export interface ExpansionPackage {
	readonly id: string;
	readonly name: string;
	readonly version: string;
	readonly boss?: string;
	readonly openings?: Readonly<Record<string, string>>;
	readonly cards: readonly ExpansionCard[];
	readonly skills?: readonly SkillDefinition[];
	readonly abilities?: readonly AbilityDefinition[];
}
export interface BossPackage {
	readonly card: BossCard & { readonly name: string; readonly image?: string };
	readonly skills?: readonly SkillDefinition[];
	readonly skillLocales?: Readonly<Record<string, { readonly name?: string; readonly label?: string; readonly text?: string }>>;
	readonly locale?: Readonly<Record<string, string>>;
}

const discovered = import.meta.glob<ExpansionPackage>(
	"../../../assets/expansions/*/expansion.json",
	{ eager: true, import: "default" },
);
const bossDocuments = import.meta.glob<BossPackage>(
	"../../../assets/expansions/*/boss.json",
	{ eager: true, import: "default" },
);
const enabled: ExpansionPackage[] = [];
const cards: AnyCard[] = [];
const metadata = new Map<string, ExpansionCardMetadata>();
const bossSkillDefinitions: SkillDefinition[] = [];
const bossSkillLocales = new Map<string, { readonly name?: string; readonly label?: string; readonly text?: string }>();
const bossCardLocales = new Map<string, Readonly<Record<string, string>>>();
const seenExpansions = new Set<string>();

if (config.version !== 1 || !Array.isArray(config.expansions)) {
	throw new Error("Configuração de expansões inválida");
}

function registerCard(card: ExpansionCard, expansionId: string): void {
	if (!card || typeof card.id !== "string" || !card.id ||
		typeof card.type !== "string" || typeof card.name !== "string" || !card.name ||
		!Array.isArray(card.skills)) {
		throw new Error("Carta inválida na expansão " + expansionId);
	}
	if (metadata.has(card.id)) throw new Error("ID de carta duplicado entre expansões: " + card.id);
	if (card.image && !/^images\/[^/]+\.webp$/.test(card.image)) {
		throw new Error("Imagem com caminho inválido: " + card.image);
	}
	metadata.set(card.id, { name: card.name, image: card.image, expansionId });
	const { name: _name, image: _image, ...mechanics } = card;
	cards.push(mechanics as AnyCard);
}

for (const entry of config.expansions) {
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id)) {
		throw new Error("ID de expansão inválido: " + entry.id);
	}
	if (seenExpansions.has(entry.id)) throw new Error("Expansão registrada mais de uma vez: " + entry.id);
	seenExpansions.add(entry.id);
	if (!entry.enabled) continue;

	const file = "../../../assets/expansions/" + entry.id + "/expansion.json";
	const pack = discovered[file];
	if (!pack || pack.id !== entry.id || !pack.name || !Array.isArray(pack.cards)) {
		throw new Error("Pacote de expansão inválido ou ausente: " + entry.id);
	}
	enabled.push(pack);
	for (const card of pack.cards) registerCard(card, pack.id);
	if (pack.boss) {
		if (pack.boss !== "boss.json") throw new Error("Referência inválida de boss: " + pack.boss);
		const boss = bossDocuments["../../../assets/expansions/" + pack.id + "/boss.json"];
		if (!boss?.card || boss.card.type !== "boss") {
			throw new Error("Ficha de boss inválida na expansão " + pack.id);
		}
		if (pack.cards.some((card) => card.type === "boss")) {
			throw new Error("Boss deve existir apenas em boss.json: " + pack.id);
		}
		registerCard(boss.card, pack.id);
		bossSkillDefinitions.push(...(boss.skills ?? []));
		for (const [id, locale] of Object.entries(boss.skillLocales ?? {})) {
			if (bossSkillLocales.has(id)) throw new Error("ID de texto de habilidade duplicado: " + id);
			bossSkillLocales.set(id, locale);
		}
		if (boss.locale) bossCardLocales.set(boss.card.id, boss.locale);
	}
}

export function getEnabledExpansions(): readonly ExpansionPackage[] { return enabled; }
export function getEnabledExpansionCards(): readonly AnyCard[] { return cards; }
export function getExpansionCardMetadata(cardId: string): ExpansionCardMetadata | undefined { return metadata.get(cardId); }
export function getEnabledBossSkillDefinitions(): readonly SkillDefinition[] { return bossSkillDefinitions; }
export function getExpansionBossSkillLocale(id: string) { return bossSkillLocales.get(id); }
export function getExpansionBossCardLocale(id: string) { return bossCardLocales.get(id); }
