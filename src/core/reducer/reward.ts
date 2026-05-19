// Handlers de recompensa, XP e gasto de XP.
// Patch 1: GRANT_REWARDS constrói fila pendingRewards em vez de distribuir automaticamente.
// Itens e artefatos são resolvidos um a um via CHOOSE_ITEM_DESTINATION / CHOOSE_ARTIFACT_BEARER.

import { getCardByName } from "../../data/cards";
import type { XpSpendOption } from "../config/defaults";
import { XP_COSTS } from "../config/defaults";
import { calculateRewards } from "../rules/reward";
import type { GameState, PendingReward } from "../state/gameState";
import { defaultItemDestination } from "../strategies/itemDistribution";
import { handleDungeonExhaustedSpend } from "./exploration";
import { levelUpHero, lowerDespertar } from "./progression";
import { getActiveHero, log, mapHero, shuffle } from "./utils";

// ─── GRANT_REWARDS ────────────────────────────────────────────────────────────
// Calcula XP, monta fila de itens/artefatos pendentes e mantém status REWARD_PHASE.

export function handleGrantRewards(state: GameState): GameState {
	if (!state.currentRoom) return state;
	// Evitar processar duas vezes (fila já preenchida)
	if (state.pendingRewards.length > 0) return state;

	const summary = calculateRewards(state.currentRoom, state.enemyGraveyard);
	let next = state;

	// XP da sala é concedido imediatamente
	next = { ...next, groupXp: next.groupXp + summary.xp };

	const queue: PendingReward[] = [];

	// Enfileirar itens
	for (let i = 0; i < summary.items; i++) {
		const available = next.decks.itemDeck.available;
		if (available.length === 0) break;
		const [itemName, ...rest] = available;
		next = {
			...next,
			decks: {
				...next.decks,
				itemDeck: { ...next.decks.itemDeck, available: rest },
			},
		};
		queue.push({
			type: "item",
			cardName: itemName as string,
			requiresBearer: false,
		});
	}

	// Enfileirar artefatos
	for (let i = 0; i < summary.artifacts; i++) {
		const available = next.decks.artifactDeck.available;
		if (available.length === 0) break;
		const [artName, ...rest] = available;
		next = {
			...next,
			decks: {
				...next.decks,
				artifactDeck: { ...next.decks.artifactDeck, available: rest },
			},
		};
		// Verificar se o artefato tem portador ("portador" no texto)
		const artCard = getCardByName(artName as string);
		const requiresBearer =
			artCard?.type === "artifact" &&
			typeof artCard.effect === "string" &&
			artCard.effect.toLowerCase().includes("portador");
		queue.push({
			type: "artifact",
			cardName: artName as string,
			requiresBearer,
		});
	}

	next = {
		...next,
		currentRoom: next.currentRoom
			? { ...next.currentRoom, status: "cleared" }
			: null,
		roomsCleared: next.roomsCleared + 1,
		pendingRewards: queue,
	};

	// Se não há recompensas físicas, avançar diretamente para XP_SPEND_PHASE
	if (queue.length === 0) {
		return log(
			{ ...next, status: "XP_SPEND_PHASE" },
			`Recompensas: +${summary.xp} XP. Sem itens ou artefatos.`,
		);
	}

	return log(
		next,
		`Recompensas: +${summary.xp} XP, ${summary.items} item(ns), ${summary.artifacts} artefato(s). Resolvendo...`,
	);
}

// ─── CHOOSE_ITEM_DESTINATION ──────────────────────────────────────────────────
// Equipa, guarda na mochila ou descarta o primeiro item pendente.

export function handleChooseItemDestination(
	state: GameState,
	heroId: string,
	destination: "equip" | "backpack" | "discard",
): GameState {
	const reward = state.pendingRewards[0];
	if (!reward || reward.type !== "item") return state;

	const itemName = reward.cardName;
	const remainingRewards = state.pendingRewards.slice(1);
	let next: GameState = { ...state, pendingRewards: remainingRewards };

	if (destination !== "discard") {
		const card = getCardByName(itemName);
		if (card && card.type === "item") {
			if (destination === "equip") {
				const slot =
					card.itemClass === "equipment"
						? "weapon"
						: card.itemClass === "utility"
							? "utility"
							: "special";
				next = mapHero(next, heroId, (h) => {
					// Item anterior do mesmo slot vai para a mochila
					const displaced = h.activeItems[slot];
					return {
						...h,
						activeItems: { ...h.activeItems, [slot]: itemName },
						backpack: displaced ? [...h.backpack, displaced] : h.backpack,
					};
				});
				next = log(next, `${itemName} equipado por ${heroId}.`);
			} else {
				// backpack
				next = mapHero(next, heroId, (h) => ({
					...h,
					backpack: [...h.backpack, itemName],
				}));
				next = log(next, `${itemName} guardado na mochila de ${heroId}.`);
			}
		}
	} else {
		next = log(next, `${itemName} descartado.`);
	}

	return advanceRewardPhase(next);
}

// ─── CHOOSE_ARTIFACT_BEARER ───────────────────────────────────────────────────
// Define o portador do primeiro artefato pendente (heroId null = sem portador).

export function handleChooseArtifactBearer(
	state: GameState,
	heroId: string | null,
): GameState {
	const reward = state.pendingRewards[0];
	if (!reward || reward.type !== "artifact") return state;

	const next: GameState = {
		...state,
		pendingRewards: state.pendingRewards.slice(1),
		groupArtifacts: [
			...state.groupArtifacts,
			{ cardName: reward.cardName, carriedBy: heroId },
		],
	};

	return advanceRewardPhase(log(next, `Artefato obtido: ${reward.cardName}.`));
}

// Quando a fila fica vazia, avança para XP_SPEND_PHASE.
function advanceRewardPhase(state: GameState): GameState {
	if (state.pendingRewards.length === 0) {
		return { ...state, status: "XP_SPEND_PHASE" };
	}
	return state;
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
				// Enfileirar como recompensa pendente para resolução pelo jogador
				pendingRewards: [
					...next.pendingRewards,
					{ type: "item", cardName: itemName as string, requiresBearer: false },
				],
			};
			return { ...next, status: "REWARD_PHASE" };
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

export function handleOpenPathsFromXpPhase(state: GameState): GameState {
	return { ...state, status: "OPEN_PATHS" };
}

// ─── INV_ASSIGN_ITEM ──────────────────────────────────────────────────────────
// Move um item específico da mesa (pendingRewards) para o herói (equip ou mochila).
// Se o slot de equip já está ocupado, o item deslocado volta para a mesa.

export function handleInvAssignItem(
	state: GameState,
	itemName: string,
	heroId: string,
	destination: "equip" | "backpack",
): GameState {
	const reward = state.pendingRewards.find(
		(r) => r.cardName === itemName && r.type === "item",
	);
	if (!reward) return state;

	const remaining = state.pendingRewards.filter((r) => r !== reward);
	let next: GameState = { ...state, pendingRewards: remaining };

	if (destination === "equip") {
		const card = getCardByName(itemName);
		if (card && card.type === "item") {
			const slot =
				card.itemClass === "equipment"
					? "weapon"
					: card.itemClass === "utility"
						? "utility"
						: "special";
			next = mapHero(next, heroId, (h) => {
				const displaced = h.activeItems[slot];
				return {
					...h,
					activeItems: { ...h.activeItems, [slot]: itemName },
					backpack: h.backpack,
				};
			});
			// Se o slot estava ocupado, item deslocado volta para a mesa
			const hero = state.heroes.find((h) => h.id === heroId);
			const displaced = hero?.activeItems[
				card.itemClass === "equipment"
					? "weapon"
					: card.itemClass === "utility"
						? "utility"
						: "special"
			];
			if (displaced) {
				next = {
					...next,
					pendingRewards: [
						...next.pendingRewards,
						{ type: "item", cardName: displaced, requiresBearer: false },
					],
				};
			}
			next = log(next, `${itemName} equipado por ${heroId}.`);
		}
	} else {
		// backpack — falha silenciosa se cheia (máx 8)
		const hero = state.heroes.find((h) => h.id === heroId);
		if ((hero?.backpack.length ?? 8) >= 8) return state;
		next = mapHero(next, heroId, (h) => ({
			...h,
			backpack: [...h.backpack, itemName],
		}));
		next = log(next, `${itemName} na mochila de ${heroId}.`);
	}

	return next;
}

// ─── INV_ASSIGN_ARTIFACT ─────────────────────────────────────────────────────
// Move artefato da mesa para a vaga do grupo. Máx 2 artefatos ativos.

export function handleInvAssignArtifact(
	state: GameState,
	artifactName: string,
	vagaIndex: 0 | 1,
	heroId: string | null,
): GameState {
	const reward = state.pendingRewards.find(
		(r) => r.cardName === artifactName && r.type === "artifact",
	);
	if (!reward) return state;
	if (state.groupArtifacts.length >= 2) return state;

	const remaining = state.pendingRewards.filter((r) => r !== reward);
	return log(
		{
			...state,
			pendingRewards: remaining,
			groupArtifacts: [
				...state.groupArtifacts,
				{ cardName: artifactName, carriedBy: heroId },
			],
		},
		`Artefato ${artifactName} ativo no grupo.`,
	);
}

// ─── INV_SET_BEARER ───────────────────────────────────────────────────────────
// Atualiza o portador de um artefato ativo no grupo.

export function handleInvSetBearer(
	state: GameState,
	vagaIndex: number,
	heroId: string | null,
): GameState {
	if (!state.groupArtifacts[vagaIndex]) return state;
	const artifacts = state.groupArtifacts.map((a, i) =>
		i === vagaIndex ? { ...a, carriedBy: heroId } : a,
	);
	return { ...state, groupArtifacts: artifacts };
}

// ─── INV_DISCARD_MESA ─────────────────────────────────────────────────────────
// Descarta tudo que restou na mesa e avança para XP_SPEND_PHASE.

export function handleInvDescartarMesa(state: GameState): GameState {
	const count = state.pendingRewards.length;
	return log(
		{ ...state, pendingRewards: [], status: "XP_SPEND_PHASE" },
		count > 0
			? `Mesa descartada: ${count} item(ns) perdido(s).`
			: "Inventário fechado.",
	);
}

// ─── Distribuição automática de item (fallback para 1 herói) ─────────────────
// Mantido para compatibilidade com testes que usam distribuição direta.

export function distributeItemAuto(
	state: GameState,
	itemName: string,
): GameState {
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
