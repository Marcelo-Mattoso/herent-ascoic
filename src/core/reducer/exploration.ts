import type { RoomCard, SubbossRoomCard } from "../data/cardTypes";
import { installPassive } from "../ecs/installPassive";
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
import { MAX_ROOM_ENEMIES } from "../rules/encounterLimits";

import { applyDeclaredPassiveBlocks } from "../skills/applyPassiveBlocks";
import { resolveSkillWindow } from "../skills/resolveSkillWindow";
import { renderSkillLabel } from "../skills/renderLabel";
import { ActivationTracker } from "../state/activation";
import { removeBlocksForSource } from "../state/blockHelpers";
import { createEmptyCombatState } from "../state/combatState";
import { beginCombat, beginRoom } from "../state/lifecycle";
import type { AscensaoGame, GameState } from "../state/gameState";
import type { RoomState } from "../state/roomState";
import { applyFullHeal } from "../systems/healSystem";
import { recordEvent } from "../events/record";
import { createEnemyFromCard, log, shuffleRng } from "./utils";
import { dungeonRecoveryCost, expansionOf, cardById, cardName, cardsOfType, skillsOf } from "../gameEngine";

import { refRequirementMet } from "../gameEngine";
import type { GameEngine, GameHandler } from "../gameEngine";
import { awakeningOf, dealDecksInto, deckOf, decksOf, discardDeckTop, isStatComponent, recordOfEnemy, shuffleDeck, spawnEnemy, withDecks, withWorld, withoutStaleEnemies, worldOf, pendingTriggerInterruptOf, pendingSkillChoiceOf, pendingSkillTargetOf, withPaused, withEffectStack } from "../state/access";
import { gameOf, withGame } from "../../engine/state";
const DUNGEON_ROOM_COPIES = 2;

export function buildDungeonRoomDeck(engine: GameEngine, expansionId?: string): string[] {
	return cardsOfType(engine, "room")
		.filter((card) => !expansionId || expansionOf(engine, card.id) === expansionId)
		.flatMap((card) => Array.from({ length: DUNGEON_ROOM_COPIES }, () => card.id));
}

export function handleRevealRoom(engine: GameEngine, state: GameState): GameState {
	return drawRandomDungeonRoom(engine, state, "Sala sorteada");
}

function drawRandomDungeonRoom(engine: GameEngine,
	state: GameState,
	logPrefix: "Sala sorteada" | "Sala revelada",
): GameState {
	const { available, discarded } = deckOf(state, "dungeonDeck");

	if (available.length === 0) {
		if (gameOf(state).groupXp >= dungeonRecoveryCost(engine, gameOf(state).difficulty) && discarded.length > 0) {
			return log(
				withGame(state, (prevGame) => ({ ...prevGame, status: "DUNGEON_EXHAUSTED" })),
				`Deck de dungeon esgotado. Gaste ${dungeonRecoveryCost(engine, gameOf(state).difficulty)} XP para continuar.`,
			);
		}
		return log(
			withGame(state, (prevGame) => ({ ...prevGame, status: "DEFEAT" })),
			"Derrota: deck de dungeon esgotado sem recursos.",
		);
	}

	const shuffledState = shuffleDeck(state, "dungeonDeck");
	const [roomId, ...remaining] = deckOf(shuffledState, "dungeonDeck").available;
	const card = cardById(engine, roomId as string);
	if (!card || (card.type !== "room" && card.type !== "subboss_room"))
		return state;

	return enterDungeonRoom(engine, shuffledState, card, remaining, logPrefix);
}

function enterDungeonRoom(engine: GameEngine,
	state: GameState,
	card: RoomCard | SubbossRoomCard,
	remainingDeck: readonly string[],
	logPrefix: "Sala sorteada" | "Sala revelada",
): GameState {
	if (card.type === "subboss_room") {
		return handleRevealSubbossRoom(engine, state, card, remainingDeck, logPrefix);
	}
	const room: RoomState = {
		cardId: card.id,
		exits: card.exits,
		currentEnemies: card.enemiesByPlayers[0], // solo = índice 0
		reward: card.reward,
		rewardType: card.rewardType,
		effect: (() => {
			const s = skillsOf(engine, card.id)[0];
			return s ? renderSkillLabel(engine, s.ref) : "";
		})(),
		xp: card.xp ?? 0,
		specialCreatureId: card.specialCreatureId,
		status: "active",
	};

	let next: GameState = withWorld(beginCombat(engine, withDecks(withGame(state, (prevGame) => ({ ...prevGame, currentRoom: room, status: "ROOM_EFFECT", activeEnemies: [], enemyGraveyard: [], combat: createEmptyCombatState() })), {
			...decksOf(state),
			dungeonDeck: { ...deckOf(state, "dungeonDeck"), available: remainingDeck },
		})), upsertEntity(worldOf(state), createEntity(room.cardId, "room")));
	next = withoutStaleEnemies(next);
	next = applyDeclaredPassiveBlocks(engine, next, {
		cardId: room.cardId,
		entityId: room.cardId,
	});
	next = recordEvent(next, "RoomEntered", { roomId: room.cardId });
	next = resolveRoomEntryWindows(engine, next, room.cardId);
	return log(next, `${logPrefix}: ${cardName(engine, card.id)}.`);
}

function resolveRoomEntryWindows(engine: GameEngine, state: GameState, roomId: string): GameState {
	const targetHeroIds = gameOf(state).heroes
		.filter((hero) => hero.status === "active")
		.map((hero) => hero.id);
	const targetEnemyIds = gameOf(state).activeEnemies
		.filter((enemy) => enemy.status === "active")
		.map((enemy) => enemy.id);
	let next = resolveSkillWindow(engine, state, {
		event: "evt_room_reveal",
		ctx: {
			triggeredBy: "evt_room_reveal",
			targetHeroIds,
			targetEnemyIds,
			value: roomId,
		},
	});
	if (pendingTriggerInterruptOf(next) || pendingSkillChoiceOf(next)) return next;
	next = resolveSkillWindow(engine, next, {
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

function handleRevealSubbossRoom(engine: GameEngine,
	state: GameState,
	card: SubbossRoomCard,
	remainingDeck: readonly string[],
	logPrefix: "Sala sorteada" | "Sala revelada",
): GameState {
	const subbossCard = cardsOfType(engine, "subboss").find((s) => s.id === card.linkedSubbossId);
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
			const s = skillsOf(engine, card.id)[0];
			return s ? renderSkillLabel(engine, s.ref) : "";
		})(),
		xp: card.xp ?? 0,
		specialCreatureId: card.linkedSubbossId,
		status: "active",
	};

	const { enemy, next: rng } = createEnemyFromCard(
		subbossCard,
		awakeningOf(state),
		gameOf(state).rng,
	);

	let worldWithSubboss = spawnEnemy(worldOf(state), enemy);
	const skills = skillsOf(engine, subbossCard.id).filter(({ ref }) =>
		refRequirementMet(engine, state, ref.requiresAwakening),
	);
	for (const { def, ref } of skills) {
		if (def.operate_type === "op_passive") {
			worldWithSubboss = installPassive(worldWithSubboss, enemy.id, def, ref);
		}
	}

	let next: GameState = withWorld(beginCombat(engine, withDecks(withGame(state, (prevGame) => ({ ...prevGame, rng, currentRoom: room, status: "COMBAT_START", activeEnemies: [recordOfEnemy(enemy)], enemyGraveyard: [], combat: createEmptyCombatState() })), {
			...decksOf(state),
			dungeonDeck: { ...deckOf(state, "dungeonDeck"), available: remainingDeck },
		})), worldWithSubboss);
	next = withoutStaleEnemies(next);
	next = applyDeclaredPassiveBlocks(engine, next, {
		cardId: room.cardId,
		entityId: room.cardId,
	});
	next = applyDeclaredPassiveBlocks(engine, next, {
		cardId: enemy.cardId,
		entityId: enemy.id,
		sourceEnemyId: enemy.id,
	});
	next = recordEvent(next, "RoomEntered", { roomId: room.cardId });
	next = resolveRoomEntryWindows(engine, next, room.cardId);
	return log(
		next,
		`${logPrefix}: ${cardName(engine, card.id)}. ${cardName(engine, subbossCard.id)} aparece!`,
	);
}

function handleDungeonDeckEmpty(engine: GameEngine, state: GameState): GameState {
	const { discarded } = deckOf(state, "dungeonDeck");
	if (gameOf(state).groupXp >= dungeonRecoveryCost(engine, gameOf(state).difficulty) && discarded.length > 0) {
		return log(
			withGame(state, (prevGame) => ({ ...prevGame, status: "DUNGEON_EXHAUSTED" })),
			`Deck de dungeon esgotado. Gaste ${dungeonRecoveryCost(engine, gameOf(state).difficulty)} XP para continuar.`,
		);
	}
	return log(
		withGame(state, (prevGame) => ({ ...prevGame, status: "DEFEAT" })),
		"Derrota: deck de dungeon esgotado sem recursos.",
	);
}

export function handleResolveRoomEffect(engine: GameEngine, state: GameState): GameState {
	if (!gameOf(state).currentRoom) return state;
	const cardId = gameOf(state).currentRoom!.cardId;
	const card = cardById(engine, cardId);
	const noEffect = ["room_narrow_corridor", "room_dungeon_room"];
	if (!noEffect.includes(cardId) && card) {
		log(
			state,
			`[TODO] Efeito de sala não implementado: ${cardName(engine, card.id)}`,
		);
	}
	return withGame(state, (prevGame) => ({ ...prevGame, status: "SPAWN_ENEMIES" }));
}

// Contagem dinâmica de inimigos para grupos de 1 a 4 heróis ativos.
function getEnemyCount(
	enemiesByPlayers: readonly [number, number, number, number],
	activeHeroesCount: number,
): number {
	const playerIndex = Math.min(Math.max(activeHeroesCount, 1), 4) - 1;
	return Math.min(MAX_ROOM_ENEMIES, enemiesByPlayers[playerIndex]!);
}

export function handleSpawnEnemies(engine: GameEngine, state: GameState): GameState {
	if (!gameOf(state).currentRoom) return state;
	const roomCard = cardById(engine, gameOf(state).currentRoom!.cardId);
	const activeHeroesCount = gameOf(state).heroes.filter(
		(h) => h.status === "active",
	).length;
	const count =
		roomCard?.type === "room"
			? getEnemyCount(roomCard.enemiesByPlayers, activeHeroesCount)
			: gameOf(state).currentRoom!.currentEnemies;
	// A criatura invocada pela sala faz parte do limite enemiesByPlayers,
	// não é um inimigo extra somado à compra do baralho.
	const specialId = gameOf(state).currentRoom!.specialCreatureId;
	const possibleSpecial = specialId ? cardById(engine, specialId) : undefined;
	const specialCard =
		possibleSpecial?.type === "creature" || possibleSpecial?.type === "subboss"
			? possibleSpecial
			: undefined;
	const regularCount = Math.max(0, count - (specialCard ? 1 : 0));

	if (count === 0) {
		return log(
			withGame(state, (prevGame) => ({ ...prevGame, status: "REWARD_PHASE" })),
			"Sala sem inimigos. Indo para recompensa.",
		);
	}

	const { available, discarded, removed } = deckOf(state, "enemyDeck");
	const drawn: string[] = [];
	let remaining = [...available];
	let rng = gameOf(state).rng;
	let reshuffleCount = 0;

	// O baralho de criaturas não recebe descartes ao final dos combates: as
	// instâncias compradas saem do deck. Quando acabar, reconstruímos o monte
	// com todas as criaturas elegíveis da expansão do chefe da partida.
	// Respeitamos o monte ainda disponível antes de iniciar um novo ciclo.
	for (let i = 0; i < regularCount; i++) {
		if (remaining.length === 0) {
			const expansionId = expansionOf(engine, gameOf(state).bossCardId);
			const removedIds = new Set(removed);
			const creatureIds = cardsOfType(engine, "creature")
				.filter((card) => expansionOf(engine, card.id) === expansionId && !removedIds.has(card.id))
				.map((card) => card.id);
			if (creatureIds.length === 0) break;
			const shuffled = shuffleRng(creatureIds, rng);
			remaining = shuffled.value;
			rng = shuffled.next;
			reshuffleCount++;
		}
		const id = remaining.shift();
		if (id) drawn.push(id);
	}
	const enemies: ReturnType<typeof createEnemyFromCard>["enemy"][] = [];
	for (const id of drawn) {
		const card = cardById(engine, id);
		if (!card || (card.type !== "creature" && card.type !== "subboss"))
			continue;
		const { enemy, next } = createEnemyFromCard(card, awakeningOf(state), rng);
		enemies.push(enemy);
		rng = next;
	}

	// A invocação usa uma vaga da sala e não consome carta do baralho.
	if (count > 0 && specialCard) {
		const { enemy, next } = createEnemyFromCard(
			specialCard,
			awakeningOf(state),
			rng,
		);
		enemies.push(enemy);
		rng = next;
	}
	state = withGame(state, (prevGame) => ({ ...prevGame, rng }));
	if (reshuffleCount > 0) {
		state = log(state, "Baralho de criaturas esgotado. Monstros da expansão reembaralhados.");
	}

	// Se a expansão não tiver criaturas elegíveis, não abrir combate sem alvos.
	if (enemies.length === 0) {
		return log(
			withGame(state, (prevGame) => ({ ...prevGame, status: "REWARD_PHASE" })),
			"Sala sem inimigos. Indo para recompensa.",
		);
	}

	// Passivos ficam no ECS; gatilhos de catálogo seguem o TriggerEngine.
	let worldWithEnemies = worldOf(state);
	for (const enemy of enemies) {
		worldWithEnemies = spawnEnemy(worldWithEnemies, enemy);
		const enemyCard = cardById(engine, enemy.cardId);
		if (enemyCard) {
			const skills = skillsOf(engine, enemyCard.id).filter(({ ref }) =>
				refRequirementMet(engine, state, ref.requiresAwakening),
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

	let next: GameState = withWorld(beginCombat(engine, withDecks(withGame(state, (prevGame) => ({ ...prevGame, activeEnemies: enemies.map(recordOfEnemy), status: "COMBAT_START", combat: createEmptyCombatState() })), {
			...decksOf(state),
			enemyDeck: {
				available: remaining,
				discarded: reshuffleCount > 0 ? [] : discarded,
				removed,
			},
		})), worldWithEnemies);
	for (const enemy of enemies) {
		next = applyDeclaredPassiveBlocks(engine, next, {
			cardId: enemy.cardId,
			entityId: enemy.id,
			sourceEnemyId: enemy.id,
		});
	}
	for (const enemy of enemies) {
		next = resolveSkillWindow(engine, next, {
			event: "evt_enter_play",
			ctx: {
				triggeredBy: "evt_enter_play",
				sourceEnemyId: enemy.id,
				targetEnemyIds: [enemy.id],
			},
		});
		if (pendingTriggerInterruptOf(next) || pendingSkillChoiceOf(next)) return next;
	}
	const enemyNames = enemies.map((e) => cardName(engine, e.cardId));
	return log(
		next,
		`${enemies.length} inimigo(s) aparecem: ${enemyNames.join(", ")}.`,
	);
}

export function handleOpenPaths(engine: GameEngine, state: GameState): GameState {
	return gameOf(state).currentRoom
		? handleCheckBossCondition(engine, state)
		: advanceToRandomDungeonRoom(engine, state);
}

export function handleChoosePath(engine: GameEngine, state: GameState, cardId: string): GameState {
	if (!gameOf(state).paths.includes(cardId)) return handleOpenPaths(engine, state);
	return handleOpenPaths(engine, withGame(state, (prevGame) => ({ ...prevGame, paths: [] })));
}

export function handleDiscardPaths(engine: GameEngine, state: GameState): GameState {
	return handleCheckBossCondition(engine, state);
}

export function handleCheckBossCondition(engine: GameEngine, state: GameState): GameState {
	const roomId = gameOf(state).currentRoom?.cardId ?? "";
	const roomExits = gameOf(state).currentRoom?.exits ?? 1;
	let beforeLeave = state;
	if (roomId) {
		beforeLeave = resolveSkillWindow(engine, beforeLeave, {
			event: "evt_room_leave",
			ctx: { triggeredBy: "evt_room_leave", value: roomId },
		});
		if (pendingTriggerInterruptOf(beforeLeave) || pendingSkillChoiceOf(beforeLeave)) {
			return beforeLeave;
		}
	}
	const {
		roomLootReplaced: _roomLootReplaced,
		roomVictoryRewardsGranted: _roomVictoryRewardsGranted,
		...flagsAfterRoom
	} = gameOf(beforeLeave).flags;
	let s: GameState = withDecks(beginRoom(engine, withGame(beforeLeave, (prevGame) => ({ ...prevGame, flags: flagsAfterRoom, disabled: ActivationTracker.clearLocks(gameOf(beforeLeave).disabled ?? {}, "room"), paths: [], currentRoom: null, activeEnemies: [], combat: createEmptyCombatState() }))), roomId
			? {
					...decksOf(beforeLeave),
					dungeonDeck: {
						...deckOf(beforeLeave, "dungeonDeck"),
						discarded: [...deckOf(beforeLeave, "dungeonDeck").discarded, roomId],
					},
				}
			: decksOf(beforeLeave));
	if (roomId) {
		s = removeBlocksForSource(s, roomId);
		s = withWorld(s, removeTriggersAppliedBySource(
				removeModifiersForSource(removeEntity(worldOf(s), roomId), roomId),
				roomId,
			));
	}

	if (checkBossCondition(engine, s, gameOf(s).bossCardId)) {
		return log(
			withGame(s, (prevGame) => ({ ...prevGame, status: "BOSS_REVEAL" })),
			"Condição do boss atendida! O grupo pode enfrentar o chefe ou continuar explorando.",
		);
	}
	return advanceToRandomDungeonRoom(engine, s, roomExits);
}

export function handleContinueExplorationAfterBossOffer(engine: GameEngine,
	state: GameState,
): GameState {
	return advanceToRandomDungeonRoom(engine,
		log(state, "O grupo adia o confronto final e continua explorando."),
	);
}

function advanceToRandomDungeonRoom(engine: GameEngine,
	state: GameState,
	exitsOverride?: number,
): GameState {
	const exits = Math.max(1, exitsOverride ?? gameOf(state).currentRoom?.exits ?? 1);
	const { available, discarded, removed } = deckOf(state, "dungeonDeck");
	if (available.length === 0) return handleDungeonDeckEmpty(engine, state);
	const discardTarget = exits >= 5 ? 2 : exits > 1 ? 1 : 0;

	// A prevenção precisa ser escolhida antes de remover cartas do baralho.
	// O resumo guarda a continuação para que a ação seja retomada após o modal.
	if (discardTarget > 0 && available.length > 1 && !gameOf(state).flags.discardDungeonLocked) {
		const opened = resolveSkillWindow(engine, state, {
			event: "evt_dungeon_discard",
			resume: { type: "advance_dungeon", exits },
			ctx: { triggeredBy: "evt_dungeon_discard", value: discardTarget },
		});
		if (
			pendingTriggerInterruptOf(opened) ||
			pendingSkillChoiceOf(opened) ||
			pendingSkillTargetOf(opened)
		) {
			return opened;
		}
		state = opened;
	}

	state = shuffleDeck(state, "dungeonDeck");
	let rng = gameOf(state).rng;
	const shuffledAvailable = deckOf(state, "dungeonDeck").available;

	const drawn = shuffledAvailable.slice(0, exits);
	const afterDraw = shuffledAvailable.slice(exits);
	if (drawn.length === 0) return handleDungeonDeckEmpty(engine, state);

	const { value: shuffledDrawn, next: afterChoice } = shuffleRng(drawn, rng);
	rng = afterChoice;

	const [chosenId, ...unchosen] = shuffledDrawn;
	const discardCount =
		gameOf(state).flags.dungeonDiscardPrevented && !gameOf(state).flags.discardDungeonLocked
			? 0
			: Math.min(discardTarget, unchosen.length);
	const discardedPaths = unchosen.slice(0, discardCount);
	const returningPaths = unchosen.slice(discardCount);

	const { value: nextAvailable, next: afterReturnShuffle } = shuffleRng(
		[...afterDraw, ...returningPaths],
		rng,
	);
	rng = afterReturnShuffle;

	const card = cardById(engine, chosenId as string);
	if (!card || (card.type !== "room" && card.type !== "subboss_room"))
		return state;

	let next: GameState = withDecks(withGame(state, (prevGame) => ({ ...prevGame, rng, paths: [], flags: gameOf(state).flags.dungeonDiscardPrevented && !gameOf(state).flags.discardDungeonLocked
				? { ...gameOf(state).flags, dungeonDiscardPrevented: false }
				: gameOf(state).flags })), {
			...decksOf(state),
			dungeonDeck: {
				available: nextAvailable,
				discarded: [...discarded, ...discardedPaths],
				removed,
			},
		});

	if (
		gameOf(state).flags.dungeonDiscardPrevented &&
		!gameOf(state).flags.discardDungeonLocked
	) {
		next = log(next, "Descarte de caminho prevenido (Caminho Preservado).");
	}

	next = log(
		next,
		`Caminho sorteado em segredo: ${drawn.length} carta(s), ${discardedPaths.length} descarte(s).`,
	);
	return enterDungeonRoom(engine, next, card, nextAvailable, "Sala sorteada");
}

/** Retoma a abertura de caminhos depois de uma interrupção de descarte. */
export function resumeDungeonAdvance(engine: GameEngine,
	state: GameState,
	exits: number,
): GameState {
	return advanceToRandomDungeonRoom(engine, state, exits);
}

// Descarta N cartas do topo do deck de dungeon. Utilitário compartilhado com handlers de skill.
export function discardFromDungeonDeck(engine: GameEngine,
	state: GameState,
	n: number,
	reason: "effect" | "extra" = "effect",
	skipWindow = false,
): GameState {
	if (!skipWindow && n > 0 && deckOf(state, "dungeonDeck").available.length > 0) {
		const opened = resolveSkillWindow(engine, state, {
			event: "evt_dungeon_discard",
			resume: { type: "discard_dungeon", count: n, reason },
			ctx: {
				triggeredBy: "evt_dungeon_discard",
				value: n,
			},
		});
		if (pendingTriggerInterruptOf(opened) || pendingSkillChoiceOf(opened)) {
			return opened;
		}
		state = opened;
	}

	if (
		gameOf(state).flags.dungeonDiscardPrevented &&
		!gameOf(state).flags.discardDungeonLocked
	) {
		return log(
			withGame(state, (prevGame) => ({ ...prevGame, flags: { ...gameOf(state).flags, dungeonDiscardPrevented: false } })),
			"Descarte de dungeon prevenido (Caminho Preservado).",
		);
	}

	const { available } = deckOf(state, "dungeonDeck");
	if (available.length === 0 || n <= 0) return state;
	return discardDeckTop(state, "dungeonDeck", n);
}

// Re-exporta log para uso em handlers que importam este módulo.
export { log } from "./utils";

function worldWithPermanentEffects(
	previous: AscensaoGame["world"],
	heroes: readonly { readonly id: string }[],
): AscensaoGame["world"] {
	let world = createEmptyWorld();
	for (const hero of heroes) {
		const kept = (previous.entities[hero.id]?.components ?? []).filter(
			(component) =>
				isStatComponent(component) ||
				((component.type === "modifier" || component.type === "trigger") &&
					component.duration.kind === "permanent"),
		);
		if (kept.length > 0) {
			world = upsertEntity(world, createEntity(hero.id, "hero", kept));
		}
	}
	return world;
}

export function handleRestartDungeon(engine: GameEngine,
	state: GameState,
	keepEquipment: boolean,
): GameState {
	const expansionId = expansionOf(engine, gameOf(state).bossCardId);
	const belongsToExpansion = (id: string) =>
		!expansionId || expansionOf(engine, id) === expansionId;
	const roomIds = buildDungeonRoomDeck(engine, expansionId);
	const creatureIds = cardsOfType(engine, "creature").filter((c) => belongsToExpansion(c.id)).map((c) => c.id);
	const itemIds = cardsOfType(engine, "item").filter((c) => belongsToExpansion(c.id)).map((c) => c.id);
	const artifactIds = cardsOfType(engine, "artifact").filter((c) => belongsToExpansion(c.id)).map((c) => c.id);

	const restoredHeroes = gameOf(state).fledHeroes.map((h) => ({
		...h,
		status: "active" as const,
		activeItems: keepEquipment ? h.activeItems : ({} as typeof h.activeItems),
		backpack: keepEquipment ? h.backpack : ([] as readonly string[]),
	}));

	let next = log(
		dealDecksInto(withWorld(withPaused(withEffectStack(beginRoom(engine, withGame(state, (prevGame) => ({ ...prevGame, status: "REVEAL_ROOM", heroes: restoredHeroes, defeatedHeroes: [], fledHeroes: [], activeEnemies: [], enemyGraveyard: [], currentRoom: null, paths: [], roomsCleared: 0, creaturesDefeated: 0, combat: createEmptyCombatState(), pendingRewards: [], flags: {}, blocks: {}, disabled: {}, tokens: {}, subbosses: { available: [], defeated: [] }, oncePer: { game: gameOf(state).oncePer.game } }))), createEmptyEffectStack()), null), worldWithPermanentEffects(worldOf(state), restoredHeroes)), {
				dungeonDeck: roomIds,
				enemyDeck: creatureIds,
				itemDeck: itemIds,
				artifactDeck: artifactIds,
			}, true),
		`Masmorra reiniciada. ${keepEquipment ? "Equipamentos mantidos." : "Heróis voltam ao início."} `,
	);

	for (const h of restoredHeroes) {
		next = applyFullHeal(engine, next, h.id);
	}
	return handleRevealRoom(engine, next);
}

export function handleDungeonExhaustedSpend(engine: GameEngine, state: GameState): GameState {
	const { discarded } = deckOf(state, "dungeonDeck");
	const cost = dungeonRecoveryCost(engine, gameOf(state).difficulty);
	if (discarded.length === 0 || gameOf(state).groupXp < cost) return state;
	const { value: reshuffled, next: rng } = shuffleRng(discarded, gameOf(state).rng);
	const next = log(
		withDecks(withGame(state, (prevGame) => ({ ...prevGame, rng, groupXp: gameOf(state).groupXp - cost })), {
				...decksOf(state),
				dungeonDeck: {
					available: reshuffled,
					discarded: [],
					removed: deckOf(state, "dungeonDeck").removed,
				},
			}),
		`${cost} XP gastos. Deck de dungeon reembaralhado.`,
	);
	return handleRevealRoom(engine, next);
}

export const explorationHandler: GameHandler = {
	id: "exploration",
	phases: [
		"REVEAL_ROOM",
		"ROOM_EFFECT",
		"SPAWN_ENEMIES",
		"OPEN_PATHS",
		"CHOOSE_PATH",
		"DISCARD_PATHS",
		"CHECK_BOSS_CONDITION",
		"DUNGEON_EXHAUSTED",
		"DUNGEON_RESTART_PROMPT",
	],
	actions: [
		"REVEAL_ROOM",
		"RESOLVE_ROOM_EFFECT",
		"SPAWN_ENEMIES",
		"OPEN_PATHS",
		"CHOOSE_PATH",
		"DISCARD_PATHS",
		"CHECK_BOSS_CONDITION",
		"CONTINUE_EXPLORATION",
		"RESTART_DUNGEON",
		"DUNGEON_EXHAUSTED",
	],
	accepts: (state, action) =>
		action.type !== "OPEN_PATHS" || gameOf(state).status !== "XP_SPEND_PHASE",
	legalActions(state) {
		switch (gameOf(state).status) {
			case "REVEAL_ROOM":
				return [{ type: "REVEAL_ROOM" }];
			case "ROOM_EFFECT":
				return [{ type: "RESOLVE_ROOM_EFFECT" }];
			case "SPAWN_ENEMIES":
				return [{ type: "SPAWN_ENEMIES" }];
			case "OPEN_PATHS":
				return [{ type: "OPEN_PATHS" }];
			case "CHOOSE_PATH":
				return gameOf(state).paths.map((cardId) => ({
					type: "CHOOSE_PATH" as const,
					payload: { cardId },
				}));
			case "DISCARD_PATHS":
				return [{ type: "DISCARD_PATHS" }];
			case "CHECK_BOSS_CONDITION":
				return [{ type: "CHECK_BOSS_CONDITION" }];
			case "DUNGEON_EXHAUSTED":
				return [
					{ type: "SPEND_XP", payload: { option: "recover_dungeon" } },
					{ type: "DEFEAT", payload: { reason: "dungeon_exhausted" } },
				];
			case "DUNGEON_RESTART_PROMPT":
				return [
					{ type: "RESTART_DUNGEON", payload: { keepEquipment: true } },
					{ type: "DEFEAT", payload: { reason: "fled" } },
				];
			default:
				return [];
		}
	},
	apply(state, action, engine) {
		switch (action.type) {
			case "REVEAL_ROOM":
				return handleRevealRoom(engine, state);
			case "RESOLVE_ROOM_EFFECT":
				return handleResolveRoomEffect(engine, state);
			case "SPAWN_ENEMIES":
				return handleSpawnEnemies(engine, state);
			case "OPEN_PATHS":
				return handleOpenPaths(engine, state);
			case "CHOOSE_PATH":
				return handleChoosePath(engine, state, action.payload.cardId);
			case "DISCARD_PATHS":
				return handleDiscardPaths(engine, state);
			case "CHECK_BOSS_CONDITION":
				return handleCheckBossCondition(engine, state);
			case "CONTINUE_EXPLORATION":
				return handleContinueExplorationAfterBossOffer(engine, state);
			case "RESTART_DUNGEON":
				return handleRestartDungeon(engine, state, action.payload.keepEquipment);
			case "DUNGEON_EXHAUSTED":
				return withGame(state, (prevGame) => ({
					...prevGame,
					status: "DUNGEON_EXHAUSTED",
				}));
			default:
				return state;
		}
	},
};
