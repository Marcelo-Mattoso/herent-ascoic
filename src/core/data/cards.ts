// Loader do catálogo de cartas habilitado: YAML legado e JSON das expansões.
// Nenhuma lógica de jogo aqui — apenas acesso e filtragem do catálogo.

import { parse } from "yaml";
import cardsYaml from "../../data/cards.yaml?raw";
import { getCardLocale } from "./cardLocale";
import { EXPANSIONS } from "@/config/expansions";
import { EXPANSION_CARDS } from "./expansionCards";
import type {
	AnyCard,
	ArtifactCard,
	BossCard,
	CreatureCard,
	HeroCard,
	ItemCard,
	RoomCard,
	SubbossCard,
	SubbossRoomCard,
} from "./cardTypes";

const LOCALE_FIELDS = [
	"name",
	"style",
	"tags",
	"condition",
	"victory",
	"dice",
	"artifactBonus",
	"dungeonScaling",
] as const;

// Valida que cada entrada tem apenas campos mecânicos (sem contaminação pt-BR)
function validateRaw(raw: unknown[]): AnyCard[] {
	for (const entry of raw) {
		if (
			typeof entry !== "object" ||
			entry === null ||
			!("id" in entry) ||
			!("type" in entry)
		) {
			throw new Error(`Carta inválida no YAML: ${JSON.stringify(entry)}`);
		}
		for (const field of LOCALE_FIELDS) {
			if (field in (entry as object)) {
				throw new Error(
					`Campo de locale "${field}" encontrado em carta mecânica: ${(entry as { id: string }).id}`,
				);
			}
		}
	}
	return raw as AnyCard[];
}

const legacyCards = EXPANSIONS.some((entry) => entry.enabled && "legacy" in entry && entry.legacy)
	? validateRaw(parse(cardsYaml) as unknown[])
	: [];
const ALL_CARDS: readonly AnyCard[] = [...legacyCards, ...EXPANSION_CARDS];
if (new Set(ALL_CARDS.map((card) => card.id)).size !== ALL_CARDS.length) {
	throw new Error("IDs de carta duplicados entre expansões habilitadas");
}

const _byId = new Map<string, AnyCard>(ALL_CARDS.map((c) => [c.id, c]));

// --- Acesso geral ---

export function getAllCards(): readonly AnyCard[] {
	return ALL_CARDS;
}

export function getCardsByType<T extends AnyCard["type"]>(
	type: T,
): Extract<AnyCard, { type: T }>[] {
	return ALL_CARDS.filter(
		(c): c is Extract<AnyCard, { type: T }> => c.type === type,
	);
}

export function getCardById(id: string): AnyCard | undefined {
	return _byId.get(id);
}

// --- Helpers por tipo ---

export function getHeroes(): HeroCard[] {
	return getCardsByType("hero");
}

export function getCreatures(): CreatureCard[] {
	return getCardsByType("creature");
}

export function getSubbosses(): SubbossCard[] {
	return getCardsByType("subboss");
}

export function getRooms(): RoomCard[] {
	return getCardsByType("room");
}

export function getSubbossRooms(): SubbossRoomCard[] {
	return getCardsByType("subboss_room");
}

export function getItems(): ItemCard[] {
	return getCardsByType("item");
}

export function getArtifacts(): ArtifactCard[] {
	return getCardsByType("artifact");
}

export function getBoss(): BossCard | undefined {
	return getCardsByType("boss")[0];
}

// --- Utilitário de dados ---

// Retorna a quantidade de dados que uma carta usa no índice de cor informado.
// Criaturas/heróis usam diceByColor[colorIndex].
// O chefe usa diceCount; a descrição antiga fica como fallback.
export function getDiceCount(
	card: HeroCard | CreatureCard | SubbossCard | BossCard,
	colorIndex: 0 | 1 | 2 | 3 | 4,
): number {
	if (card.type === "boss") {
		if (card.diceCount !== undefined) return card.diceCount;
		const dice = getCardLocale(card.id)?.dice ?? "";
		const match = dice.match(/\d+/);
		return match ? Number.parseInt(match[0], 10) : 1;
	}
	return card.diceByColor[colorIndex];
}
