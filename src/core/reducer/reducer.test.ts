// Testes de integração do reducer.
// Cada teste percorre um caminho completo do loop de jogo.

import { describe, expect, it } from "vitest";
import type { EnemyState } from "../state/enemyState";
import type { GameState } from "../state/gameState";
import { createInitialGameState } from "../state/gameState";
import type { RoomState } from "../state/roomState";
import { getModifierTotal } from "../ecs/world";
import { reducer, reducerCore } from "./index";

const HERO = "hero_crimson_barbarian";
const CLERIC = "hero_eternal_rest_cleric";
const PALADIN = "hero_last_light_paladin";
const WARRIOR = "hero_broken_bastion_warrior";
const BOSS_NAME = "boss_azhakar";

function rollDiceWithApprovals(state: GameState): GameState {
	let next = reducer(state, { type: "ROLL_DICE" });
	let guard = 0;
	while (next.pendingTriggerInterrupt && guard < 10) {
		const interruptedStatus = next.status;
		const interruptId = next.pendingTriggerInterrupt.id;
		next = reducer(next, {
			type: "APPLY_TRIGGER_INTERRUPT",
			payload: { interruptId },
		});
		if (interruptedStatus === "ROLL_DICE" && next.status === "ROLL_DICE") {
			next = reducer(next, { type: "ROLL_DICE" });
		}
		guard += 1;
	}
	return next;
}

// Constrói um estado com sala e inimigo pré-definidos para evitar aleatoriedade
function stateWithRoomAndEnemy(lifeHero = 12, lifeEnemy = 1): GameState {
	const base = createInitialGameState({ heroCardIds: [HERO] });
	const s = reducer(base, {
		type: "START_GAME",
		payload: { heroCardIds: [HERO] },
	});

	const hero = s.heroes[0];
	if (!hero) throw new Error("no hero");

	const enemy: EnemyState = {
		id: "e1",
		cardId: "creature_deep_rift_rat",
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
				available: ["room_narrow_corridor", "room_dungeon_room"],
				discarded: [],
				removed: [],
			},
			itemDeck: { available: [], discarded: [], removed: [] },
		},
	};
}

function stateWithHeroesAndEnemy(heroCardIds: string[]): GameState {
	const base = createInitialGameState({ heroCardIds });
	const started = reducer(base, {
		type: "START_GAME",
		payload: { heroCardIds },
	});

	const enemy: EnemyState = {
		id: "e1",
		cardId: "creature_deep_rift_rat",
		maxLife: 8,
		currentLife: 8,
		damage: 1,
		hitBonus: 0,
		dice: 1,
		tokens: { xp: 1, reward_item: 0, reward_artifact: 0 },
		conditions: [],
		firstDamageTakenThisTurn: false,
		status: "active",
	};

	const room: RoomState = {
		cardId: "room_dungeon_room",
		exits: 2,
		currentEnemies: 1,
		reward: 0,
		rewardType: "item",
		effect: "",
		xp: 1,
		status: "active",
	};

	return {
		...started,
		heroes: started.heroes.map((h) => ({
			...h,
			currentLife: h.maxLife,
			hitBonus: 100,
		})),
		currentRoom: room,
		activeEnemies: [enemy],
		status: "COMBAT_START",
	};
}

// ─── Testes de setup ─────────────────────────────────────────────────────────

describe("START_GAME", () => {
	it("cria herói e embaralha decks", () => {
		const base = createInitialGameState({ heroCardIds: [HERO] });
		const s = reducer(base, {
			type: "START_GAME",
			payload: { heroCardIds: [HERO] },
		});
		expect(s.heroes).toHaveLength(1);
		expect(s.heroes[0]?.cardId).toBe(HERO);
		expect(s.status).toBe("ROOM_EFFECT");
		expect(s.currentRoom).not.toBeNull();
		expect(s.decks.dungeonDeck.available.length).toBeGreaterThan(0);
	});

	it("inicia Guerreiro do Bastião Partido com bônus de acerto base 5 no normal", () => {
		const warrior = "hero_broken_bastion_warrior";
		const base = createInitialGameState({ heroCardIds: [warrior] });
		const s = reducer(base, {
			type: "START_GAME",
			payload: { heroCardIds: [warrior], difficulty: "normal" },
		});
		expect(s.heroes[0]?.cardId).toBe(warrior);
		expect(s.heroes[0]?.hitBonus).toBe(5);
	});

	it("define o boss corretamente", () => {
		const base = createInitialGameState({ heroCardIds: [HERO] });
		const s = reducer(base, {
			type: "START_GAME",
			payload: { heroCardIds: [HERO] },
		});
		expect(s.bossCardId).toBe(BOSS_NAME);
	});
});

// ─── Testes de itens ─────────────────────────────────────────────────────────

describe("USE_ITEM", () => {
	it("Caminho Preservado pode ser usado manualmente por item consumível", () => {
		const base = createInitialGameState({ heroCardIds: [HERO] });
		const started = reducer(base, {
			type: "START_GAME",
			payload: { heroCardIds: [HERO] },
		});
		const hero = started.heroes[0];
		if (!hero) throw new Error("no hero");
		const itemId = "item_worn_explorer_rope";

		const result = reducer(
			{
				...started,
				heroes: [{ ...hero, backpack: [itemId] }],
			},
			{ type: "USE_ITEM", payload: { itemId, heroId: hero.id } },
		);

		expect(result.heroes[0]?.backpack).not.toContain(itemId);
		expect(result.flags.dungeonDiscardPrevented).toBe(true);
	});

	it("Saque Místico descarta o item da mochila e ativa o artefato no grupo", () => {
		const base = createInitialGameState({ heroCardIds: [HERO] });
		const started = reducer(base, {
			type: "START_GAME",
			payload: { heroCardIds: [HERO] },
		});
		const hero = started.heroes[0];
		if (!hero) throw new Error("no hero");

		const itemId = "item_ancient_iron_key";
		const artifactId = "artifact_crimson_jailer_chain";
		const state: GameState = {
			...started,
			heroes: [{ ...hero, backpack: [itemId] }],
			decks: {
				...started.decks,
				artifactDeck: {
					available: [artifactId],
					discarded: [],
					removed: [],
				},
			},
			pendingRewards: [],
		};

		const result = reducer(state, {
			type: "USE_ITEM",
			payload: { itemId, heroId: hero.id },
		});

		expect(result.heroes[0]?.backpack).not.toContain(itemId);
		expect(result.pendingRewards).toHaveLength(0);
		expect(result.groupArtifacts).toContainEqual({
			cardId: artifactId,
			carriedBy: null,
		});
		expect(result.decks.artifactDeck.available).not.toContain(artifactId);
	});

	it("Saque Místico descarta o item mesmo quando ele está equipado no slot especial", () => {
		const base = createInitialGameState({ heroCardIds: [HERO] });
		const started = reducer(base, {
			type: "START_GAME",
			payload: { heroCardIds: [HERO] },
		});
		const hero = started.heroes[0];
		if (!hero) throw new Error("no hero");

		const itemId = "item_torn_depths_map";
		const artifactId = "artifact_ancient_ember_heart";
		const state: GameState = {
			...started,
			heroes: [
				{
					...hero,
					activeItems: { ...hero.activeItems, special: itemId },
					backpack: [],
				},
			],
			decks: {
				...started.decks,
				artifactDeck: {
					available: [artifactId],
					discarded: [],
					removed: [],
				},
			},
			pendingRewards: [],
		};

		const result = reducer(state, {
			type: "USE_ITEM",
			payload: { itemId, heroId: hero.id },
		});

		expect(result.heroes[0]?.activeItems.special).toBeUndefined();
		expect(result.pendingRewards).toHaveLength(0);
		expect(result.groupArtifacts[0]).toMatchObject({
			cardId: artifactId,
			carriedBy: null,
		});
	});

	it("usar item manual em combate desativa o herói até a próxima rodada", () => {
		let s = stateWithHeroesAndEnemy([CLERIC, HERO]);
		s = reducer(s, { type: "START_COMBAT" });
		const hero = s.heroes[0];
		if (!hero) throw new Error("no hero");
		const itemId = "item_ancient_iron_key";
		const artifactId = "artifact_crimson_jailer_chain";
		s = {
			...s,
			heroes: [{ ...hero, backpack: [itemId] }, ...s.heroes.slice(1)],
			decks: {
				...s.decks,
				artifactDeck: {
					available: [artifactId],
					discarded: [],
					removed: [],
				},
			},
		};
		s = reducer(s, {
			type: "CHOOSE_HERO_FOR_ROUND",
			payload: { heroId: hero.id },
		});

		const result = reducer(s, {
			type: "USE_ITEM",
			payload: { itemId, heroId: hero.id },
		});

		expect(result.combat?.heroesActed).toContain(hero.id);
		expect(result.combat?.disabled[`hero:${hero.id}`]).toMatchObject({
			kind: "hero",
			scope: "round",
		});
		expect(result.status).toBe("HERO_ACTION");
		expect(result.combat?.phase).toBe("selecting_hero");
		expect(result.groupArtifacts).toContainEqual({
			cardId: artifactId,
			carriedBy: null,
		});
	});

	it("usar habilidade manual desativa o herói e impede nova seleção na rodada", () => {
		let s = stateWithHeroesAndEnemy([CLERIC, HERO]);
		s = reducer(s, { type: "START_COMBAT" });
		const hero = s.heroes[0];
		if (!hero) throw new Error("no hero");
		s = reducer(s, {
			type: "CHOOSE_HERO_FOR_ROUND",
			payload: { heroId: hero.id },
		});

		const afterSkill = reducer(s, {
			type: "USE_SKILL",
			payload: {
				skillId: "skill_last_light_healing",
				sourceId: hero.id,
				targetIds: [hero.id],
			},
		});
		const blocked = reducer(afterSkill, {
			type: "CHOOSE_HERO_FOR_ROUND",
			payload: { heroId: hero.id },
		});

		expect(afterSkill.combat?.heroesActed).toContain(hero.id);
		expect(afterSkill.combat?.disabled[`hero:${hero.id}`]).toMatchObject({
			kind: "hero",
			scope: "round",
		});
		expect(blocked.eventLog.at(-1)).toContain("já agiu nesta rodada");
	});

	it("habilidade manual com múltiplos alvos abre seleção e resolve no alvo escolhido", () => {
		let s = stateWithHeroesAndEnemy([CLERIC, HERO]);
		s = reducer(s, { type: "START_COMBAT" });
		const cleric = s.heroes.find((h) => h.cardId === CLERIC);
		const ally = s.heroes.find((h) => h.cardId === HERO);
		if (!cleric || !ally) throw new Error("invalid heroes");

		s = {
			...s,
			heroes: s.heroes.map((h) =>
				h.id === ally.id ? { ...h, currentLife: 5 } : h,
			),
		};
		s = reducer(s, {
			type: "CHOOSE_HERO_FOR_ROUND",
			payload: { heroId: cleric.id },
		});

		const pending = reducer(s, {
			type: "USE_SKILL",
			payload: {
				skillId: "skill_last_light_healing",
				sourceId: cleric.id,
			},
		});
		expect(pending.pendingSkillTarget).toMatchObject({
			skillId: "skill_last_light_healing",
			sourceId: cleric.id,
		});
		expect(pending.pendingSkillTarget?.candidates.map((c) => c.id)).toEqual(
			expect.arrayContaining([cleric.id, ally.id]),
		);

		const result = reducer(pending, {
			type: "SELECT_SKILL_TARGET",
			payload: { targetId: ally.id },
		});

		expect(result.pendingSkillTarget).toBeUndefined();
		expect(result.heroes.find((h) => h.id === ally.id)?.currentLife).toBe(8);
		expect(result.combat?.heroesActed).toContain(cleric.id);
		expect(result.combat?.disabled[`hero:${cleric.id}`]).toMatchObject({
			kind: "hero",
			scope: "round",
		});
	});

	it("habilidade ativa pode ser usada fora de combate sem consumir ação de rodada", () => {
		const s = stateWithHeroesAndEnemy([CLERIC, HERO]);
		const cleric = s.heroes.find((h) => h.cardId === CLERIC);
		const ally = s.heroes.find((h) => h.cardId === HERO);
		if (!cleric || !ally) throw new Error("invalid heroes");

		const result = reducer(
			{
				...s,
				status: "XP_SPEND_PHASE",
				combat: null,
				heroes: s.heroes.map((h) =>
					h.id === ally.id ? { ...h, currentLife: 5 } : h,
				),
			},
			{
				type: "USE_SKILL",
				payload: {
					skillId: "skill_last_light_healing",
					sourceId: cleric.id,
					targetIds: [ally.id],
				},
			},
		);

		expect(result.heroes.find((h) => h.id === ally.id)?.currentLife).toBe(8);
		expect(result.combat).toBeNull();
		expect(result.status).toBe("XP_SPEND_PHASE");
	});

	it("nova rodada reativa heróis desativados por rodada", () => {
		let s = stateWithHeroesAndEnemy([CLERIC]);
		s = reducer(s, { type: "START_COMBAT" });
		const hero = s.heroes[0];
		if (!hero) throw new Error("no hero");
		s = reducer(s, {
			type: "CHOOSE_HERO_FOR_ROUND",
			payload: { heroId: hero.id },
		});
		s = reducer(s, {
			type: "USE_SKILL",
			payload: {
				skillId: "skill_last_light_healing",
				sourceId: hero.id,
				targetIds: [hero.id],
			},
		});

		const nextRound = reducer(s, { type: "CHECK_COMBAT_END" });

		expect(nextRound.combat?.heroesActed).toHaveLength(0);
		expect(nextRound.combat?.disabled[`hero:${hero.id}`]).toBeUndefined();
		expect(nextRound.status).toBe("HERO_ACTION");
		expect(nextRound.combat?.phase).toBe("selecting_hero");
	});

	it("habilidade do Paladino dispara automaticamente no início do combate em dungeon 3+", () => {
		let s = stateWithHeroesAndEnemy([PALADIN]);
		const hero = s.heroes[0];
		if (!hero) throw new Error("no hero");

		s = reducer({ ...s, despertar: 3 }, { type: "START_COMBAT" });

		expect(s.pendingTriggerInterrupt).toBeUndefined();
		expect(getModifierTotal(s.world, hero.id, "hit_bonus")).toBe(2);
		expect(getModifierTotal(s.world, hero.id, "damage_dealt")).toBe(2);
	});

	it("habilidade do Guerreiro pode proteger aliado antes do dano e desativa o Guerreiro", () => {
		let s = stateWithHeroesAndEnemy([WARRIOR, CLERIC]);
		s = reducer(s, { type: "START_COMBAT" });
		const warrior = s.heroes.find((h) => h.cardId === WARRIOR);
		const cleric = s.heroes.find((h) => h.cardId === CLERIC);
		const enemy = s.activeEnemies[0];
		if (!warrior || !cleric || !enemy || !s.combat) {
			throw new Error("invalid combat");
		}

		s = {
			...s,
			status: "RESOLVE_ATTACK",
			combat: {
				...s.combat,
				phase: "resolving",
				selectedHeroId: cleric.id,
				pairs: [{ heroId: cleric.id, enemyId: enemy.id }],
				lastRoll: {
					heroId: cleric.id,
					enemyId: enemy.id,
					heroResults: [1],
					heroTotal: 1,
					heroBreakdown: [],
					enemyResults: [6],
					enemyTotal: 6,
					enemyBreakdown: [],
				},
			},
			heroes: s.heroes.map((hero) =>
				hero.id === cleric.id ? { ...hero, currentLife: 10 } : hero,
			),
			activeEnemies: [{ ...enemy, damage: 5 }],
		};

		const interrupted = reducer(s, { type: "RESOLVE_ATTACK" });
		expect(interrupted.pendingTriggerInterrupt).toMatchObject({
			skillId: "skill_bastion_guard",
			sourceHeroId: warrior.id,
			targetHeroIds: [cleric.id],
		});

		const result = reducer(interrupted, {
			type: "APPLY_TRIGGER_INTERRUPT",
			payload: { interruptId: interrupted.pendingTriggerInterrupt?.id },
		});

		const updatedCleric = result.heroes.find((h) => h.id === cleric.id);
		expect(updatedCleric?.currentLife).toBe(10 - (6 - 3));
		expect(result.combat?.disabled[`hero:${warrior.id}`]).toMatchObject({
			kind: "hero",
			scope: "round",
		});
	});

	it("item equipado de bloqueio reduz o dano sofrido pelo herói", () => {
		let s = stateWithRoomAndEnemy(12, 8);
		s = reducer(s, { type: "START_COMBAT" });
		const hero = s.heroes[0];
		const enemy = s.activeEnemies[0];
		if (!hero || !enemy || !s.combat) throw new Error("invalid combat");

		const result = reducer(
			{
				...s,
				status: "RESOLVE_ATTACK",
				heroes: [
					{
						...hero,
						currentLife: 12,
						hitBonus: 0,
						activeItems: { armor: "item_ancient_metal_armor" },
					},
				],
				activeEnemies: [{ ...enemy, damage: 5, currentLife: 8 }],
				combat: {
					...s.combat,
					lastRoll: {
						heroId: hero.id,
						enemyId: enemy.id,
						heroResults: [1],
						heroTotal: 1,
						heroBreakdown: [],
						enemyResults: [6],
						enemyTotal: 6,
						enemyBreakdown: [],
					},
				},
			},
			{ type: "RESOLVE_ATTACK" },
		);

		expect(result.heroes[0]?.currentLife).toBe(8);
		expect(result.eventLog.at(-1)).toContain("Armadura de Metal Antigo -2");
	});

	it("item equipado de dano aumenta o dano efetivo quando a margem da rolagem permite", () => {
		let s = stateWithRoomAndEnemy(12, 10);
		s = reducer(s, { type: "START_COMBAT" });
		const hero = s.heroes[0];
		const enemy = s.activeEnemies[0];
		if (!hero || !enemy || !s.combat) throw new Error("invalid combat");

		const result = reducer(
			{
				...s,
				status: "RESOLVE_ATTACK",
				heroes: [
					{
						...hero,
						activeItems: { weapon: "item_broken_stone_hammer" },
					},
				],
				activeEnemies: [{ ...enemy, currentLife: 10 }],
				combat: {
					...s.combat,
					lastRoll: {
						heroId: hero.id,
						enemyId: enemy.id,
						heroResults: [6],
						heroTotal: 10,
						heroBreakdown: [],
						enemyResults: [2],
						enemyTotal: 6,
						enemyBreakdown: [],
					},
				},
			},
			{ type: "RESOLVE_ATTACK" },
		);

		expect(result.activeEnemies[0]?.currentLife).toBe(10 - hero.damage - 2);
		expect(result.eventLog.join("\n")).toContain(
			"Martelo de Pedra Quebrada +2",
		);
	});
});

// ─── Testes de exploração ────────────────────────────────────────────────────

describe("REVEAL_ROOM", () => {
	it("remove carta do deck e cria sala atual", () => {
		const base = createInitialGameState({ heroCardIds: [HERO] });
		let s = reducer(base, {
			type: "START_GAME",
			payload: { heroCardIds: [HERO] },
		});
		const deckSizeBefore = s.decks.dungeonDeck.available.length;
		s = { ...s, currentRoom: null, status: "REVEAL_ROOM" };
		s = reducer(s, { type: "REVEAL_ROOM" });
		expect(s.currentRoom).not.toBeNull();
		expect(s.decks.dungeonDeck.available.length).toBe(deckSizeBefore - 1);
		expect(s.status).toBe("ROOM_EFFECT");
	});

	it("transita para DUNGEON_EXHAUSTED quando deck vazio e XP suficiente", () => {
		const base = createInitialGameState({ heroCardIds: [HERO] });
		let s = reducer(base, {
			type: "START_GAME",
			payload: { heroCardIds: [HERO] },
		});
		s = {
			...s,
			groupXp: 10,
			currentRoom: null,
			status: "REVEAL_ROOM",
			decks: {
				...s.decks,
				dungeonDeck: {
					available: [],
					discarded: ["room_narrow_corridor"],
					removed: [],
				},
			},
		};
		s = reducer(s, { type: "REVEAL_ROOM" });
		expect(s.status).toBe("DUNGEON_EXHAUSTED");
	});

	it("transita para DEFEAT quando deck vazio sem XP", () => {
		const base = createInitialGameState({ heroCardIds: [HERO] });
		let s = reducer(base, {
			type: "START_GAME",
			payload: { heroCardIds: [HERO] },
		});
		s = {
			...s,
			groupXp: 0,
			currentRoom: null,
			status: "REVEAL_ROOM",
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

		s = rollDiceWithApprovals(s);
		expect(s.status).toBe("RESOLVE_ATTACK");

		s = reducer(s, { type: "RESOLVE_ATTACK" });
		// Após RESOLVE_ATTACK → DIRECT_DAMAGE (sem inimigos não engajados)
		s = reducer(s, { type: "CHECK_COMBAT_END" });

		// Com hitBonus=100, herói sempre vence; inimigo tem vida=1 → é derrotado
		if (s.status === "HERO_ACTION") {
			// Inimigo sobreviveu — faz mais uma rodada
			s = reducer(s, { type: "CHOOSE_TARGET", payload: { heroId, enemyId } });
			s = rollDiceWithApprovals(s);
			s = reducer(s, { type: "RESOLVE_ATTACK" });
			s = reducer(s, { type: "CHECK_COMBAT_END" });
		}

		expect(s.status).toBe("REWARD_PHASE");

		// Recompensa
		s = reducer(s, { type: "GRANT_REWARDS" });
		expect(s.status).toBe("XP_SPEND_PHASE");
		expect(s.groupXp).toBeGreaterThan(0);

		// Pular gasto de XP avança por sorteio oculto da próxima sala
		s = reducer(s, { type: "CHECK_BOSS_CONDITION" });

		// Sem artefatos suficientes → avança para REVEAL_ROOM
		expect(s.status).toBe("ROOM_EFFECT");
		expect(s.currentRoom).not.toBeNull();
		expect(s.paths).toHaveLength(0);
		expect(s.roomsCleared).toBe(1);
	});

	it("habilidade reativa de herói pede aprovação antes da rolagem", () => {
		let s = stateWithRoomAndEnemy();
		s = reducer(s, { type: "START_COMBAT" });

		const heroId = s.heroes[0]?.id ?? "";
		const enemyId = s.activeEnemies[0]?.id ?? "";
		s = reducer(s, { type: "CHOOSE_TARGET", payload: { heroId, enemyId } });

		s = reducer(s, { type: "ROLL_DICE" });
		expect(s.status).toBe("ROLL_DICE");
		expect(s.pendingTriggerInterrupt).toMatchObject({
			skillId: "skill_crimson_fury",
			sourceKind: "hero",
			sourceHeroId: heroId,
		});

		const interruptId = s.pendingTriggerInterrupt?.id ?? "";
		s = reducer(s, {
			type: "APPLY_TRIGGER_INTERRUPT",
			payload: { interruptId },
		});

		expect(s.pendingTriggerInterrupt).toBeUndefined();
		expect(s.status).toBe("RESOLVE_ATTACK");
	});

	it("ignorar habilidade reativa de herói também retoma a rolagem", () => {
		let s = stateWithRoomAndEnemy();
		s = reducer(s, { type: "START_COMBAT" });

		const heroId = s.heroes[0]?.id ?? "";
		const enemyId = s.activeEnemies[0]?.id ?? "";
		s = reducer(s, { type: "CHOOSE_TARGET", payload: { heroId, enemyId } });
		s = reducer(s, { type: "ROLL_DICE" });

		const interruptId = s.pendingTriggerInterrupt?.id ?? "";
		s = reducer(s, {
			type: "SKIP_TRIGGER_INTERRUPT",
			payload: { interruptId },
		});

		expect(s.pendingTriggerInterrupt).toBeUndefined();
		expect(s.status).toBe("RESOLVE_ATTACK");
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
		s = rollDiceWithApprovals(s);
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
		const base = createInitialGameState({ heroCardIds: [HERO] });
		let s = reducer(base, {
			type: "START_GAME",
			payload: { heroCardIds: [HERO] },
		});
		s = {
			...s,
			groupXp: 0,
			currentRoom: null,
			status: "REVEAL_ROOM",
			decks: {
				...s.decks,
				dungeonDeck: { available: [], discarded: [], removed: [] },
			},
		};
		s = reducer(s, { type: "REVEAL_ROOM" });
		expect(s.status).toBe("DEFEAT");
	});

	it("com XP → DUNGEON_EXHAUSTED; gastar 5 XP → reembaralha", () => {
		const base = createInitialGameState({ heroCardIds: [HERO] });
		let s = reducer(base, {
			type: "START_GAME",
			payload: { heroCardIds: [HERO] },
		});
		s = {
			...s,
			groupXp: 10,
			currentRoom: null,
			status: "REVEAL_ROOM",
			decks: {
				...s.decks,
				dungeonDeck: {
					available: [],
					discarded: ["room_narrow_corridor", "room_dungeon_room"],
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
		expect(s.status).toBe("ROOM_EFFECT");
		expect(s.currentRoom).not.toBeNull();
		expect(s.groupXp).toBe(5);
		expect(s.decks.dungeonDeck.available.length).toBe(1);
	});
});

// ─── Regras v2 §8.8 — combate múltiplo ───────────────────────────────────────

describe("combate múltiplo v2 (§8.8)", () => {
	function stateWithTwoHeroesOneEnemy(): GameState {
		const HERO2 = "hero_broken_bastion_warrior";
		const base = createInitialGameState({ heroCardIds: [HERO, HERO2] });
		const s = reducer(base, {
			type: "START_GAME",
			payload: { heroCardIds: [HERO, HERO2] },
		});

		const enemy: EnemyState = {
			id: "e1",
			cardId: "test_training_enemy",
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
		s = rollDiceWithApprovals(s);
		s = reducer(s, { type: "RESOLVE_ATTACK" });

		// Agora herói 2 deve poder selecionar o MESMO inimigo — v2 permite
		expect(s.status).toBe("HERO_ACTION");
		s = reducer(s, {
			type: "CHOOSE_TARGET",
			payload: { heroId: hero2!.id, enemyId },
		});
		expect(s.status).toBe("ROLL_DICE");
	});

	it("criatura sem atacante não age se não houver inimigo excedente", () => {
		let s = stateWithTwoHeroesOneEnemy();

		// Segundo inimigo que não será atacado, mas há dois heróis para dois inimigos.
		const unattacked: EnemyState = {
			id: "e2",
			cardId: "test_unengaged_enemy",
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
		s = rollDiceWithApprovals(s);
		s = reducer(s, { type: "RESOLVE_ATTACK" });

		s = reducer(s, {
			type: "CHOOSE_TARGET",
			payload: { heroId: hero2!.id, enemyId: attackedId },
		});
		s = rollDiceWithApprovals(s);
		s = reducer(s, { type: "RESOLVE_ATTACK" });

		// Sem inimigo excedente numérico, e2 não faz rolagem extra.
		const totalLifeBefore = s.heroes.reduce((acc, h) => acc + h.currentLife, 0);
		s = reducer(s, { type: "DIRECT_DAMAGE" });
		const totalLifeAfter = s.heroes.reduce((acc, h) => acc + h.currentLife, 0);

		expect(totalLifeAfter).toBe(totalLifeBefore);
	});

	it("inimigo excedente rola combate e só causa dano se vencer", () => {
		let s = stateWithTwoHeroesOneEnemy();

		const extraEnemies: EnemyState[] = [
			{
				id: "e2",
				cardId: "test_extra_enemy_wins",
				maxLife: 5,
				currentLife: 5,
				damage: 3,
				hitBonus: 1000,
				dice: 1,
				tokens: { xp: 1, reward_item: 0, reward_artifact: 0 },
				conditions: [],
				firstDamageTakenThisTurn: false,
				status: "active",
			},
			{
				id: "e3",
				cardId: "test_extra_enemy_waits",
				maxLife: 5,
				currentLife: 5,
				damage: 3,
				hitBonus: 0,
				dice: 1,
				tokens: { xp: 1, reward_item: 0, reward_artifact: 0 },
				conditions: [],
				firstDamageTakenThisTurn: false,
				status: "active",
			},
		];
		s = { ...s, activeEnemies: [...s.activeEnemies, ...extraEnemies] };

		s = reducer(s, { type: "START_COMBAT" });
		const [hero1, hero2] = s.heroes;
		const attackedId = "e1";

		s = reducer(s, {
			type: "CHOOSE_TARGET",
			payload: { heroId: hero1!.id, enemyId: attackedId },
		});
		s = rollDiceWithApprovals(s);
		s = reducer(s, { type: "RESOLVE_ATTACK" });

		s = reducer(s, {
			type: "CHOOSE_TARGET",
			payload: { heroId: hero2!.id, enemyId: attackedId },
		});
		s = rollDiceWithApprovals(s);
		s = reducer(s, { type: "RESOLVE_ATTACK" });

		const totalLifeBefore = s.heroes.reduce((acc, h) => acc + h.currentLife, 0);
		s = reducer(s, { type: "DIRECT_DAMAGE" });
		const totalLifeAfter = s.heroes.reduce((acc, h) => acc + h.currentLife, 0);

		expect(totalLifeBefore - totalLifeAfter).toBe(3);
		expect(s.eventLog.some((entry) => entry.includes("Ataque extra"))).toBe(
			true,
		);
	});
});

// ─── Vitória contra boss ──────────────────────────────────────────────────────

describe("vitória contra boss", () => {
	it("boss com 1 de vida é derrotado na primeira rodada", () => {
		const base = createInitialGameState({ heroCardIds: [HERO] });
		let s = reducer(base, {
			type: "START_GAME",
			payload: { heroCardIds: [HERO] },
		});

		// Força 2 artefatos (condição do Azhakar) e vai pelo fluxo correto
		s = {
			...s,
			groupArtifacts: [
				{
					cardId: "artifact_crimson_jailer_chain",
					carriedBy: null,
				},
				{
					cardId: "artifact_ancient_ember_heart",
					carriedBy: null,
				},
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
		s = rollDiceWithApprovals(s);
		s = reducer(s, { type: "RESOLVE_ATTACK" });

		expect(s.status).toBe("VICTORY");
		expect(s.bossDefeated).toBe(true);
	});
});

// ─── Boss sobrevive a uma rodada ─────────────────────────────────────────────

describe("boss sobrevive a uma rodada", () => {
	it("após RESOLVE_ATTACK phase reinicia para selecting_hero", () => {
		const base = createInitialGameState({ heroCardIds: [HERO] });
		let s = reducer(base, {
			type: "START_GAME",
			payload: { heroCardIds: [HERO] },
		});

		s = {
			...s,
			groupArtifacts: [
				{
					cardId: "artifact_crimson_jailer_chain",
					carriedBy: null,
				},
				{
					cardId: "artifact_ancient_ember_heart",
					carriedBy: null,
				},
			],
			status: "BOSS_REVEAL" as const,
		};

		s = reducer(s, { type: "REVEAL_BOSS" });

		// Boss com vida alta e herói com dano baixo → boss sobrevive
		s = {
			...s,
			heroes: s.heroes.map((h) => ({ ...h, hitBonus: 1000, damage: 1 })),
			activeEnemies: s.activeEnemies.map((e) =>
				e.id === "boss" ? { ...e, currentLife: 999, hitBonus: 0 } : e,
			),
		};

		const heroId = s.heroes[0]?.id ?? "";
		s = reducer(s, {
			type: "CHOOSE_TARGET",
			payload: { heroId, enemyId: "boss" },
		});
		s = rollDiceWithApprovals(s);
		s = reducer(s, { type: "RESOLVE_ATTACK" });

		expect(s.status).toBe("BOSS_COMBAT");
		expect(s.combat?.phase).toBe("selecting_hero");
		expect(s.combat?.selectedHeroId).toBeNull();
		expect(s.combat?.pairs).toHaveLength(0);
		expect(s.combat?.heroesActed).toHaveLength(0);
	});
});

// ─── Testes de actionLog (Passo 1) ───────────────────────────────────────────

describe("actionLog", () => {
	const base = () => createInitialGameState({ heroCardIds: [HERO] });

	it("actionLog.length === N após N dispatches", () => {
		let s = reducer(base(), {
			type: "START_GAME",
			payload: { heroCardIds: [HERO] },
		});
		// START_GAME reinicia o log com exatamente 1 entrada
		expect(s.actionLog).toHaveLength(1);

		s = reducer(s, { type: "REVEAL_ROOM" });
		expect(s.actionLog).toHaveLength(2);

		s = reducer(s, { type: "RESOLVE_ROOM_EFFECT" });
		expect(s.actionLog).toHaveLength(3);
	});

	it("actionLog[i].seq === i para todo i", () => {
		let s = reducer(base(), {
			type: "START_GAME",
			payload: { heroCardIds: [HERO] },
		});
		s = reducer(s, { type: "REVEAL_ROOM" });
		s = reducer(s, { type: "RESOLVE_ROOM_EFFECT" });

		for (let i = 0; i < s.actionLog.length; i++) {
			expect(s.actionLog[i]?.seq).toBe(i);
		}
	});

	it("actionLog[i].action é exatamente a action passada (deep equal)", () => {
		const startAction = {
			type: "START_GAME" as const,
			payload: { heroCardIds: [HERO] },
		};
		const revealAction = { type: "REVEAL_ROOM" as const };

		let s = reducer(base(), startAction);
		s = reducer(s, revealAction);

		expect(s.actionLog[0]?.action).toEqual(startAction);
		expect(s.actionLog[1]?.action).toEqual(revealAction);
	});

	it("START_GAME reinicia o actionLog com exatamente uma entrada", () => {
		let s = reducer(base(), {
			type: "START_GAME",
			payload: { heroCardIds: [HERO] },
		});
		s = reducer(s, { type: "REVEAL_ROOM" });
		expect(s.actionLog).toHaveLength(2);

		// Segunda partida: log deve recomeçar do zero
		s = reducer(s, { type: "START_GAME", payload: { heroCardIds: [HERO] } });
		expect(s.actionLog).toHaveLength(1);
		expect(s.actionLog[0]?.action.type).toBe("START_GAME");
	});
});

// ─── Testes de determinismo (Passo 2) ────────────────────────────────────────

describe("determinismo via seed", () => {
	const startAction = {
		type: "START_GAME" as const,
		payload: { heroCardIds: [HERO], seed: 42, gameId: "test-game" },
	};
	const init = () => createInitialGameState({ heroCardIds: [HERO] });

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
		expect(s1.decks.dungeonDeck.available).toEqual(
			s2.decks.dungeonDeck.available,
		);
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

		expect(replayed.decks.dungeonDeck.available).toEqual(
			finalState.decks.dungeonDeck.available,
		);
		expect(replayed.heroes[0]?.id).toBe(finalState.heroes[0]?.id);
		expect(replayed.rng).toEqual(finalState.rng);
	});

	it("seeds diferentes → ao menos um resultado de deck diferente", () => {
		const s1 = reducer(init(), {
			...startAction,
			payload: { ...startAction.payload, seed: 1 },
		});
		const s2 = reducer(init(), {
			...startAction,
			payload: { ...startAction.payload, seed: 999 },
		});
		const same =
			s1.decks.dungeonDeck.available.join(",") ===
			s2.decks.dungeonDeck.available.join(",");
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
