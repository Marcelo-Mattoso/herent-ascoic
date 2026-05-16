// Handlers de recompensa, XP e gasto de XP.

import { getCardByName } from "../../data/cards";
import type { XpSpendOption } from "../config/defaults";
import { XP_COSTS } from "../config/defaults";
import { calculateRewards } from "../rules/reward";
import type { GameState } from "../state/gameState";
import { defaultItemDestination } from "../strategies/itemDistribution";
import { handleDungeonExhaustedSpend } from "./exploration";
import { levelUpHero, lowerDespertar } from "./progression";
import { getActiveHero, log, mapHero, shuffle } from "./utils";

// ─── GRANT_REWARDS ────────────────────────────────────────────────────────────

export function handleGrantRewards(state: GameState): GameState {
	if (!state.currentRoom) return state;

	const summary = calculateRewards(state.currentRoom, state.enemyGraveyard);
	let next = state;

	// XP da sala
	next = { ...next, groupXp: next.groupXp + summary.xp };

	// Itens
	for (let i = 0; i < summary.items; i++) {
		const { available, discarded, removed } = next.decks.itemDeck;
		if (available.length === 0) break;
		const [itemName, ...rest] = available;
		next = {
			...next,
			decks: {
				...next.decks,
				itemDeck: { available: rest, discarded, removed },
			},
		};
		next = distributeItem(next, itemName as string);
	}

	// Artefatos
	for (let i = 0; i < summary.artifacts; i++) {
		const { available, discarded, removed } = next.decks.artifactDeck;
		if (available.length === 0) break;
		const [artName, ...rest] = available;
		next = {
			...next,
			groupArtifacts: [
				...next.groupArtifacts,
				{ cardName: artName as string, carriedBy: null },
			],
			decks: {
				...next.decks,
				artifactDeck: { available: rest, discarded, removed },
			},
		};
		next = log(next, `Artefato obtido: ${artName}.`);
	}

	next = {
		...next,
		currentRoom: next.currentRoom
			? { ...next.currentRoom, status: "cleared" }
			: null,
		roomsCleared: next.roomsCleared + 1,
		status: "XP_SPEND_PHASE",
	};

	return log(
		next,
		`Recompensas: +${summary.xp} XP, ${summary.items} item(ns), ${summary.artifacts} artefato(s).`,
	);
}

function distributeItem(state: GameState, itemName: string): GameState {
	const hero = getActiveHero(state);
	if (!hero) return state;

	const card = getCardByName(itemName);
	if (!card || card.type !== "item") return state;

	const dest = defaultItemDestination(hero, card.itemClass);

	if (dest === "equip") {
		const slot =
			card.itemClass === "equipment"
				? "weapon"
				: card.itemClass === "utility"
					? "utility"
					: "special";
		return mapHero(
			log(state, `${itemName} equipado em ${hero.cardName}.`),
			hero.id,
			(h) => ({
				...h,
				activeItems: { ...h.activeItems, [slot]: itemName },
			}),
		);
	}

	return mapHero(
		log(state, `${itemName} foi para a mochila de ${hero.cardName}.`),
		hero.id,
		(h) => ({
			...h,
			backpack: [...h.backpack, itemName],
		}),
	);
}

// ─── GAIN_XP ─────────────────────────────────────────────────────────────────

export function handleGainXp(state: GameState, amount: number): GameState {
	return log(
		{ ...state, groupXp: state.groupXp + amount },
		`+${amount} XP. Total: ${state.groupXp + amount}.`,
	);
}

// ─── SPEND_XP ────────────────────────────────────────────────────────────────

export function handleSpendXp(
	state: GameState,
	option: XpSpendOption,
	heroId?: string,
): GameState {
	// Caso especial: gastar XP para recuperar dungeon quando esgotada
	if (option === "recover_dungeon" && state.status === "DUNGEON_EXHAUSTED") {
		return handleDungeonExhaustedSpend(state);
	}

	const cost = XP_COSTS[option];
	if (state.groupXp < cost) {
		return log(
			state,
			`XP insuficiente. Custo: ${cost}, disponível: ${state.groupXp}.`,
		);
	}

	let next: GameState = { ...state, groupXp: state.groupXp - cost };

	switch (option) {
		case "recover_dungeon": {
			const { discarded, removed } = next.decks.dungeonDeck;
			next = {
				...next,
				decks: {
					...next.decks,
					dungeonDeck: {
						available: shuffle(discarded),
						discarded: [],
						removed,
					},
				},
			};
			return log(next, "5 XP: deck de dungeon reembaralhado.");
		}
		case "level_up": {
			const hId = heroId ?? getActiveHero(state)?.id;
			if (!hId) return state;
			return levelUpHero(next, hId);
		}
		case "buy_item": {
			const { available, discarded, removed } = next.decks.itemDeck;
			if (available.length === 0) return log(next, "Nenhum item disponível.");
			const [itemName, ...rest] = available;
			next = {
				...next,
				decks: {
					...next.decks,
					itemDeck: { available: rest, discarded, removed },
				},
			};
			return distributeItem(next, itemName as string);
		}
		case "lower_despertar":
			return lowerDespertar(next);
		case "buy_artifact": {
			const { available, discarded, removed } = next.decks.artifactDeck;
			if (available.length === 0)
				return log(next, "Nenhum artefato disponível.");
			const [artName, ...rest] = available;
			return log(
				{
					...next,
					groupArtifacts: [
						...next.groupArtifacts,
						{ cardName: artName as string, carriedBy: null },
					],
					decks: {
						...next.decks,
						artifactDeck: { available: rest, discarded, removed },
					},
				},
				`Artefato comprado: ${artName}.`,
			);
		}
	}
}

// ─── Transição de XP_SPEND_PHASE → OPEN_PATHS ────────────────────────────────
// Chamada pelo reducer quando o jogador não quer mais gastar XP (OPEN_PATHS action).

export function handleOpenPathsFromXpPhase(state: GameState): GameState {
	return { ...state, status: "OPEN_PATHS" };
}
