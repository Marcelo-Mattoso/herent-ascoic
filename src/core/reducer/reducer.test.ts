// Testes de integração do reducer.
// Cada teste percorre um caminho completo do loop de jogo.

import { describe, expect, it } from "vitest";
import type { EnemyState } from "../state/enemyState";
import type { GameState } from "../state/gameState";
import { createInitialGameState } from "../state/gameState";
import type { RoomState } from "../state/roomState";
import { reducer, reducerCore } from "./index";

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
		cardId: "room_dungeon_room",
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

	it("inicia Guerreiro do Bastião Partido com bônus de acerto base 5 no normal", () => {
		const warrior = "Guerreiro do Bastião Partido";
		const base = createInitialGameState({ heroCardNames: [warrior] });
		const s = reducer(base, {
			type: "START_GAME",
			payload: { heroCardNames: [warrior], difficulty: "normal" },
		});
		expect(s.heroes[0]?.cardName).toBe(warrior);
		expect(s.heroes[0]?.hitBonus).toBe(5);
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

// ─── Regras v2 §8.8 — combate múltiplo ───────────────────────────────────────

describe("combate múltiplo v2 (§8.8)", () => {
	function stateWithTwoHeroesOneEnemy(): GameState {
		const HERO2 = "Guerreiro do Bastião Partido";
		const base = createInitialGameState({ heroCardNames: [HERO, HERO2] });
		let s = reducer(base, {
			type: "START_GAME",
			payload: { heroCardNames: [HERO, HERO2] },
		});

		const enemy: EnemyState = {
			id: "e1",
			cardName: "Rato das Fendas Profundas",
			maxLife: 99,
			currentLife: 99,
			damage: 1,
			hitBonus: 0,
			dice: 1,
			tokens: { xp: 1, reward_item: 1, reward_artifact: 0 },
			conditions: [],
			firstDamageTakenThisTurn: false,
			status: "active",
		};

		const room: RoomState = {
			cardId: "room_dungeon_room",
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
			heroes: s.heroes.map((h) => ({ ...h, hitBonus: 100 })),
			currentRoom: room,
			activeEnemies: [enemy],
			status: "COMBAT_START",
		};
	}

	it("dois heróis podem atacar o mesmo inimigo (antes era rejeitado)", () => {
		let s = stateWithTwoHeroesOneEnemy();
		s = reducer(s, { type: "START_COMBAT" });

		const [hero1, hero2] = s.heroes;
		const enemyId = s.activeEnemies[0]?.id ?? "";

		// Herói 1 seleciona o inimigo
		s = reducer(s, {
			type: "CHOOSE_TARGET",
			payload: { heroId: hero1!.id, enemyId },
		});
		expect(s.status).toBe("ROLL_DICE");

		// Rola e resolve o combate do herói 1
		s = reducer(s, { type: "ROLL_DICE" });
		s = reducer(s, { type: "RESOLVE_ATTACK" });

		// Agora herói 2 deve poder selecionar o MESMO inimigo — v2 permite
		expect(s.status).toBe("HERO_ACTION");
		s = reducer(s, {
			type: "CHOOSE_TARGET",
			payload: { heroId: hero2!.id, enemyId },
		});
		expect(s.status).toBe("ROLL_DICE");
	});

	it("criatura sem atacante aplica dano completo num único herói", () => {
		let s = stateWithTwoHeroesOneEnemy();

		// Segundo inimigo que não será atacado
		const unattacked: EnemyState = {
			id: "e2",
			cardName: "Rato das Fendas Profundas",
			maxLife: 5,
			currentLife: 5,
			damage: 3,
			hitBonus: 0,
			dice: 1,
			tokens: { xp: 1, reward_item: 0, reward_artifact: 0 },
			conditions: [],
			firstDamageTakenThisTurn: false,
			status: "active",
		};
		s = { ...s, activeEnemies: [...s.activeEnemies, unattacked] };

		s = reducer(s, { type: "START_COMBAT" });
		const [hero1, hero2] = s.heroes;
		const attackedId = "e1";

		// Ambos heróis atacam o mesmo inimigo (e1), deixando e2 sem atacante
		s = reducer(s, {
			type: "CHOOSE_TARGET",
			payload: { heroId: hero1!.id, enemyId: attackedId },
		});
		s = reducer(s, { type: "ROLL_DICE" });
		s = reducer(s, { type: "RESOLVE_ATTACK" });

		s = reducer(s, {
			type: "CHOOSE_TARGET",
			payload: { heroId: hero2!.id, enemyId: attackedId },
		});
		s = reducer(s, { type: "ROLL_DICE" });
		s = reducer(s, { type: "RESOLVE_ATTACK" });

		// Fase de dano direto: e2 não foi atacado → aplica 3 de dano num herói
		const totalLifeBefore = s.heroes.reduce((acc, h) => acc + h.currentLife, 0);
		s = reducer(s, { type: "DIRECT_DAMAGE" });
		const totalLifeAfter = s.heroes.reduce((acc, h) => acc + h.currentLife, 0);

		// Dano de 3 deve ter sido aplicado (inteiro, num herói só)
		expect(totalLifeBefore - totalLifeAfter).toBe(3);
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

		// Força 2 artefatos (condição do Azhakar) e vai pelo fluxo correto
		s = {
			...s,
			groupArtifacts: [
				{ cardId: "artifact_crimson_jailer_chain", cardName: "Corrente do Carcereiro Rubro", carriedBy: null },
				{ cardId: "artifact_ancient_ember_heart", cardName: "Coração de Brasa Antiga", carriedBy: null },
			],
			status: "BOSS_REVEAL" as const,
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

// ─── Testes de actionLog (Passo 1) ───────────────────────────────────────────

describe("actionLog", () => {
	const base = () => createInitialGameState({ heroCardNames: [HERO] });

	it("actionLog.length === N após N dispatches", () => {
		let s = reducer(base(), { type: "START_GAME", payload: { heroCardNames: [HERO] } });
		// START_GAME reinicia o log com exatamente 1 entrada
		expect(s.actionLog).toHaveLength(1);

		s = reducer(s, { type: "REVEAL_ROOM" });
		expect(s.actionLog).toHaveLength(2);

		s = reducer(s, { type: "RESOLVE_ROOM_EFFECT" });
		expect(s.actionLog).toHaveLength(3);
	});

	it("actionLog[i].seq === i para todo i", () => {
		let s = reducer(base(), { type: "START_GAME", payload: { heroCardNames: [HERO] } });
		s = reducer(s, { type: "REVEAL_ROOM" });
		s = reducer(s, { type: "RESOLVE_ROOM_EFFECT" });

		for (let i = 0; i < s.actionLog.length; i++) {
			expect(s.actionLog[i]?.seq).toBe(i);
		}
	});

	it("actionLog[i].action é exatamente a action passada (deep equal)", () => {
		const startAction = { type: "START_GAME" as const, payload: { heroCardNames: [HERO] } };
		const revealAction = { type: "REVEAL_ROOM" as const };

		let s = reducer(base(), startAction);
		s = reducer(s, revealAction);

		expect(s.actionLog[0]?.action).toEqual(startAction);
		expect(s.actionLog[1]?.action).toEqual(revealAction);
	});

	it("START_GAME reinicia o actionLog com exatamente uma entrada", () => {
		let s = reducer(base(), { type: "START_GAME", payload: { heroCardNames: [HERO] } });
		s = reducer(s, { type: "REVEAL_ROOM" });
		expect(s.actionLog).toHaveLength(2);

		// Segunda partida: log deve recomeçar do zero
		s = reducer(s, { type: "START_GAME", payload: { heroCardNames: [HERO] } });
		expect(s.actionLog).toHaveLength(1);
		expect(s.actionLog[0]?.action.type).toBe("START_GAME");
	});
});

// ─── Testes de determinismo (Passo 2) ────────────────────────────────────────

describe("determinismo via seed", () => {
	const startAction = { type: "START_GAME" as const, payload: { heroCardNames: [HERO], seed: 42, gameId: "test-game" } };
	const init = () => createInitialGameState({ heroCardNames: [HERO] });

	it("mesma seed + mesma sequência → mesmo GameState final (executando 2× separadamente)", () => {
		let s1 = reducer(init(), startAction);
		s1 = reducer(s1, { type: "REVEAL_ROOM" });
		s1 = reducer(s1, { type: "RESOLVE_ROOM_EFFECT" });
		s1 = reducer(s1, { type: "SPAWN_ENEMIES" });

		let s2 = reducer(init(), startAction);
		s2 = reducer(s2, { type: "REVEAL_ROOM" });
		s2 = reducer(s2, { type: "RESOLVE_ROOM_EFFECT" });
		s2 = reducer(s2, { type: "SPAWN_ENEMIES" });

		// Estados finais são idênticos
		expect(s1.decks.dungeonDeck.available).toEqual(s2.decks.dungeonDeck.available);
		expect(s1.heroes[0]?.id).toBe(s2.heroes[0]?.id);
		expect(s1.rng).toEqual(s2.rng);
	});

	it("replay determinístico: aplicar actionLog produz o mesmo GameState final", () => {
		// Constrói uma sequência de actions
		let s = reducer(init(), startAction);
		s = reducer(s, { type: "REVEAL_ROOM" });
		s = reducer(s, { type: "RESOLVE_ROOM_EFFECT" });
		s = reducer(s, { type: "SPAWN_ENEMIES" });
		const finalState = s;
		const log = s.actionLog;

		// Replay: aplica o log sobre estado inicial via reducerCore
		const replayed = log.reduce(
			(acc, entry) => reducerCore(acc, entry.action),
			init(),
		);

		expect(replayed.decks.dungeonDeck.available).toEqual(finalState.decks.dungeonDeck.available);
		expect(replayed.heroes[0]?.id).toBe(finalState.heroes[0]?.id);
		expect(replayed.rng).toEqual(finalState.rng);
	});

	it("seeds diferentes → ao menos um resultado de deck diferente", () => {
		const s1 = reducer(init(), { ...startAction, payload: { ...startAction.payload, seed: 1 } });
		const s2 = reducer(init(), { ...startAction, payload: { ...startAction.payload, seed: 999 } });
		const same = s1.decks.dungeonDeck.available.join(",") === s2.decks.dungeonDeck.available.join(",");
		expect(same).toBe(false);
	});

	it("counter do RNG cresce monotonicamente entre actions (sem reset em meio de partida)", () => {
		let s = reducer(init(), startAction);
		const c0 = s.rng.counter;
		s = reducer(s, { type: "REVEAL_ROOM" });
		const c1 = s.rng.counter;
		// Segue o fluxo correto: ROOM_EFFECT → SPAWN_ENEMIES → COMBAT_START
		s = reducer(s, { type: "RESOLVE_ROOM_EFFECT" });
		s = reducer(s, { type: "SPAWN_ENEMIES" });
		const c2 = s.rng.counter;
		expect(c1).toBeGreaterThanOrEqual(c0);
		expect(c2).toBeGreaterThanOrEqual(c1);
	});
});
