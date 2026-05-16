// Handlers de exploração: revelar sala, efeito, spawnar inimigos, caminhos.

import { getCardByName } from "../../data/cards";
import { DUNGEON_EXHAUSTION_COST } from "../config/defaults";
import { checkBossCondition } from "../rules/conditions";
import { createEmptyCombatState } from "../state/combatState";
import type { GameState } from "../state/gameState";
import type { RoomState } from "../state/roomState";
import { createEnemyFromCard, log, shuffle } from "./utils";

export function handleRevealRoom(state: GameState): GameState {
	const { available, discarded } = state.decks.dungeonDeck;

	if (available.length === 0) {
		if (state.groupXp >= DUNGEON_EXHAUSTION_COST && discarded.length > 0) {
			return log(
				{ ...state, status: "DUNGEON_EXHAUSTED" },
				"Deck de dungeon esgotado. Gaste 5 XP para continuar.",
			);
		}
		return log(
			{ ...state, status: "DEFEAT" },
			"Derrota: deck de dungeon esgotado sem recursos.",
		);
	}

	const [roomName, ...remaining] = available;
	const card = getCardByName(roomName as string);
	if (!card || card.type !== "room") return state;

	const room: RoomState = {
		cardName: card.name,
		exits: card.exits,
		currentEnemies: card.enemiesByPlayers[0], // solo = índice 0
		reward: card.reward,
		rewardType: card.rewardType,
		effect: card.effect,
		xp: card.xp ?? 0,
		specialCreature: card.specialCreature,
		status: "active",
	};

	return log(
		{
			...state,
			currentRoom: room,
			status: "ROOM_EFFECT",
			decks: {
				...state.decks,
				dungeonDeck: { ...state.decks.dungeonDeck, available: remaining },
			},
		},
		`Sala revelada: ${room.cardName}.`,
	);
}

export function handleResolveRoomEffect(state: GameState): GameState {
	if (!state.currentRoom) return state;
	// MVP1: efeitos de sala implementados — Corredor Estreito e Sala da Masmorra não têm efeito adicional.
	// Outros efeitos ficam como TODO no log.
	const name = state.currentRoom.cardName;
	const noEffect = ["Corredor Estreito", "Sala da Masmorra"];
	if (!noEffect.includes(name)) {
		log(state, `[TODO] Efeito de sala não implementado: ${name}`);
	}
	return { ...state, status: "SPAWN_ENEMIES" };
}

export function handleSpawnEnemies(state: GameState): GameState {
	if (!state.currentRoom) return state;
	const count = state.currentRoom.currentEnemies;

	if (count === 0) {
		return log(
			{ ...state, status: "REWARD_PHASE" },
			"Sala sem inimigos. Indo para recompensa.",
		);
	}

	const { available, discarded } = state.decks.enemyDeck;
	const drawn: string[] = [];
	const remaining = [...available];

	for (let i = 0; i < count && remaining.length > 0; i++) {
		drawn.push(remaining.shift() as string);
	}

	const enemies = drawn.flatMap((name) => {
		const card = getCardByName(name);
		if (!card || (card.type !== "creature" && card.type !== "subboss"))
			return [];
		return [createEnemyFromCard(card, state.despertar)];
	});

	return log(
		{
			...state,
			activeEnemies: enemies,
			status: "COMBAT_START",
			combat: createEmptyCombatState(),
			decks: {
				...state.decks,
				enemyDeck: {
					available: remaining,
					discarded,
					removed: state.decks.enemyDeck.removed,
				},
			},
		},
		`${enemies.length} inimigo(s) aparecem: ${enemies.map((e) => e.cardName).join(", ")}.`,
	);
}

export function handleOpenPaths(state: GameState): GameState {
	if (!state.currentRoom) return state;
	const exits = state.currentRoom.exits;
	const { available } = state.decks.dungeonDeck;
	const drawn = available.slice(0, exits);
	const remaining = available.slice(exits);

	return log(
		{
			...state,
			paths: drawn,
			status: "CHOOSE_PATH",
			decks: {
				...state.decks,
				dungeonDeck: { ...state.decks.dungeonDeck, available: remaining },
			},
		},
		`${drawn.length} caminho(s) revelado(s).`,
	);
}

export function handleChoosePath(
	state: GameState,
	cardName: string,
): GameState {
	if (!state.paths.includes(cardName)) return state;
	// Coloca a carta escolhida no topo do deck para ser revelada na próxima vez
	return log(
		{
			...state,
			status: "DISCARD_PATHS",
			decks: {
				...state.decks,
				dungeonDeck: {
					...state.decks.dungeonDeck,
					available: [cardName, ...state.decks.dungeonDeck.available],
				},
			},
		},
		`Caminho escolhido: ${cardName}.`,
	);
}

export function handleDiscardPaths(state: GameState): GameState {
	const chosenName = state.decks.dungeonDeck.available[0];
	// Descarta os caminhos não escolhidos (os que ainda estão em paths)
	const toDiscard = state.paths.filter((p) => p !== chosenName);
	const newDiscarded = [...state.decks.dungeonDeck.discarded, ...toDiscard];

	const next = {
		...state,
		paths: [],
		status: "CHECK_BOSS_CONDITION" as const,
		decks: {
			...state.decks,
			dungeonDeck: { ...state.decks.dungeonDeck, discarded: newDiscarded },
		},
	};
	return log(next, `${toDiscard.length} caminho(s) descartado(s).`);
}

export function handleCheckBossCondition(state: GameState): GameState {
	if (checkBossCondition(state, state.bossCardName)) {
		return log(
			{ ...state, status: "BOSS_REVEAL" },
			"Condição do boss atendida! Boss revelado.",
		);
	}
	return log(
		{ ...state, status: "REVEAL_ROOM" },
		"Avançando para próxima sala.",
	);
}

export function handleDungeonExhaustedSpend(state: GameState): GameState {
	// Chamado via SPEND_XP com option "recover_dungeon" quando status é DUNGEON_EXHAUSTED
	const { discarded } = state.decks.dungeonDeck;
	const reshuffled = shuffle(discarded);
	return log(
		{
			...state,
			groupXp: state.groupXp - DUNGEON_EXHAUSTION_COST,
			status: "REVEAL_ROOM",
			decks: {
				...state.decks,
				dungeonDeck: {
					available: reshuffled,
					discarded: [],
					removed: state.decks.dungeonDeck.removed,
				},
			},
		},
		"5 XP gastos. Deck de dungeon reembaralhado.",
	);
}
