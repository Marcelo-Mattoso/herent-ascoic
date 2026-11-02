import { getCardName } from "@/core/data/cardLocale";
import { publicAssetUrl } from "./publicAssetUrl";

export interface CardImage {
	readonly id: string;
	readonly fileName: string;
	readonly url: string;
	readonly sizeBytes: number;
}

export interface CardImageManifest {
	readonly version: 1;
	readonly source: "assets/expansions";
	readonly cards: readonly CardImage[];
}

export type CardImageUrls = Partial<Record<string, string>>;

export const CARD_IMAGE_MANIFEST_URL = publicAssetUrl("generated/cards/manifest.json");

export const EMPTY_CARD_IMAGE_MANIFEST: CardImageManifest = {
	version: 1,
	source: "assets/expansions",
	cards: [],
};

export function normalizeCardImageKey(value: string) {
	return value
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-zA-Z0-9]+/g, "")
		.toLowerCase();
}

export function getCardImageUrl(
	cardImageUrls: CardImageUrls | undefined,
	cardId: string,
) {
	if (!cardImageUrls) return undefined;
	const aliases: Partial<Record<string, string>> = {
		boss_azhakar: "azhakardragaofornalhasombria",
	};
	const localizedName = getCardName(cardId);
	return (
		cardImageUrls[cardId] ??
		cardImageUrls[normalizeCardImageKey(cardId)] ??
		cardImageUrls[normalizeCardImageKey(localizedName)] ??
		(aliases[cardId] ? cardImageUrls[aliases[cardId]] : undefined) ??
		cardImageUrls[normalizeCardImageKey(cardId)] ??
		cardImageUrls[cardId]
	);
}
