import { describe, expect, it } from "vitest";
import { getHeroes } from "../data/cards";
import { createEmptyCombatState } from "../state/combatState";
import type { EnemyState } from "../state/enemyState";
import type { GameState } from "../state/gameState";
import { createInitialGameState } from "../state/gameState";
import type { RoomState } from "../state/roomState";
import { getModifierTotal } from "../ecs/world";
import { reducer, reducerCore } from "./index";
import { testEngine } from "@/core/__tests__/testEngine";
import { deckOf, decksOf, enemiesOf, heroesOf, withAwakening, withDecks } from "@/core/state/access";
import { settled } from "../__tests__/fixtures";
import { pendingTriggerInterruptOf, pendingSkillChoiceOf, pendingSkillTargetOf, scopedFlagOf, withPendingSkillTarget } from "../state/access";
import { gameOf, withGame } from "../../engine/state";

const HERO = "hero_crimson_barbarian";
const CLERIC = "hero_eternal_rest_cleric";
const PALADIN = "hero_last_light_paladin";
const WARRIOR = "hero_broken_bastion_warrior";
const BOSS_NAME = "boss_azhakar";

function rollDiceWithApprovals(state: GameState): GameState {
	let next = reducer(testEngine, state, { type: "ROLL_DICE" });
	let guard = 0;
	let interrupt = pendingTriggerInterruptOf(next);
	while (interrupt && guard < 10) {
		const interruptedStatus = gameOf(next).status;
		const interruptId = interrupt.id;
		next = reducer(testEngine, next, {
			type: "APPLY_TRIGGER_INTERRUPT",
			payload: { interruptId },
		});
		if (interruptedStatus === "ROLL_DICE" && gameOf(next).status === "ROLL_DICE") {
			next = reducer(testEngine, next, { type: "ROLL_DICE" });
		}
		guard += 1;
		interrupt = pendingTriggerInterruptOf(next);
	}
	return next;
}

// Constrói um estado com sala e inimigo pré-definidos para evitar aleatoriedade
function stateWithRoomAndEnemy(lifeHero = 12, lifeEnemy = 1): GameState {
	const base = createInitialGameState({ heroCardIds: [HERO] });
	const s = reducer(testEngine, base, {
		type: "START_GAME",
		payload: { heroCardIds: [HERO] },
	});

	const hero = heroesOf(s)[0];
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

	return withDecks(settled(withGame(s, (prevGame) => ({ ...prevGame, heroes: [{ ...hero, currentLife: lifeHero, hitBonus: 100 }], currentRoom: room, activeEnemies: [enemy], status: "COMBAT_START", oncePer: {
			...gameOf(s).oncePer,
			game: {
				...gameOf(s).oncePer.game,
				[`power_mighty_crimson_fury::${hero.id}`]: true,
			},
		} }))), {
			...decksOf(s),
			dungeonDeck: {
				available: ["room_narrow_corridor", "room_dungeon_room"],
				discarded: [],
				removed: [],
			},
			itemDeck: { available: [], discarded: [], removed: [] },
		});
}

function stateWithHeroesAndEnemy(heroCardIds: string[]): GameState {
	const base = createInitialGameState({ heroCardIds });
	const started = reducer(testEngine, base, {
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

	return settled(withGame(started, (prevGame) => ({ ...prevGame, heroes: heroesOf(started).map((h) => ({
			...h,
			currentLife: h.maxLife,
			hitBonus: 100,
		})), currentRoom: room, activeEnemies: [enemy], status: "COMBAT_START" })));
}

// ─── Testes de setup ─────────────────────────────────────────────────────────

describe("START_GAME", () => {
	it("seed do tutorial oferece um encontro válido a cada herói disponível", () => {
		for (const hero of getHeroes()) {
			let state = reducer(testEngine, createInitialGameState({ heroCardIds: [hero.id] }), {
				type: "START_GAME",
				payload: {
					heroCardIds: [hero.id],
					seed: 2,
					deferInitialRoomReveal: true,
				},
			});
			state = reducer(testEngine, state, { type: "REVEAL_ROOM" });
			if (gameOf(state).status === "ROOM_EFFECT")
				state = reducer(testEngine, state, { type: "RESOLVE_ROOM_EFFECT" });
			if (gameOf(state).status === "SPAWN_ENEMIES")
				state = reducer(testEngine, state, { type: "SPAWN_ENEMIES" });
			expect(gameOf(state).status, hero.id).toBe("COMBAT_START");
			expect(gameOf(state).currentRoom, hero.id).not.toBeNull();
			expect(enemiesOf(state).length, hero.id).toBeGreaterThan(0);
			expect(pendingSkillChoiceOf(state), hero.id).toBeFalsy();
		}
	});

	it("pode aguardar a primeira revelação sem alterar o fluxo normal", () => {
		const base = createInitialGameState({ heroCardIds: [HERO] });
		const prepared = reducer(testEngine, base, {
			type: "START_GAME",
			payload: { heroCardIds: [HERO], seed: 2, deferInitialRoomReveal: true },
		});
		expect(gameOf(prepared).status).toBe("REVEAL_ROOM");
		expect(gameOf(prepared).currentRoom).toBeNull();
		expect(deckOf(prepared, "dungeonDeck").available.length).toBeGreaterThan(0);
		const revealed = reducer(testEngine, prepared, { type: "REVEAL_ROOM" });
		expect(gameOf(revealed).status).toBe("ROOM_EFFECT");
		expect(gameOf(revealed).currentRoom).not.toBeNull();
		const normal = reducer(testEngine, base, {
			type: "START_GAME",
			payload: { heroCardIds: [HERO], seed: 2 },
		});
		expect(gameOf(normal).currentRoom?.cardId).toBe(gameOf(revealed).currentRoom?.cardId);
	});

	it("cria herói e embaralha decks", () => {
		const base = createInitialGameState({ heroCardIds: [HERO] });
		const s = reducer(testEngine, base, {
			type: "START_GAME",
			payload: { heroCardIds: [HERO] },
		});
		expect(heroesOf(s)).toHaveLength(1);
		expect(heroesOf(s)[0]?.cardId).toBe(HERO);
		expect(gameOf(s).status).toBe("ROOM_EFFECT");
		expect(gameOf(s).currentRoom).not.toBeNull();
		expect(deckOf(s, "dungeonDeck").available.length).toBeGreaterThan(0);
	});

	it("rejeita partidas com mais de quatro heróis", () => {
		const heroCardIds = [HERO, CLERIC, PALADIN, WARRIOR, "hero_rift_rogue"];
		const base = createInitialGameState({ heroCardIds });
		const s = reducer(testEngine, base, {
			type: "START_GAME",
			payload: { heroCardIds },
		});

		expect(heroesOf(s)).toHaveLength(0);
		expect(gameOf(s).status).toBe("MAIN_MENU");
		expect(gameOf(s).eventLog.at(-1)).toBe("[ERRO] Selecione no máximo 4 heróis.");
	});

	it("inicia Guerreiro do Bastião Partido com bônus de acerto base 5 no normal", () => {
		const warrior = "hero_broken_bastion_warrior";
		const base = createInitialGameState({ heroCardIds: [warrior] });
		const s = reducer(testEngine, base, {
			type: "START_GAME",
			payload: { heroCardIds: [warrior], difficulty: "normal" },
		});
		expect(heroesOf(s)[0]?.cardId).toBe(warrior);
		expect(heroesOf(s)[0]?.hitBonus).toBe(5);
	});

	it("define o boss corretamente", () => {
		const base = createInitialGameState({ heroCardIds: [HERO] });
		const s = reducer(testEngine, base, {
			type: "START_GAME",
			payload: { heroCardIds: [HERO] },
		});
		expect(gameOf(s).bossCardId).toBe(BOSS_NAME);
	});
});

// ─── Testes de itens ─────────────────────────────────────────────────────────

describe("USE_ITEM", () => {
	it("Caminho Preservado aguarda a janela de descarte de dungeon", () => {
		const base = createInitialGameState({ heroCardIds: [HERO] });
		const started = reducer(testEngine, base, {
			type: "START_GAME",
			payload: { heroCardIds: [HERO] },
		});
		const hero = heroesOf(started)[0];
		if (!hero) throw new Error("no hero");
		const itemId = "item_worn_explorer_rope";

		const result = reducer(testEngine, 
			settled(withGame(started, (prevGame) => ({ ...prevGame, heroes: [{ ...hero, backpack: [itemId] }] }))),
			{ type: "USE_ITEM", payload: { itemId, heroId: hero.id } },
		);

		expect(heroesOf(result)[0]?.backpack).toContain(itemId);
		expect(gameOf(result).flags.dungeonDiscardPrevented).not.toBe(true);
	});

	it("Saque Místico equipado descarta o item e ativa o artefato no grupo", () => {
		const base = createInitialGameState({ heroCardIds: [HERO] });
		const started = reducer(testEngine, base, {
			type: "START_GAME",
			payload: { heroCardIds: [HERO] },
		});
		const hero = heroesOf(started)[0];
		if (!hero) throw new Error("no hero");

		const itemId = "item_ancient_iron_key";
		const artifactId = "artifact_crimson_jailer_chain";
		const state: GameState = withDecks(settled(withGame(started, (prevGame) => ({ ...prevGame, heroes: [{ ...hero, activeItems: { amulet: itemId } }], pendingRewards: [] }))), {
				...decksOf(started),
				artifactDeck: {
					available: [artifactId],
					discarded: [],
					removed: [],
				},
			});

		const result = reducer(testEngine, state, {
			type: "USE_ITEM",
			payload: { itemId, heroId: hero.id },
		});

		expect(heroesOf(result)[0]?.activeItems.amulet).toBeUndefined();
		expect(gameOf(result).pendingRewards).toHaveLength(0);
		expect(gameOf(result).groupArtifacts).toContainEqual({
			cardId: artifactId,
			carriedBy: null,
		});
		expect(deckOf(result, "artifactDeck").available).not.toContain(artifactId);
	});

	it("Saque Místico descarta o item mesmo quando ele está equipado no slot especial", () => {
		const base = createInitialGameState({ heroCardIds: [HERO] });
		const started = reducer(testEngine, base, {
			type: "START_GAME",
			payload: { heroCardIds: [HERO] },
		});
		const hero = heroesOf(started)[0];
		if (!hero) throw new Error("no hero");

		const itemId = "item_torn_depths_map";
		const artifactId = "artifact_ancient_ember_heart";
		const state: GameState = withDecks(settled(withGame(started, (prevGame) => ({ ...prevGame, heroes: [
				{
					...hero,
					activeItems: { ...hero.activeItems, amulet: itemId },
					backpack: [],
				},
			], pendingRewards: [] }))), {
				...decksOf(started),
				artifactDeck: {
					available: [artifactId],
					discarded: [],
					removed: [],
				},
			});

		const result = reducer(testEngine, state, {
			type: "USE_ITEM",
			payload: { itemId, heroId: hero.id },
		});

		expect(heroesOf(result)[0]?.activeItems.amulet).toBeUndefined();
		expect(gameOf(result).pendingRewards).toHaveLength(0);
		expect(gameOf(result).groupArtifacts[0]).toMatchObject({
			cardId: artifactId,
			carriedBy: null,
		});
	});

	it("não permite usar item guardado na mochila durante o combate", () => {
		let s = stateWithHeroesAndEnemy([CLERIC, HERO]);
		s = reducer(testEngine, s, { type: "START_COMBAT" });
		const hero = heroesOf(s)[0];
		if (!hero) throw new Error("no hero");
		const itemId = "item_ancient_iron_key";
		const artifactId = "artifact_crimson_jailer_chain";
		s = withDecks(settled(withGame(s, (prevGame) => ({ ...prevGame, heroes: [{ ...hero, backpack: [itemId] }, ...heroesOf(s).slice(1)] }))), {
				...decksOf(s),
				artifactDeck: {
					available: [artifactId],
					discarded: [],
					removed: [],
				},
			});
		s = reducer(testEngine, s, {
			type: "CHOOSE_HERO_FOR_ROUND",
			payload: { heroId: hero.id },
		});

		const result = reducer(testEngine, s, {
			type: "USE_ITEM",
			payload: { itemId, heroId: hero.id },
		});

		expect(heroesOf(result)[0]?.backpack).toContain(itemId);
		expect(gameOf(result).combat?.heroesActed).not.toContain(hero.id);
		expect(gameOf(result).combat?.disabled[`hero:${hero.id}`]).toBeUndefined();
		expect(gameOf(result).status).toBe("HERO_ACTION");
		expect(gameOf(result).combat?.phase).toBe("selecting_target");
		expect(gameOf(result).groupArtifacts).toHaveLength(0);
	});

	it("item que derrota a última criatura encaminha o combate para recompensa", () => {
		let s = stateWithRoomAndEnemy(10, 1);
		s = reducer(testEngine, s, { type: "START_COMBAT" });
		const hero = heroesOf(s)[0];
		const enemy = enemiesOf(s)[0];
		if (!hero || !enemy) throw new Error("estado de combate inválido");
		s = reducer(testEngine, s, {
			type: "CHOOSE_HERO_FOR_ROUND",
			payload: { heroId: hero.id },
		});
		s = settled(withGame(s, (prevGame) => ({ ...prevGame, heroes: [{ ...hero, activeItems: { hand1: "item_living_ember_potion" } }], activeEnemies: [{ ...enemy, currentLife: 1 }] })));

		const afterItem = reducer(testEngine, s, {
			type: "USE_ITEM",
			payload: {
				itemId: "item_living_ember_potion",
				heroId: hero.id,
				targetEnemyId: enemy.id,
			},
		});

		expect(enemiesOf(afterItem)[0]?.status).toBe("defeated");
		expect(gameOf(afterItem).status).toBe("CHECK_COMBAT_END");
		const completed = reducer(testEngine, afterItem, { type: "CHECK_COMBAT_END" });
		expect(gameOf(completed).status).toBe("REWARD_PHASE");
		expect(enemiesOf(completed)).toEqual([]);
	});

	it("usar habilidade manual preserva o ataque", () => {
		let s = stateWithHeroesAndEnemy([CLERIC, HERO]);
		s = reducer(testEngine, s, { type: "START_COMBAT" });
		const hero = heroesOf(s)[0];
		if (!hero) throw new Error("no hero");
		s = reducer(testEngine, s, {
			type: "CHOOSE_HERO_FOR_ROUND",
			payload: { heroId: hero.id },
		});

		const afterSkill = reducer(testEngine, s, {
			type: "USE_SKILL",
			payload: {
				skillId: "skill_last_light_healing",
				sourceId: hero.id,
				targetIds: [hero.id],
			},
		});
		const attack = reducer(testEngine, afterSkill, {
			type: "CHOOSE_TARGET",
			payload: { heroId: hero.id, enemyId: enemiesOf(s)[0]!.id },
		});

		expect(gameOf(afterSkill).combat?.heroesActed).not.toContain(hero.id);
		expect(gameOf(afterSkill).combat?.phase).toBe("selecting_target");
		expect(gameOf(attack).status).toBe("ROLL_DICE");
	});

	it("habilidade manual com múltiplos alvos abre seleção e resolve no alvo escolhido", () => {
		let s = stateWithHeroesAndEnemy([CLERIC, HERO]);
		s = reducer(testEngine, s, { type: "START_COMBAT" });
		const cleric = heroesOf(s).find((h) => h.cardId === CLERIC);
		const ally = heroesOf(s).find((h) => h.cardId === HERO);
		if (!cleric || !ally) throw new Error("invalid heroes");

		s = settled(withGame(s, (prevGame) => ({ ...prevGame, heroes: heroesOf(s).map((h) =>
				h.id === ally.id ? { ...h, currentLife: 5 } : h,
			) })));
		s = reducer(testEngine, s, {
			type: "CHOOSE_HERO_FOR_ROUND",
			payload: { heroId: cleric.id },
		});

		const pending = reducer(testEngine, s, {
			type: "USE_SKILL",
			payload: {
				skillId: "skill_last_light_healing",
				sourceId: cleric.id,
			},
		});
		expect(pendingSkillTargetOf(pending)).toMatchObject({
			skillId: "skill_last_light_healing",
			sourceId: cleric.id,
		});
		expect(pendingSkillTargetOf(pending)?.candidates.map((c) => c.id)).toEqual(
			expect.arrayContaining([cleric.id, ally.id]),
		);

		const result = reducer(testEngine, pending, {
			type: "SELECT_SKILL_TARGET",
			payload: { targetId: ally.id },
		});

		expect(pendingSkillTargetOf(result)).toBeUndefined();
		expect(heroesOf(result).find((h) => h.id === ally.id)?.currentLife).toBe(8);
		expect(gameOf(result).combat?.heroesActed).not.toContain(cleric.id);
		expect(gameOf(result).combat?.phase).toBe("selecting_target");
	});

	it("habilidade ativa pode ser usada fora de combate sem consumir ação de rodada", () => {
		const s = stateWithHeroesAndEnemy([CLERIC, HERO]);
		const cleric = heroesOf(s).find((h) => h.cardId === CLERIC);
		const ally = heroesOf(s).find((h) => h.cardId === HERO);
		if (!cleric || !ally) throw new Error("invalid heroes");

		const result = reducer(testEngine, 
			settled(withGame(s, (prevGame) => ({ ...prevGame, status: "XP_SPEND_PHASE", combat: null, heroes: heroesOf(s).map((h) =>
					h.id === ally.id ? { ...h, currentLife: 5 } : h,
				) }))),
			{
				type: "USE_SKILL",
				payload: {
					skillId: "skill_last_light_healing",
					sourceId: cleric.id,
					targetIds: [ally.id],
				},
			},
		);

		expect(heroesOf(result).find((h) => h.id === ally.id)?.currentLife).toBe(8);
		expect(gameOf(result).combat).toBeNull();
		expect(gameOf(result).status).toBe("XP_SPEND_PHASE");
	});

	it("nova rodada reativa heróis desativados por rodada", () => {
		let s = stateWithHeroesAndEnemy([CLERIC]);
		s = reducer(testEngine, s, { type: "START_COMBAT" });
		const hero = heroesOf(s)[0];
		if (!hero) throw new Error("no hero");
		s = reducer(testEngine, s, {
			type: "CHOOSE_HERO_FOR_ROUND",
			payload: { heroId: hero.id },
		});
		s = reducer(testEngine, s, {
			type: "USE_SKILL",
			payload: {
				skillId: "skill_last_light_healing",
				sourceId: hero.id,
				targetIds: [hero.id],
			},
		});

		const nextRound = reducer(testEngine, s, { type: "CHECK_COMBAT_END" });

		expect(gameOf(nextRound).combat?.heroesActed).toHaveLength(0);
		expect(gameOf(nextRound).combat?.disabled[`hero:${hero.id}`]).toBeUndefined();
		expect(gameOf(nextRound).status).toBe("HERO_ACTION");
		expect(gameOf(nextRound).combat?.phase).toBe("selecting_hero");
	});

	it("habilidade do Paladino dispara automaticamente no início do combate em dungeon 3+", () => {
		let s = stateWithHeroesAndEnemy([PALADIN]);
		const hero = heroesOf(s)[0];
		if (!hero) throw new Error("no hero");

		s = reducer(testEngine, withAwakening(s, 3), { type: "START_COMBAT" });

		expect(pendingTriggerInterruptOf(s)).toBeUndefined();
		expect(getModifierTotal(gameOf(s).world, hero.id, "hit_bonus")).toBe(2);
		expect(getModifierTotal(gameOf(s).world, hero.id, "damage_dealt")).toBe(2);
	});

	it("habilidade do Guerreiro pode proteger aliado antes do dano sem desativá-lo", () => {
		let s = stateWithHeroesAndEnemy([WARRIOR, CLERIC]);
		s = reducer(testEngine, s, { type: "START_COMBAT" });
		const warrior = heroesOf(s).find((h) => h.cardId === WARRIOR);
		const cleric = heroesOf(s).find((h) => h.cardId === CLERIC);
		const enemy = enemiesOf(s)[0];
		if (!warrior || !cleric || !enemy || !gameOf(s).combat) {
			throw new Error("invalid combat");
		}
		s = reducer(testEngine, s, {
			type: "USE_SKILL",
			payload: {
				skillId: "skill_bastion_guard",
				sourceId: warrior.id,
			},
		});
		expect(gameOf(s).preparedAbilities).toBeDefined();

		s = settled(withGame(s, (prevGame) => ({ ...prevGame, status: "RESOLVE_ATTACK", combat: {
				...gameOf(s).combat!,
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
			}, heroes: heroesOf(s).map((hero) =>
				hero.id === cleric.id ? { ...hero, currentLife: 10 } : hero,
			), activeEnemies: [{ ...enemy, damage: 5 }] })));

		const result = reducer(testEngine, s, { type: "RESOLVE_ATTACK" });
		expect(pendingTriggerInterruptOf(result)).toBeUndefined();

		const updatedCleric = heroesOf(result).find((h) => h.id === cleric.id);
		expect(updatedCleric?.currentLife).toBe(10 - (6 - 3));
		expect(gameOf(result).combat?.disabled[`hero:${warrior.id}`]).toBeUndefined();
	});

	it("item equipado de bloqueio reduz o dano sofrido pelo herói", () => {
		let s = stateWithRoomAndEnemy(12, 8);
		s = reducer(testEngine, s, { type: "START_COMBAT" });
		const hero = heroesOf(s)[0];
		const enemy = enemiesOf(s)[0];
		if (!hero || !enemy || !gameOf(s).combat) throw new Error("invalid combat");

		const result = reducer(testEngine, 
			settled(withGame(s, (prevGame) => ({ ...prevGame, status: "RESOLVE_ATTACK", heroes: [
					{
						...hero,
						currentLife: 12,
						hitBonus: 0,
						activeItems: { hand1: "item_ancient_metal_armor" },
					},
				], activeEnemies: [{ ...enemy, damage: 5, currentLife: 8 }], combat: {
					...gameOf(s).combat!,
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
				} }))),
			{ type: "RESOLVE_ATTACK" },
		);

		expect(heroesOf(result)[0]?.currentLife).toBe(8);
		expect(gameOf(result).eventLog.at(-1)).toContain("Armadura de Metal Antigo -2");
	});

	it("item equipado de dano aumenta o dano efetivo quando a margem da rolagem permite", () => {
		let s = stateWithRoomAndEnemy(12, 10);
		s = reducer(testEngine, s, { type: "START_COMBAT" });
		const hero = heroesOf(s)[0];
		const enemy = enemiesOf(s)[0];
		if (!hero || !enemy || !gameOf(s).combat) throw new Error("invalid combat");

		const result = reducer(testEngine, 
			settled(withGame(s, (prevGame) => ({ ...prevGame, status: "RESOLVE_ATTACK", heroes: [
					{
						...hero,
						activeItems: { hand1: "item_broken_stone_hammer" },
					},
				], activeEnemies: [{ ...enemy, currentLife: 10 }], combat: {
					...gameOf(s).combat!,
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
				} }))),
			{ type: "RESOLVE_ATTACK" },
		);

		expect(enemiesOf(result)[0]?.currentLife).toBe(10 - hero.damage - 2);
		expect(gameOf(result).eventLog.join("\n")).toContain(
			"Martelo de Pedra Quebrada +2",
		);
	});

	it("ataque normal preserva o herói como fonte para gatilhos após acertar", () => {
		let s = stateWithRoomAndEnemy(12, 5);
		s = reducer(testEngine, s, { type: "START_COMBAT" });
		const hero = heroesOf(s)[0];
		const enemy = enemiesOf(s)[0];
		if (!hero || !enemy || !gameOf(s).combat) throw new Error("invalid combat");

		const result = reducer(testEngine, 
			settled(withGame(withAwakening(s, 4), (prevGame) => ({ ...prevGame, oncePer: { ...gameOf(s).oncePer, game: {} }, status: "RESOLVE_ATTACK", activeEnemies: [
					{
						...enemy,
						cardId: "creature_wet_stone_slime",
						maxLife: 5,
						currentLife: 5,
					},
				], combat: {
					...gameOf(s).combat!,
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
				} }))),
			{ type: "RESOLVE_ATTACK" },
		);
		expect(pendingTriggerInterruptOf(result)).toBeUndefined();
	});
});

describe("cancelamento de habilidade voluntária", () => {
	it("cancelar seleção de alvo preserva uso e ataque", () => {
		const started = reducer(testEngine, createInitialGameState({ heroCardIds: [HERO] }), {
			type: "START_GAME",
			payload: { heroCardIds: [HERO] },
		});
		const hero = heroesOf(started)[0]!;
		const state: GameState = withPendingSkillTarget(withGame(started, (prevGame) => ({ ...prevGame, status: "HERO_ACTION", combat: {
				...gameOf(started).combat!,
				phase: "selecting_target",
				selectedHeroId: hero.id,
			} })), {
				skillId: "skill_rift_second_chance",
				sourceId: hero.id,
				prompt: "Escolha um alvo",
				candidates: [{ id: "e1", label: "Inimigo", kind: "enemy" }],
			});

		const result = reducer(testEngine, state, { type: "CANCEL_SKILL_TARGET" });
		expect(pendingSkillTargetOf(result)).toBeUndefined();
		expect(
			scopedFlagOf(result, "combat", "oncePer", `skill_rift_second_chance::${hero.id}`) || undefined,
		).toBeUndefined();
		expect(gameOf(result).combat?.heroesActed).not.toContain(hero.id);
	});
});

// ─── Testes de exploração ────────────────────────────────────────────────────

describe("REVEAL_ROOM", () => {
	it("remove carta do deck e cria sala atual", () => {
		const base = createInitialGameState({ heroCardIds: [HERO] });
		let s = reducer(testEngine, base, {
			type: "START_GAME",
			payload: { heroCardIds: [HERO] },
		});
		const deckSizeBefore = deckOf(s, "dungeonDeck").available.length;
		s = withGame(s, (prevGame) => ({ ...prevGame, currentRoom: null, status: "REVEAL_ROOM" }));
		s = reducer(testEngine, s, { type: "REVEAL_ROOM" });
		expect(gameOf(s).currentRoom).not.toBeNull();
		expect(deckOf(s, "dungeonDeck").available.length).toBe(deckSizeBefore - 1);
		expect(gameOf(s).status).toBe("ROOM_EFFECT");
	});

	it("transita para DUNGEON_EXHAUSTED quando deck vazio e XP suficiente", () => {
		const base = createInitialGameState({ heroCardIds: [HERO] });
		let s = reducer(testEngine, base, {
			type: "START_GAME",
			payload: { heroCardIds: [HERO] },
		});
		s = withDecks(withGame(s, (prevGame) => ({ ...prevGame, groupXp: 10, currentRoom: null, status: "REVEAL_ROOM" })), {
				...decksOf(s),
				dungeonDeck: {
					available: [],
					discarded: ["room_narrow_corridor"],
					removed: [],
				},
			});
		s = reducer(testEngine, s, { type: "REVEAL_ROOM" });
		expect(gameOf(s).status).toBe("DUNGEON_EXHAUSTED");
	});

	it("transita para DEFEAT quando deck vazio sem XP", () => {
		const base = createInitialGameState({ heroCardIds: [HERO] });
		let s = reducer(testEngine, base, {
			type: "START_GAME",
			payload: { heroCardIds: [HERO] },
		});
		s = withDecks(withGame(s, (prevGame) => ({ ...prevGame, groupXp: 0, currentRoom: null, status: "REVEAL_ROOM" })), {
				...decksOf(s),
				dungeonDeck: { available: [], discarded: [], removed: [] },
			});
		s = reducer(testEngine, s, { type: "REVEAL_ROOM" });
		expect(gameOf(s).status).toBe("DEFEAT");
	});
});

// ─── Partida feliz: sala completa ─────────────────────────────────────────────

describe("loop de sala completo", () => {
	it("derrota inimigo, recebe recompensa, escolhe caminho", () => {
		let s = stateWithRoomAndEnemy();

		// Combate
		s = reducer(testEngine, s, { type: "START_COMBAT" });
		expect(gameOf(s).status).toBe("HERO_ACTION");

		const heroId = heroesOf(s)[0]?.id ?? "";
		const enemyId = enemiesOf(s)[0]?.id ?? "";

		s = reducer(testEngine, s, { type: "CHOOSE_TARGET", payload: { heroId, enemyId } });
		expect(gameOf(s).status).toBe("ROLL_DICE");

		s = rollDiceWithApprovals(s);
		expect(gameOf(s).status).toBe("RESOLVE_ATTACK");

		s = reducer(testEngine, s, { type: "RESOLVE_ATTACK" });
		// Após RESOLVE_ATTACK → DIRECT_DAMAGE (sem inimigos não engajados)
		s = reducer(testEngine, s, { type: "CHECK_COMBAT_END" });

		// Com hitBonus=100, herói sempre vence; inimigo tem vida=1 → é derrotado
		if (gameOf(s).status === "HERO_ACTION") {
			// Inimigo sobreviveu — faz mais uma rodada
			s = reducer(testEngine, s, { type: "CHOOSE_TARGET", payload: { heroId, enemyId } });
			s = rollDiceWithApprovals(s);
			s = reducer(testEngine, s, { type: "RESOLVE_ATTACK" });
			s = reducer(testEngine, s, { type: "CHECK_COMBAT_END" });
		}

		expect(gameOf(s).status).toBe("REWARD_PHASE");

		// Recompensa
		s = reducer(testEngine, s, { type: "GRANT_REWARDS" });
		expect(gameOf(s).status).toBe("XP_SPEND_PHASE");
		expect(gameOf(s).groupXp).toBeGreaterThan(0);

		// Pular gasto de XP avança por sorteio oculto da próxima sala
		s = reducer(testEngine, s, { type: "CHECK_BOSS_CONDITION" });

		// Sem artefatos suficientes → avança para REVEAL_ROOM
		expect(gameOf(s).status).toBe("ROOM_EFFECT");
		expect(gameOf(s).currentRoom).not.toBeNull();
		expect(gameOf(s).paths).toHaveLength(0);
		expect(gameOf(s).roomsCleared).toBe(1);
	});

	it("habilidade preparada resolve sem confirmação antes da rolagem", () => {
		let s = stateWithRoomAndEnemy();
		s = reducer(testEngine, s, { type: "START_COMBAT" });

		const heroId = heroesOf(s)[0]?.id ?? "";
		const enemyId = enemiesOf(s)[0]?.id ?? "";
		s = reducer(testEngine, s, {
			type: "USE_SKILL",
			payload: { skillId: "skill_crimson_fury", sourceId: heroId },
		});
		expect(Object.values(gameOf(s).preparedAbilities ?? {})).toHaveLength(1);
		s = reducer(testEngine, s, { type: "CHOOSE_TARGET", payload: { heroId, enemyId } });

		s = reducer(testEngine, s, { type: "ROLL_DICE" });
		expect(pendingTriggerInterruptOf(s)).toBeUndefined();
		expect(gameOf(s).status).toBe("RESOLVE_ATTACK");
		expect(heroesOf(s)[0]?.currentLife).toBeLessThan(12);
		expect(Object.values(gameOf(s).preparedAbilities ?? {})).toHaveLength(0);
	});

	it("habilidade não preparada não interrompe a rolagem", () => {
		let s = stateWithRoomAndEnemy();
		s = reducer(testEngine, s, { type: "START_COMBAT" });

		const heroId = heroesOf(s)[0]?.id ?? "";
		const enemyId = enemiesOf(s)[0]?.id ?? "";
		s = reducer(testEngine, s, { type: "CHOOSE_TARGET", payload: { heroId, enemyId } });
		s = reducer(testEngine, s, { type: "ROLL_DICE" });

		expect(pendingTriggerInterruptOf(s)).toBeUndefined();
		expect(gameOf(s).status).toBe("RESOLVE_ATTACK");
	});
});

// ─── Derrota por herói ───────────────────────────────────────────────────────

describe("derrota por herói", () => {
	it("herói com 1 de vida morre no dano direto", () => {
		let s = stateWithRoomAndEnemy(1, 999); // herói fraco, inimigo imortal

		s = reducer(testEngine, s, { type: "START_COMBAT" });
		const heroId = heroesOf(s)[0]?.id ?? "";
		const enemyId = enemiesOf(s)[0]?.id ?? "";

		// Torna o herói fraco e o inimigo forte no par
		s = settled(withGame(s, (prevGame) => ({ ...prevGame, heroes: heroesOf(s).map((h) => ({ ...h, hitBonus: 0, currentLife: 1 })), activeEnemies: enemiesOf(s).map((e) => ({
				...e,
				hitBonus: 1000,
				damage: 99,
			})) })));

		s = reducer(testEngine, s, { type: "CHOOSE_TARGET", payload: { heroId, enemyId } });
		s = rollDiceWithApprovals(s);
		s = reducer(testEngine, s, { type: "RESOLVE_ATTACK" });

		// Após damage, herói deve estar com vida <= 0
		const hero = heroesOf(s)[0];
		expect(hero?.currentLife).toBeLessThanOrEqual(0);

		s = reducer(testEngine, s, { type: "CHECK_COMBAT_END" });
		expect(gameOf(s).status).toBe("DEFEAT");
	});
});

// ─── Derrota por deck esgotado ───────────────────────────────────────────────

describe("derrota por deck esgotado", () => {
	it("sem XP e sem cartas → derrota direta", () => {
		const base = createInitialGameState({ heroCardIds: [HERO] });
		let s = reducer(testEngine, base, {
			type: "START_GAME",
			payload: { heroCardIds: [HERO] },
		});
		s = withDecks(withGame(s, (prevGame) => ({ ...prevGame, groupXp: 0, currentRoom: null, status: "REVEAL_ROOM" })), {
				...decksOf(s),
				dungeonDeck: { available: [], discarded: [], removed: [] },
			});
		s = reducer(testEngine, s, { type: "REVEAL_ROOM" });
		expect(gameOf(s).status).toBe("DEFEAT");
	});

	it("com XP → DUNGEON_EXHAUSTED; gastar 5 XP → reembaralha", () => {
		const base = createInitialGameState({ heroCardIds: [HERO] });
		let s = reducer(testEngine, base, {
			type: "START_GAME",
			payload: { heroCardIds: [HERO] },
		});
		s = withDecks(withGame(s, (prevGame) => ({ ...prevGame, groupXp: 10, currentRoom: null, status: "REVEAL_ROOM" })), {
				...decksOf(s),
				dungeonDeck: {
					available: [],
					discarded: ["room_narrow_corridor", "room_dungeon_room"],
					removed: [],
				},
			});
		s = reducer(testEngine, s, { type: "REVEAL_ROOM" });
		expect(gameOf(s).status).toBe("DUNGEON_EXHAUSTED");

		s = reducer(testEngine, s, {
			type: "SPEND_XP",
			payload: { option: "recover_dungeon" },
		});
		expect(gameOf(s).status).toBe("ROOM_EFFECT");
		expect(gameOf(s).currentRoom).not.toBeNull();
		expect(gameOf(s).groupXp).toBe(5);
		expect(deckOf(s, "dungeonDeck").available.length).toBe(1);
	});
});

// ─── Regras v2 §8.8 — combate múltiplo ───────────────────────────────────────

describe("combate múltiplo v2 (§8.8)", () => {
	function stateWithTwoHeroesOneEnemy(): GameState {
		const HERO2 = PALADIN;
		const base = createInitialGameState({ heroCardIds: [HERO, HERO2] });
		const s = reducer(testEngine, base, {
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

		return settled(withGame(s, (prevGame) => ({ ...prevGame, heroes: heroesOf(s).map((h) => ({ ...h, hitBonus: 100 })), currentRoom: room, activeEnemies: [enemy], status: "COMBAT_START", oncePer: {
				...gameOf(s).oncePer,
				game: {
					...gameOf(s).oncePer.game,
					[`power_mighty_crimson_fury::${heroesOf(s)[0]?.id ?? ""}`]: true,
				},
			} })));
	}

	it("dois heróis podem atacar o mesmo inimigo (antes era rejeitado)", () => {
		let s = stateWithTwoHeroesOneEnemy();
		s = reducer(testEngine, s, { type: "START_COMBAT" });

		const [hero1, hero2] = heroesOf(s);
		const enemyId = enemiesOf(s)[0]?.id ?? "";

		// Herói 1 seleciona o inimigo
		s = reducer(testEngine, s, {
			type: "CHOOSE_TARGET",
			payload: { heroId: hero1!.id, enemyId },
		});
		expect(gameOf(s).status).toBe("ROLL_DICE");

		// Rola e resolve o combate do herói 1
		s = rollDiceWithApprovals(s);
		s = reducer(testEngine, s, { type: "RESOLVE_ATTACK" });

		// Agora herói 2 deve poder selecionar o MESMO inimigo — v2 permite
		expect(gameOf(s).status).toBe("HERO_ACTION");
		s = reducer(testEngine, s, {
			type: "CHOOSE_TARGET",
			payload: { heroId: hero2!.id, enemyId },
		});
		expect(gameOf(s).status).toBe("ROLL_DICE");
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
		s = settled(withGame(s, (prevGame) => ({ ...prevGame, activeEnemies: [...enemiesOf(s), unattacked] })));

		s = reducer(testEngine, s, { type: "START_COMBAT" });
		const [hero1, hero2] = heroesOf(s);
		const attackedId = "e1";

		// Ambos heróis atacam o mesmo inimigo (e1), deixando e2 sem atacante
		s = reducer(testEngine, s, {
			type: "CHOOSE_TARGET",
			payload: { heroId: hero1!.id, enemyId: attackedId },
		});
		s = rollDiceWithApprovals(s);
		s = reducer(testEngine, s, { type: "RESOLVE_ATTACK" });

		s = reducer(testEngine, s, {
			type: "CHOOSE_TARGET",
			payload: { heroId: hero2!.id, enemyId: attackedId },
		});
		s = rollDiceWithApprovals(s);
		s = reducer(testEngine, s, { type: "RESOLVE_ATTACK" });

		// Sem inimigo excedente numérico, e2 não faz rolagem extra.
		const totalLifeBefore = heroesOf(s).reduce((acc, h) => acc + h.currentLife, 0);
		s = reducer(testEngine, s, { type: "DIRECT_DAMAGE" });
		const totalLifeAfter = heroesOf(s).reduce((acc, h) => acc + h.currentLife, 0);

		expect(totalLifeAfter).toBe(totalLifeBefore);
		expect(gameOf(s).extraAttackFeedback).toBeUndefined();
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
		s = settled(withGame(s, (prevGame) => ({ ...prevGame, activeEnemies: [...enemiesOf(s), ...extraEnemies] })));

		s = reducer(testEngine, s, { type: "START_COMBAT" });
		const [hero1, hero2] = heroesOf(s);
		const attackedId = "e1";

		s = reducer(testEngine, s, {
			type: "CHOOSE_TARGET",
			payload: { heroId: hero1!.id, enemyId: attackedId },
		});
		s = rollDiceWithApprovals(s);
		s = reducer(testEngine, s, { type: "RESOLVE_ATTACK" });

		s = reducer(testEngine, s, {
			type: "CHOOSE_TARGET",
			payload: { heroId: hero2!.id, enemyId: attackedId },
		});
		s = rollDiceWithApprovals(s);
		s = reducer(testEngine, s, { type: "RESOLVE_ATTACK" });

		const totalLifeBefore = heroesOf(s).reduce((acc, h) => acc + h.currentLife, 0);
		s = reducer(testEngine, s, { type: "DIRECT_DAMAGE" });
		const totalLifeAfter = heroesOf(s).reduce((acc, h) => acc + h.currentLife, 0);

		expect(pendingTriggerInterruptOf(s)).toBeUndefined();
		expect(totalLifeBefore - totalLifeAfter).toBe(3);
		expect(gameOf(s).eventLog.some((entry) => entry.includes("Ataque extra"))).toBe(
			true,
		);
		expect(gameOf(s).extraAttackFeedback?.at(-1)).toMatchObject({
			enemyId: "e2",
			enemyCardId: "test_extra_enemy_wins",
		});
		expect(gameOf(s).damageFeedback?.at(-1)?.extraAttackId).toBe(
			gameOf(s).extraAttackFeedback?.at(-1)?.id,
		);
	});

	it("inimigo excedente que erra ainda registra a investida visual", () => {
		const base = stateWithTwoHeroesOneEnemy();
		const [firstHero, secondHero] = heroesOf(base);
		const firstEnemy = enemiesOf(base)[0]!;
		const hero = { ...firstHero!, hitBonus: 1000 };
		const enemy = {
			...firstEnemy,
			id: "e2",
			cardId: "test_extra_enemy_misses",
			hitBonus: -1000,
		};
		const state: GameState = settled(withGame(base, (prevGame) => ({
			...prevGame,
			status: "DIRECT_DAMAGE",
			heroes: [hero, { ...secondHero!, status: "defeated" }],
			activeEnemies: [firstEnemy, enemy],
			combat: {
				...createEmptyCombatState(),
				pairs: [{ heroId: hero.id, enemyId: "e1" }],
			},
		})));
		const result = reducer(testEngine, state, { type: "DIRECT_DAMAGE" });
		expect(gameOf(result).extraAttackFeedback?.at(-1)).toMatchObject({
			enemyId: "e2",
			heroId: hero.id,
		});
		expect(gameOf(result).damageFeedback).toBeUndefined();
	});
});

// ─── Vitória contra boss ──────────────────────────────────────────────────────

describe("vitória contra boss", () => {
	it("boss com 1 de vida é derrotado na primeira rodada", () => {
		const base = createInitialGameState({ heroCardIds: [HERO] });
		let s = reducer(testEngine, base, {
			type: "START_GAME",
			payload: { heroCardIds: [HERO] },
		});

		// Força 2 artefatos (condição do Azhakar) e vai pelo fluxo correto
		s = withGame(s, (prevGame) => ({ ...prevGame, groupArtifacts: [
				{
					cardId: "artifact_crimson_jailer_chain",
					carriedBy: null,
				},
				{
					cardId: "artifact_ancient_ember_heart",
					carriedBy: null,
				},
			], status: "BOSS_REVEAL" as const }));

		s = reducer(testEngine, s, { type: "REVEAL_BOSS" });
		expect(gameOf(s).status).toBe("BOSS_COMBAT");

		const bossId = enemiesOf(s).find((e) => e.id === "boss")?.id ?? "";
		expect(bossId).toBe("boss");

		// Seta boss com 1 de vida e herói com hitBonus altíssimo
		s = settled(withGame(s, (prevGame) => ({ ...prevGame, heroes: heroesOf(s).map((h) => ({ ...h, hitBonus: 1000, damage: 99 })), activeEnemies: enemiesOf(s).map((e) =>
				e.id === "boss" ? { ...e, currentLife: 1, hitBonus: 0 } : e,
			) })));

		const heroId = heroesOf(s)[0]?.id ?? "";
		s = reducer(testEngine, s, {
			type: "CHOOSE_TARGET",
			payload: { heroId, enemyId: "boss" },
		});
		s = rollDiceWithApprovals(s);
		s = reducer(testEngine, s, { type: "RESOLVE_ATTACK" });

		expect(gameOf(s).status).toBe("VICTORY");
		expect(gameOf(s).bossDefeated).toBe(true);
	});
});

// ─── Boss sobrevive a uma rodada ─────────────────────────────────────────────

describe("boss sobrevive a uma rodada", () => {
	it("após RESOLVE_ATTACK phase reinicia para selecting_hero", () => {
		const base = createInitialGameState({ heroCardIds: [HERO] });
		let s = reducer(testEngine, base, {
			type: "START_GAME",
			payload: { heroCardIds: [HERO] },
		});

		s = withGame(s, (prevGame) => ({ ...prevGame, groupArtifacts: [
				{
					cardId: "artifact_crimson_jailer_chain",
					carriedBy: null,
				},
				{
					cardId: "artifact_ancient_ember_heart",
					carriedBy: null,
				},
			], status: "BOSS_REVEAL" as const }));

		s = reducer(testEngine, s, { type: "REVEAL_BOSS" });

		// Boss com vida alta e herói com dano baixo → boss sobrevive
		s = settled(withGame(s, (prevGame) => ({ ...prevGame, heroes: heroesOf(s).map((h) => ({ ...h, hitBonus: 1000, damage: 1 })), activeEnemies: enemiesOf(s).map((e) =>
				e.id === "boss" ? { ...e, currentLife: 999, hitBonus: 0 } : e,
			) })));

		const heroId = heroesOf(s)[0]?.id ?? "";
		s = reducer(testEngine, s, {
			type: "CHOOSE_TARGET",
			payload: { heroId, enemyId: "boss" },
		});
		s = rollDiceWithApprovals(s);
		s = reducer(testEngine, s, { type: "RESOLVE_ATTACK" });

		expect(gameOf(s).status).toBe("BOSS_COMBAT");
		expect(gameOf(s).combat?.phase).toBe("selecting_hero");
		expect(gameOf(s).combat?.selectedHeroId).toBeNull();
		expect(gameOf(s).combat?.pairs).toHaveLength(0);
		expect(gameOf(s).combat?.heroesActed).toHaveLength(0);
	});
});

// ─── Testes de actionLog (Passo 1) ───────────────────────────────────────────

describe("actionLog", () => {
	const base = () => createInitialGameState({ heroCardIds: [HERO] });

	it("actionLog.length === N após N dispatches", () => {
		let s = reducer(testEngine, base(), {
			type: "START_GAME",
			payload: { heroCardIds: [HERO] },
		});
		// START_GAME reinicia o log com exatamente 1 entrada
		expect(gameOf(s).actionLog).toHaveLength(1);

		s = reducer(testEngine, s, { type: "REVEAL_ROOM" });
		expect(gameOf(s).actionLog).toHaveLength(2);

		s = reducer(testEngine, s, { type: "RESOLVE_ROOM_EFFECT" });
		expect(gameOf(s).actionLog).toHaveLength(3);
	});

	it("actionLog[i].seq === i para todo i", () => {
		let s = reducer(testEngine, base(), {
			type: "START_GAME",
			payload: { heroCardIds: [HERO] },
		});
		s = reducer(testEngine, s, { type: "REVEAL_ROOM" });
		s = reducer(testEngine, s, { type: "RESOLVE_ROOM_EFFECT" });

		for (let i = 0; i < gameOf(s).actionLog.length; i++) {
			expect(gameOf(s).actionLog[i]?.seq).toBe(i);
		}
	});

	it("actionLog[i].action é exatamente a action passada (deep equal)", () => {
		const startAction = {
			type: "START_GAME" as const,
			payload: { heroCardIds: [HERO] },
		};
		const revealAction = { type: "REVEAL_ROOM" as const };

		let s = reducer(testEngine, base(), startAction);
		s = reducer(testEngine, s, revealAction);

		expect(gameOf(s).actionLog[0]?.action).toEqual(startAction);
		expect(gameOf(s).actionLog[1]?.action).toEqual(revealAction);
	});

	it("START_GAME reinicia o actionLog com exatamente uma entrada", () => {
		let s = reducer(testEngine, base(), {
			type: "START_GAME",
			payload: { heroCardIds: [HERO] },
		});
		s = reducer(testEngine, s, { type: "REVEAL_ROOM" });
		expect(gameOf(s).actionLog).toHaveLength(2);

		// Segunda partida: log deve recomeçar do zero
		s = reducer(testEngine, s, { type: "START_GAME", payload: { heroCardIds: [HERO] } });
		expect(gameOf(s).actionLog).toHaveLength(1);
		expect(gameOf(s).actionLog[0]?.action.type).toBe("START_GAME");
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
		let s1 = reducer(testEngine, init(), startAction);
		s1 = reducer(testEngine, s1, { type: "REVEAL_ROOM" });
		s1 = reducer(testEngine, s1, { type: "RESOLVE_ROOM_EFFECT" });
		s1 = reducer(testEngine, s1, { type: "SPAWN_ENEMIES" });

		let s2 = reducer(testEngine, init(), startAction);
		s2 = reducer(testEngine, s2, { type: "REVEAL_ROOM" });
		s2 = reducer(testEngine, s2, { type: "RESOLVE_ROOM_EFFECT" });
		s2 = reducer(testEngine, s2, { type: "SPAWN_ENEMIES" });

		// Estados finais são idênticos
		expect(deckOf(s1, "dungeonDeck").available).toEqual(
			deckOf(s2, "dungeonDeck").available,
		);
		expect(heroesOf(s1)[0]?.id).toBe(heroesOf(s2)[0]?.id);
		expect(gameOf(s1).rng).toEqual(gameOf(s2).rng);
	});

	it("replay determinístico: aplicar actionLog produz o mesmo GameState final", () => {
		// Constrói uma sequência de actions
		let s = reducer(testEngine, init(), startAction);
		s = reducer(testEngine, s, { type: "REVEAL_ROOM" });
		s = reducer(testEngine, s, { type: "RESOLVE_ROOM_EFFECT" });
		s = reducer(testEngine, s, { type: "SPAWN_ENEMIES" });
		const finalState = s;
		const log = gameOf(s).actionLog;

		// Replay: aplica o log sobre estado inicial via reducerCore
		const replayed = log.reduce(
			(acc, entry) => reducerCore(testEngine, acc, entry.action),
			init(),
		);

		expect(deckOf(replayed, "dungeonDeck").available).toEqual(
			deckOf(finalState, "dungeonDeck").available,
		);
		expect(heroesOf(replayed)[0]?.id).toBe(heroesOf(finalState)[0]?.id);
		expect(gameOf(replayed).rng).toEqual(gameOf(finalState).rng);
	});

	it("seeds diferentes → ao menos um resultado de deck diferente", () => {
		const s1 = reducer(testEngine, init(), {
			...startAction,
			payload: { ...startAction.payload, seed: 1 },
		});
		const s2 = reducer(testEngine, init(), {
			...startAction,
			payload: { ...startAction.payload, seed: 999 },
		});
		const same =
			deckOf(s1, "dungeonDeck").available.join(",") ===
			deckOf(s2, "dungeonDeck").available.join(",");
		expect(same).toBe(false);
	});

	it("counter do RNG cresce monotonicamente entre actions (sem reset em meio de partida)", () => {
		let s = reducer(testEngine, init(), startAction);
		const c0 = gameOf(s).rng.counter;
		s = reducer(testEngine, s, { type: "REVEAL_ROOM" });
		const c1 = gameOf(s).rng.counter;
		// Segue o fluxo correto: ROOM_EFFECT → SPAWN_ENEMIES → COMBAT_START
		s = reducer(testEngine, s, { type: "RESOLVE_ROOM_EFFECT" });
		s = reducer(testEngine, s, { type: "SPAWN_ENEMIES" });
		const c2 = gameOf(s).rng.counter;
		expect(c1).toBeGreaterThanOrEqual(c0);
		expect(c2).toBeGreaterThanOrEqual(c1);
	});
});
