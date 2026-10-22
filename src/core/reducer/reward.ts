// Handlers de recompensa, XP e gasto de XP.
// Patch 1: GRANT_REWARDS constrói fila pendingRewards em vez de distribuir automaticamente.
// Itens e artefatos são resolvidos um a um via CHOOSE_ITEM_DESTINATION / CHOOSE_ARTIFACT_BEARER.

import type { InvFromZone, InvToZone } from "../actions/types";
import type { XpSpendOption } from "../config/defaults";
import { XP_COSTS } from "../config/defaults";
import { getCardName } from "../data/cardLocale";
import { getCardById } from "../data/cards";
import { tickModifierDurations } from "../ecs/world";
import { calculateRewards } from "../rules/reward";
import { resolveSkillWindow } from "../skills/resolveSkillWindow";
import { tickBlockEntries } from "../state/blockHelpers";
import type { GameState, PendingReward } from "../state/gameState";
import {
	defaultItemDestination,
	getItemEquipmentSlot,
} from "../strategies/itemDistribution";
import {
	handleCheckBossCondition,
	handleDungeonExhaustedSpend,
} from "./exploration";
import { levelUpHero, lowerDespertar } from "./progression";
import { getActiveHero, log, mapHero, shuffleRng } from "./utils";

// ─── GRANT_REWARDS ────────────────────────────────────────────────────────────
// Calcula XP, monta fila de itens pendentes e ativa artefatos no grupo.

export function handleGrantRewards(state: GameState): GameState {
	if (!state.currentRoom) return state;
	// Evitar processar duas vezes (fila já preenchida)
	if (state.pendingRewards.length > 0) return state;

	const afterRoomWin = resolveSkillWindow(state, {
		event: "evt_room_won",
		ctx: {
			triggeredBy: "evt_room_won",
			targetHeroIds: state.heroes
				.filter((hero) => hero.status === "active")
				.map((hero) => hero.id),
		},
		resume: { type: "continue_rewards_after_room_win" },
	});
	if (
		afterRoomWin.pendingTriggerInterrupt ||
		afterRoomWin.pendingSkillChoice ||
		afterRoomWin.pendingSkillTarget
	) {
		return afterRoomWin;
	}
	return continueRewardsAfterRoomWin(afterRoomWin);
}

/** Continua o fluxo normal somente depois de todas as habilidades de vitória. */
export function continueRewardsAfterRoomWin(state: GameState): GameState {
	if (!state.currentRoom) return state;
	const withVictoryRewards =
		state.pendingRewards.length > 0
			? {
					...state,
					flags: { ...state.flags, roomVictoryRewardsGranted: true },
				}
			: state;
	const afterCombatEnd = resolveSkillWindow(withVictoryRewards, {
		event: "evt_combat_end",
		ctx: {
			triggeredBy: "evt_combat_end",
			targetHeroIds: state.heroes
				.filter((hero) => hero.status === "active")
				.map((hero) => hero.id),
		},
		resume: { type: "finish_rewards" },
	});
	if (
		afterCombatEnd.pendingTriggerInterrupt ||
		afterCombatEnd.pendingSkillChoice ||
		afterCombatEnd.pendingSkillTarget
	) {
		return afterCombatEnd;
	}
	return finishGrantRewards(afterCombatEnd);
}

/** Materializa XP e saque após todas as janelas de vitória/encerramento. */
export function finishGrantRewards(state: GameState): GameState {
	const replacesRoomLoot = state.flags.roomLootReplaced === true;
	const hasVictoryRewards = state.flags.roomVictoryRewardsGranted === true;
	if (
		!state.currentRoom ||
		(state.pendingRewards.length > 0 && !replacesRoomLoot && !hasVictoryRewards)
	)
		return state;
	let next = state;
	// Expira modificadores ECS com duração this_combat/this_turn ao fechar o combate
	// (cobre sala limpa, onde RoundEnded/end_of_round tick não rodou).
	next = {
		...next,
		world: tickModifierDurations(
			tickModifierDurations(next.world, "end_of_round"),
			"end_of_combat",
		),
	};
	next = tickBlockEntries(
		tickBlockEntries(next, "end_of_round"),
		"end_of_combat",
	);

	const eligibleGraveyard = next.enemyGraveyard.filter((e) => !e.noReward);
	const summary = calculateRewards(next.currentRoom!, eligibleGraveyard);

	// Registrar subchefes derrotados
	const newlyDefeatedSubbosses = next.enemyGraveyard
		.filter((e) => e.isSubboss && !next.subbosses.defeated.includes(e.cardId))
		.map((e) => e.cardId);
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
	for (let i = 0; i < (replacesRoomLoot ? 0 : summary.items); i++) {
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
			cardId: itemName as string,
			requiresBearer: false,
		});
	}

	// Ativar artefatos direto no grupo
	for (let i = 0; i < (replacesRoomLoot ? 0 : summary.artifacts); i++) {
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
		next = {
			...next,
			groupArtifacts: [
				...next.groupArtifacts,
				{ cardId: artName as string, carriedBy: null },
			],
		};
	}

	next = {
		...next,
		currentRoom: next.currentRoom
			? { ...next.currentRoom, status: "cleared" }
			: null,
		roomsCleared: next.roomsCleared + 1,
		pendingRewards: [...next.pendingRewards, ...queue],
	};

	// Se não há recompensas físicas, avançar diretamente para XP_SPEND_PHASE.
	// Artefatos entram ativos, mas ainda podem pedir escolha de portador na tela.
	if (
		next.pendingRewards.length === 0 &&
		(replacesRoomLoot || summary.artifacts === 0)
	) {
		return log(
			{ ...next, status: "XP_SPEND_PHASE" },
			`Recompensas: +${summary.xp} XP. Sem itens ou artefatos.`,
		);
	}

	return log(
		next,
		`Recompensas: +${summary.xp} XP, ${replacesRoomLoot ? 0 : summary.items} item(ns), ${replacesRoomLoot ? 0 : summary.artifacts} artefato(s). Resolvendo...`,
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

	const itemId = reward.cardId;
	const itemName = getCardName(itemId);
	const remainingRewards = state.pendingRewards.slice(1);
	let next: GameState = { ...state, pendingRewards: remainingRewards };

	if (destination !== "discard") {
		const card = getCardById(itemId);
		if (card && card.type === "item") {
			if (destination === "equip") {
				const slot = getItemEquipmentSlot(card.itemClass);
				if (!slot) return state;
				next = mapHero(next, heroId, (h) => {
					const displaced = h.activeItems[slot];
					return {
						...h,
						activeItems: { ...h.activeItems, [slot]: itemId },
						backpack: displaced ? [...h.backpack, displaced] : h.backpack,
					};
				});
				next = log(next, `${itemName} equipado por ${heroId}.`);
			} else {
				// backpack
				next = mapHero(next, heroId, (h) => ({
					...h,
					backpack: [...h.backpack, itemId],
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
				cardId: reward.cardId,
				carriedBy: heroId,
			},
		],
	};

	return advanceRewardPhase(
		log(next, `Artefato obtido: ${getCardName(reward.cardId)}.`),
	);
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

	// Subir de nível é uma decisão do grupo. Não assumir o primeiro herói
	// ativo evita gastar XP no alvo errado quando há mais de um herói elegível.
	if (option === "level_up") {
		if (!heroId) {
			return log(state, "Escolha qual herói receberá o nível de Ímpeto.");
		}
		const hero = state.heroes.find((candidate) => candidate.id === heroId);
		if (!hero || hero.status !== "active") {
			return log(state, "O herói escolhido não está disponível para subir de nível.");
		}
		if (hero.impeto >= 4) {
			return log(state, `${getCardName(hero.cardId)} já está no nível máximo.`);
		}
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
			return levelUpHero(next, heroId!);
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
					{ type: "item", cardId: itemName as string, requiresBearer: false },
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
							cardId: artName as string,
							carriedBy: null,
						},
					],
					decks: {
						...next.decks,
						artifactDeck: { available: rest, discarded, removed },
					},
				},
				`Artefato comprado: ${getCardName(artName as string)}.`,
			);
		}
	}
}

// ─── Transição de XP_SPEND_PHASE → OPEN_PATHS ────────────────────────────────

export function handleOpenPathsFromXpPhase(state: GameState): GameState {
	return handleCheckBossCondition(state);
}

// ─── INV_MOVE ────────────────────────────────────────────────────────────────
// Move um item entre qualquer zona: mesa ↔ herói-slot ↔ herói-mochila.
// Se o destino já está ocupado, o item deslocado vai para a zona de origem.

export function handleInvMove(
	state: GameState,
	itemId: string,
	from: InvFromZone,
	to: InvToZone,
): GameState {
	if (!verifyAtSource(state, itemId, from)) return state;

	// 1. Remove da origem
	let next = removeFromZone(state, itemId, from);

	// 2. Coloca no destino; captura deslocado, se houver
	let displaced: string | null = null;

	if (to.kind === "mesa") {
		next = {
			...next,
			pendingRewards: [
				...next.pendingRewards,
				{ type: "item", cardId: itemId, requiresBearer: false },
			],
		};
	} else if (to.kind === "hero_equip") {
		const card = getCardById(itemId);
		if (!card || card.type !== "item")
			return state;
		const slot = getItemEquipmentSlot(card.itemClass);
		if (!slot) return state;
		const hero = next.heroes.find((h) => h.id === to.heroId);
		displaced = hero?.activeItems[slot] ?? null;
		next = mapHero(next, to.heroId, (h) => ({
			...h,
			activeItems: { ...h.activeItems, [slot]: itemId },
		}));
	} else if (to.kind === "hero_backpack") {
		const hero = next.heroes.find((h) => h.id === to.heroId);
		if ((hero?.backpack.length ?? 8) >= 8) return state;
		next = mapHero(next, to.heroId, (h) => ({
			...h,
			backpack: [...h.backpack, itemId],
		}));
	}

	// 3. Devolver deslocado para a origem (swap)
	if (displaced) {
		next = returnToZone(next, displaced, from);
	}

	const itemName = getCardName(itemId);
	return log(next, `${itemName}: ${zoneLabel(from)} → ${zoneLabel(to)}`);
}

function verifyAtSource(
	state: GameState,
	itemId: string,
	from: InvFromZone,
): boolean {
	if (from.kind === "mesa")
		return state.pendingRewards.some(
			(r) => r.cardId === itemId && r.type === "item",
		);
	if (from.kind === "hero_slot") {
		const h = state.heroes.find((h) => h.id === from.heroId);
		return h?.activeItems[from.slotType] === itemId;
	}
	if (from.kind === "hero_backpack") {
		const h = state.heroes.find((h) => h.id === from.heroId);
		return h?.backpack[from.index] === itemId;
	}
	return false;
}

function removeFromZone(
	state: GameState,
	itemId: string,
	from: InvFromZone,
): GameState {
	if (from.kind === "mesa") {
		let removed = false;
		return {
			...state,
			pendingRewards: state.pendingRewards.filter((r) => {
				if (!removed && r.cardId === itemId && r.type === "item") {
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
	itemId: string,
	zone: InvFromZone,
): GameState {
	if (zone.kind === "mesa") {
		return {
			...state,
			pendingRewards: [
				...state.pendingRewards,
				{ type: "item", cardId: itemId, requiresBearer: false },
			],
		};
	}
	if (zone.kind === "hero_slot") {
		return mapHero(state, zone.heroId, (h) => ({
			...h,
			activeItems: { ...h.activeItems, [zone.slotType]: itemId },
		}));
	}
	if (zone.kind === "hero_backpack") {
		return mapHero(state, zone.heroId, (h) => {
			const bp = [...h.backpack];
			bp.splice(zone.index, 0, itemId);
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
	itemId: string,
	heroId: string,
	destination: "equip" | "backpack",
): GameState {
	const reward = state.pendingRewards.find(
		(r) => r.cardId === itemId && r.type === "item",
	);
	if (!reward) return state;

	const remaining = state.pendingRewards.filter((r) => r !== reward);
	let next: GameState = { ...state, pendingRewards: remaining };
	const itemName = getCardName(itemId);

	if (destination === "equip") {
		const card = getCardById(itemId);
		if (card && card.type === "item") {
			const slot = getItemEquipmentSlot(card.itemClass);
			if (!slot) return state;
			next = mapHero(next, heroId, (h) => ({
				...h,
				activeItems: { ...h.activeItems, [slot]: itemId },
				backpack: h.backpack,
			}));
			const hero = state.heroes.find((h) => h.id === heroId);
			const displaced = hero?.activeItems[slot];
			if (displaced) {
				next = {
					...next,
					pendingRewards: [
						...next.pendingRewards,
						{ type: "item", cardId: displaced, requiresBearer: false },
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
			backpack: [...h.backpack, itemId],
		}));
		next = log(next, `${itemName} na mochila de ${heroId}.`);
	}

	return next;
}

// ─── INV_ASSIGN_ARTIFACT ─────────────────────────────────────────────────────
// Move artefato da mesa para os artefatos ativos do grupo.

export function handleInvAssignArtifact(
	state: GameState,
	artifactId: string,
	_vagaIndex: number,
	heroId: string | null,
): GameState {
	const reward = state.pendingRewards.find(
		(r) => r.cardId === artifactId && r.type === "artifact",
	);
	if (!reward) return state;

	const remaining = state.pendingRewards.filter((r) => r !== reward);
	const artifactName = getCardName(artifactId);
	return log(
		{
			...state,
			pendingRewards: remaining,
			groupArtifacts: [
				...state.groupArtifacts,
				{
					cardId: artifactId,
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
	itemId: string,
): GameState {
	const hero = getActiveHero(state);
	if (!hero) return state;

	const card = getCardById(itemId);
	if (!card || card.type !== "item") return state;

	const dest = defaultItemDestination(hero, card.itemClass);
	const itemName = getCardName(itemId);
	const heroName = getCardName(hero.cardId);

	if (dest === "equip") {
		const slot = getItemEquipmentSlot(card.itemClass);
		if (!slot) return state;
		return mapHero(
			log(state, `${itemName} equipado em ${heroName}.`),
			hero.id,
			(h) => ({
				...h,
				activeItems: { ...h.activeItems, [slot]: itemId },
			}),
		);
	}

	return mapHero(
		log(state, `${itemName} foi para a mochila de ${heroName}.`),
		hero.id,
		(h) => ({
			...h,
			backpack: [...h.backpack, itemId],
		}),
	);
}
