import { publicAssetUrl } from "./publicAssetUrl";

export interface UiAsset {
	readonly id: string;
	readonly name: string;
	readonly fileName: string;
	readonly url: string;
	readonly sizeBytes: number;
}

export interface UiAssetManifest {
	readonly version: 1;
	readonly source: "imagedata/ui";
	readonly assets: readonly UiAsset[];
}

export type UiAssetUrls = Partial<Record<string, string>>;

export const UI_ASSET_MANIFEST_URL = publicAssetUrl("generated/ui/manifest.json");

export const EMPTY_UI_ASSET_MANIFEST: UiAssetManifest = {
	version: 1,
	source: "imagedata/ui",
	assets: [],
};

export function normalizeUiAssetKey(value: string) {
	return value
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-zA-Z0-9]+/g, "")
		.toLowerCase();
}

export function getUiAssetUrl(
	uiAssetUrls: UiAssetUrls | undefined,
	assetId: string,
) {
	if (!uiAssetUrls) return undefined;
	return (
		uiAssetUrls[assetId] ??
		uiAssetUrls[normalizeUiAssetKey(assetId)] ??
		undefined
	);
}
