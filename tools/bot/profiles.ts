import type { GoldenSetup } from "../golden/lib";
import { BOT_HEROES, setupFromSeed } from "./play";

export const BOT_PROFILES = ["casual", "power-player", "speedrunner", "explorer", "random"] as const;
export type BotProfile = typeof BOT_PROFILES[number];

const HERO_ALIASES: Readonly<Record<string, string>> = {
	barbarian: "hero_crimson_barbarian",
	paladin: "hero_last_light_paladin",
	cleric: "hero_eternal_rest_cleric",
	rogue: "hero_rift_rogue",
	warrior: "hero_broken_bastion_warrior",
	necromancer: "hero_deep_veil_necromancer",
	mage: "hero_crimson_rune_mage",
	hunter: "hero_broken_veil_hunter",
};

export function parseBotProfile(value: string): BotProfile {
	if (BOT_PROFILES.includes(value as BotProfile)) return value as BotProfile;
	throw new Error(`Perfil desconhecido: ${value}. Use ${BOT_PROFILES.join(", ")}.`);
}

export function parseBotDifficulty(value: string): GoldenSetup["difficulty"] {
	if (["very_easy", "easy", "normal", "hard", "nightmare"].includes(value))
		return value as GoldenSetup["difficulty"];
	throw new Error("--difficulty exige very_easy, easy, normal, hard ou nightmare.");
}

export function parseBotParty(value: string): string[] {
	const heroes = value.split(",").map((entry) => HERO_ALIASES[entry.trim()] ?? entry.trim());
	if (heroes.length < 1 || heroes.length > 4 || new Set(heroes).size !== heroes.length ||
		heroes.some((id) => !BOT_HEROES.includes(id))) {
		throw new Error("--heroes exige 1 a 4 heróis distintos: barbarian,paladin,cleric,rogue,warrior,necromancer,mage,hunter.");
	}
	return heroes;
}

export function setupForRun(seed: number, heroes?: readonly string[], difficulty?: GoldenSetup["difficulty"]): GoldenSetup {
	const random = setupFromSeed(seed);
	return {
		...random,
		...(heroes ? { heroCardIds: [...heroes] } : {}),
		...(difficulty ? { difficulty } : {}),
	};
}
