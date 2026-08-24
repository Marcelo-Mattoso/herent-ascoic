import { useEffect, useMemo, useState } from "react";
import {
	CARD_IMAGE_MANIFEST_URL,
	type CardImageManifest,
	type CardImageUrls,
	EMPTY_CARD_IMAGE_MANIFEST,
	normalizeCardImageKey,
} from "@/ui/cardImages";

function isCardImageManifest(value: unknown): value is CardImageManifest {
	if (!value || typeof value !== "object") return false;
	const manifest = value as Partial<CardImageManifest>;
	return (
		manifest.version === 1 &&
		manifest.source === "imagedata/cards" &&
		Array.isArray(manifest.cards)
	);
}

export function useCardImages(): CardImageUrls {
	const [manifest, setManifest] = useState<CardImageManifest>(
		EMPTY_CARD_IMAGE_MANIFEST,
	);

	useEffect(() => {
		let cancelled = false;

		fetch(CARD_IMAGE_MANIFEST_URL, { cache: "no-cache" })
			.then((response) => {
				if (!response.ok) return EMPTY_CARD_IMAGE_MANIFEST;
				return response.json() as Promise<unknown>;
			})
			.then((value) => {
				if (cancelled) return;
				setManifest(
					isCardImageManifest(value) ? value : EMPTY_CARD_IMAGE_MANIFEST,
				);
			})
			.catch(() => {
				if (!cancelled) setManifest(EMPTY_CARD_IMAGE_MANIFEST);
			});

		return () => {
			cancelled = true;
		};
	}, []);

	return useMemo(() => {
		const urls: CardImageUrls = {};
		for (const card of manifest.cards) {
			urls[card.id] = card.url;
			urls[normalizeCardImageKey(card.id)] = card.url;
			urls[normalizeCardImageKey(card.fileName)] = card.url;
		}
		return urls;
	}, [manifest.cards]);
}
