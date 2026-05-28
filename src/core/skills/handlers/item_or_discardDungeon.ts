// item_or_discardDungeon: Tributo Sombrio.
// Antes do primeiro combate, o grupo escolhe: descartar 1 item ou 1 carta de dungeon.
// Cobre: Esqueleto das Catacumbas, Ladrão, Guardião.

import type { SkillContext } from "../../data/skillTypes";
import type { GameState } from "../../state/gameState";
import { discardFromDungeonDeck, log } from "../../reducer/exploration";
import { registerContinuation } from "../registry";
import { mapHero } from "../../reducer/utils";

export function handleItemOrDiscardDungeon(
	state: GameState,
	ctx: SkillContext,
	_value: number | string | null,
): GameState {
	const firstHero = state.heroes.find((h) => h.status === "active");
	const hasItem = firstHero && (
		Object.values(firstHero.activeItems).some(Boolean) ||
		firstHero.backpack.length > 0
	);
	const hasDungeonCard = state.decks.dungeonDeck.available.length > 0;

	if (!hasItem && !hasDungeonCard) {
		return log(state, "Tributo Sombrio: sem itens nem cartas de dungeon para descartar.");
	}

	const options: { id: string; label: string }[] = [];
	if (hasItem) options.push({ id: "item", label: "Descartar 1 item" });
	if (hasDungeonCard) options.push({ id: "dungeon", label: "Descartar 1 carta de dungeon" });

	return {
		...state,
		pendingSkillChoice: {
			skillId: ctx.skillId ?? "habilidade-tributo-sombrio",
			prompt: "Tributo Sombrio: o grupo deve escolher o tributo.",
			options,
			sourceHeroId: ctx.sourceHeroId,
		},
	};
}

// Continuação: aplica a escolha do jogador.
registerContinuation("item_or_discardDungeon", (state, _ctx, choice) => {
	if (choice === "dungeon") {
		return log(discardFromDungeonDeck(state, 1), "Tributo Sombrio: 1 carta de dungeon descartada.");
	}
	// choice === "item": descarta o primeiro item da mochila do herói focado ou backpack
	const hero = state.heroes.find((h) => h.status === "active" && h.backpack.length > 0);
	if (hero) {
		const [removed, ...rest] = hero.backpack;
		return log(
			mapHero(state, hero.id, (h) => ({ ...h, backpack: rest })),
			`Tributo Sombrio: ${removed} descartado.`,
		);
	}
	// Fallback: descartar o primeiro slot equipado
	const heroWithItem = state.heroes.find((h) => h.status === "active" && Object.values(h.activeItems).some(Boolean));
	if (heroWithItem) {
		const slot = (Object.keys(heroWithItem.activeItems) as (keyof typeof heroWithItem.activeItems)[])
			.find((k) => heroWithItem.activeItems[k]);
		if (slot) {
			return log(
				mapHero(state, heroWithItem.id, (h) => {
					const { [slot]: _removed, ...rest } = h.activeItems;
					return { ...h, activeItems: rest };
				}),
				`Tributo Sombrio: ${heroWithItem.activeItems[slot]} descartado.`,
			);
		}
	}
	return log(state, "Tributo Sombrio: sem item disponível para descartar.");
});
