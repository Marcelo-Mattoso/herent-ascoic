// Handler de START_GAME: monta estado inicial, embaralha decks, cria heróis ativos.
// Patch 1: suporta 1 a 8 heróis; aplica heroOffset e despertarOffset da dificuldade.

import { DIFFICULTY_PRESETS } from "../config/defaults";
import {
	getArtifacts,
	getCardById,
	getCreatures,
	getItems,
	getRooms,
} from "../data/cards";
import { installPassive } from "../ecs/installPassive";
import { installSkillTriggers } from "../ecs/installTriggers";
import { syncHeroesAndEnemies } from "../ecs/sync";
import { createEmptyWorld } from "../ecs/world";
import { cardSkills } from "../skills/lookup";
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
	const heroIds: string[] =
		payload.heroCardIds.length > 0 ? payload.heroCardIds : [];

	if (heroIds.length === 0) {
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
	for (let idx = 0; idx < heroIds.length; idx++) {
		const id = heroIds[idx]!;
		const card = getCardById(id);
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

	const bossId = payload.bossCardId ?? selectBoss();

	const roomIds = getRooms().map((c) => c.id);
	const creatureIds = getCreatures().map((c) => c.id);
	const itemIds = getItems().map((c) => c.id);
	const artifactIds = getArtifacts().map((c) => c.id);

	const mode = payload.mode ?? "cooperative";

	// Embaralhar todos os decks encadeando o RNG
	let shuffledRooms: string[];
	let shuffledCreatures: string[];
	let shuffledItems: string[];
	let shuffledArtifacts: string[];

	({ value: shuffledRooms, next: rng } = shuffleRng(roomIds, rng));
	({ value: shuffledCreatures, next: rng } = shuffleRng(creatureIds, rng));
	({ value: shuffledItems, next: rng } = shuffleRng(itemIds, rng));
	({ value: shuffledArtifacts, next: rng } = shuffleRng(artifactIds, rng));

	let world = syncHeroesAndEnemies(createEmptyWorld(), heroes, []);
	// Lote F: instala TriggerComponents e ModifierComponents passivos das habilidades de cada herói
	for (const hero of heroes) {
		const heroCard = getCardById(hero.cardId);
		if (heroCard) {
			const skills = cardSkills(heroCard.id);
			world = installSkillTriggers(world, hero.id, skills);
			for (const { def, ref } of skills) {
				if (def.operate_type === "op_passive") {
					world = installPassive(world, hero.id, def, ref);
				}
			}
		}
	}

	const heroNames = heroes.map((h) => getCardById(h.cardId)?.name ?? h.cardId);
	const bossCard = getCardById(bossId);

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
			artifactDeck: {
				available: shuffledArtifacts,
				discarded: [],
				removed: [],
			},
		},
		eventLog: [
			`Partida iniciada. Heróis: ${heroNames.join(", ")}. Boss: ${bossCard?.name ?? bossId}.`,
		],
		// START_GAME reinicia o actionLog (feito pelo wrapper em reducer/index.ts)
	};

	return next;
}
