// Catálogo combinado das expansões habilitadas. Mantém a API atual do motor.

import { getCardLocale } from "./cardLocale";
import { getEnabledExpansionCards } from "./expansions";
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

const ALL_CARDS: readonly AnyCard[] = getEnabledExpansionCards();
const byId = new Map<string, AnyCard>(ALL_CARDS.map((card) => [card.id, card]));

export function getAllCards(): readonly AnyCard[] {
	return ALL_CARDS;
}

export function getCardsByType<T extends AnyCard["type"]>(
	type: T,
): Extract<AnyCard, { type: T }>[] {
	return ALL_CARDS.filter(
		(card): card is Extract<AnyCard, { type: T }> => card.type === type,
	);
}

export function getCardById(id: string): AnyCard | undefined {
	return byId.get(id);
}

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

export function getDiceCount(
	card: HeroCard | CreatureCard | SubbossCard | BossCard,
	colorIndex: 0 | 1 | 2 | 3 | 4,
): number {
	if (card.type === "boss") {
		const dice = getCardLocale(card.id)?.dice ?? "";
		const match = dice.match(/\d+/);
		return match ? Number.parseInt(match[0], 10) : 1;
	}
	return card.diceByColor[colorIndex];
}
