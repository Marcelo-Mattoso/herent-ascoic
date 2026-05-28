// Handler de START_GAME: monta estado inicial, embaralha decks, cria heróis ativos.
// Patch 1: suporta 1 a 8 heróis; aplica heroOffset e despertarOffset da dificuldade.

import {
	getArtifacts,
	getCardByName,
	getCreatures,
	getItems,
	getRooms,
} from "../data/cards";
import { syncHeroesAndEnemies } from "../ecs/sync";
import { createEmptyWorld } from "../ecs/world";
import { DIFFICULTY_PRESETS } from "../config/defaults";
import { createRng } from "../ports/random";
import type { ColorIndex } from "../state/color";
import { createEmptyCombatState } from "../state/combatState";
import type { GameConfig, GameState } from "../state/gameState";
import type { HeroState } from "../state/heroState";
import { selectBoss } from "../strategies/bossSelection";
import { createHeroFromCard, log, shuffleRng } from "./utils";

export function handleStartGame(
	state: GameState,
	payload: GameConfig & { seed?: number; gameId?: string },
): GameState {
	const heroNames: string[] =
		payload.heroCardNames.length > 0 ? payload.heroCardNames : [];

	if (heroNames.length === 0) {
		return log(state, "[ERRO] Nenhum herói selecionado.");
	}

	// Seed e gameId vêm do payload (injetados pela UI ou testes).
	// Fallback determinístico para testes que não fornecem seed.
	const seed = payload.seed ?? 0;
	const gameId = payload.gameId ?? `game-${seed}`;
	let rng = createRng(seed);

	// Offsets de dificuldade
	const difficulty = payload.difficulty ?? "normal";
	const preset = DIFFICULTY_PRESETS[difficulty] ?? DIFFICULTY_PRESETS.normal;
	const heroColorIndex = Math.min(4, preset.heroOffset) as ColorIndex;
	const despertarIndex = Math.min(4, preset.despertarOffset) as ColorIndex;

	// Criar estados de herói (em competitivo cada herói tem playerIndex único)
	const heroes: HeroState[] = [];
	for (let idx = 0; idx < heroNames.length; idx++) {
		const name = heroNames[idx]!;
		const card = getCardByName(name);
		if (!card || card.type !== "hero") {
			throw new Error(`Carta de herói não encontrada: ${name}`);
		}
		const playerIdx = (payload.mode ?? "cooperative") === "competitive" ? idx : 0;
		const { hero, next } = createHeroFromCard(card, heroColorIndex, rng, playerIdx);
		heroes.push(hero);
		rng = next;
	}

	const bossName = payload.bossCardName ?? selectBoss();
	const bossId = getCardByName(bossName)?.id ?? "";

	const roomNames = getRooms().map((c) => c.name);
	const creatureNames = getCreatures().map((c) => c.name);
	const itemNames = getItems().map((c) => c.name);
	const artifactNames = getArtifacts().map((c) => c.name);

	const mode = payload.mode ?? "cooperative";

	// Embaralhar todos os decks encadeando o RNG
	let shuffledRooms: string[];
	let shuffledCreatures: string[];
	let shuffledItems: string[];
	let shuffledArtifacts: string[];

	({ value: shuffledRooms, next: rng } = shuffleRng(roomNames, rng));
	({ value: shuffledCreatures, next: rng } = shuffleRng(creatureNames, rng));
	({ value: shuffledItems, next: rng } = shuffleRng(itemNames, rng));
	({ value: shuffledArtifacts, next: rng } = shuffleRng(artifactNames, rng));

	const world = syncHeroesAndEnemies(createEmptyWorld(), heroes, []);

	const next: GameState = {
		...state,
		gameId,
		rng,
		difficulty,
		mode,
		status: "REVEAL_ROOM",
		world,
		groupXp: 0,
		despertar: despertarIndex,
		heroes,
		defeatedHeroes: [],
		fledHeroes: [],
		activeEnemies: [],
		enemyGraveyard: [],
		bossCardId: bossId,
		bossCardName: bossName,
		bossDefeated: false,
		subbosses: { available: [], defeated: [] },
		groupArtifacts: [],
		currentRoom: null,
		paths: [],
		roomsCleared: 0,
		creaturesDefeated: 0,
		combat: createEmptyCombatState(),
		pendingRewards: [],
		decks: {
			dungeonDeck: { available: shuffledRooms, discarded: [], removed: [] },
			enemyDeck: { available: shuffledCreatures, discarded: [], removed: [] },
			itemDeck: { available: shuffledItems, discarded: [], removed: [] },
			artifactDeck: { available: shuffledArtifacts, discarded: [], removed: [] },
		},
		eventLog: [
			`Partida iniciada. Heróis: ${heroes.map((h) => h.cardName).join(", ")}. Boss: ${bossName}.`,
		],
		// START_GAME reinicia o actionLog (feito pelo wrapper em reducer/index.ts)
	};

	return next;
}
