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
import type { RoomCard, SubbossRoomCard } from "../data/cardTypes";
import { installPassive } from "../ecs/installPassive";
import { syncEntityFromEnemy, syncHeroesAndEnemies } from "../ecs/sync";
import {
	createEmptyWorld,
	createEntity,
	removeEntity,
	removeModifiersForSource,
	removeTriggersAppliedBySource,
	upsertEntity,
} from "../ecs/world";
import { createEmptyEffectStack } from "../effects/stack";
import { checkBossCondition } from "../rules/conditions";
import { cardSkills } from "../skills/lookup";
import { applyDeclaredPassiveBlocks } from "../skills/applyPassiveBlocks";
import { resolveSkillWindow } from "../skills/resolveSkillWindow";
import { renderSkillLabel } from "../skills/renderLabel";
import { ActivationTracker } from "../state/activation";
import { removeBlocksForSource } from "../state/blockHelpers";
import { createEmptyCombatState } from "../state/combatState";
import type { GameState } from "../state/gameState";
import type { RoomState } from "../state/roomState";
import { applyFullHeal } from "../systems/healSystem";
import { createEnemyFromCard, log, shuffleRng } from "./utils";
import { awakeningRequirementMet } from "../rules/awakening";

const DUNGEON_ROOM_COPIES = 2;

export function buildDungeonRoomDeck(): string[] {
	return getRooms().flatMap((card) =>
		Array.from({ length: DUNGEON_ROOM_COPIES }, () => card.id),
	);
}

export function handleRevealRoom(state: GameState): GameState {
	return drawRandomDungeonRoom(state, "Sala sorteada");
}

function drawRandomDungeonRoom(
	state: GameState,
	logPrefix: "Sala sorteada" | "Sala revelada",
): GameState {
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

	const { value: shuffled, next: rng } = shuffleRng(available, state.rng);
	const [roomId, ...remaining] = shuffled;
	const card = getCardById(roomId as string);
	if (!card || (card.type !== "room" && card.type !== "subboss_room"))
		return state;

	return enterDungeonRoom({ ...state, rng }, card, remaining, logPrefix);
}

function enterDungeonRoom(
	state: GameState,
	card: RoomCard | SubbossRoomCard,
	remainingDeck: readonly string[],
	logPrefix: "Sala sorteada" | "Sala revelada",
): GameState {
	if (card.type === "subboss_room") {
		return handleRevealSubbossRoom(state, card, remainingDeck, logPrefix);
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
		world: upsertEntity(state.world, createEntity(room.cardId, "room")),
		currentRoom: room,
		status: "ROOM_EFFECT",
		activeEnemies: [],
		enemyGraveyard: [],
		combat: createEmptyCombatState(),
		decks: {
			...state.decks,
			dungeonDeck: { ...state.decks.dungeonDeck, available: remainingDeck },
		},
	};
	next = applyDeclaredPassiveBlocks(next, {
		cardId: room.cardId,
		entityId: room.cardId,
	});
	next = resolveRoomEntryWindows(next, room.cardId);
	return log(next, `${logPrefix}: ${getCardName(card.id)}.`);
}

function resolveRoomEntryWindows(state: GameState, roomId: string): GameState {
	const targetHeroIds = state.heroes
		.filter((hero) => hero.status === "active")
		.map((hero) => hero.id);
	const targetEnemyIds = state.activeEnemies
		.filter((enemy) => enemy.status === "active")
		.map((enemy) => enemy.id);
	let next = resolveSkillWindow(state, {
		event: "evt_room_reveal",
		ctx: {
			triggeredBy: "evt_room_reveal",
			targetHeroIds,
			targetEnemyIds,
			value: roomId,
		},
	});
	if (next.pendingTriggerInterrupt || next.pendingSkillChoice) return next;
	next = resolveSkillWindow(next, {
		event: "evt_room_enter",
		ctx: {
			triggeredBy: "evt_room_enter",
			targetHeroIds,
			targetEnemyIds,
			value: roomId,
		},
	});
	return next;
}

function handleRevealSubbossRoom(
	state: GameState,
	card: SubbossRoomCard,
	remainingDeck: readonly string[],
	logPrefix: "Sala sorteada" | "Sala revelada",
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

	let worldWithSubboss = syncEntityFromEnemy(state.world, enemy);
	const skills = cardSkills(subbossCard.id).filter(({ ref }) =>
		awakeningRequirementMet(state.despertar, ref.requiresAwakening),
	);
	for (const { def, ref } of skills) {
		if (def.operate_type === "op_passive") {
			worldWithSubboss = installPassive(worldWithSubboss, enemy.id, def, ref);
		}
	}

	let next: GameState = {
		...state,
		rng,
		world: worldWithSubboss,
		currentRoom: room,
		status: "COMBAT_START",
		activeEnemies: [enemy],
		enemyGraveyard: [],
		combat: createEmptyCombatState(),
		decks: {
			...state.decks,
			dungeonDeck: { ...state.decks.dungeonDeck, available: remainingDeck },
		},
	};
	next = applyDeclaredPassiveBlocks(next, {
		cardId: room.cardId,
		entityId: room.cardId,
	});
	next = applyDeclaredPassiveBlocks(next, {
		cardId: enemy.cardId,
		entityId: enemy.id,
		sourceEnemyId: enemy.id,
	});
	next = resolveRoomEntryWindows(next, room.cardId);
	return log(
		next,
		`${logPrefix}: ${getCardName(card.id)}. ${getCardName(subbossCard.id)} aparece!`,
	);
}

function handleDungeonDeckEmpty(state: GameState): GameState {
	const { discarded } = state.decks.dungeonDeck;
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

	// Passivos ficam no ECS; gatilhos de catálogo seguem o TriggerEngine.
	let worldWithEnemies = state.world;
	for (const enemy of enemies) {
		worldWithEnemies = syncEntityFromEnemy(worldWithEnemies, enemy);
		const enemyCard = getCardById(enemy.cardId);
		if (enemyCard) {
			const skills = cardSkills(enemyCard.id).filter(({ ref }) =>
				awakeningRequirementMet(state.despertar, ref.requiresAwakening),
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
		next = applyDeclaredPassiveBlocks(next, {
			cardId: enemy.cardId,
			entityId: enemy.id,
			sourceEnemyId: enemy.id,
		});
	}
	for (const enemy of enemies) {
		next = resolveSkillWindow(next, {
			event: "evt_enter_play",
			ctx: {
				triggeredBy: "evt_enter_play",
				sourceEnemyId: enemy.id,
				targetEnemyIds: [enemy.id],
			},
		});
		if (next.pendingTriggerInterrupt || next.pendingSkillChoice) return next;
	}
	const enemyNames = enemies.map((e) => getCardName(e.cardId));
	return log(
		next,
		`${enemies.length} inimigo(s) aparecem: ${enemyNames.join(", ")}.`,
	);
}

export function handleOpenPaths(state: GameState): GameState {
	return state.currentRoom
		? handleCheckBossCondition(state)
		: advanceToRandomDungeonRoom(state);
}

export function handleChoosePath(state: GameState, cardId: string): GameState {
	if (!state.paths.includes(cardId)) return handleOpenPaths(state);
	return handleOpenPaths({ ...state, paths: [] });
}

export function handleDiscardPaths(state: GameState): GameState {
	return handleCheckBossCondition(state);
}

export function handleCheckBossCondition(state: GameState): GameState {
	const roomId = state.currentRoom?.cardId ?? "";
	const roomExits = state.currentRoom?.exits ?? 1;
	let beforeLeave = state;
	if (roomId) {
		beforeLeave = resolveSkillWindow(beforeLeave, {
			event: "evt_room_leave",
			ctx: { triggeredBy: "evt_room_leave", value: roomId },
		});
		if (beforeLeave.pendingTriggerInterrupt || beforeLeave.pendingSkillChoice) {
			return beforeLeave;
		}
	}
	const {
		roomLootReplaced: _roomLootReplaced,
		roomVictoryRewardsGranted: _roomVictoryRewardsGranted,
		...flagsAfterRoom
	} = beforeLeave.flags;
	let s: GameState = {
		...beforeLeave,
		flags: flagsAfterRoom,
		oncePer: { ...beforeLeave.oncePer, room: {} },
		disabled: ActivationTracker.clearLocks(beforeLeave.disabled ?? {}, "room"),
		paths: [],
		currentRoom: null,
		activeEnemies: [],
		combat: createEmptyCombatState(),
		decks: roomId
			? {
					...beforeLeave.decks,
					dungeonDeck: {
						...beforeLeave.decks.dungeonDeck,
						discarded: [...beforeLeave.decks.dungeonDeck.discarded, roomId],
					},
				}
			: beforeLeave.decks,
	};
	if (roomId) {
		s = removeBlocksForSource(s, roomId);
		s = {
			...s,
			world: removeTriggersAppliedBySource(
				removeModifiersForSource(removeEntity(s.world, roomId), roomId),
				roomId,
			),
		};
	}

	if (checkBossCondition(s, s.bossCardId)) {
		return log(
			{ ...s, status: "BOSS_REVEAL" },
			"Condição do boss atendida! O grupo pode enfrentar o chefe ou continuar explorando.",
		);
	}
	return advanceToRandomDungeonRoom(s, roomExits);
}

export function handleContinueExplorationAfterBossOffer(
	state: GameState,
): GameState {
	return advanceToRandomDungeonRoom(
		log(state, "O grupo adia o confronto final e continua explorando."),
	);
}

function advanceToRandomDungeonRoom(
	state: GameState,
	exitsOverride?: number,
): GameState {
	const exits = Math.max(1, exitsOverride ?? state.currentRoom?.exits ?? 1);
	const { available, discarded, removed } = state.decks.dungeonDeck;
	if (available.length === 0) return handleDungeonDeckEmpty(state);
	const discardTarget = exits >= 5 ? 2 : exits > 1 ? 1 : 0;

	// A prevenção precisa ser escolhida antes de remover cartas do baralho.
	// O resumo guarda a continuação para que a ação seja retomada após o modal.
	if (discardTarget > 0 && !state.flags.discardDungeonLocked) {
		const opened = resolveSkillWindow(state, {
			event: "evt_dungeon_discard",
			resume: { type: "advance_dungeon", exits },
			ctx: { triggeredBy: "evt_dungeon_discard", value: discardTarget },
		});
		if (
			opened.pendingTriggerInterrupt ||
			opened.pendingSkillChoice ||
			opened.pendingSkillTarget
		) {
			return opened;
		}
		state = opened;
	}

	let rng = state.rng;
	const { value: shuffledAvailable, next: afterPathDraw } = shuffleRng(
		available,
		rng,
	);
	rng = afterPathDraw;

	const drawn = shuffledAvailable.slice(0, exits);
	const afterDraw = shuffledAvailable.slice(exits);
	if (drawn.length === 0) return handleDungeonDeckEmpty(state);

	const { value: shuffledDrawn, next: afterChoice } = shuffleRng(drawn, rng);
	rng = afterChoice;

	const [chosenId, ...unchosen] = shuffledDrawn;
	const discardCount =
		state.flags.dungeonDiscardPrevented && !state.flags.discardDungeonLocked
			? 0
			: Math.min(discardTarget, unchosen.length);
	const discardedPaths = unchosen.slice(0, discardCount);
	const returningPaths = unchosen.slice(discardCount);

	const { value: nextAvailable, next: afterReturnShuffle } = shuffleRng(
		[...afterDraw, ...returningPaths],
		rng,
	);
	rng = afterReturnShuffle;

	const card = getCardById(chosenId as string);
	if (!card || (card.type !== "room" && card.type !== "subboss_room"))
		return state;

	let next: GameState = {
		...state,
		rng,
		paths: [],
		flags:
			state.flags.dungeonDiscardPrevented && !state.flags.discardDungeonLocked
				? { ...state.flags, dungeonDiscardPrevented: false }
				: state.flags,
		decks: {
			...state.decks,
			dungeonDeck: {
				available: nextAvailable,
				discarded: [...discarded, ...discardedPaths],
				removed,
			},
		},
	};

	if (
		state.flags.dungeonDiscardPrevented &&
		!state.flags.discardDungeonLocked
	) {
		next = log(next, "Descarte de caminho prevenido (Caminho Preservado).");
	}

	next = log(
		next,
		`Caminho sorteado em segredo: ${drawn.length} carta(s), ${discardedPaths.length} descarte(s).`,
	);
	return enterDungeonRoom(next, card, nextAvailable, "Sala sorteada");
}

/** Retoma a abertura de caminhos depois de uma interrupção de descarte. */
export function resumeDungeonAdvance(
	state: GameState,
	exits: number,
): GameState {
	return advanceToRandomDungeonRoom(state, exits);
}

// Descarta N cartas do topo do deck de dungeon. Utilitário compartilhado com handlers de skill.
export function discardFromDungeonDeck(
	state: GameState,
	n: number,
	reason: "effect" | "extra" = "effect",
	skipWindow = false,
): GameState {
	if (!skipWindow) {
		const opened = resolveSkillWindow(state, {
			event: "evt_dungeon_discard",
			resume: { type: "discard_dungeon", count: n, reason },
			ctx: {
				triggeredBy: "evt_dungeon_discard",
				value: n,
			},
		});
		if (opened.pendingTriggerInterrupt || opened.pendingSkillChoice) {
			return opened;
		}
		state = opened;
	}

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
	return next;
}

// Re-exporta log para uso em handlers que importam este módulo.
export { log } from "./utils";

export function handleRestartDungeon(
	state: GameState,
	keepEquipment: boolean,
): GameState {
	const roomIds = buildDungeonRoomDeck();
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
			blocks: {},
			disabled: {},
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
			world: syncHeroesAndEnemies(createEmptyWorld(), restoredHeroes, []),
		},
		`Masmorra reiniciada. ${keepEquipment ? "Equipamentos mantidos." : "Heróis voltam ao início."} `,
	);

	for (const h of restoredHeroes) {
		next = applyFullHeal(next, h.id);
	}
	return handleRevealRoom(next);
}

export function handleDungeonExhaustedSpend(state: GameState): GameState {
	const { discarded } = state.decks.dungeonDeck;
	const { value: reshuffled, next: rng } = shuffleRng(discarded, state.rng);
	const next = log(
		{
			...state,
			rng,
			groupXp: state.groupXp - DUNGEON_EXHAUSTION_COST,
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
	return handleRevealRoom(next);
}
