import { installPassive } from "../ecs/installPassive";
import { createEmptyWorld } from "../ecs/world";
import { createRng } from "../ports/random";

import type { ColorIndex } from "../state/color";
import { createEmptyCombatState } from "../state/combatState";
import {
	MAX_HEROES,
	type GameConfig,
	type GameState,
} from "../state/gameState";
import type { HeroState } from "../state/heroState";
import { selectBoss } from "../strategies/bossSelection";
import { buildDungeonRoomDeck, handleRevealRoom } from "./exploration";
import { createHeroFromCard, log } from "./utils";
import { balanceOf, cardById, cardName, cardsOfType, skillsOf } from "../gameEngine";
import { refRequirementMet } from "../gameEngine";
import type { GameEngine, GameHandler } from "../gameEngine";

import { dealDecksInto, recordOfHero, spawnHero, withAwakening, withImpeto, withWorld } from "../state/access";
import { withGame } from "../../engine/state";
export function handleStartGame(engine: GameEngine,
	state: GameState,
	payload: GameConfig & {
		seed?: number;
		gameId?: string;
		deferInitialRoomReveal?: boolean;
	},
): GameState {
	const heroIds: string[] =
		payload.heroCardIds.length > 0 ? payload.heroCardIds : [];

	if (heroIds.length === 0) {
		return log(state, "[ERRO] Nenhum herói selecionado.");
	}
	if (heroIds.length > MAX_HEROES) {
		return log(state, `[ERRO] Selecione no máximo ${MAX_HEROES} heróis.`);
	}

	// Seed e gameId vêm do payload (injetados pela UI ou testes).
	// Fallback determinístico para testes que não fornecem seed.
	const seed = payload.seed ?? 0;
	const gameId = payload.gameId ?? `game-${seed}`;
	let rng = createRng(seed);

	// Offsets de dificuldade
	const difficulty = payload.difficulty ?? "normal";
	const preset = balanceOf(engine).difficultyPresets[difficulty] ?? balanceOf(engine).difficultyPresets.normal;
	const heroColorIndex = Math.min(4, preset.heroOffset) as ColorIndex;
	const despertarIndex = Math.min(4, preset.despertarOffset) as ColorIndex;

	// Criar estados de herói (em competitivo cada herói tem playerIndex único)
	const heroes: HeroState[] = [];
	for (let idx = 0; idx < heroIds.length; idx++) {
		const id = heroIds[idx]!;
		const card = cardById(engine, id);
		if (!card || card.type !== "hero") {
			throw new Error(`Carta de herói não encontrada: ${id}`);
		}
		const playerIdx =
			(payload.mode ?? "cooperative") === "competitive" ? idx : 0;
		const { hero, next } = createHeroFromCard(
			card,
			heroColorIndex,
			rng,
			playerIdx,
		);
		heroes.push(hero);
		rng = next;
	}

	const bossId = payload.bossCardId ?? selectBoss(engine);

	const roomIds = buildDungeonRoomDeck(engine);
	const creatureIds = cardsOfType(engine, "creature").map((c) => c.id);
	const itemIds = cardsOfType(engine, "item").map((c) => c.id);
	const artifactIds = cardsOfType(engine, "artifact").map((c) => c.id);

	const mode = payload.mode ?? "cooperative";


	let world = heroes.reduce(spawnHero, createEmptyWorld());
	// Passivos pertencem ao ECS; gatilhos de catálogo são resolvidos pelo TriggerEngine.
	for (const hero of heroes) {
		const heroCard = cardById(engine, hero.cardId);
		if (heroCard) {
			const skills = skillsOf(engine, heroCard.id).filter(({ ref }) =>
				refRequirementMet(engine, withAwakening(state, despertarIndex), ref.requiresAwakening),
			);
			for (const { def, ref } of skills) {
				if (def.operate_type === "op_passive") {
					world = installPassive(world, hero.id, def, ref);
				}
			}
		}
	}

	const heroNames = heroes.map((h) => cardName(engine, h.cardId));

	const dealt: GameState = withWorld(withAwakening(dealDecksInto(withGame(state, (prevGame) => ({ ...prevGame, gameId, rng, difficulty, mode, status: "REVEAL_ROOM", groupXp: 0, heroes: heroes.map(recordOfHero), defeatedHeroes: [], fledHeroes: [], activeEnemies: [], enemyGraveyard: [], bossCardId: bossId, bossDefeated: false, subbosses: { available: [], defeated: [] }, groupArtifacts: [], currentRoom: null, paths: [], roomsCleared: 0, creaturesDefeated: 0, combat: createEmptyCombatState(), pendingRewards: [], eventLog: [
			`Partida iniciada. Heróis: ${heroNames.join(", ")}. Boss: ${cardName(engine, bossId)}.`,
		], events: [] })), {
		dungeonDeck: roomIds,
		enemyDeck: creatureIds,
		itemDeck: itemIds,
		artifactDeck: artifactIds,
	}), despertarIndex), world);
	const next = heroes.reduce(
		(acc, hero) => withImpeto(acc, hero.id, heroColorIndex),
		dealt,
	);

	// O treinamento pode apresentar a primeira sala como uma ação real do jogador.
	// A partida normal mantém a revelação imediata existente.
	return payload.deferInitialRoomReveal ? next : handleRevealRoom(engine, next);
}

export const setupHandler: GameHandler = {
	id: "setup",
	phases: [
		"MAIN_MENU",
		"SETUP_MODE",
		"SETUP_DIFFICULTY",
		"SETUP_HERO",
		"SETUP_CONFIRM",
	],
	actions: ["START_GAME"],
	legalActions: () => [],
	apply(state, action, engine) {
		return action.type === "START_GAME"
			? handleStartGame(engine, state, action.payload)
			: state;
	},
};
