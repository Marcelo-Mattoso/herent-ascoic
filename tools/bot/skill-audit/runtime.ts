/**
 * Cenários determinísticos usando o reducer real. PASS aqui significa que o
 * cenário específico executou e alterou o estado esperado; NÃO significa
 * cobertura integral da habilidade, de todos os alvos ou do cooperativo.
 */
import { createAscensaoEngine } from "@/core/composition";
import { reducer } from "@/core/reducer";
import { createInitialGameState, type GameState } from "@/core/state/gameState";
import { createEmptyCombatState } from "@/core/state/combatState";
import { gameOf, withGame } from "@/engine/state";
import { heroesOf, pendingSkillTargetOf, pendingTriggerInterruptOf,
	recordOfEnemy, spawnEnemy, withWorld, worldOf, pendingSkillChoiceOf } from "@/core/state/access";
import type { EnemyState } from "@/core/state/enemyState";
import { legalActions } from "@/core/legalActions";
import { canStartHeroAttack } from "@/core/rules/attackAvailability";
import { playerView } from "@/core/projection/playerView";

export interface RuntimeScenarioResult {
	readonly id: string;
	readonly sourceCardId: string;
	readonly abilityId: string;
	readonly status: "PASS" | "FAIL";
	readonly detail: string;
}

export const auditEngine = createAscensaoEngine();
const engine = auditEngine;

function ensure(condition: unknown, description: string): asserts condition {
	if (!condition) throw new Error(description);
}

export function combat(cardId: string | readonly string[]): GameState {
	const heroCardIds = typeof cardId === "string" ? [cardId] : [...cardId];
	const started = reducer(engine, createInitialGameState({ heroCardIds }), {
		type: "START_GAME", payload: { heroCardIds, seed: 42 },
	});
	const enemy: EnemyState = {
		id: "audit-enemy", cardId: "creature_deep_rift_rat",
		maxLife: 20, currentLife: 20, damage: 1, hitBonus: 0, dice: 1,
		tokens: {}, conditions: [], firstDamageTakenThisTurn: false,
		status: "active",
	};
	const withEnemy = withWorld(started, spawnEnemy(worldOf(started), enemy));
	const prepared = withGame(withEnemy, (game) => ({
		...game, status: "COMBAT_START", currentRoom: {
			cardId: "room_dungeon_room", exits: 2, currentEnemies: 1,
			reward: 0, rewardType: "item", effect: "", xp: 1, status: "active",
		},
		activeEnemies: [recordOfEnemy(enemy)],
	}));
	return reducer(engine, prepared, { type: "START_COMBAT" });
}

function checkFury(): void {
	let state = combat("hero_crimson_barbarian");
	const heroId = heroesOf(state)[0]!.id;
	const initialHp = heroesOf(state)[0]!.currentLife;
	state = reducer(engine, state, { type: "USE_SKILL", payload: {
		skillId: "skill_crimson_fury", sourceId: heroId,
	} });
	ensure(Object.values(gameOf(state).preparedAbilities ?? {}).some((entry) =>
		entry.abilityId === "skill_crimson_fury"), "Fúria não foi preparada");
	state = reducer(engine, state, { type: "CHOOSE_TARGET", payload: {
		heroId, enemyId: "audit-enemy",
	} });
	state = reducer(engine, state, { type: "ROLL_DICE" });
	ensure(heroesOf(state)[0]!.currentLife === initialHp - 2,
		"Fúria não aplicou o custo de 2 PV no ataque");
	ensure(!Object.values(gameOf(state).preparedAbilities ?? {}).some((entry) =>
		entry.abilityId === "skill_crimson_fury"), "Fúria continuou preparada após disparar");
	ensure(!canStartHeroAttack(state, heroId),
		"Fúria permitiu outro ataque após o disparo");
}

function checkPreyMark(): void {
	let state = combat("hero_broken_veil_hunter");
	const heroId = heroesOf(state)[0]!.id;
	state = reducer(engine, state, { type: "USE_SKILL", payload: {
		skillId: "skill_prey_mark", sourceId: heroId,
	} });
	ensure(pendingSkillTargetOf(state)?.candidates.some((target) =>
		target.id === "audit-enemy"), "Marca da Presa não ofereceu o inimigo como alvo");
	state = reducer(engine, state, { type: "SELECT_SKILL_TARGET", payload: {
		targetId: "audit-enemy",
	} });
	ensure(gameOf(state).combat?.preyByHero[heroId] === "audit-enemy",
		"Marca da Presa não foi aplicada ao alvo escolhido");
	ensure(!gameOf(state).combat?.heroesActed.includes(heroId),
		"Marca da Presa consumiu indevidamente o ataque");
	state = reducer(engine, state, { type: "CHOOSE_TARGET", payload: {
		heroId, enemyId: "audit-enemy",
	} });
	state = reducer(engine, state, { type: "ROLL_DICE" });
	ensure(gameOf(state).combat?.lastRoll?.heroBreakdown.some((entry) =>
		entry.source === "Marca da Presa" && entry.value === 1),
		"Marca da Presa não adicionou o bônus ao dado de ataque");
}

function checkLunarSpark(): void {
	const base = combat("hero_green_moon_sorceress");
	const heroId = heroesOf(base)[0]!.id;
	const ready = withGame(base, (game) => ({
		...game, status: "ROLL_DICE",
		combat: { ...createEmptyCombatState(), phase: "resolving",
			pairs: [{ heroId, enemyId: "audit-enemy" }] },
	}));
	const prepared = reducer(engine, ready, { type: "PREPARE_PHYSICAL_ROLL" });
	const dice = gameOf(prepared).combat?.pendingPhysicalRoll;
	ensure(dice, "Rolagem física não foi preparada");
	const rolled = reducer(engine, prepared, { type: "CONFIRM_DICE_ROLL", payload: {
		rollId: dice.id, heroId: dice.heroId, enemyId: dice.enemyId,
		heroResults: Array(dice.heroDiceCount).fill(1),
		enemyResults: Array(dice.enemyDiceCount).fill(5), source: "physics",
	} });
	const interrupt = pendingTriggerInterruptOf(rolled);
	ensure(interrupt?.skillId === "witch_skill_lunar_spark",
		"Centelha não ofereceu a interrupção após obter 1 no dado");
	const accepted = reducer(engine, rolled, {
		type: "APPLY_TRIGGER_INTERRUPT", payload: { interruptId: interrupt.id },
	});
	const choices = legalActions(engine, accepted).filter((action) => action.type === "SELECT_DIE");
	ensure(choices.length > 0, "Centelha não ofereceu a seleção de dado");
	const selected = reducer(engine, accepted, choices[0]!);
	ensure(!gameOf(selected).combat?.pendingDiceCommit,
		"Centelha não concluiu a seleção e a resolução do dado");
	ensure(gameOf(selected).combat?.lastRoll?.heroResults.length,
		"Centelha não deixou resultado de rolagem verificável");
}


/** Contrato mínimo de ativação: não prova que o efeito posterior foi aplicado. */
function checkPowerActivation(cardId: string, powerId: string): void {
	let state = combat(cardId);
	const heroId = heroesOf(state)[0]!.id;
	const before = playerView(engine, state).abilityActionsByHero[heroId]?.find(
		(action) => action.abilityId === powerId);
	ensure(before?.kind === "power" && before.status === "available",
		powerId + ": poder indisponível no início do combate");
	state = reducer(engine, state, { type: "USE_POWER", payload: { heroId } });
	if (before.activation === "prepare") {
		ensure(Object.values(gameOf(state).preparedAbilities ?? {}).some((entry) =>
			entry.abilityId === powerId && entry.sourceHeroId === heroId),
			powerId + ": não ficou preparado no herói correto");
	} else {
		ensure(gameOf(state).oncePer.game[`${powerId}::${heroId}`] === true,
			powerId + ": uso não foi registrado");
	}
	ensure(!gameOf(state).combat?.heroesActed.includes(heroId),
		powerId + ": ativação consumiu o ataque do herói");
	ensure(canStartHeroAttack(state, heroId, "audit-enemy") || Boolean(pendingSkillChoiceOf(state)),
		powerId + ": ação de ataque indisponível após ativar o poder");
}

const powerCases = [
	["hero_eternal_rest_cleric", "power_greater_last_light_miracle"],
	["hero_broken_bastion_warrior", "power_unbreakable_bastion_guard"],
	["hero_rift_rogue", "power_restored_path"],
	["hero_crimson_rune_mage", "power_supreme_rift_rune"],
	["hero_crimson_barbarian", "power_mighty_crimson_fury"],
	["hero_last_light_paladin", "power_last_light_oath"],
	["hero_broken_veil_hunter", "power_hunter_execution"],
] as const;

const scenarios = [
	{ id: "crimson-fury-attack", sourceCardId: "hero_crimson_barbarian",
		abilityId: "skill_crimson_fury", check: checkFury,
		detail: "Preparação, custo de PV, consumo e encerramento no ataque" },
	{ id: "hunter-prey-mark", sourceCardId: "hero_broken_veil_hunter",
		abilityId: "skill_prey_mark", check: checkPreyMark,
		detail: "Seleção de alvo, bônus +1 e preservação do ataque" },
	{ id: "lunar-spark-dice", sourceCardId: "hero_green_moon_sorceress",
		abilityId: "witch_skill_lunar_spark", check: checkLunarSpark,
		detail: "Interrupção com dado 1, seleção e commit da rolagem" },
] as const;

export function runRuntimeScenarios(): RuntimeScenarioResult[] {
	const allScenarios: { id: string; sourceCardId: string; abilityId: string; check: () => void; detail: string }[] = [
		...scenarios,
		...powerCases.map(([sourceCardId, abilityId]) => ({
			id: "power-activation-" + abilityId, sourceCardId, abilityId,
			check: () => checkPowerActivation(sourceCardId, abilityId),
			detail: "Ativação, registro de preparação/uso e preservação do ataque (não verifica efeito posterior)",
		})),
	];
	return allScenarios.map(({ id, sourceCardId, abilityId, check, detail }) => {
		try {
			check();
			return { id, sourceCardId, abilityId, status: "PASS" as const, detail };
		} catch (error) {
			return {
				id, sourceCardId, abilityId, status: "FAIL" as const,
				detail: error instanceof Error ? error.message : String(error),
			};
		}
	});
}
