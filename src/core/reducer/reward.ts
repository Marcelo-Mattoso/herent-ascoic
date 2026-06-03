// Handlers de recompensa, XP e gasto de XP.
// Patch 1: GRANT_REWARDS constrói fila pendingRewards em vez de distribuir automaticamente.
// Itens e artefatos são resolvidos um a um via CHOOSE_ITEM_DESTINATION / CHOOSE_ARTIFACT_BEARER.

import type { InvFromZone, InvToZone } from "../actions/types";
import type { XpSpendOption } from "../config/defaults";
import { XP_COSTS } from "../config/defaults";
import { getCardByName } from "../data/cards";
import { calculateRewards } from "../rules/reward";
import { tickModifierDurations } from "../ecs/world";
import { emit } from "../events/bus";
import { cardSkills } from "../skills/lookup";
import { renderSkillLabel } from "../skills/renderLabel";
import type { GameState, PendingReward } from "../state/gameState";
import { defaultItemDestination } from "../strategies/itemDistribution";
import { handleDungeonExhaustedSpend } from "./exploration";
import { levelUpHero, lowerDespertar } from "./progression";
import { getActiveHero, log, mapHero, shuffleRng } from "./utils";

// ─── GRANT_REWARDS ────────────────────────────────────────────────────────────
// Calcula XP, monta fila de itens/artefatos pendentes e mantém status REWARD_PHASE.

export function handleGrantRewards(state: GameState): GameState {
	if (!state.currentRoom) return state;
	// Evitar processar duas vezes (fila já preenchida)
	if (state.pendingRewards.length > 0) return state;

	// on_win_room: via TriggerComponents (emit CombatEnded — Lote G)
	let next = state;
	({ state: next } = emit(next, { type: "CombatEnded", payload: {} }));
	// Expira modificadores ECS com duração this_combat/this_turn ao fechar o combate
	// (cobre sala limpa, onde RoundEnded/end_of_round tick não rodou).
	next = {
		...next,
		world: tickModifierDurations(
			tickModifierDurations(next.world, "end_of_round"),
			"end_of_combat",
		),
	};

	const eligibleGraveyard = next.enemyGraveyard.filter((e) => !e.noReward);
	const summary = calculateRewards(next.currentRoom!, eligibleGraveyard);

	// Registrar subchefes derrotados
	const newlyDefeatedSubbosses = next.enemyGraveyard
		.filter((e) => e.isSubboss && !next.subbosses.defeated.includes(e.cardName))
		.map((e) => e.cardName);
	if (newlyDefeatedSubbosses.length > 0) {
		next = {
			...next,
			subbosses: {
				available: next.subbosses.available.filter(
					(name) => !newlyDefeatedSubbosses.includes(name),
				),
				defeated: [...next.subbosses.defeated, ...newlyDefeatedSubbosses],
			},
		};
	}

	// XP da sala é concedido imediatamente
	next = { ...next, groupXp: next.groupXp + summary.xp };

	// Em modo competitivo, distribuir XP individualmente para heróis ativos
	if (next.mode === "competitive" && summary.xp > 0) {
		const activeHeroIds = new Set(
			(next.combat?.pairs ?? []).map((p) => p.heroId),
		);
		const recipients = next.heroes.filter(
			(h) => activeHeroIds.has(h.id) || activeHeroIds.size === 0,
		);
		const share = Math.floor(summary.xp / Math.max(1, recipients.length));
		if (share > 0) {
			next = {
				...next,
				heroes: next.heroes.map((h) =>
					recipients.some((r) => r.id === h.id)
						? { ...h, xp: h.xp + share }
						: h,
				),
			};
		}
	}

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
		// Verificar se o artefato tem portador ("portador" no label renderizado)
		const artCard = getCardByName(artName as string);
		const artSkillEntry =
			artCard?.type === "artifact" ? cardSkills(artCard.id)[0] : null;
		const requiresBearer =
			artCard?.type === "artifact" &&
			!!artSkillEntry &&
			renderSkillLabel(artSkillEntry.ref).toLowerCase().includes("portador");
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
				if (card.itemClass === "consumable") {
					// Consumíveis não ocupam slot de equipamento — vão para a mochila
					next = mapHero(next, heroId, (h) => ({
						...h,
						backpack: [...h.backpack, itemName],
					}));
					next = log(next, `${itemName} guardado na mochila de ${heroId}.`);
				} else {
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
				}
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
			{
				cardId: getCardByName(reward.cardName)?.id ?? "",
				cardName: reward.cardName,
				carriedBy: heroId,
			},
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
			const { value: reshuffled, next: rng } = shuffleRng(discarded, next.rng);
			next = {
				...next,
				rng,
				decks: {
					...next.decks,
					dungeonDeck: {
						available: reshuffled,
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
						{
							cardId: getCardByName(artName as string)?.id ?? "",
							cardName: artName as string,
							carriedBy: null,
						},
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

// ─── INV_MOVE ────────────────────────────────────────────────────────────────
// Move um item entre qualquer zona: mesa ↔ herói-slot ↔ herói-mochila.
// Se o destino já está ocupado, o item deslocado vai para a zona de origem.

export function handleInvMove(
	state: GameState,
	itemName: string,
	from: InvFromZone,
	to: InvToZone,
): GameState {
	if (!verifyAtSource(state, itemName, from)) return state;

	// 1. Remove da origem
	let next = removeFromZone(state, itemName, from);

	// 2. Coloca no destino; captura deslocado, se houver
	let displaced: string | null = null;

	if (to.kind === "mesa") {
		next = {
			...next,
			pendingRewards: [
				...next.pendingRewards,
				{ type: "item", cardName: itemName, requiresBearer: false },
			],
		};
	} else if (to.kind === "hero_equip") {
		const card = getCardByName(itemName);
		if (!card || card.type !== "item" || card.itemClass === "consumable")
			return state;
		const slot =
			card.itemClass === "equipment"
				? "weapon"
				: card.itemClass === "utility"
					? "utility"
					: "special";
		const hero = next.heroes.find((h) => h.id === to.heroId);
		displaced = hero?.activeItems[slot] ?? null;
		next = mapHero(next, to.heroId, (h) => ({
			...h,
			activeItems: { ...h.activeItems, [slot]: itemName },
		}));
	} else if (to.kind === "hero_backpack") {
		const hero = next.heroes.find((h) => h.id === to.heroId);
		if ((hero?.backpack.length ?? 8) >= 8) return state;
		next = mapHero(next, to.heroId, (h) => ({
			...h,
			backpack: [...h.backpack, itemName],
		}));
	}

	// 3. Devolver deslocado para a origem (swap)
	if (displaced) {
		next = returnToZone(next, displaced, from);
	}

	return log(next, `${itemName}: ${zoneLabel(from)} → ${zoneLabel(to)}`);
}

function verifyAtSource(
	state: GameState,
	itemName: string,
	from: InvFromZone,
): boolean {
	if (from.kind === "mesa")
		return state.pendingRewards.some(
			(r) => r.cardName === itemName && r.type === "item",
		);
	if (from.kind === "hero_slot") {
		const h = state.heroes.find((h) => h.id === from.heroId);
		return h?.activeItems[from.slotType] === itemName;
	}
	if (from.kind === "hero_backpack") {
		const h = state.heroes.find((h) => h.id === from.heroId);
		return h?.backpack[from.index] === itemName;
	}
	return false;
}

function removeFromZone(
	state: GameState,
	itemName: string,
	from: InvFromZone,
): GameState {
	if (from.kind === "mesa") {
		let removed = false;
		return {
			...state,
			pendingRewards: state.pendingRewards.filter((r) => {
				if (!removed && r.cardName === itemName && r.type === "item") {
					removed = true;
					return false;
				}
				return true;
			}),
		};
	}
	if (from.kind === "hero_slot") {
		return mapHero(state, from.heroId, (h) => {
			const { [from.slotType]: _removed, ...rest } = h.activeItems;
			return { ...h, activeItems: rest };
		});
	}
	if (from.kind === "hero_backpack") {
		return mapHero(state, from.heroId, (h) => ({
			...h,
			backpack: h.backpack.filter((_, i) => i !== from.index),
		}));
	}
	return state;
}

function returnToZone(
	state: GameState,
	itemName: string,
	zone: InvFromZone,
): GameState {
	if (zone.kind === "mesa") {
		return {
			...state,
			pendingRewards: [
				...state.pendingRewards,
				{ type: "item", cardName: itemName, requiresBearer: false },
			],
		};
	}
	if (zone.kind === "hero_slot") {
		return mapHero(state, zone.heroId, (h) => ({
			...h,
			activeItems: { ...h.activeItems, [zone.slotType]: itemName },
		}));
	}
	if (zone.kind === "hero_backpack") {
		return mapHero(state, zone.heroId, (h) => {
			const bp = [...h.backpack];
			bp.splice(zone.index, 0, itemName);
			return { ...h, backpack: bp };
		});
	}
	return state;
}

function zoneLabel(zone: InvFromZone | InvToZone): string {
	if (zone.kind === "mesa") return "mesa";
	if (zone.kind === "hero_slot") return `slot(${zone.heroId})`;
	if (zone.kind === "hero_backpack") return `mochila(${zone.heroId})`;
	if (zone.kind === "hero_equip") return `equip(${zone.heroId})`;
	return "?";
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
			if (card.itemClass === "consumable") {
				// Consumíveis não ocupam slot de equipamento — vão para a mochila
				const hero = state.heroes.find((h) => h.id === heroId);
				if ((hero?.backpack.length ?? 8) >= 8) return state;
				next = mapHero(next, heroId, (h) => ({
					...h,
					backpack: [...h.backpack, itemName],
				}));
				next = log(next, `${itemName} na mochila de ${heroId}.`);
			} else {
				const slot =
					card.itemClass === "equipment"
						? "weapon"
						: card.itemClass === "utility"
							? "utility"
							: "special";
				next = mapHero(next, heroId, (h) => ({
					...h,
					activeItems: { ...h.activeItems, [slot]: itemName },
					backpack: h.backpack,
				}));
				// Se o slot estava ocupado, item deslocado volta para a mesa
				const hero = state.heroes.find((h) => h.id === heroId);
				const displaced =
					hero?.activeItems[
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
	_vagaIndex: 0 | 1,
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
				{
					cardId: getCardByName(artifactName)?.id ?? "",
					cardName: artifactName,
					carriedBy: heroId,
				},
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
