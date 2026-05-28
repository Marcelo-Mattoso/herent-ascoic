// Handlers de exploração: revelar sala, efeito, spawnar inimigos, caminhos.

import { getArtifacts, getCardById, getCardByName, getCreatures, getItems, getRooms, getSubbosses } from "../data/cards";
import { DUNGEON_EXHAUSTION_COST } from "../config/defaults";
import { createEmptyEffectStack } from "../effects/stack";
import { checkBossCondition } from "../rules/conditions";
import { fireTrigger } from "../skills/dispatch";
import { createEmptyCombatState } from "../state/combatState";
import type { SubbossRoomCard } from "../data/cardTypes";
import type { GameState } from "../state/gameState";
import type { RoomState } from "../state/roomState";
import { applyFullHeal } from "../systems/healSystem";
import { createEnemyFromCard, log, shuffleRng } from "./utils";

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
	if (!card || (card.type !== "room" && card.type !== "subboss_room")) return state;

	// Sala de subchefe: spawna diretamente o subchefe vinculado
	if (card.type === "subboss_room") {
		return handleRevealSubbossRoom(state, card, remaining);
	}

	const room: RoomState = {
		cardId: card.id,
		cardName: card.name,
		exits: card.exits,
		currentEnemies: card.enemiesByPlayers[0], // solo = índice 0
		reward: card.reward,
		rewardType: card.rewardType,
		effect: card.effect.label,
		xp: card.xp ?? 0,
		specialCreature: card.specialCreature,
		status: "active",
	};

	let next: GameState = {
		...state,
		currentRoom: room,
		status: "ROOM_EFFECT",
		decks: {
			...state.decks,
			dungeonDeck: { ...state.decks.dungeonDeck, available: remaining },
		},
	};
	next = fireTrigger(next, "on_room_reveal", { triggeredBy: "on_room_reveal" });
	return log(next, `Sala revelada: ${room.cardName}.`);
}

function handleRevealSubbossRoom(
	state: GameState,
	card: SubbossRoomCard,
	remainingDeck: readonly string[],
): GameState {
	const subbossCard = getSubbosses().find((s) => s.name === card.linkedSubbossName);
	if (!subbossCard) return log(state, `[AVISO] Subchefe não encontrado: ${card.linkedSubbossName}`);

	const room: RoomState = {
		cardId: card.id,
		cardName: card.name,
		exits: card.exits,
		currentEnemies: 1,
		reward: card.reward,
		rewardType: card.rewardType,
		effect: card.effect.label,
		xp: card.xp ?? 0,
		specialCreature: card.linkedSubbossName,
		status: "active",
	};

	const { enemy, next: rng } = createEnemyFromCard(subbossCard, state.despertar, state.rng);

	let next: GameState = {
		...state,
		rng,
		currentRoom: room,
		status: "COMBAT_START",
		activeEnemies: [enemy],
		combat: createEmptyCombatState(),
		decks: {
			...state.decks,
			dungeonDeck: { ...state.decks.dungeonDeck, available: remainingDeck },
		},
	};
	next = fireTrigger(next, "before_combat", { triggeredBy: "before_combat" });
	next = fireTrigger(next, "before_first_combat_in_room", { triggeredBy: "before_first_combat_in_room" });
	return log(next, `Sala de subchefe revelada: ${card.name}. ${subbossCard.name} aparece!`);
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
	const withSpawn: GameState = { ...state, status: "SPAWN_ENEMIES" };
	return fireTrigger(withSpawn, "on_enter_room", { triggeredBy: "on_enter_room" });
}

// Patch 2: contagem dinâmica de inimigos baseada no número de heróis ativos.
function getEnemyCount(
	enemiesByPlayers: readonly [number, number, number, number],
	activeHeroesCount: number,
): number {
	if (activeHeroesCount <= 2) return enemiesByPlayers[0];
	if (activeHeroesCount <= 4) return enemiesByPlayers[1];
	if (activeHeroesCount <= 6) return enemiesByPlayers[2];
	return enemiesByPlayers[3];
}

export function handleSpawnEnemies(state: GameState): GameState {
	if (!state.currentRoom) return state;
	// Buscar a carta da sala para obter enemiesByPlayers e calcular contagem dinamicamente
	const roomCard = getCardById(state.currentRoom.cardId);
	const activeHeroesCount = state.heroes.filter(
		(h) => h.status === "active",
	).length;
	const count =
		roomCard?.type === "room"
			? getEnemyCount(roomCard.enemiesByPlayers, activeHeroesCount)
			: state.currentRoom.currentEnemies;

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

	let rng = state.rng;
	const enemies: ReturnType<typeof createEnemyFromCard>["enemy"][] = [];
	for (const name of drawn) {
		const card = getCardByName(name);
		if (!card || (card.type !== "creature" && card.type !== "subboss")) continue;
		const { enemy, next } = createEnemyFromCard(card, state.despertar, rng);
		enemies.push(enemy);
		rng = next;
	}

	// Spawn da criatura especial da sala (ex.: Carcereiro, Guardião do Abismo)
	if (state.currentRoom.specialCreature) {
		const specialCard = getCardByName(state.currentRoom.specialCreature);
		if (specialCard && (specialCard.type === "creature" || specialCard.type === "subboss")) {
			const { enemy, next } = createEnemyFromCard(specialCard, state.despertar, rng);
			enemies.push(enemy);
			rng = next;
		}
	}
	state = { ...state, rng };

	let next: GameState = {
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
	};
	next = fireTrigger(next, "before_combat", { triggeredBy: "before_combat" });
	next = fireTrigger(next, "before_first_combat_in_room", { triggeredBy: "before_first_combat_in_room" });
	return log(next, `${enemies.length} inimigo(s) aparecem: ${enemies.map((e) => e.cardName).join(", ")}.`);
}

export function handleOpenPaths(state: GameState): GameState {
	if (!state.currentRoom) return state;
	const exits = state.currentRoom.exits;
	const { available } = state.decks.dungeonDeck;
	const drawn = available.slice(0, exits);
	const remaining = available.slice(exits);

	let next: GameState = log(
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
	next = fireTrigger(next, "on_reveal_paths", { triggeredBy: "on_reveal_paths" });
	return next;
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
	if (checkBossCondition(state, state.bossCardId)) {
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

// Descarta N cartas do topo do deck de dungeon. Utilitário compartilhado com handlers de skill.
export function discardFromDungeonDeck(state: GameState, n: number): GameState {
	const { available, discarded, removed } = state.decks.dungeonDeck;
	const toDiscard = available.slice(0, n);
	const remaining = available.slice(n);
	if (toDiscard.length === 0) return state;
	return {
		...state,
		decks: {
			...state.decks,
			dungeonDeck: { available: remaining, discarded: [...discarded, ...toDiscard], removed },
		},
	};
}

// Re-exporta log para uso em handlers que importam este módulo.
export { log } from "./utils";

export function handleRestartDungeon(
	state: GameState,
	keepEquipment: boolean,
): GameState {
	const roomNames = getRooms().map((c) => c.name);
	const creatureNames = getCreatures().map((c) => c.name);
	const itemNames = getItems().map((c) => c.name);
	const artifactNames = getArtifacts().map((c) => c.name);

	// Embaralhar encadeando o RNG
	let rng = state.rng;
	let shuffledRooms: string[], shuffledCreatures: string[], shuffledItems: string[], shuffledArtifacts: string[];
	({ value: shuffledRooms, next: rng } = shuffleRng(roomNames, rng));
	({ value: shuffledCreatures, next: rng } = shuffleRng(creatureNames, rng));
	({ value: shuffledItems, next: rng } = shuffleRng(itemNames, rng));
	({ value: shuffledArtifacts, next: rng } = shuffleRng(artifactNames, rng));

	// Restaurar heróis fugidos: status e equipamentos (vida restaurada via healSystem depois)
	const restoredHeroes = state.fledHeroes.map((h) => ({
		...h,
		status: "active" as const,
		activeItems: keepEquipment ? h.activeItems : ({} as typeof h.activeItems),
		backpack: keepEquipment ? h.backpack : ([] as readonly string[]),
	}));

	let next = log(
		{
			...state,
			rng,
			status: "REVEAL_ROOM",
			heroes: restoredHeroes,
			defeatedHeroes: [],
			fledHeroes: [],
			activeEnemies: [],
			enemyGraveyard: [],
			currentRoom: null,
			paths: [],
			roomsCleared: 0,
			creaturesDefeated: 0,
			combat: createEmptyCombatState(),
			effectStack: createEmptyEffectStack(),
			paused: null,
			pendingRewards: [],
			flags: {},
			tokens: {},
			subbosses: { available: [], defeated: [] },
			oncePer: { game: state.oncePer.game },
			decks: {
				dungeonDeck: { available: shuffledRooms, discarded: [], removed: [] },
				enemyDeck: { available: shuffledCreatures, discarded: [], removed: [] },
				itemDeck: { available: shuffledItems, discarded: [], removed: [] },
				artifactDeck: { available: shuffledArtifacts, discarded: [], removed: [] },
			},
		},
		`Masmorra reiniciada. ${keepEquipment ? "Equipamentos mantidos." : "Heróis voltam ao início."} `,
	);

	// Restaurar vida ao máximo via healSystem (sincroniza o world ECS)
	for (const h of restoredHeroes) {
		next = applyFullHeal(next, h.id);
	}
	return next;
}

export function handleDungeonExhaustedSpend(state: GameState): GameState {
	// Chamado via SPEND_XP com option "recover_dungeon" quando status é DUNGEON_EXHAUSTED
	const { discarded } = state.decks.dungeonDeck;
	const { value: reshuffled, next: rng } = shuffleRng(discarded, state.rng);
	return log(
		{
			...state,
			rng,
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
