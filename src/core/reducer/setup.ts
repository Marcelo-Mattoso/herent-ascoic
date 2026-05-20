// Handler de START_GAME: monta estado inicial, embaralha decks, cria heróis ativos.
// Patch 1: suporta 1 a 8 heróis; aplica heroOffset e despertarOffset da dificuldade.

import {
	getArtifacts,
	getCardByName,
	getCreatures,
	getItems,
	getRooms,
} from "../../data/cards";
import { DIFFICULTY_PRESETS } from "../config/defaults";
import type { ColorIndex } from "../state/color";
import { createEmptyCombatState } from "../state/combatState";
import type { GameConfig, GameState } from "../state/gameState";
import { selectBoss } from "../strategies/bossSelection";
import { createHeroFromCard, log, shuffle } from "./utils";

export function handleStartGame(
	state: GameState,
	payload: GameConfig,
): GameState {
	// Suporte ao campo legado heroCardName (string única) para compatibilidade de testes
	const heroNames: string[] =
		payload.heroCardNames.length > 0 ? payload.heroCardNames : [];

	if (heroNames.length === 0) {
		return log(state, "[ERRO] Nenhum herói selecionado.");
	}

	// Offsets de dificuldade
	const difficulty = payload.difficulty ?? "normal";
	const preset = DIFFICULTY_PRESETS[difficulty] ?? DIFFICULTY_PRESETS.normal;
	const heroColorIndex = Math.min(4, preset.heroOffset) as ColorIndex;
	const despertarIndex = Math.min(4, preset.despertarOffset) as ColorIndex;

	// Criar estados de herói (em competitivo cada herói tem playerIndex único)
	const heroes = heroNames.map((name, idx) => {
		const card = getCardByName(name);
		if (!card || card.type !== "hero") {
			throw new Error(`Carta de herói não encontrada: ${name}`);
		}
		const playerIdx = (payload.mode ?? "cooperative") === "competitive" ? idx : 0;
		return createHeroFromCard(card, heroColorIndex, playerIdx);
	});

	const bossName = payload.bossCardName ?? selectBoss();

	const roomNames = getRooms().map((c) => c.name);
	const creatureNames = getCreatures().map((c) => c.name);
	const itemNames = getItems().map((c) => c.name);
	const artifactNames = getArtifacts().map((c) => c.name);

	const mode = payload.mode ?? "cooperative";

	const next: GameState = {
		...state,
		difficulty,
		mode,
		status: "REVEAL_ROOM",
		groupXp: 0,
		despertar: despertarIndex,
		heroes,
		defeatedHeroes: [],
		fledHeroes: [],
		activeEnemies: [],
		enemyGraveyard: [],
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
			dungeonDeck: {
				available: shuffle(roomNames),
				discarded: [],
				removed: [],
			},
			enemyDeck: {
				available: shuffle(creatureNames),
				discarded: [],
				removed: [],
			},
			itemDeck: { available: shuffle(itemNames), discarded: [], removed: [] },
			artifactDeck: {
				available: shuffle(artifactNames),
				discarded: [],
				removed: [],
			},
		},
		eventLog: [
			`Partida iniciada. Heróis: ${heroes.map((h) => h.cardName).join(", ")}. Boss: ${bossName}.`,
		],
	};

	return next;
}
