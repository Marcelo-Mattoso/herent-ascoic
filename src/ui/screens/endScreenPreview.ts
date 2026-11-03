import { getBoss, getHeroes } from "@/core/data/cards";
import type { HeroView, PlayerView } from "@/core/projection/playerView";
import { displayCardName as getCardName } from "@/i18n/catalogs";

export function endScreenPreviewView(view: PlayerView, ending: "victory" | "defeat"): PlayerView {
	const heroes: HeroView[] = getHeroes().slice(0, 3).map((card, index): HeroView => {
		const maxLife = card.life[2];
		return {
			id: `preview-hero-${index}`,
			cardId: card.id,
			maxLife,
			currentLife: ending === "defeat" && index === 0 ? 0 : Math.max(1, maxLife - index),
			damage: card.damage,
			hitBonus: card.hitBonus[2],
			dice: card.diceByColor[2],
			impeto: 2,
  eco: 0,
			activeItems: {},
			backpack: [],
			usedPowers: {},
			conditions: [],
			status: ending === "defeat" && index === 0 ? "defeated" : "active",
			playerIndex: 0,
			xp: 5 + index * 3,
		};
	});
	const boss = getBoss();
	return {
		...view,
		status: ending === "victory" ? "VICTORY" : "DEFEAT",
		heroes,
		bossCardName: boss ? getCardName(boss.id) : view.bossCardName,
		roomsCleared: 7,
		creaturesDefeated: 12,
		groupXp: 28,
		groupArtifacts: [
			{ cardId: "preview-artifact-1", carriedBy: null },
			{ cardId: "preview-artifact-2", carriedBy: null },
		],
		despertar: 3,
	};
}
