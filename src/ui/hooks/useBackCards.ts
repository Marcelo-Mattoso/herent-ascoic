import { useEffect, useMemo, useState } from "react";
import {
	BACK_CARD_MANIFEST_URL,
	type BackCardId,
	type BackCardManifest,
	type BackCardUrls,
	EMPTY_BACK_CARD_MANIFEST,
} from "@/ui/backCards";

const EXPECTED_BACK_CARD_IDS: readonly BackCardId[] = [
	"verso_criatura",
	"verso_dungeon",
	"verso_tesouro",
];

function isBackCardManifest(value: unknown): value is BackCardManifest {
	if (!value || typeof value !== "object") return false;
	const manifest = value as Partial<BackCardManifest>;
	return (
		manifest.version === 1 &&
		manifest.source === "imagedata/backcard" &&
		Array.isArray(manifest.backCards)
	);
}

function isBackCardId(value: string): value is BackCardId {
	return EXPECTED_BACK_CARD_IDS.includes(value as BackCardId);
}

export function useBackCards(): BackCardUrls {
	const [manifest, setManifest] = useState<BackCardManifest>(
		EMPTY_BACK_CARD_MANIFEST,
	);

	useEffect(() => {
		let cancelled = false;

		fetch(BACK_CARD_MANIFEST_URL, { cache: "no-cache" })
			.then((response) => {
				if (!response.ok) return EMPTY_BACK_CARD_MANIFEST;
				return response.json() as Promise<unknown>;
			})
			.then((value) => {
				if (cancelled) return;
				setManifest(
					isBackCardManifest(value) ? value : EMPTY_BACK_CARD_MANIFEST,
				);
			})
			.catch(() => {
				if (!cancelled) setManifest(EMPTY_BACK_CARD_MANIFEST);
			});

		return () => {
			cancelled = true;
		};
	}, []);

	return useMemo(() => {
		const urls: BackCardUrls = {};
		for (const backCard of manifest.backCards) {
			if (isBackCardId(backCard.id)) urls[backCard.id] = backCard.url;
		}
		return urls;
	}, [manifest.backCards]);
}
