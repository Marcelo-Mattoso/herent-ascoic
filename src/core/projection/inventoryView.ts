import {
	collectHeroDamageBonusesFromItems,
	collectHeroDamageReductionsFromItems,
	collectHeroHitBonusesFromItems,
	itemIsExhausted,
	manualItemOptions,
	totalItemValue,
} from "../rules/itemEffects";
import type { GameState } from "../state/gameState";
import type { HeroState } from "../state/heroState";
import type { GameEngine } from "../gameEngine";

export interface HeroInventoryView {
	readonly stats: {
		readonly hit: number;
		readonly hitBonus: number;
		readonly damage: number;
		readonly damageBonus: number;
		readonly protection: number;
		readonly protectionText: string;
	};
	readonly usableItemIds: readonly string[];
	readonly exhaustedItemIds: readonly string[];
}

export const EMPTY_HERO_INVENTORY: HeroInventoryView = {
	stats: {
		hit: 0,
		hitBonus: 0,
		damage: 0,
		damageBonus: 0,
		protection: 0,
		protectionText: "",
	},
	usableItemIds: [],
	exhaustedItemIds: [],
};

function heroItemStats(engine: GameEngine, hero: HeroState, state: GameState): HeroInventoryView["stats"] {
	const hitBonus = totalItemValue(collectHeroHitBonusesFromItems(engine, hero, state));
	const damageBonus = totalItemValue(
		collectHeroDamageBonusesFromItems(engine, hero, state, undefined, 4),
	);
	const protectionEntries = collectHeroDamageReductionsFromItems(engine, hero, state);
	const protection = totalItemValue(protectionEntries);
	return {
		hit: hero.hitBonus + hitBonus,
		hitBonus,
		damage: hero.damage + damageBonus,
		damageBonus,
		protection,
		protectionText:
			protection > 0
				? protectionEntries
						.map((entry) => `${entry.source} -${entry.value}`)
						.join(", ")
				: "",
	};
}

export function projectHeroInventory(engine: GameEngine, 
	state: GameState,
	hero: HeroState,
): HeroInventoryView {
	const equipped = Object.values(hero.activeItems).filter(
		(id): id is string => !!id,
	);
	return {
		stats: heroItemStats(engine, hero, state),
		usableItemIds: manualItemOptions(engine, state, hero.id).map((item) => item.itemId),
		exhaustedItemIds: [...new Set(equipped)].filter((id) =>
			itemIsExhausted(state, hero.id, id),
		),
	};
}
