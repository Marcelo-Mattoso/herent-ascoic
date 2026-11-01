import { getEnabledExpansions } from "@/core/data/expansions";
import { publicAssetUrl } from "@/ui/publicAssetUrl";

export type OpeningEffect = "none" | "slow-zoom-in" | "slow-zoom-out" | "slow-pan-left" | "slow-pan-right";

export interface OpeningScene {
	readonly id: string;
	readonly imageUrl: string;
	readonly textKey: string;
	readonly effect: OpeningEffect;
	readonly transitionMs: number;
}

export interface StoryOpeningData {
	readonly id: string;
	readonly bossId: string;
	readonly titleKey: string;
	readonly scenes: readonly OpeningScene[];
}

const discovered = import.meta.glob<unknown>(
	"../../../assets/expansions/*/abertura/*.json",
	{ eager: true, import: "default" },
);

const effects = new Set<OpeningEffect>([
	"none", "slow-zoom-in", "slow-zoom-out", "slow-pan-left", "slow-pan-right",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Invalid or absent opening data never blocks starting the game. */
export function parseOpening(raw: unknown, expansionId: string, bossId: string): StoryOpeningData | null {
	if (!isRecord(raw) || raw.version !== 1 || raw.type !== "prologue" ||
		raw.expansionId !== expansionId || raw.bossId !== bossId ||
		typeof raw.id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(raw.id) ||
		typeof raw.titleKey !== "string" || !/^game:[A-Za-z0-9.]+$/.test(raw.titleKey) ||
		!Array.isArray(raw.scenes) || raw.scenes.length === 0) return null;
	const ids = new Set<string>();
	const scenes: OpeningScene[] = [];
	for (const scene of raw.scenes) {
		if (!isRecord(scene) || typeof scene.id !== "string" ||
			!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(scene.id) || ids.has(scene.id) ||
			typeof scene.image !== "string" || !/^images\/[a-zA-Z0-9-]+\.webp$/.test(scene.image) ||
			typeof scene.textKey !== "string" || !/^game:[A-Za-z0-9.]+$/.test(scene.textKey) ||
			!effects.has(scene.effect as OpeningEffect) || scene.transition !== "fade" ||
			typeof scene.transitionMs !== "number" || !Number.isInteger(scene.transitionMs) || scene.transitionMs < 0 || scene.transitionMs > 2000) return null;
		ids.add(scene.id);
		scenes.push({
			id: scene.id,
			imageUrl: publicAssetUrl(`generated/openings/assets/${encodeURIComponent(expansionId)}/abertura/${scene.image}`),
			textKey: scene.textKey,
			effect: scene.effect as OpeningEffect,
			transitionMs: scene.transitionMs,
		});
	}
	return { id: raw.id, bossId, titleKey: raw.titleKey, scenes };
}

export function getOpeningForBoss(bossId: string): StoryOpeningData | null {
	for (const expansion of getEnabledExpansions()) {
		const relativePath = expansion.openings?.[bossId];
		if (!relativePath) continue;
		if (!/^abertura\/[a-z0-9-]+\.json$/.test(relativePath)) return null;
		const file = `../../../assets/expansions/${expansion.id}/${relativePath}`;
		return parseOpening(discovered[file], expansion.id, bossId);
	}
	return null;
}
