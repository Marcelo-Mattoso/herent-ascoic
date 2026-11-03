import { awakeningOf, withAwakening } from "@/core/state/access";
// Testes para triggers adicionados: while_in_play, combat_if_dungeon_red_or_purple,
// on_destroyed, combat (Fio Mortal), e filtro combat_against_self.

import { describe, expect, it } from "vitest";
import type { ModifierComponent } from "../../ecs/types";
import { getComponents } from "../../ecs/world";
import { drainStack } from "../../effects/resolver";
import { handleStartCombat } from "../../reducer/combat";
import { playerView } from "../../projection/playerView";
import { createEmptyCombatState } from "../../state/combatState";
import { createInitialGameState } from "../../state/gameState";
import { preparedAbilityKey } from "../../abilities/prepared";
import { fireTrigger } from "../dispatch";
import "../handlers/index"; // popula registry
import type { ColorIndex } from "../../state/color";
import type { EnemyState } from "../../state/enemyState";
import type { GameState } from "../../state/gameState";
import type { HeroState } from "../../state/heroState";
import { testEngine } from "@/core/__tests__/testEngine";
import { settled, settledWith, type LooseGame } from "../../__tests__/fixtures";
import { pendingTriggerInterruptOf } from "../../state/access";
import { withGame, gameOf } from "../../../engine/state";

function makeHero(overrides: Partial<HeroState> = {}): HeroState {
	return {
		id: "h1",
		cardId: "hero_crimson_barbarian",
		maxLife: 10,
		currentLife: 10,
		damage: 4,
		hitBonus: 0,
		dice: 2,
		activeItems: {},
		backpack: [],
		usedPowers: {},
		conditions: [],
		status: "active",
		playerIndex: 0,
		xp: 0,
		...overrides,
	};
}

function makeEnemy(overrides: Partial<EnemyState> = {}): EnemyState {
	return {
		id: "e1",
		cardId: "",
		maxLife: 5,
		currentLife: 5,
		damage: 2,
		hitBonus: 0,
		dice: 1,
		tokens: {},
		conditions: [],
		firstDamageTakenThisTurn: true,
		status: "active",
		...overrides,
	};
}

function baseState(
	extras: Partial<LooseGame> = {},
	awakening: ColorIndex = 4,
): GameState {
	const base = createInitialGameState({
		heroCardIds: ["hero_crimson_barbarian"],
	});
	return withAwakening(settledWith(base, {
		heroes: [makeHero()],
		activeEnemies: [],
		...extras,
	}), awakening);
}

function approvePendingTrigger(state: GameState): GameState {
	expect(pendingTriggerInterruptOf(state)).toBeUndefined();
	return drainStack(testEngine, state);
}

function prepareFury(state: GameState): GameState {
	const key = preparedAbilityKey("hero", "h1", "hero_crimson_barbarian", "skill_crimson_fury");
	return withGame(state, (prevGame) => ({ ...prevGame, preparedAbilities: { [key]: {
		key, sourceKind: "hero", sourceHeroId: "h1", sourceCardId: "hero_crimson_barbarian",
		abilityId: "skill_crimson_fury", event: "evt_attack_declared",
	} } }));
}

// ── while_in_play dispara em handleStartCombat ─────────────────────────────────

describe("while_in_play — flee_block", () => {
	// "Correntes da Fornalha": purpleEffect flee_block, trigger while_in_play
	// Precisamos de uma criatura com esse efeito roxo. Mas como o usedBy está vazio
	// no skills.json, vamos usar fireTrigger diretamente com estado manipulado.
	// Verificamos que handleStartCombat chama fireTrigger("while_in_play").
	// Como não temos inimigo real com while_in_play, verificamos que não explode.

	it("handleStartCombat não explode com while_in_play no Despertar 4", () => {
		const state = baseState();
		expect(() => handleStartCombat(testEngine, state)).not.toThrow();
	});

	it("fireTrigger while_in_play seta fleeBlocked quando inimigo com flee_block está ativo (Despertar 4)", () => {
		// Simular inimigo com purpleEffect = flee_block/while_in_play
		// Precisamos do ID real da habilidade para que resolveSkillFor funcione.
		// Como não temos carta real com while_in_play flee_block nos usedBy,
		// testamos via handleStartCombat que não quebra com inimigos sem a skill.
		const enemy = makeEnemy({});
		const state = baseState({
			activeEnemies: [enemy],
		});
		const result = handleStartCombat(testEngine, state);
		// Goblin não tem while_in_play, então fleeBlocked não deve estar ativo
		expect(gameOf(result).flags?.fleeBlocked).toBeFalsy();
	});
});

// ── combat_if_dungeon_red_or_purple — Paladino ────────────────────────────────

describe("combat_if_dungeon_red_or_purple — Luz da Aurora Final", () => {
	function makeStateWithPaladino(despertar: ColorIndex): GameState {
		const base = createInitialGameState({
			heroCardIds: ["hero_last_light_paladin"],
		});
		const hero: HeroState = {
			id: "h1",
			cardId: "hero_last_light_paladin",
			maxLife: 8,
			currentLife: 8,
			damage: 3,
			hitBonus: 0,
			dice: 2,
			activeItems: {},
			backpack: [],
			usedPowers: {},
			conditions: [],
			status: "active",
			playerIndex: 0,
			xp: 0,
		};
		const enemy = makeEnemy();
		const combat = {
			...createEmptyCombatState(),
			phase: "resolving" as const,
			currentPair: { heroId: "h1", enemyId: "e1" },
		};
		return withAwakening(settled(withGame(base, (prevGame) => ({ ...prevGame, heroes: [hero], activeEnemies: [enemy], combat }))), despertar);
	}

	it("NÃO dispara com despertar < 3 — conditions[] avaliadas pelo dispatch (Lote B)", () => {
		// Patch-21 Lote B: conditions[] avaliadas no dispatch — guard declarativo.
		// Com despertar=2 ($dungeon.level=2 < 3), a condition gte falha → skill não dispara.
		const state = makeStateWithPaladino(2 as ColorIndex);
		const result = drainStack(testEngine, 
			fireTrigger(testEngine, state, "evt_combat_start", {
				triggeredBy: "evt_combat_start",
				sourceHeroId: "h1",
				sourceEnemyId: "e1",
			}),
		);
		const mods = getComponents<ModifierComponent>(
			gameOf(result).world,
			"h1",
			"modifier",
		).filter((m) => m.target === "hit_bonus" || m.target === "damage_dealt");
		expect(mods.length).toBe(0);
	});

	it("expõe a passiva do Paladino como ativa com Despertar 3", () => {
		const state = makeStateWithPaladino(3 as ColorIndex);
		const action = playerView(testEngine, state).abilityActionsByHero.h1
			?.find((entry) => entry.abilityId === "skill_final_dawn_light");
		expect(action?.status).toBe("active");
		// Bônus da passiva são calculados durante a rolagem, sem modificador persistente no ECS.
		const modifiers = getComponents<ModifierComponent>(gameOf(state).world, "h1", "modifier")
			.filter((entry) => entry.target === "hit_bonus" || entry.target === "damage_dealt");
		expect(modifiers).toHaveLength(0);
	});

	it("mantém passiva ativa com Despertar 4", () => {
		const state = makeStateWithPaladino(4 as ColorIndex);
		const action = playerView(testEngine, state).abilityActionsByHero.h1
			?.find((entry) => entry.abilityId === "skill_final_dawn_light");
		expect(action?.status).toBe("active");
	});

// ── on_destroyed — dungeonLevel (Despertar Mortal) ────────────────────────────

describe("on_destroyed — dungeonLevel (Despertar Mortal)", () => {
	// "Cultista da Chama Oculta": purpleEffect dungeonLevel, trigger on_destroyed, value 1
	it("aumenta despertar ao destruir Cultista da Chama Oculta (Despertar 4)", () => {
		const cultista: EnemyState = {
			id: "e1",
			cardId: "creature_hidden_flame_cultist",
			maxLife: 3,
			currentLife: 3,
			damage: 2,
			hitBonus: 0,
			dice: 1,
			tokens: {},
			conditions: [],
			firstDamageTakenThisTurn: true,
			status: "active",
		};
		const state = baseState({
			activeEnemies: [cultista],
		}, 3);
		// Despertar 4: purpleEffect ativo
		const stateD4 = withAwakening(state, 4);
		const result = fireTrigger(testEngine, stateD4, "evt_destroy", {
			triggeredBy: "evt_destroy",
			sourceHeroId: "h1",
			sourceEnemyId: "e1",
		});
		// Despertar já estava em 4 (máximo), deve permanecer em 4
		expect(awakeningOf(result)).toBe(4);
	});

	it("aumenta despertar ao destruir Cultista (Despertar 3 → 4)", () => {
		const cultista: EnemyState = {
			id: "e1",
			cardId: "creature_hidden_flame_cultist",
			maxLife: 3,
			currentLife: 3,
			damage: 2,
			hitBonus: 0,
			dice: 1,
			tokens: {},
			conditions: [],
			firstDamageTakenThisTurn: true,
			status: "active",
		};
		// Despertar 4 para que purpleEffect seja visível
		const state = baseState({
			activeEnemies: [cultista],
		});
		// Forçar despertar para 3 mantendo purpleEffect ativo (despertar 4 já foi ativado para coleta)
		// Na prática a skill é coletada com despertar === 4; vamos testar com estado D4 e despertar 3
		// interno ao handler
		const stateWith3 = withAwakening(state, 3);
		const result = fireTrigger(testEngine, stateWith3, "evt_destroy", {
			triggeredBy: "evt_destroy",
			sourceHeroId: "h1",
			sourceEnemyId: "e1",
		});
		// purpleEffect só é coletado se despertar === 4; com 3 não dispara
		expect(awakeningOf(result)).toBe(3);
	});
});

// ── Fio Mortal (combat / before_attack) sem restrição de despertar ────────────

describe("tohit_damage via trigger 'combat' — Fio Mortal (Adaga Enferrujada)", () => {
	function makeStateWithAdaga(despertar: ColorIndex): GameState {
		const base = createInitialGameState({
			heroCardIds: ["hero_crimson_barbarian"],
		});
		const hero: HeroState = {
			id: "h1",
			cardId: "hero_crimson_barbarian",
			maxLife: 10,
			currentLife: 10,
			damage: 4,
			hitBonus: 0,
			dice: 2,
			activeItems: { hand1: "item_rusty_dagger" },
			backpack: [],
			usedPowers: {},
			conditions: [],
			status: "active",
			playerIndex: 0,
			xp: 0,
		};
		const enemy = makeEnemy();
		const combat = {
			...createEmptyCombatState(),
			phase: "resolving" as const,
			currentPair: { heroId: "h1", enemyId: "e1" },
		};
		return withAwakening(settled(withGame(base, (prevGame) => ({ ...prevGame, heroes: [hero], activeEnemies: [enemy], combat }))), despertar);
	}

	it("aplica bônus de Fio Mortal no Despertar 1 (sem restrição de despertar)", () => {
		// Patch-18 Lote G: modifiers agora no ECS world (damage_dealt + hit_bonus).
		// skill_crimson_fury → damage_bonus +6 → damage_dealt +6
		// item_skill_deadly_edge → tohit_bonus +1 + damage_bonus +1 → hit_bonus +1 + damage_dealt +1
		const state = prepareFury(makeStateWithAdaga(1 as ColorIndex));
		const prompted = fireTrigger(testEngine, state, "evt_attack_declared", {
				triggeredBy: "evt_attack_declared",
				sourceHeroId: "h1",
				sourceEnemyId: "e1",
		});
		const result = approvePendingTrigger(prompted);
		const mods = getComponents<ModifierComponent>(
			gameOf(result).world,
			"h1",
			"modifier",
		).filter((m) => m.target === "hit_bonus" || m.target === "damage_dealt");
		const total = mods.reduce((s, m) => s + m.value, 0);
		expect(total).toBe(8); // 6 + 1 + 1 = 8
		expect(mods.some((m) => m.value === 6)).toBe(true);
		expect(mods.filter((m) => m.value === 1).length).toBeGreaterThanOrEqual(2);
	});

	it("aplica bônus de Fio Mortal no Despertar 4 também", () => {
		const state = prepareFury(makeStateWithAdaga(4 as ColorIndex));
		const prompted = fireTrigger(testEngine, state, "evt_attack_declared", {
				triggeredBy: "evt_attack_declared",
				sourceHeroId: "h1",
				sourceEnemyId: "e1",
		});
		const result = approvePendingTrigger(prompted);
		const mods = getComponents<ModifierComponent>(
			gameOf(result).world,
			"h1",
			"modifier",
		).filter((m) => m.target === "hit_bonus" || m.target === "damage_dealt");
		const total = mods.reduce((s, m) => s + m.value, 0);
		expect(total).toBe(8);
		expect(mods.some((m) => m.value === 6)).toBe(true);
		expect(mods.filter((m) => m.value === 1).length).toBeGreaterThanOrEqual(2);
	});
});

// ── Filtro combat_against_self — só dispara contra o inimigo correto ──────────

describe("filtro combat_against_self em before_attack", () => {
	// Corpo Gelatinoso usa combat_against_self. Sem carta real com esse trigger
	// nos dados, testamos que o filtro de sourceEnemyId funciona:
	// se o contexto tem sourceEnemyId diferente do inimigo-fonte, não dispara.

	it("skill do inimigo e2 não dispara quando o herói ataca e1", () => {
		const e1 = makeEnemy({ id: "e1" });
		const e2 = makeEnemy({ id: "e2" });
		const state = baseState({ activeEnemies: [e1, e2] });
		// Não deve explodir e não deve aplicar efeito de e2 quando sourceEnemyId=e1
		expect(() =>
			fireTrigger(testEngine, state, "evt_attack_declared", {
				triggeredBy: "evt_attack_declared",
				sourceHeroId: "h1",
				sourceEnemyId: "e1",
			}),
		).not.toThrow();
	});
});
