import type { InvFromZone, InvToZone } from "../actions/types";

import { executeAbilityGrant, resolveManualGrantTarget } from "../abilities/executor";
import { abilityGrants } from "../gameEngine";
import { pausedOf } from "../state/access";

import { tickModifierDurations } from "../ecs/world";
import { moveInventoryItem } from "../rules/inventoryMoves";
import { placeEquipment } from "../rules/equipment";
import { calculateRewards } from "../rules/reward";
import { resolveSkillWindow } from "../skills/resolveSkillWindow";
import { tickBlockEntries } from "../state/blockHelpers";
import type { GameState, PendingReward } from "../state/gameState";
import { defaultItemDestination } from "../strategies/itemDistribution";
import { recordEvent } from "../events/record";
import { getActiveHero, log, mapHero } from "./utils";
import { backpackCapacity, cardById, cardName } from "../gameEngine";

import type { GameEngine, GameHandler } from "../gameEngine";
import type { Action } from "../actions/types";
import { partyHeroIds } from "./legal";
import { deckOf, decksOf, graveyardOf, heroesOf, withDecks, withWorld, worldOf, pendingTriggerInterruptOf, pendingSkillChoiceOf, pendingSkillTargetOf } from "../state/access";
import { gameOf, withGame } from "../../engine/state";
// ─── GRANT_REWARDS ────────────────────────────────────────────────────────────
// Calcula XP, monta fila de itens pendentes e ativa artefatos no grupo.

export function handleGrantRewards(engine: GameEngine, state: GameState): GameState {
	if (!gameOf(state).currentRoom) return state;
	// Evitar processar duas vezes (fila já preenchida)
	if (gameOf(state).pendingRewards.length > 0) return state;
	// Sala já paga: conceder de novo duplicaria XP e travaria a fase.
	if (gameOf(state).currentRoom!.status === "cleared") {
		return withGame(state, (prevGame) => ({ ...prevGame, status: "XP_SPEND_PHASE" }));
	}

	const afterRoomWin = resolveSkillWindow(engine, state, {
		event: "evt_room_won",
		ctx: {
			triggeredBy: "evt_room_won",
			targetHeroIds: heroesOf(state)
				.filter((hero) => hero.status === "active")
				.map((hero) => hero.id),
		},
		resume: { type: "continue_rewards_after_room_win" },
	});
	if (
		pendingTriggerInterruptOf(afterRoomWin) ||
		pendingSkillChoiceOf(afterRoomWin) ||
		pendingSkillTargetOf(afterRoomWin)
	) {
		return afterRoomWin;
	}
	return continueRewardsAfterRoomWin(engine, afterRoomWin);
}

/** Continua o fluxo normal somente depois de todas as habilidades de vitória. */
export function continueRewardsAfterRoomWin(engine: GameEngine, state: GameState): GameState {
	if (!gameOf(state).currentRoom) return state;
	const withVictoryRewards =
		gameOf(state).pendingRewards.length > 0
			? withGame(state, (prevGame) => ({ ...prevGame, flags: { ...gameOf(state).flags, roomVictoryRewardsGranted: true } }))
			: state;
	const afterCombatEnd = resolveSkillWindow(engine, withVictoryRewards, {
		event: "evt_combat_end",
		ctx: {
			triggeredBy: "evt_combat_end",
			targetHeroIds: heroesOf(state)
				.filter((hero) => hero.status === "active")
				.map((hero) => hero.id),
		},
		resume: { type: "finish_rewards" },
	});
	if (
		pendingTriggerInterruptOf(afterCombatEnd) ||
		pendingSkillChoiceOf(afterCombatEnd) ||
		pendingSkillTargetOf(afterCombatEnd)
	) {
		return afterCombatEnd;
	}
	return finishGrantRewards(afterCombatEnd);
}

/** Materializa XP e saque após todas as janelas de vitória/encerramento. */
export function finishGrantRewards(state: GameState): GameState {
	const replacesRoomLoot = gameOf(state).flags.roomLootReplaced === true;
	const hasVictoryRewards = gameOf(state).flags.roomVictoryRewardsGranted === true;
	if (
		!gameOf(state).currentRoom ||
		(gameOf(state).pendingRewards.length > 0 && !replacesRoomLoot && !hasVictoryRewards)
	)
		return state;
	let next = state;
	// Expira modificadores ECS com duração this_combat/this_turn ao fechar o combate
	// (cobre sala limpa, onde RoundEnded/end_of_round tick não rodou).
	next = withWorld(next, tickModifierDurations(
			tickModifierDurations(worldOf(next), "end_of_round"),
			"end_of_combat",
		));
	next = tickBlockEntries(
		tickBlockEntries(next, "end_of_round"),
		"end_of_combat",
	);

	const eligibleGraveyard = graveyardOf(next).filter((e) => !e.noReward);
	const summary = calculateRewards(gameOf(next).currentRoom!, eligibleGraveyard);

	// Registrar subchefes derrotados
	const newlyDefeatedSubbosses = graveyardOf(next)
		.filter((e) => e.isSubboss && !gameOf(next).subbosses.defeated.includes(e.cardId))
		.map((e) => e.cardId);
	if (newlyDefeatedSubbosses.length > 0) {
		next = withGame(next, (prevGame) => ({ ...prevGame, subbosses: {
				available: gameOf(next).subbosses.available.filter(
					(name) => !newlyDefeatedSubbosses.includes(name),
				),
				defeated: [...gameOf(next).subbosses.defeated, ...newlyDefeatedSubbosses],
			} }));
	}

	// XP da sala é concedido imediatamente
	next = withGame(next, (prevGame) => ({ ...prevGame, groupXp: gameOf(next).groupXp + summary.xp }));
	next = recordEvent(next, "RoomWon", { roomId: gameOf(next).currentRoom!.cardId });
	next = recordEvent(next, "RewardGranted", { kind: "xp", amount: summary.xp });

	// Em modo competitivo, distribuir XP individualmente para heróis ativos
	if (gameOf(next).mode === "competitive" && summary.xp > 0) {
		const activeHeroIds = new Set(
			(gameOf(next).combat?.pairs ?? []).map((p) => p.heroId),
		);
		const recipients = heroesOf(next).filter(
			(h) => activeHeroIds.has(h.id) || activeHeroIds.size === 0,
		);
		const share = Math.floor(summary.xp / Math.max(1, recipients.length));
		if (share > 0) {
			next = withGame(next, (prevGame) => ({ ...prevGame, heroes: gameOf(next).heroes.map((h) =>
					recipients.some((r) => r.id === h.id)
						? { ...h, xp: h.xp + share }
						: h,
				) }));
		}
	}

	const queue: PendingReward[] = [];

	// Enfileirar itens
	for (let i = 0; i < (replacesRoomLoot ? 0 : summary.items); i++) {
		const available = deckOf(next, "itemDeck").available;
		if (available.length === 0) break;
		const [itemName, ...rest] = available;
		next = withDecks(next, {
				...decksOf(next),
				itemDeck: { ...deckOf(next, "itemDeck"), available: rest },
			});
		queue.push({
			type: "item",
			cardId: itemName as string,
			requiresBearer: false,
		});
	}

	// Ativar artefatos direto no grupo
	for (let i = 0; i < (replacesRoomLoot ? 0 : summary.artifacts); i++) {
		const available = deckOf(next, "artifactDeck").available;
		if (available.length === 0) break;
		const [artName, ...rest] = available;
		next = withDecks(next, {
				...decksOf(next),
				artifactDeck: { ...deckOf(next, "artifactDeck"), available: rest },
			});
		next = withGame(next, (prevGame) => ({ ...prevGame, groupArtifacts: [
				...gameOf(next).groupArtifacts,
				{ cardId: artName as string, carriedBy: null },
			] }));
		next = recordEvent(next, "RewardGranted", {
			kind: "artifact",
			cardId: artName as string,
		});
	}

	for (const reward of queue) {
		next = recordEvent(next, "RewardGranted", {
			kind: reward.type,
			cardId: reward.cardId,
		});
	}
	next = withGame(next, (prevGame) => ({ ...prevGame, currentRoom: gameOf(next).currentRoom
			? { ...gameOf(next).currentRoom!, status: "cleared" }
			: null, roomsCleared: gameOf(next).roomsCleared + 1, pendingRewards: [...gameOf(next).pendingRewards, ...queue] }));

	// Se não há recompensas físicas, avançar diretamente para XP_SPEND_PHASE.
	// Artefatos entram ativos, mas ainda podem pedir escolha de portador na tela.
	if (
		gameOf(next).pendingRewards.length === 0 &&
		(replacesRoomLoot || summary.artifacts === 0)
	) {
		return log(
			withGame(next, (prevGame) => ({ ...prevGame, status: "XP_SPEND_PHASE" })),
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

export function handleUseRewardItem(engine: GameEngine, state: GameState, itemId: string, heroId: string): GameState {
	const game = gameOf(state);
	if (
		game.status !== "REWARD_PHASE" ||
		pausedOf(state) ||
		pendingSkillChoiceOf(state) ||
		pendingSkillTargetOf(state) ||
		pendingTriggerInterruptOf(state) ||
		!game.pendingRewards.some((reward) => reward.type === "item" && reward.cardId === itemId) ||
		!heroesOf(state).some((hero) => hero.id === heroId && hero.status === "active")
	) return state;
	const grant = abilityGrants(engine, itemId).find((entry) =>
		entry.activation.kind === "manual" && entry.activation.usableFromReward);
	if (!grant) return state;
	const source = { kind: "item" as const, cardId: itemId, sourceHeroId: heroId };
	const selection = resolveManualGrantTarget(engine, state, source, grant);
	if (selection.kind !== "ready")
		return log(state, `[AVISO] ${selection.kind === "unavailable" ? selection.reason : selection.prompt}`);
	return executeAbilityGrant(engine, state, {
		source, grant, triggeredBy: "manual", targetIds: selection.targetIds,
		consumeFromPendingReward: true,
	});
}

export function handleChooseItemDestination(engine: GameEngine,
	state: GameState,
	heroId: string,
	destination: "equip" | "backpack" | "discard",
): GameState {
	if (gameOf(state).status !== "REWARD_PHASE") return state;
	const reward = gameOf(state).pendingRewards[0];
	if (!reward || reward.type !== "item") return state;

	const itemId = reward.cardId;
	const itemName = cardName(engine, itemId);
	if (destination === "discard") {
		return advanceRewardPhase(
			log(
				recordEvent(
					withGame(state, (prevGame) => ({ ...prevGame, pendingRewards: gameOf(state).pendingRewards.slice(1) })),
					"ItemDiscarded",
					{ itemId },
				),
				`${itemName} descartado.`,
			),
		);
	}
	const moved = moveInventoryItem(engine,
		state,
		itemId,
		{ kind: "mesa" },
		destination === "equip"
			? { kind: "hero_equip", heroId }
			: { kind: "hero_backpack", heroId },
	);
	return moved
		? advanceRewardPhase(
				log(
					recordEvent(
						moved,
						destination === "equip" ? "ItemEquipped" : "ItemStored",
						{ heroId, itemId },
					),
					`${itemName} atribuído a ${heroId}.`,
				),
			)
		: state;
}

// ─── CHOOSE_ARTIFACT_BEARER ───────────────────────────────────────────────────
// Define o portador do primeiro artefato pendente (heroId null = sem portador).

export function handleChooseArtifactBearer(engine: GameEngine,
	state: GameState,
	heroId: string | null,
): GameState {
	const reward = gameOf(state).pendingRewards[0];
	if (!reward || reward.type !== "artifact") return state;

	const next: GameState = withGame(state, (prevGame) => ({ ...prevGame, pendingRewards: gameOf(state).pendingRewards.slice(1), groupArtifacts: [
			...gameOf(state).groupArtifacts,
			{
				cardId: reward.cardId,
				carriedBy: heroId,
			},
		] }));

	return advanceRewardPhase(
		log(next, `Artefato obtido: ${cardName(engine, reward.cardId)}.`),
	);
}

// Quando a fila fica vazia, avança para XP_SPEND_PHASE.
function advanceRewardPhase(state: GameState): GameState {
	if (gameOf(state).pendingRewards.length === 0) {
		return withGame(state, (prevGame) => ({ ...prevGame, status: "XP_SPEND_PHASE" }));
	}
	return state;
}

// ─── INV_MOVE ────────────────────────────────────────────────────────────────
// Move um item entre qualquer zona: mesa ↔ herói-slot ↔ herói-mochila.
// Se o destino já está ocupado, o item deslocado vai para a zona de origem.

export function handleInvMove(engine: GameEngine,
	state: GameState,
	itemId: string,
	from: InvFromZone,
	to: InvToZone,
): GameState {
	const moved = moveInventoryItem(engine, state, itemId, from, to);
	return moved
		? log(moved, `${cardName(engine, itemId)} movido no inventário.`)
		: state;
}

export function handleInvAssignItem(engine: GameEngine,
	state: GameState,
	itemId: string,
	heroId: string,
	destination: "equip" | "backpack",
): GameState {
	return handleInvMove(engine,
		state,
		itemId,
		{ kind: "mesa" },
		destination === "equip"
			? { kind: "hero_equip", heroId }
			: { kind: "hero_backpack", heroId },
	);
}
// ─── INV_ASSIGN_ARTIFACT ─────────────────────────────────────────────────────
// Move artefato da mesa para os artefatos ativos do grupo.

export function handleInvAssignArtifact(engine: GameEngine,
	state: GameState,
	artifactId: string,
	_vagaIndex: number,
	heroId: string | null,
): GameState {
	const reward = gameOf(state).pendingRewards.find(
		(r) => r.cardId === artifactId && r.type === "artifact",
	);
	if (!reward) return state;

	const remaining = gameOf(state).pendingRewards.filter((r) => r !== reward);
	const artifactName = cardName(engine, artifactId);
	return log(
		withGame(state, (prevGame) => ({ ...prevGame, pendingRewards: remaining, groupArtifacts: [
				...gameOf(state).groupArtifacts,
				{
					cardId: artifactId,
					carriedBy: heroId,
				},
			] })),
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
	if (!gameOf(state).groupArtifacts[vagaIndex]) return state;
	const artifacts = gameOf(state).groupArtifacts.map((a, i) =>
		i === vagaIndex ? { ...a, carriedBy: heroId } : a,
	);
	return withGame(state, (prevGame) => ({ ...prevGame, groupArtifacts: artifacts }));
}

// ─── INV_DISCARD_MESA ─────────────────────────────────────────────────────────
// Descarta tudo que restou na mesa e avança para XP_SPEND_PHASE.

export function handleInvDescartarMesa(state: GameState): GameState {
	const count = gameOf(state).pendingRewards.length;
	return log(
		withGame(state, (prevGame) => ({ ...prevGame, pendingRewards: [], status: "XP_SPEND_PHASE" })),
		count > 0
			? `Mesa descartada: ${count} item(ns) perdido(s).`
			: "Inventário fechado.",
	);
}

// ─── Distribuição automática de item (fallback para 1 herói) ─────────────────
// Mantido para compatibilidade com testes que usam distribuição direta.

export function distributeItemAuto(engine: GameEngine,
	state: GameState,
	itemId: string,
): GameState {
	const hero = getActiveHero(state);
	if (!hero) return state;

	const card = cardById(engine, itemId);
	if (!card || card.type !== "item") return state;
	if (Object.values(hero.activeItems).includes(itemId) || hero.backpack.includes(itemId)) return state;

	const dest = defaultItemDestination(engine, hero, card);
	const itemName = cardName(engine, itemId);
	const heroName = cardName(engine, hero.cardId);

	if (dest === "equip") {
		const equipped = placeEquipment(engine, hero, card);
		if (!equipped) return state;
		return mapHero(
			log(state, `${itemName} equipado em ${heroName}.`),
			hero.id,
			() => equipped.hero,
		);
	}
	if (hero.backpack.length >= backpackCapacity(engine)) return state;

	return mapHero(
		log(state, `${itemName} foi para a mochila de ${heroName}.`),
		hero.id,
		(h) => ({
			...h,
			backpack: [...h.backpack, itemId],
		}),
	);
}

export const rewardHandler: GameHandler = {
	id: "reward",
	phases: ["REWARD_PHASE"],
	actions: [
		"GRANT_REWARDS",
		"CHOOSE_ITEM_DESTINATION",
		"USE_REWARD_ITEM",
		"CHOOSE_ARTIFACT_BEARER",
		"INV_MOVE",
		"INV_ASSIGN_ITEM",
		"INV_ASSIGN_ARTIFACT",
		"INV_SET_BEARER",
		"INV_DISCARD_MESA",
	],
	legalActions(state) {
		const heroIds = partyHeroIds(state);
		const out: Action[] = [];
		if (gameOf(state).pendingRewards.length > 0) {
			for (const heroId of heroIds) {
				out.push({
					type: "CHOOSE_ITEM_DESTINATION",
					payload: { heroId, destination: "equip" },
				});
				out.push({
					type: "CHOOSE_ITEM_DESTINATION",
					payload: { heroId, destination: "backpack" },
				});
				out.push({ type: "CHOOSE_ARTIFACT_BEARER", payload: { heroId } });
			}
			out.push({
				type: "CHOOSE_ITEM_DESTINATION",
				payload: { heroId: heroIds[0] ?? "", destination: "discard" },
			});
		}
		out.push({ type: "GRANT_REWARDS" });
		return out;
	},
	apply(state, action, engine) {
		switch (action.type) {
			case "GRANT_REWARDS":
				return handleGrantRewards(engine, state);
			case "CHOOSE_ITEM_DESTINATION":
				return handleChooseItemDestination(
					engine,
					state,
					action.payload.heroId,
					action.payload.destination,
				);
			case "USE_REWARD_ITEM":
				return handleUseRewardItem(engine, state, action.payload.itemId, action.payload.heroId);
			case "CHOOSE_ARTIFACT_BEARER":
				return handleChooseArtifactBearer(engine, state, action.payload.heroId);
			case "INV_MOVE":
				return handleInvMove(
					engine,
					state,
					action.payload.itemId,
					action.payload.from,
					action.payload.to,
				);
			case "INV_ASSIGN_ITEM":
				return handleInvAssignItem(
					engine,
					state,
					action.payload.itemId,
					action.payload.heroId,
					action.payload.destination,
				);
			case "INV_ASSIGN_ARTIFACT":
				return handleInvAssignArtifact(
					engine,
					state,
					action.payload.artifactId,
					action.payload.vagaIndex,
					action.payload.heroId,
				);
			case "INV_SET_BEARER":
				return handleInvSetBearer(
					state,
					action.payload.vagaIndex,
					action.payload.heroId,
				);
			case "INV_DISCARD_MESA":
				return handleInvDescartarMesa(state);
			default:
				return state;
		}
	},
};
