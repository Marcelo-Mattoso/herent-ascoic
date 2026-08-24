export interface BoardBackground {
	readonly id: string;
	readonly name: string;
	readonly fileName: string;
	readonly url: string;
	readonly sizeBytes: number;
}

export interface BoardBackgroundManifest {
	readonly version: 1;
	readonly source: "imagedata/tabuleiros";
	readonly boards: readonly BoardBackground[];
}

export const BOARD_BACKGROUND_MANIFEST_URL = "/generated/boards/manifest.json";
export const BOARD_BACKGROUND_STORAGE_KEY =
	"ascensao.heroica.boardBackgroundId";

export const EMPTY_BOARD_BACKGROUND_MANIFEST: BoardBackgroundManifest = {
	version: 1,
	source: "imagedata/tabuleiros",
	boards: [],
};
