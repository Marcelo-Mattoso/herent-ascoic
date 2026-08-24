export type BackCardId = "verso_criatura" | "verso_dungeon" | "verso_tesouro";

export interface BackCard {
	readonly id: string;
	readonly fileName: string;
	readonly url: string;
	readonly sizeBytes: number;
}

export interface BackCardManifest {
	readonly version: 1;
	readonly source: "imagedata/backcard";
	readonly backCards: readonly BackCard[];
}

export type BackCardUrls = Partial<Record<BackCardId, string>>;

export const BACK_CARD_MANIFEST_URL = "/generated/backcards/manifest.json";

export const EMPTY_BACK_CARD_MANIFEST: BackCardManifest = {
	version: 1,
	source: "imagedata/backcard",
	backCards: [],
};
