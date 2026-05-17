// Testes de integração do reducer.
// Cada teste percorre um caminho completo do loop de jogo.

import { describe, expect, it } from "vitest";
import type { EnemyState } from "../state/enemyState";
import type { GameState } from "../state/gameState";
import { createInitialGameState } from "../state/gameState";
import type { RoomState } from "../state/roomState";
import { reducer } from "./index";

const HERO = "Bárbaro Rubro";
const BOSS_NAME = "Azhakar, Dragão da Fornalha Sombria";

// Constrói um estado com sala e inimigo pré-definidos para evitar aleatoriedade
function stateWithRoomAndEnemy(lifeHero = 12, lifeEnemy = 1): GameState {
	const base = createInitialGameState({ heroCardNames: [HERO] });
	const s = reducer(base, {
		type: "START_GAME",
		payload: { heroCardNames: [HERO] },
	});

	const hero = s.heroes[0];
	if (!hero) throw new Error("no hero");

	const enemy: EnemyState = {
		id: "e1",
		cardName: "Rato das Fendas Profundas",
		maxLife: lifeEnemy,
		currentLife: lifeEnemy,
		damage: 1,
		hitBonus: 0, // hitBonus=0 → herói sempre vence
		dice: 1,
		tokens: { xp: 1, reward_item: 1, reward_artifact: 0 },
		conditions: [],
		firstDamageTakenThisTurn: false,
		status: "active",
	};

	const room: RoomState = {
		cardName: "Sala da Masmorra",
		exits: 2,
		currentEnemies: 1,
		reward: 0,
		rewardType: "item",
		effect: "",
		xp: 1,
		status: "active",
	};

	return {
		...s,
		heroes: [{ ...hero, currentLife: lifeHero, hitBonus: 100 }], // hitBonus alto → herói sempre vence
		currentRoom: room,
		activeEnemies: [enemy],
		status: "COMBAT_START",
		decks: {
			...s.decks,
			dungeonDeck: {
				available: ["Corredor Estreito", "Sala da Masmorra"],
				discarded: [],
				removed: [],
			},
			itemDeck: { available: [], discarded: [], removed: [] },
		},
	};
}

// ─── Testes de setup ─────────────────────────────────────────────────────────

describe("START_GAME", () => {
	it("cria herói e embaralha decks", () => {
		const base = createInitialGameState({ heroCardNames: [HERO] });
		const s = reducer(base, {
			type: "START_GAME",
			payload: { heroCardNames: [HERO] },
		});
		expect(s.heroes).toHaveLength(1);
		expect(s.heroes[0]?.cardName).toBe(HERO);
		expect(s.status).toBe("REVEAL_ROOM");
		expect(s.decks.dungeonDeck.available.length).toBeGreaterThan(0);
	});

	it("define o boss corretamente", () => {
		const base = createInitialGameState({ heroCardNames: [HERO] });
		const s = reducer(base, {
			type: "START_GAME",
			payload: { heroCardNames: [HERO] },
		});
		expect(s.bossCardName).toBe(BOSS_NAME);
	});
});

// ─── Testes de exploração ────────────────────────────────────────────────────

describe("REVEAL_ROOM", () => {
	it("remove carta do deck e cria sala atual", () => {
		const base = createInitialGameState({ heroCardNames: [HERO] });
		let s = reducer(base, {
			type: "START_GAME",
			payload: { heroCardNames: [HERO] },
		});
		const deckSizeBefore = s.decks.dungeonDeck.available.length;
		s = reducer(s, { type: "REVEAL_ROOM" });
		expect(s.currentRoom).not.toBeNull();
		expect(s.decks.dungeonDeck.available.length).toBe(deckSizeBefore - 1);
		expect(s.status).toBe("ROOM_EFFECT");
	});

	it("transita para DUNGEON_EXHAUSTED quando deck vazio e XP suficiente", () => {
		const base = createInitialGameState({ heroCardNames: [HERO] });
		let s = reducer(base, {
			type: "START_GAME",
			payload: { heroCardNames: [HERO] },
		});
		s = {
			...s,
			groupXp: 10,
			decks: {
				...s.decks,
				dungeonDeck: {
					available: [],
					discarded: ["Corredor Estreito"],
					removed: [],
				},
			},
		};
		s = reducer(s, { type: "REVEAL_ROOM" });
		expect(s.status).toBe("DUNGEON_EXHAUSTED");
	});

	it("transita para DEFEAT quando deck vazio sem XP", () => {
		const base = createInitialGameState({ heroCardNames: [HERO] });
		let s = reducer(base, {
			type: "START_GAME",
			payload: { heroCardNames: [HERO] },
		});
		s = {
			...s,
			groupXp: 0,
			decks: {
				...s.decks,
				dungeonDeck: { available: [], discarded: [], removed: [] },
			},
		};
		s = reducer(s, { type: "REVEAL_ROOM" });
		expect(s.status).toBe("DEFEAT");
	});
});

// ─── Partida feliz: sala completa ─────────────────────────────────────────────

describe("loop de sala completo", () => {
	it("derrota inimigo, recebe recompensa, escolhe caminho", () => {
		let s = stateWithRoomAndEnemy();

		// Combate
		s = reducer(s, { type: "START_COMBAT" });
		expect(s.status).toBe("HERO_ACTION");

		const heroId = s.heroes[0]?.id ?? "";
		const enemyId = s.activeEnemies[0]?.id ?? "";

		s = reducer(s, { type: "CHOOSE_TARGET", payload: { heroId, enemyId } });
		expect(s.status).toBe("ROLL_DICE");

		s = reducer(s, { type: "ROLL_DICE" });
		expect(s.status).toBe("RESOLVE_ATTACK");

		s = reducer(s, { type: "RESOLVE_ATTACK" });
		// Após RESOLVE_ATTACK → DIRECT_DAMAGE (sem inimigos não engajados)
		s = reducer(s, { type: "CHECK_COMBAT_END" });

		// Com hitBonus=100, herói sempre vence; inimigo tem vida=1 → é derrotado
		if (s.status === "HERO_ACTION") {
			// Inimigo sobreviveu — faz mais uma rodada
			s = reducer(s, { type: "CHOOSE_TARGET", payload: { heroId, enemyId } });
			s = reducer(s, { type: "ROLL_DICE" });
			s = reducer(s, { type: "RESOLVE_ATTACK" });
			s = reducer(s, { type: "CHECK_COMBAT_END" });
		}

		expect(s.status).toBe("REWARD_PHASE");

		// Recompensa
		s = reducer(s, { type: "GRANT_REWARDS" });
		expect(s.status).toBe("XP_SPEND_PHASE");
		expect(s.groupXp).toBeGreaterThan(0);

		// Pular gasto de XP, abrir caminhos
		s = reducer(s, { type: "OPEN_PATHS" });
		expect(s.status).toBe("OPEN_PATHS");
		s = reducer(s, { type: "OPEN_PATHS" });
		expect(s.status).toBe("CHOOSE_PATH");
		expect(s.paths.length).toBeGreaterThan(0);

		// Escolher caminho
		const path = s.paths[0] as string;
		s = reducer(s, { type: "CHOOSE_PATH", payload: { cardName: path } });
		s = reducer(s, { type: "DISCARD_PATHS" });
		s = reducer(s, { type: "CHECK_BOSS_CONDITION" });

		// Sem artefatos suficientes → avança para REVEAL_ROOM
		expect(s.status).toBe("REVEAL_ROOM");
		expect(s.roomsCleared).toBe(1);
	});
});

// ─── Derrota por herói ───────────────────────────────────────────────────────

describe("derrota por herói", () => {
	it("herói com 1 de vida morre no dano direto", () => {
		let s = stateWithRoomAndEnemy(1, 999); // herói fraco, inimigo imortal

		s = reducer(s, { type: "START_COMBAT" });
		const heroId = s.heroes[0]?.id ?? "";
		const enemyId = s.activeEnemies[0]?.id ?? "";

		// Torna o herói fraco e o inimigo forte no par
		s = {
			...s,
			heroes: s.heroes.map((h) => ({ ...h, hitBonus: 0, currentLife: 1 })),
			activeEnemies: s.activeEnemies.map((e) => ({
				...e,
				hitBonus: 1000,
				damage: 99,
			})),
		};

		s = reducer(s, { type: "CHOOSE_TARGET", payload: { heroId, enemyId } });
		s = reducer(s, { type: "ROLL_DICE" });
		s = reducer(s, { type: "RESOLVE_ATTACK" });

		// Após damage, herói deve estar com vida <= 0
		const hero = s.heroes[0];
		expect(hero?.currentLife).toBeLessThanOrEqual(0);

		s = reducer(s, { type: "CHECK_COMBAT_END" });
		expect(s.status).toBe("DEFEAT");
	});
});

// ─── Derrota por deck esgotado ───────────────────────────────────────────────

describe("derrota por deck esgotado", () => {
	it("sem XP e sem cartas → derrota direta", () => {
		const base = createInitialGameState({ heroCardNames: [HERO] });
		let s = reducer(base, {
			type: "START_GAME",
			payload: { heroCardNames: [HERO] },
		});
		s = {
			...s,
			groupXp: 0,
			decks: {
				...s.decks,
				dungeonDeck: { available: [], discarded: [], removed: [] },
			},
		};
		s = reducer(s, { type: "REVEAL_ROOM" });
		expect(s.status).toBe("DEFEAT");
	});

	it("com XP → DUNGEON_EXHAUSTED; gastar 5 XP → reembaralha", () => {
		const base = createInitialGameState({ heroCardNames: [HERO] });
		let s = reducer(base, {
			type: "START_GAME",
			payload: { heroCardNames: [HERO] },
		});
		s = {
			...s,
			groupXp: 10,
			decks: {
				...s.decks,
				dungeonDeck: {
					available: [],
					discarded: ["Corredor Estreito", "Sala da Masmorra"],
					removed: [],
				},
			},
		};
		s = reducer(s, { type: "REVEAL_ROOM" });
		expect(s.status).toBe("DUNGEON_EXHAUSTED");

		s = reducer(s, {
			type: "SPEND_XP",
			payload: { option: "recover_dungeon" },
		});
		expect(s.status).toBe("REVEAL_ROOM");
		expect(s.groupXp).toBe(5);
		expect(s.decks.dungeonDeck.available.length).toBe(2);
	});
});

// ─── Vitória contra boss ──────────────────────────────────────────────────────

describe("vitória contra boss", () => {
	it("boss com 1 de vida é derrotado na primeira rodada", () => {
		const base = createInitialGameState({ heroCardNames: [HERO] });
		let s = reducer(base, {
			type: "START_GAME",
			payload: { heroCardNames: [HERO] },
		});

		// Força 2 artefatos (condição do Azhakar)
		s = {
			...s,
			groupArtifacts: [
				{ cardName: "Corrente do Carcereiro Rubro", carriedBy: null },
				{ cardName: "Coração de Brasa Antiga", carriedBy: null },
			],
		};

		s = reducer(s, { type: "REVEAL_BOSS" });
		expect(s.status).toBe("BOSS_COMBAT");

		const bossId = s.activeEnemies.find((e) => e.id === "boss")?.id ?? "";
		expect(bossId).toBe("boss");

		// Seta boss com 1 de vida e herói com hitBonus altíssimo
		s = {
			...s,
			heroes: s.heroes.map((h) => ({ ...h, hitBonus: 1000, damage: 99 })),
			activeEnemies: s.activeEnemies.map((e) =>
				e.id === "boss" ? { ...e, currentLife: 1, hitBonus: 0 } : e,
			),
		};

		const heroId = s.heroes[0]?.id ?? "";
		s = reducer(s, {
			type: "CHOOSE_TARGET",
			payload: { heroId, enemyId: "boss" },
		});
		s = reducer(s, { type: "ROLL_DICE" });
		s = reducer(s, { type: "RESOLVE_ATTACK" });

		expect(s.status).toBe("VICTORY");
		expect(s.bossDefeated).toBe(true);
	});
});
