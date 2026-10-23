import type { InvFromZone, InvToZone } from "../actions/types";
import { getCardById } from "../data/cards";
import type { GameState, PendingReward } from "../state/gameState";
import type { HeroState, ItemSlotType } from "../state/heroState";
import { BACKPACK_CAPACITY, itemFitsSlot, placeEquipment } from "./equipment";

type HeroDraft = Omit<HeroState, "activeItems" | "backpack"> & {
	activeItems: Partial<Record<ItemSlotType, string>>;
	backpack: string[];
};

export function moveInventoryItem(
	state: GameState,
	itemId: string,
	from: InvFromZone,
	to: InvToZone,
): GameState | null {
	if (state.status !== "REWARD_PHASE") return null;
	const card = getCardById(itemId);
	if (card?.type !== "item") return null;
	const heroes: HeroDraft[] = state.heroes.map((hero) => ({
		...hero,
		activeItems: { ...hero.activeItems },
		backpack: [...hero.backpack],
	}));
	const pendingRewards = [...state.pendingRewards];
	const heroById = (heroId: string) =>
		heroes.find((hero) => hero.id === heroId && hero.status === "active");
	const rewardFor = (id: string): PendingReward => ({
		type: "item",
		cardId: id,
		requiresBearer: false,
	});
	const addBackpack = (
		hero: HeroDraft,
		id: string,
		index?: number,
	): boolean => {
		if (hero.backpack.length >= BACKPACK_CAPACITY) return false;
		const backpack = [...hero.backpack];
		backpack.splice(index ?? backpack.length, 0, id);
		hero.backpack = backpack;
		return true;
	};
	const addEquipment = (
		hero: HeroDraft,
		id: string,
		slot?: ItemSlotType,
	): string[] | null => {
		const item = getCardById(id);
		if (item?.type !== "item") return null;
		const result = placeEquipment(hero, item, slot);
		if (!result) return null;
		hero.activeItems = result.hero.activeItems;
		return result.displaced;
	};

	if (from.kind === "mesa") {
		const index = pendingRewards.findIndex(
			(reward) => reward.type === "item" && reward.cardId === itemId,
		);
		if (index < 0) return null;
		pendingRewards.splice(index, 1);
	} else if (from.kind === "hero_backpack") {
		const source = heroById(from.heroId);
		if (!source || source.backpack[from.index] !== itemId) return null;
		source.backpack = source.backpack.filter(
			(_, index) => index !== from.index,
		);
	} else {
		const source = heroById(from.heroId);
		if (!source || source.activeItems[from.slotType] !== itemId) return null;
		const activeItems = { ...source.activeItems };
		delete activeItems[from.slotType];
		source.activeItems = activeItems;
	}

	let displaced: string[] = [];
	if (to.kind === "mesa") {
		pendingRewards.push(rewardFor(itemId));
	} else {
		const target = heroById(to.heroId);
		if (!target) return null;
		if (to.kind === "hero_backpack") {
			if (
				target.backpack.includes(itemId) ||
				Object.values(target.activeItems).includes(itemId)
			)
				return null;
			if (!addBackpack(target, itemId)) return null;
		} else {
			const result = addEquipment(target, itemId, to.slotType);
			if (!result) return null;
			displaced = result;
		}
	}

	for (const displacedId of displaced) {
		if (from.kind === "mesa") {
			pendingRewards.push(rewardFor(displacedId));
		} else {
			const source = heroById(from.heroId);
			if (!source) return null;
			if (from.kind === "hero_backpack") {
				if (!addBackpack(source, displacedId, from.index)) return null;
			} else {
				const displacedCard = getCardById(displacedId);
				if (displacedCard?.type !== "item") return null;
				if (
					itemFitsSlot(displacedCard, from.slotType) &&
					!source.activeItems[from.slotType]
				) {
					if (addEquipment(source, displacedId, from.slotType) === null)
						return null;
				} else if (!addBackpack(source, displacedId)) {
					return null;
				}
			}
		}
	}

	return { ...state, heroes, pendingRewards };
}
