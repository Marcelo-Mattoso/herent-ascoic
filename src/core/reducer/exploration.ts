// Handlers de exploração: revelar sala, efeito, spawnar inimigos, caminhos.

import { DUNGEON_EXHAUSTION_COST } from "../config/defaults";
import { getCardName } from "../data/cardLocale";
import {
	getArtifacts,
	getCardById,
	getCreatures,
	getItems,
	getRooms,
	getSubbosses,
} from "../data/cards";
import type { SubbossRoomCard } from "../data/cardTypes";
import { installPassive } from "../ecs/installPassive";
import { installSkillTriggers } from "../ecs/installTriggers";
import { syncEntityFromEnemy } from "../ecs/sync";
import { createEmptyEffectStack } from "../effects/stack";
import { emit } from "../events/bus";
import { checkBossCondition } from "../rules/conditions";
import { cardSkills } from "../skills/lookup";
import { renderSkillLabel } from "../skills/renderLabel";
import { createEmptyCombatState } from "../state/combatState";
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

	const [roomId, ...remaining] = available;
	const card = getCardById(roomId as string);
	if (!card || (card.type !== "room" && card.type !== "subboss_room"))
		return state;

	// Sala de subchefe: spawna diretamente o subchefe vinculado
	if (card.type === "subboss_room") {
		return handleRevealSubbossRoom(state, card, remaining);
	}

	const room: RoomState = {
		cardId: card.id,
		exits: card.exits,
		currentEnemies: card.enemiesByPlayers[0], // solo = índice 0
		reward: card.reward,
		rewardType: card.rewardType,
		effect: (() => {
			const s = cardSkills(card.id)[0];
			return s ? renderSkillLabel(s.ref) : "";
		})(),
		xp: card.xp ?? 0,
		specialCreatureId: card.specialCreatureId,
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
	({ state: next } = emit(next, {
		type: "RoomEntered",
		payload: { roomId: room.cardId },
	}));
	return log(next, `Sala revelada: ${getCardName(card.id)}.`);
}

function handleRevealSubbossRoom(
	state: GameState,
	card: SubbossRoomCard,
	remainingDeck: readonly string[],
): GameState {
	const subbossCard = getSubbosses().find((s) => s.id === card.linkedSubbossId);
	if (!subbossCard)
		return log(
			state,
			`[AVISO] Subchefe não encontrado: ${card.linkedSubbossId}`,
		);

	const room: RoomState = {
		cardId: card.id,
		exits: card.exits,
		currentEnemies: 1,
		reward: card.reward,
		rewardType: card.rewardType,
		effect: (() => {
			const s = cardSkills(card.id)[0];
			return s ? renderSkillLabel(s.ref) : "";
		})(),
		xp: card.xp ?? 0,
		specialCreatureId: card.linkedSubbossId,
		status: "active",
	};

	const { enemy, next: rng } = createEnemyFromCard(
		subbossCard,
		state.despertar,
		state.rng,
	);

	const next: GameState = {
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
	return log(
		next,
		`Sala de subchefe revelada: ${getCardName(card.id)}. ${getCardName(subbossCard.id)} aparece!`,
	);
}

export function handleResolveRoomEffect(state: GameState): GameState {
	if (!state.currentRoom) return state;
	const cardId = state.currentRoom.cardId;
	const card = getCardById(cardId);
	const noEffect = ["room_narrow_corridor", "room_dungeon_room"];
	if (!noEffect.includes(cardId) && card) {
		log(
			state,
			`[TODO] Efeito de sala não implementado: ${getCardName(card.id)}`,
		);
	}
	return { ...state, status: "SPAWN_ENEMIES" };
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
	for (const id of drawn) {
		const card = getCardById(id);
		if (!card || (card.type !== "creature" && card.type !== "subboss"))
			continue;
		const { enemy, next } = createEnemyFromCard(card, state.despertar, rng);
		enemies.push(enemy);
		rng = next;
	}

	// Spawn da criatura especial da sala (ex.: Carcereiro, Guardião do Abismo)
	if (state.currentRoom.specialCreatureId) {
		const specialCard = getCardById(state.currentRoom.specialCreatureId);
		if (
			specialCard &&
			(specialCard.type === "creature" || specialCard.type === "subboss")
		) {
			const { enemy, next } = createEnemyFromCard(
				specialCard,
				state.despertar,
				rng,
			);
			enemies.push(enemy);
			rng = next;
		}
	}
	state = { ...state, rng };

	// Lote F: instala TriggerComponents e ModifierComponents passivos dos inimigos
	let worldWithEnemies = state.world;
	for (const enemy of enemies) {
		worldWithEnemies = syncEntityFromEnemy(worldWithEnemies, enemy);
		const enemyCard = getCardById(enemy.cardId);
		if (enemyCard) {
			const skills = cardSkills(enemyCard.id);
			worldWithEnemies = installSkillTriggers(
				worldWithEnemies,
				enemy.id,
				skills,
			);
			for (const { def, ref } of skills) {
				if (def.operate_type === "op_passive") {
					worldWithEnemies = installPassive(
						worldWithEnemies,
						enemy.id,
						def,
						ref,
					);
				}
			}
		}
	}

	let next: GameState = {
		...state,
		activeEnemies: enemies,
		status: "COMBAT_START",
		combat: createEmptyCombatState(),
		world: worldWithEnemies,
		decks: {
			...state.decks,
			enemyDeck: {
				available: remaining,
				discarded,
				removed: state.decks.enemyDeck.removed,
			},
		},
	};
	for (const enemy of enemies) {
		({ state: next } = emit(next, {
			type: "EntityEnteredPlay",
			payload: { entityId: enemy.id, entityType: "enemy" },
		}));
	}
	const enemyNames = enemies.map((e) => getCardName(e.cardId));
	return log(
		next,
		`${enemies.length} inimigo(s) aparecem: ${enemyNames.join(", ")}.`,
	);
}

export function handleOpenPaths(state: GameState): GameState {
	if (!state.currentRoom) return state;
	const exits = state.currentRoom.exits;
	const { available } = state.decks.dungeonDeck;
	const drawn = available.slice(0, exits);
	const remaining = available.slice(exits);

	if (drawn.length === 0) {
		return log(
			{ ...state, status: "DUNGEON_EXHAUSTED" },
			"Sem caminhos disponíveis — masmorra esgotada.",
		);
	}

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
	({ state: next } = emit(next, {
		type: "PathsRevealed",
		payload: { cards: drawn as string[] },
	}));
	return next;
}

export function handleChoosePath(state: GameState, cardId: string): GameState {
	if (!state.paths.includes(cardId)) return state;
	return log(
		{
			...state,
			status: "DISCARD_PATHS",
			decks: {
				...state.decks,
				dungeonDeck: {
					...state.decks.dungeonDeck,
					available: [cardId, ...state.decks.dungeonDeck.available],
				},
			},
		},
		`Caminho escolhido: ${getCardName(cardId)}.`,
	);
}

export function handleDiscardPaths(state: GameState): GameState {
	const chosenId = state.decks.dungeonDeck.available[0];
	const toDiscard = state.paths.filter((p) => p !== chosenId);
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
	const roomId = state.currentRoom?.cardId ?? "";
	let s = state;
	({ state: s } = emit(s, { type: "RoomLeft", payload: { roomId } }));

	if (checkBossCondition(s, s.bossCardId)) {
		return log(
			{ ...s, status: "BOSS_REVEAL" },
			"Condição do boss atendida! Boss revelado.",
		);
	}
	return log({ ...s, status: "REVEAL_ROOM" }, "Avançando para próxima sala.");
}

// Descarta N cartas do topo do deck de dungeon. Utilitário compartilhado com handlers de skill.
export function discardFromDungeonDeck(
	state: GameState,
	n: number,
	reason: "effect" | "extra" = "effect",
): GameState {
	if (
		state.flags.dungeonDiscardPrevented &&
		!state.flags.discardDungeonLocked
	) {
		return log(
			{ ...state, flags: { ...state.flags, dungeonDiscardPrevented: false } },
			"Descarte de dungeon prevenido (Caminho Preservado).",
		);
	}

	const { available, discarded, removed } = state.decks.dungeonDeck;
	const toDiscard = available.slice(0, n);
	const remaining = available.slice(n);
	if (toDiscard.length === 0) return state;
	let next: GameState = {
		...state,
		decks: {
			...state.decks,
			dungeonDeck: {
				available: remaining,
				discarded: [...discarded, ...toDiscard],
				removed,
			},
		},
	};
	for (const cardId of toDiscard) {
		({ state: next } = emit(next, {
			type: "DungeonCardDiscarded",
			payload: { cardId: cardId as string, reason },
		}));
	}
	return next;
}

// Re-exporta log para uso em handlers que importam este módulo.
export { log } from "./utils";

export function handleRestartDungeon(
	state: GameState,
	keepEquipment: boolean,
): GameState {
	const roomIds = getRooms().map((c) => c.id);
	const creatureIds = getCreatures().map((c) => c.id);
	const itemIds = getItems().map((c) => c.id);
	const artifactIds = getArtifacts().map((c) => c.id);

	let rng = state.rng;
	let shuffledRooms: string[],
		shuffledCreatures: string[],
		shuffledItems: string[],
		shuffledArtifacts: string[];
	({ value: shuffledRooms, next: rng } = shuffleRng(roomIds, rng));
	({ value: shuffledCreatures, next: rng } = shuffleRng(creatureIds, rng));
	({ value: shuffledItems, next: rng } = shuffleRng(itemIds, rng));
	({ value: shuffledArtifacts, next: rng } = shuffleRng(artifactIds, rng));

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
				artifactDeck: {
					available: shuffledArtifacts,
					discarded: [],
					removed: [],
				},
			},
		},
		`Masmorra reiniciada. ${keepEquipment ? "Equipamentos mantidos." : "Heróis voltam ao início."} `,
	);

	for (const h of restoredHeroes) {
		next = applyFullHeal(next, h.id);
	}
	return next;
}

export function handleDungeonExhaustedSpend(state: GameState): GameState {
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
