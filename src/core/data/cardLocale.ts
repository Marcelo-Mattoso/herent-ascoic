import { parse } from "yaml";
import localeText from "../../data/cards.locale.pt-BR.yaml?raw";

export interface CardLocale {
	readonly name: string;
	readonly characterName?: string;
	readonly style?: string;
	readonly tags?: readonly string[];
	readonly condition?: string;
	readonly victory?: string;
	readonly dice?: string;
	readonly artifactBonus?: string;
	readonly dungeonScaling?: string;
}

export const CARD_LOCALE: Readonly<Record<string, CardLocale>> = parse(
	localeText,
) as Record<string, CardLocale>;

export function getCardLocale(cardId: string): CardLocale | undefined {
	return CARD_LOCALE[cardId];
}

export function getCardName(cardId: string): string {
	return CARD_LOCALE[cardId]?.name ?? cardId;
}
