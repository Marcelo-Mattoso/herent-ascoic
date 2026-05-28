// Loader do catálogo de cartas. Importa o JSON estático, valida minimamente e expõe helpers tipados.
// Nenhuma lógica de jogo aqui — apenas acesso e filtragem do catálogo.

import rawCards from "../../data/cards.json";
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

// Valida que cada entrada tem pelo menos `id`, `type` e `name`
function validateRaw(raw: unknown[]): AnyCard[] {
	for (const entry of raw) {
		if (
			typeof entry !== "object" ||
			entry === null ||
			!("id" in entry) ||
			!("type" in entry) ||
			!("name" in entry)
		) {
			throw new Error(`Carta inválida no JSON: ${JSON.stringify(entry)}`);
		}
	}
	return raw as AnyCard[];
}

const ALL_CARDS: readonly AnyCard[] = validateRaw(rawCards as unknown[]);

const _byId = new Map<string, AnyCard>(ALL_CARDS.map((c) => [c.id, c]));
const _byName = new Map<string, AnyCard>(ALL_CARDS.map((c) => [c.name, c]));

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

/** @deprecated Use getCardById instead */
export function getCardByName(name: string): AnyCard | undefined {
	return _byName.get(name);
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
// O boss usa string descritiva — extraímos o número por regex (ex.: "3 dados vermelhos" → 3).
export function getDiceCount(
	card: HeroCard | CreatureCard | SubbossCard | BossCard,
	colorIndex: 0 | 1 | 2 | 3 | 4,
): number {
	if (card.type === "boss") {
		const match = card.dice.match(/\d+/);
		return match ? Number.parseInt(match[0], 10) : 1;
	}
	return card.diceByColor[colorIndex];
}
