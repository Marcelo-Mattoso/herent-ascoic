import { useEffect, useMemo, useState } from "react";
import {
	EMPTY_UI_ASSET_MANIFEST,
	normalizeUiAssetKey,
	UI_ASSET_MANIFEST_URL,
	type UiAssetManifest,
	type UiAssetUrls,
} from "@/ui/uiAssets";
import { publicAssetUrl } from "@/ui/publicAssetUrl";

function isUiAssetManifest(value: unknown): value is UiAssetManifest {
	if (!value || typeof value !== "object") return false;
	const manifest = value as Partial<UiAssetManifest>;
	return (
		manifest.version === 1 &&
		manifest.source === "imagedata/ui" &&
		Array.isArray(manifest.assets)
	);
}

export function useUiAssets(): UiAssetUrls {
	const [manifest, setManifest] = useState<UiAssetManifest>(
		EMPTY_UI_ASSET_MANIFEST,
	);

	useEffect(() => {
		let cancelled = false;

		fetch(UI_ASSET_MANIFEST_URL, { cache: "no-cache" })
			.then((response) => {
				if (!response.ok) return EMPTY_UI_ASSET_MANIFEST;
				return response.json() as Promise<unknown>;
			})
			.then((value) => {
				if (cancelled) return;
				setManifest(isUiAssetManifest(value) ? value : EMPTY_UI_ASSET_MANIFEST);
			})
			.catch(() => {
				if (!cancelled) setManifest(EMPTY_UI_ASSET_MANIFEST);
			});

		return () => {
			cancelled = true;
		};
	}, []);

	return useMemo(() => {
		const urls: UiAssetUrls = {};
		for (const asset of manifest.assets) {
			const url = publicAssetUrl(asset.url);
			urls[asset.id] = url;
			urls[normalizeUiAssetKey(asset.id)] = url;
			urls[normalizeUiAssetKey(asset.fileName)] = url;
		}
		return urls;
	}, [manifest.assets]);
}
