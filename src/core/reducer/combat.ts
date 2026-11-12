import { HERO_ABILITY_IDS } from "../data/heroAbilityIds";
import {
	canExecuteAbilityGrant,
	executeAbilityGrant,
	resolveManualGrantTarget,
	markGrantUsed,
} from "../abilities/executor";
import { preparedAbilityKey, togglePreparedAbility, isAbilityPrepared, removePreparedAbility } from "../abilities/prepared";
import {
	decrementRoundsModifiers,
	removeComponent,
	removeModifiersForSource,
	removeTriggersAppliedBySource,
	tickModifierDurations,
} from "../ecs/world";
import { drainStack } from "../effects/resolver";
import { emit } from "../events/bus";
import type { DamageType } from "../events/types";
import { calculateTotal, resolveAttack } from "../rules/combat";
import { dungeonAwakeningEffect, piercedItemReduction } from "../rules/dungeonAwakening";
import { isEligibleDie, dieReplacementValues } from "../rules/diceSelection";
import { canStartHeroAttack } from "../rules/attackAvailability";
import { rollDiceRng } from "../rules/dice";
import {
	collectHeroDamageBonusesFromItems,
	collectHeroDamageReductionsFromItems,
	collectHeroHitBonusesFromItems,
	collectHeroLifeDrainFromItems,
	manualItemUnavailableReason,
	formatItemBreakdown,
	itemActivationId,
	itemCanBeUsedManually,
	itemShouldBeConsumed,
	removeHeroItem,
	totalItemValue,
} from "../rules/itemEffects";
import { guardPassed } from "../triggers/engine";
import { ActivationTracker } from "../state/activation";

import {
	fireOnUseSkill,
	isManuallyActivatable,
	type UseSkillPayload,
} from "../skills/useSkill";
import { resolveManualSkillTarget } from "../skills/targeting";
import {
	resolveSkillWindow,
	isVoluntaryTrigger,
	type AttackResume,
} from "../skills/resolveSkillWindow";
import { tickBlockEntries } from "../state/blockHelpers";
import type { BonusEntry, CombatRollResult } from "../state/combatState";
import { createEmptyCombatState } from "../state/combatState";
import type { EnemyState } from "../state/enemyState";
import type { GameState } from "../state/gameState";
import type { HeroRecord, HeroState } from "../state/heroState";
import { selectTargetHero } from "../strategies/targetSelection";
import { applyDamage } from "../systems/damageSystem";
import { resolvePoisonRound } from "../rules/poison";
import { resolveDamageOverTimeRound, clearDamageOverTime } from "../rules/damageOverTime";
import { applyHeal } from "../systems/healSystem";
import { recordEvent } from "../events/record";
import { log } from "./utils";
import { ANY_PHASE } from "../../engine/phases";
import { appendAlphaLog } from "../diagnostics/alphaLog";
import type { Action } from "../actions/types";
import { abilityGrants, cardById, cardName, skillById, skillsOf } from "../gameEngine";
import type { GameEngine } from "../gameEngine";

import { awakeningOf, deckOf, decksOf, enemiesOf, extraDiceOf, fledHeroesOf, heroesOf, shuffleDeck, withDeck, withDecks, withEntityRetired, withWorld, worldOf, pendingTriggerInterruptOf, pendingSkillChoiceOf, pendingSkillTargetOf, pendingSkillWindowOf, pausedOf, withPendingSkillWindow, withPendingSkillTarget } from "../state/access";
import { scopedCountOf, scopedFlagOf, withScopedFlag } from "../state/access";
import type { GameHandler } from "../gameEngine";
import { buildBossRollFromResults, isBossAttack, isBossRoll } from "./boss";
import { targetPairs } from "./legal";
import { beginCombat, beginRound } from "../state/lifecycle";
import { gameOf, withGame } from "../../engine/state";
function activeHeroesPendingActivation(state: GameState): HeroState[] {
	return heroesOf(state).filter(
		(h) =>
			h.status === "active" &&
			!ActivationTracker.isHeroDisabledThisRound(state, h.id),
	);
}

export function advanceAfterHeroDisabledForRound(state: GameState): GameState {
	if (!gameOf(state).combat) return state;
	const pendingHeroes = activeHeroesPendingActivation(state);

	if (pendingHeroes.length > 0) {
		const livingEnemies = enemiesOf(state).filter(
			(e) => e.status === "active",
		);
		if (livingEnemies.length === 0) {
			return withGame(state, (prevGame) => ({ ...prevGame, status: "DIRECT_DAMAGE" as const, combat: {
					...gameOf(state).combat!,
					phase: "direct_damage" as const,
					selectedHeroId: null,
				} }));
		}
		return log(
			withGame(state, (prevGame) => ({ ...prevGame, status: (gameOf(state).status === "BOSS_COMBAT"
					? "BOSS_COMBAT"
					: "HERO_ACTION") as "BOSS_COMBAT" | "HERO_ACTION", combat: {
					...gameOf(state).combat!,
					phase: "selecting_hero" as const,
					selectedHeroId: null,
				} })),
			`Aguardando ação de ${pendingHeroes.length} herói(s).`,
		);
	}

	return withGame(state, (prevGame) => ({ ...prevGame, status: "DIRECT_DAMAGE" as const, combat: {
			...gameOf(state).combat!,
			phase: "direct_damage" as const,
			selectedHeroId: null,
		} }));
}

function clearLastRoll(state: GameState): GameState {
	return gameOf(state).combat
		? withGame(state, (game) => ({ ...game, combat: { ...game.combat!, lastRoll: null } }))
		: state;
}

function endHeroTurnAndAdvance(
	state: GameState,
	heroId: string,
	_reason: string,
): GameState {
	const afterTurn = ActivationTracker.endHeroTurn(state, heroId);
	return advanceAfterHeroDisabledForRound(clearLastRoll(afterTurn));
}

/**
 * Itens de uso rápido não consomem a ação do herói. Se um deles eliminar a
 * última criatura, porém, ainda é preciso entrar no estado auto-avançável que
 * encerra o combate; caso contrário a tela permanece em HERO_ACTION sem alvo.
 */
export function advanceAfterEnemyDefeat(state: GameState): GameState {
	if (
		pendingTriggerInterruptOf(state) ||
		pendingSkillChoiceOf(state) ||
		pendingSkillTargetOf(state) ||
		!gameOf(state).combat ||
		(gameOf(state).status !== "HERO_ACTION" &&
			gameOf(state).status !== "RESOLVE_ATTACK" &&
			gameOf(state).status !== "DIRECT_DAMAGE" &&
			gameOf(state).status !== "CHECK_COMBAT_END") ||
		enemiesOf(state).some((enemy) => enemy.status === "active")
	) {
		return state;
	}
	return withGame(state, (prevGame) => ({ ...prevGame, status: "CHECK_COMBAT_END", combat: {
			...gameOf(state).combat!,
			phase: "direct_damage",
			selectedHeroId: null,
		} }));
}

// ─── START_COMBAT ────────────────────────────────────────────────────────────

export function handleStartCombat(engine: GameEngine, state: GameState): GameState {
	let next: GameState = beginCombat(engine, withGame(state, (prevGame) => ({ ...prevGame, status: "HERO_ACTION", combat: { ...createEmptyCombatState(), phase: "selecting_hero" } })));
	const targetEnemyIds = enemiesOf(next)
		.filter((enemy) => enemy.status === "active")
		.map((enemy) => enemy.id);
	const targetHeroIds = heroesOf(next)
		.filter((hero) => hero.status === "active")
		.map((hero) => hero.id);
	next = resolveSkillWindow(engine, next, {
		event: "evt_combat_start",
		ctx: {
			triggeredBy: "evt_combat_start",
			targetEnemyIds,
			targetHeroIds,
		},
	});
	if (pendingTriggerInterruptOf(next)) return next;
	next = resolveSkillWindow(engine, next, {
		event: "evt_round_start",
		ctx: {
			triggeredBy: "evt_round_start",
			round: 1,
			targetHeroIds,
			targetEnemyIds,
		},
	});
	if (pendingTriggerInterruptOf(next)) return next;
	return log(next, "Combate iniciado.");
}

// ─── DECLARE_FLEE ────────────────────────────────────────────────────────────

export function handleDeclareFlee(engine: GameEngine, state: GameState, heroId: string): GameState {
	if (!gameOf(state).combat) {
		return log(state, "[AVISO] Fuga só possível durante combate.");
	}
	if (gameOf(state).flags?.fleeBlocked) {
		return log(state, "[AVISO] Fuga bloqueada nesta sala.");
	}
	const hero = heroesOf(state).find(
		(h) => h.id === heroId && h.status === "active",
	);
	if (!hero) {
		return log(state, "[AVISO] Herói inválido ou inativo.");
	}
	if (hero.currentLife !== 1) {
		return log(state, "[AVISO] Fuga só permitida com 1 de vida.");
	}
	let next: GameState = withScopedFlag(state, "combat", "fleeAttempt", heroId);
	// Lote E: emite HeroFled ao declarar fuga
	({ state: next } = emit(engine, next, { type: "HeroFled", payload: { heroId } }));
	return log(
		next,
		`${cardName(engine, hero.cardId)} declara fuga! O próximo confronto será uma tentativa de fuga.`,
	);
}

// ─── CHOOSE_HERO_FOR_ROUND ────────────────────────────────────────────────────

export function handleChooseHeroForRound(engine: GameEngine, 
	state: GameState,
	heroId: string,
): GameState {
	if (!gameOf(state).combat) return state;
	if (ActivationTracker.isHeroDisabledThisRound(state, heroId)) {
		return log(state, `[AVISO] Herói ${heroId} já agiu nesta rodada.`);
	}
	const hero = heroesOf(state).find(
		(h) => h.id === heroId && h.status === "active",
	);
	if (!hero) return log(state, `[AVISO] Herói ${heroId} inválido ou inativo.`);

	return log(
		withGame(state, (prevGame) => ({ ...prevGame, combat: {
				...gameOf(state).combat!,
				phase: "selecting_target",
				selectedHeroId: heroId,
			} })),
		`${cardName(engine, hero.cardId)} selecionado para agir.`,
	);
}

// ─── PASS_HERO_ACTION ─────────────────────────────────────────────────────────

export function handlePassHeroAction(engine: GameEngine, 
	state: GameState,
	heroId: string,
): GameState {
	if (!gameOf(state).combat) return state;
	const hero = heroesOf(state).find((h) => h.id === heroId);
	if (ActivationTracker.isHeroDisabledThisRound(state, heroId)) {
		return log(state, `[AVISO] Herói ${heroId} já agiu nesta rodada.`);
	}
	const next = ActivationTracker.endHeroTurn(state, heroId);
	const pendingHeroes = activeHeroesPendingActivation(next);

	if (pendingHeroes.length > 0) {
		return log(
			withGame(next, (prevGame) => ({ ...prevGame, combat: gameOf(next).combat
					? {
							...gameOf(next).combat!,
							selectedHeroId: null,
							phase: "selecting_hero" as const,
						}
					: null })),
			`${cardName(engine, hero?.cardId ?? heroId)} passou a rodada.`,
		);
	}
	return log(
		withGame(next, (prevGame) => ({ ...prevGame, status: "DIRECT_DAMAGE", combat: gameOf(next).combat
				? {
						...gameOf(next).combat!,
						selectedHeroId: null,
						phase: "direct_damage" as const,
					}
				: null })),
		"Todos os heróis agiram. Dano direto.",
	);
}

// ─── CHOOSE_TARGET ───────────────────────────────────────────────────────────

export function handleChooseTarget(engine: GameEngine, 
	state: GameState,
	heroId: string,
	enemyId: string,
): GameState {
	if (!gameOf(state).combat) return state;

	// Validação: herói não pode agir duas vezes na mesma rodada
	if (ActivationTracker.isHeroDisabledThisRound(state, heroId)) {
		return log(state, `[AVISO] Herói ${heroId} já agiu nesta rodada.`);
	}

	if (!canStartHeroAttack(state, heroId, enemyId)) {
		return log(
			state,
			"[AVISO] Herói, inimigo ou momento inválido para iniciar ataque.",
		);
	}

	// on_targeted: removido em Lote G (semântica incorreta; HeroTargeted emitido via bus se necessário)
	const afterTrigger = state;

	// Lote E: emite TargetChosen
	const roomTargetKey = `targetChosen::${enemyId}`;
	const roomFirstTime = !gameOf(state).flags[roomTargetKey];
	let afterEmit = afterTrigger;
	if (roomFirstTime) {
		afterEmit = withGame(afterEmit, (prevGame) => ({ ...prevGame, flags: { ...gameOf(afterEmit).flags, [roomTargetKey]: true } }));
	}
	({ state: afterEmit } = emit(engine, afterEmit, {
		type: "TargetChosen",
		payload: {
			sourceId: heroId,
			targetId: enemyId,
			sourceType: "hero",
			roomFirstTime,
		},
	}));

	if (
		pendingTriggerInterruptOf(afterEmit) ||
		pendingSkillChoiceOf(afterEmit) ||
		pendingSkillTargetOf(afterEmit)
	) {
		return afterEmit;
	}
	const pair = { heroId, enemyId };
	return withGame(afterEmit, (prevGame) => ({ ...prevGame, status: "ROLL_DICE", combat: {
			...gameOf(afterEmit).combat!,
			phase: "resolving",
			selectedHeroId: heroId,
			lastRoll: null,
			pairs: [...(gameOf(afterEmit).combat?.pairs ?? []), pair],
		} }));
}

// ─── ROLL_DICE ───────────────────────────────────────────────────────────────

function collectHeroBonuses(engine: GameEngine, 
	hero: HeroState,
	state: GameState,
	enemy?: EnemyState,
): BonusEntry[] {
	const bonuses: BonusEntry[] = [{ source: "hitBonus", value: hero.hitBonus }];
	if (awakeningOf(state) >= 3 && skillsOf(engine, hero.cardId).some(({ def }) => def.id === HERO_ABILITY_IDS.skill_final_dawn_light)) {
		bonuses.push({ source: "Luz da Aurora Final", value: 2 });
	}

	// Bônus de acerto — lê do ECS world (Lote C)
	const entity = worldOf(state).entities[hero.id];
	if (entity) {
		for (const comp of entity.components) {
			if (
				comp.type === "modifier" &&
				comp.target === "hit_bonus" &&
				comp.value !== 0
			) {
				bonuses.push({ source: comp.source, value: comp.value });
			}
		}
	}

	if (gameOf(state).combat?.preyByHero[hero.id] === enemy?.id) {
		const preyMark = skillsOf(engine, hero.cardId).find(
			({ def }) => def.rules?.preyHitBonus,
		);
		const value = preyMark?.ref.params?.value;
		if (typeof value === "number" && value !== 0) {
			bonuses.push({
				source: preyMark?.def.rules?.preyHitBonus?.label ?? "",
				value,
			});
		}
	}

	bonuses.push(...collectHeroHitBonusesFromItems(engine, hero, state, enemy));

	return bonuses;
}

function collectEnemyBonuses(
	enemy: EnemyState,
	state: GameState,
): BonusEntry[] {
	const bonuses: BonusEntry[] = [{ source: "hitBonus", value: enemy.hitBonus }];
	const influence = dungeonAwakeningEffect(awakeningOf(state));
	if (influence.hitBonus > 0) bonuses.push({ source: "Despertar da Masmorra", value: influence.hitBonus });
	const enemyEntity = worldOf(state).entities[enemy.id];
	if (enemyEntity) {
		for (const comp of enemyEntity.components) {
			if (
				comp.type === "modifier" &&
				comp.target === "hit_bonus" &&
				comp.value !== 0
			) {
				bonuses.push({ source: comp.source, value: comp.value });
			}
		}
	}
	return bonuses;
}

function collectWorldModifierEntries(
	state: GameState,
	entityId: string,
	target: "damage_dealt" | "damage_taken",
): Array<{ source: string; value: number }> {
	const entity = worldOf(state).entities[entityId];
	if (!entity) return [];
	const entries: Array<{ source: string; value: number }> = [];
	for (const comp of entity.components) {
		if (
			comp.type === "modifier" &&
			comp.target === target &&
			comp.value !== 0
		) {
			entries.push({ source: comp.source, value: comp.value });
		}
	}
	return entries;
}

function effectiveHeroDamage(engine: GameEngine, 
	hero: HeroState,
	state: GameState,
	enemy: EnemyState | undefined,
	rollMargin: number,
): { damage: number; breakdown: readonly { source: string; value: number }[] } {
	const worldEntries = collectWorldModifierEntries(
		state,
		hero.id,
		"damage_dealt",
	);
	const itemEntries = collectHeroDamageBonusesFromItems(engine, 
		hero,
		state,
		enemy,
		rollMargin,
	);
	const breakdown = [...worldEntries, ...itemEntries];
	if (awakeningOf(state) >= 3 && skillsOf(engine, hero.cardId).some(({ def }) => def.id === HERO_ABILITY_IDS.skill_final_dawn_light)) {
		breakdown.push({ source: "Luz da Aurora Final", value: 2 });
	}
	return {
		damage: Math.max(0, hero.damage + totalItemValue(breakdown)),
		breakdown,
	};
}

function effectiveEnemyDamage(
	enemy: EnemyState,
	state: GameState,
): { damage: number; breakdown: readonly { source: string; value: number }[] } {
	const breakdown = collectWorldModifierEntries(
		state,
		enemy.id,
		"damage_dealt",
	);
	return {
		damage: Math.max(0, enemy.damage + totalItemValue(breakdown) + dungeonAwakeningEffect(awakeningOf(state)).damageBonus),
		breakdown,
	};
}

function reduceHeroDamage(engine: GameEngine, 
	state: GameState,
	hero: HeroState,
	amount: number,
	damageType: DamageType = "physical",
): { damage: number; breakdown: string[] } {
	const worldEntries = collectWorldModifierEntries(
		state,
		hero.id,
		"damage_taken",
	);
	const worldReduction = -totalItemValue(worldEntries);
	const itemEntries = collectHeroDamageReductionsFromItems(engine, 
		hero,
		state,
		damageType,
	);
	const itemReduction = totalItemValue(itemEntries);
	const penetration = damageType === "attack" ? dungeonAwakeningEffect(awakeningOf(state)).armorPenetration : 0;
	const adjustedReduction = piercedItemReduction(itemReduction, penetration);
	const finalDamage = Math.max(0, amount - worldReduction - adjustedReduction);
	const breakdown = [
		...formatItemBreakdown(itemEntries, "-"),
		...(itemReduction > adjustedReduction ? [`Penetração ${itemReduction - adjustedReduction}`] : []),
		...(worldReduction > 0
			? [`redução -${worldReduction}`]
			: worldReduction < 0
				? [`vulnerabilidade +${Math.abs(worldReduction)}`]
				: []),
	];
	return { damage: finalDamage, breakdown };
}

function logItemLifeDrain(engine: GameEngine, state: GameState, hero: HeroState): GameState {
	const drains = collectHeroLifeDrainFromItems(engine, hero, state);
	const amount = totalItemValue(drains);
	if (amount <= 0) return state;
	const healed = applyHeal(engine, state, hero.id, amount);
	const sources = drains.map((d) => d.source).join(", ");
	return log(
		healed,
		`${cardName(engine, hero.cardId)} recuperou ${amount} de vida (${sources}).`,
	);
}

function formatDamageBonusNote(
	baseDamage: number,
	effectiveDamageValue: number,
	breakdown: readonly { source: string; value: number }[],
): string {
	if (effectiveDamageValue === baseDamage || breakdown.length === 0) return "";
	const parts = breakdown
		.filter((entry) => entry.value !== 0)
		.map(
			(entry) => `${entry.source} ${entry.value > 0 ? "+" : ""}${entry.value}`,
		);
	return parts.length
		? ` [dano ${baseDamage}→${effectiveDamageValue}: ${parts.join(", ")}]`
		: "";
}

function maybeDisableReusableItem(engine: GameEngine, 
	state: GameState,
	heroId: string,
	itemId: string,
	consumed: boolean,
): GameState {
	if (consumed) return state;
	return ActivationTracker.disable(engine, state, {
		kind: "item",
		id: itemActivationId(heroId, itemId),
		scope: skillsOf(engine, itemId)[0]?.def.cooldown?.scope ?? "room",
		sourceId: heroId,
		reason: "item usado",
	});
}

export function handleRollDice(engine: GameEngine, state: GameState): GameState {
	if (gameOf(state).combat?.pendingPhysicalRoll) return state;
	if (!gameOf(state).combat || gameOf(state).combat!.pairs.length === 0) return state;
	// Rola para o par mais recente (último adicionado nesta rodada)
	const pair = gameOf(state).combat!.pairs[gameOf(state).combat!.pairs.length - 1];
	if (!pair) return state;

	const hero = heroesOf(state).find((h) => h.id === pair.heroId);
	const enemy = enemiesOf(state).find((e) => e.id === pair.enemyId);
	if (!hero || !enemy) return state;

	let preRoll = resolveSkillWindow(engine, state, {
		event: "evt_attack_declared",
		resume: { type: "roll_dice" },
		ctx: {
			triggeredBy: "evt_attack_declared",
			sourceHeroId: hero.id,
			sourceEnemyId: enemy.id,
			targetHeroIds: [hero.id],
			targetEnemyIds: [enemy.id],
			round: gameOf(state).combat?.round ?? 0,
		},
	});
	if (pendingTriggerInterruptOf(preRoll)) {
		return withGame(preRoll, (prevGame) => ({ ...prevGame, status: "ROLL_DICE" }));
	}
	// Drena a stack de efeitos acumulados pelos TriggerComponents (modificadores de combate)
	preRoll = drainStack(engine, preRoll);

	const heroDiceCount = hero.dice + extraDiceOf(preRoll, hero.id);
	const { result: heroRollResult, next: rng1 } = rollDiceRng(
		heroDiceCount,
		gameOf(preRoll).rng,
	);
	const { result: enemyRollResult, next: rng2 } = rollDiceRng(enemy.dice, rng1);
	preRoll = withGame(preRoll, (prevGame) => ({ ...prevGame, rng: rng2 }));

	const heroBonuses = collectHeroBonuses(engine, hero, preRoll, enemy);
	const enemyBonuses = collectEnemyBonuses(enemy, preRoll);

	const heroCalc = calculateTotal(heroRollResult.results, heroBonuses);
	const enemyCalc = calculateTotal(enemyRollResult.results, enemyBonuses);

	const roll: CombatRollResult = {
		heroId: hero.id,
		enemyId: enemy.id,
		heroResults: heroRollResult.results,
		heroTotal: heroCalc.total,
		heroBreakdown: heroBonuses,
		enemyResults: enemyRollResult.results,
		enemyTotal: enemyCalc.total,
		enemyBreakdown: enemyBonuses,
	};

	let postRoll: GameState = withGame(preRoll, (prevGame) => ({ ...prevGame, status: "RESOLVE_ATTACK", combat: gameOf(preRoll).combat ? { ...gameOf(preRoll).combat!, lastRoll: roll } : null }));

	postRoll = recordEvent(postRoll, "RollResolved", {
		heroId: hero.id,
		enemyId: enemy.id,
		heroTotal: heroCalc.total,
		enemyTotal: enemyCalc.total,
		heroResults: heroRollResult.results,
		enemyResults: enemyRollResult.results,
	});

	postRoll = resolveSkillWindow(engine, postRoll, {
		event: "evt_roll",
		ctx: {
			triggeredBy: "evt_roll",
			sourceHeroId: hero.id,
			sourceEnemyId: enemy.id,
			targetHeroIds: [hero.id],
			targetEnemyIds: [enemy.id],
			value: heroCalc.total - enemyCalc.total,
			round: gameOf(postRoll).combat?.round ?? 0,
		},
	});
	if (pendingTriggerInterruptOf(postRoll)) return postRoll;

	return log(
		postRoll,
		`Herói rolou ${heroCalc.total} | Inimigo rolou ${enemyCalc.total}.`,
	);
}

/** Prepara a rolagem interativa sem consumir resultados de dados. */
export function handlePreparePhysicalRoll(engine: GameEngine, state: GameState, skipPreRoll = false): GameState {
	const game = gameOf(state);
	if (!game.combat || game.combat.pendingPhysicalRoll) return state;
	if (game.status !== "ROLL_DICE" && game.status !== "BOSS_COMBAT") return state;
	const boss = game.status === "BOSS_COMBAT" ||
		game.combat.pairs.some((pair) => pair.enemyId === "boss");
	const pair = boss ? game.combat.pairs[0] : game.combat.pairs.at(-1);
	if (!pair) return state;
	const hero = heroesOf(state).find((entry) => entry.id === pair.heroId);
	const enemy = enemiesOf(state).find((entry) => entry.id === pair.enemyId);
	if (!hero || !enemy) return state;

	// Uma rolagem anterior não pode bloquear a preparação do novo confronto.
	let prepared: GameState = game.combat.lastRoll ? clearLastRoll(state) : state;
	if (!boss && !skipPreRoll) {
		prepared = resolveSkillWindow(engine, withGame(state, (g) => ({ ...g, combat: { ...g.combat!, physicalRollPreparing: true } })), {
			event: "evt_attack_declared",
			resume: { type: "prepare_physical_roll" },
			ctx: {
				triggeredBy: "evt_attack_declared",
				sourceHeroId: hero.id,
				sourceEnemyId: enemy.id,
				targetHeroIds: [hero.id],
				targetEnemyIds: [enemy.id],
				round: game.combat.round,
			},
		});
		if (hasPendingDecision(prepared))
			return withGame(prepared, (g) => ({ ...g, status: "ROLL_DICE" }));
		prepared = drainStack(engine, prepared);
	}
	if (skipPreRoll) prepared = drainStack(engine, prepared);
	const preparedGame = gameOf(prepared);
	const heroDiceCount = hero.dice + (boss ? 0 : extraDiceOf(prepared, hero.id));
	const enemyDiceCount = enemy.dice;
	const { result: fallbackHero, next: rng1 } = rollDiceRng(heroDiceCount, preparedGame.rng);
	const { result: fallbackEnemy } = rollDiceRng(enemyDiceCount, rng1);
	const pending = {
		id: `${preparedGame.actionLog.length}:${preparedGame.combat?.round ?? 0}:${hero.id}:${enemy.id}`,
		heroId: hero.id,
		enemyId: enemy.id,
		heroDiceCount,
		enemyDiceCount,
		boss,
		heroBonuses: boss ? [] : collectHeroBonuses(engine, hero, prepared, enemy),
		enemyBonuses: boss ? [] : collectEnemyBonuses(enemy, prepared),
		fallbackHeroResults: fallbackHero.results,
		fallbackEnemyResults: fallbackEnemy.results,
	};
	return withGame(prepared, (g) => ({
		...g,
		status: "RESOLVE_ATTACK",
		combat: { ...g.combat!, pendingPhysicalRoll: pending, physicalRollPreparing: false },
	}));
}

function hasPendingDecision(state: GameState): boolean {
	return Boolean(pendingTriggerInterruptOf(state) || pendingSkillChoiceOf(state) || pendingSkillTargetOf(state));
}

/** Prepara um ataque excedente por vez, mantendo a ordem original dos inimigos. */
export function handlePrepareExtraAttack(engine: GameEngine, state: GameState): GameState {
	const combat = gameOf(state).combat;
	if (gameOf(state).status !== "DIRECT_DAMAGE" || !combat || combat.pendingPhysicalRoll) return state;
	if (hasPendingDecision(state)) return state;
	const withCombat = (base: GameState, patch: Partial<NonNullable<typeof combat>>): GameState =>
		withGame(base, (g) => ({ ...g, combat: { ...g.combat!, ...patch } }));
	const remaining = combat.extraEnemiesRemaining ?? (() => {
		const attacked = new Set(combat.pairs.map((pair) => pair.enemyId));
		const activeEnemies = enemiesOf(state).filter((enemy) => enemy.status === "active");
		// A morte de criaturas engajadas não cancela a reação das que ainda não lutaram.
		// Contar somente "vivos - heróis" fazia a última criatura perder sua ação.
		return activeEnemies.filter((enemy) => !attacked.has(enemy.id))
			.map((enemy) => enemy.id);
	})();
	if (remaining.length === 0) {
		return withGame(state, (g) => ({ ...g, status: "CHECK_COMBAT_END", combat: { ...g.combat!, extraEnemiesRemaining: undefined } }));
	}
	const preparation = combat.pendingExtraPreparation;
	const enemy = enemiesOf(state).find((entry) => entry.id === (preparation?.enemyId ?? remaining[0]) && entry.status === "active");
	const target = preparation
		? heroesOf(state).find((hero) => hero.id === preparation.heroId && hero.status === "active")
		: selectTargetHero(heroesOf(state));
	if (!enemy || !target) return withCombat(state, { extraEnemiesRemaining: remaining.slice(1), pendingExtraPreparation: undefined });
	let next = state;
	if (!preparation) {
		next = resolveSkillWindow(engine, state, {
			event: "evt_targeted",
			ctx: { triggeredBy: "evt_targeted", sourceEnemyId: enemy.id, targetHeroIds: [target.id], round: combat.round },
		});
		if (hasPendingDecision(next))
			return withCombat(next, { extraEnemiesRemaining: remaining,
				pendingExtraPreparation: { enemyId: enemy.id, heroId: target.id, stage: "targeted" } });
	}
	if (preparation?.stage !== "declared" && scopedFlagOf(next, "combat", "targetProtection", target.id)) {
		return log(withCombat(withScopedFlag(next, "combat", "targetProtection", target.id, false), {
			extraEnemiesRemaining: remaining.slice(1), pendingExtraPreparation: undefined,
		}), `${cardName(engine, target.cardId)} ignorou o efeito que o escolheria como alvo.`);
	}
	if (preparation?.stage !== "declared") {
		next = resolveSkillWindow(engine, next, {
			event: "evt_attack_declared",
			ctx: { triggeredBy: "evt_attack_declared", sourceEnemyId: enemy.id,
				targetHeroIds: [target.id], targetEnemyIds: [enemy.id], round: gameOf(next).combat?.round ?? 0 },
		});
		if (hasPendingDecision(next))
			return withCombat(next, { extraEnemiesRemaining: remaining,
				pendingExtraPreparation: { enemyId: enemy.id, heroId: target.id, stage: "declared" } });
	}
	next = drainStack(engine, next);
	const currentTarget = heroesOf(next).find((entry) => entry.id === target.id && entry.status === "active");
	const currentEnemy = enemiesOf(next).find((entry) => entry.id === enemy.id && entry.status === "active");
	if (!currentTarget || !currentEnemy) return withCombat(next, { extraEnemiesRemaining: remaining.slice(1), pendingExtraPreparation: undefined });
	const nextGame = gameOf(next);
	const { result: fallbackHero, next: rng1 } = rollDiceRng(currentTarget.dice, nextGame.rng);
	const { result: fallbackEnemy } = rollDiceRng(currentEnemy.dice, rng1);
	const pendingPhysicalRoll = {
		id: `${nextGame.actionLog.length}:${nextGame.combat?.round ?? 0}:extra:${currentEnemy.id}:${currentTarget.id}`,
		heroId: currentTarget.id, enemyId: currentEnemy.id,
		heroDiceCount: currentTarget.dice, enemyDiceCount: currentEnemy.dice,
		boss: false, extraAttack: true,
		heroBonuses: collectHeroBonuses(engine, currentTarget, next, currentEnemy),
		enemyBonuses: collectEnemyBonuses(currentEnemy, next),
		fallbackHeroResults: fallbackHero.results, fallbackEnemyResults: fallbackEnemy.results,
	};
	return withGame(next, (g) => ({
		...g, status: "RESOLVE_ATTACK",
		combat: { ...g.combat!, extraEnemiesRemaining: remaining.slice(1), pendingExtraPreparation: undefined, pendingPhysicalRoll },
	}));
}

/** Aceita somente as faces confirmadas para a rolagem pendente atual. */
export function handleConfirmPhysicalRoll(
	engine: GameEngine,
	state: GameState,
	payload: Extract<Action, { type: "CONFIRM_DICE_ROLL" }>["payload"],
): GameState {
	const pending = gameOf(state).combat?.pendingPhysicalRoll;
	if (!pending || gameOf(state).status !== "RESOLVE_ATTACK" || gameOf(state).combat?.lastRoll) return state;
	if (hasPendingDecision(state)) return state;
	if (payload.rollId !== pending.id || payload.heroId !== pending.heroId || payload.enemyId !== pending.enemyId) return state;
	if (payload.source !== "physics" && payload.source !== "fallback") return state;
	const valid = (values: readonly number[], count: number) =>
		Array.isArray(values) && values.length === count && values.every((value) => Number.isInteger(value) && value >= 1 && value <= 6);
	if (!valid(payload.heroResults, pending.heroDiceCount) || !valid(payload.enemyResults, pending.enemyDiceCount)) return state;
	let next = state;
	if (payload.source === "fallback") {
		if (payload.heroResults.some((value, index) => value !== pending.fallbackHeroResults[index]) ||
			payload.enemyResults.some((value, index) => value !== pending.fallbackEnemyResults[index])) return state;
		const { next: rng1 } = rollDiceRng(pending.heroDiceCount, gameOf(state).rng);
		const { next: rng2 } = rollDiceRng(pending.enemyDiceCount, rng1);
		next = withGame(state, (g) => ({ ...g, rng: rng2 }));
	}
	let roll: CombatRollResult;
	if (pending.boss) {
		const bossRoll = buildBossRollFromResults(engine, next, payload.heroResults, payload.enemyResults);
		if (!bossRoll) return state;
		roll = { ...bossRoll, physicalRollId: pending.id };
	} else {
		const heroCalc = calculateTotal(payload.heroResults, pending.heroBonuses);
		const enemyCalc = calculateTotal(payload.enemyResults, pending.enemyBonuses);
		roll = {
			physicalRollId: pending.id,
			extraAttack: pending.extraAttack,
			heroId: pending.heroId,
			enemyId: pending.enemyId,
			heroResults: [...payload.heroResults],
			heroTotal: heroCalc.total,
			heroBreakdown: pending.heroBonuses,
			enemyResults: [...payload.enemyResults],
			enemyTotal: enemyCalc.total,
			enemyBreakdown: pending.enemyBonuses,
		};
	}
	next = withGame(next, (g) => ({
		...g,
		combat: { ...g.combat!, pendingPhysicalRoll: undefined, lastRoll: roll },
	}));
	{
		next = resolveSkillWindow(engine, next, {
			event: "evt_roll",
			ctx: {
				triggeredBy: "evt_roll",
				sourceHeroId: pending.heroId, sourceEnemyId: pending.enemyId,
				targetHeroIds: [pending.heroId],
				targetEnemyIds: [pending.enemyId],
				value: roll.heroTotal - roll.enemyTotal,
				round: gameOf(next).combat?.round ?? 0,
			},
		});
		if (pendingTriggerInterruptOf(next)) return next;
	}
	return log(next, `Herói rolou ${roll.heroTotal} | Inimigo rolou ${roll.enemyTotal}.`);
}

// ─── Helpers de log ──────────────────────────────────────────────────────────

// Rótulos legíveis para as fontes de bônus
const BONUS_LABELS: Record<string, string> = {
	hitBonus: "acerto",
	habilidade: "skill",
	penalidade: "penalidade",
};

function fmtBonus(entry: BonusEntry): string {
	const label = BONUS_LABELS[entry.source] ?? entry.source;
	return `${label} ${entry.value >= 0 ? "+" : ""}${entry.value}`;
}

function fmtRoll(
	dice: readonly number[],
	bonuses: readonly BonusEntry[],
	total: number,
): string {
	const diceStr = `dado(s) [${dice.join("+")}]=${dice.reduce((a, b) => a + b, 0)}`;
	const bonusStr = bonuses.map(fmtBonus).join(", ");
	return bonusStr
		? `${diceStr}, ${bonusStr} → ${total}`
		: `${diceStr} → ${total}`;
}

// ─── RESOLVE_ATTACK ───────────────────────────────────────────────────────────

export function handleResolveAttack(engine: GameEngine, state: GameState): GameState {
	if (!gameOf(state).combat?.lastRoll || gameOf(state).combat?.pendingDiceSelection) return state;
	const roll = gameOf(state).combat!.lastRoll;
	if (roll!.extraAttack) return resolveExtraPhysicalAttack(engine, state, roll!);

	const hero = heroesOf(state).find((h) => h.id === roll!.heroId);
	const enemy = enemiesOf(state).find((e) => e.id === roll!.enemyId);
	if (!hero || !enemy) {
		return advanceAfterEnemyDefeat(endHeroTurnAndAdvance(state, roll!.heroId, "atacou"));
	}

	const rollMargin = roll!.heroTotal - roll!.enemyTotal;
	const heroDamage = effectiveHeroDamage(engine, hero, state, enemy, rollMargin);
	const enemyDamage = effectiveEnemyDamage(enemy, state);
	const result = resolveAttack(
		roll!.heroTotal,
		roll!.enemyTotal,
		heroDamage.damage,
		enemyDamage.damage,
	);

	const isFleeAttempt = scopedFlagOf(state, "combat", "fleeAttempt", hero.id);
	let next =
		result.heroDamageTaken > 0
			? resolveSkillWindow(engine, state, {
					event: "evt_damage_taken",
					resume: { type: "resolve_attack" },
					ctx: {
						triggeredBy: "evt_damage_taken",
						sourceEnemyId: enemy.id,
						targetHeroIds: [hero.id],
						targetEnemyIds: [enemy.id],
						value: result.heroDamageTaken,
						round: gameOf(state).combat?.round ?? 0,
					},
				})
			: state;
	if (pendingTriggerInterruptOf(next) || pendingSkillChoiceOf(next)) return next;

	// Limpar flag de fuga independente do resultado
	if (isFleeAttempt && gameOf(next).combat) {
		next = withScopedFlag(next, "combat", "fleeAttempt", hero.id, false);
	}

	// Fuga bem-sucedida: herói venceu o confronto de fuga
	if (isFleeAttempt && result.enemyDamageTaken > 0) {
		const fledHero: HeroRecord = {
			...(gameOf(next).heroes.find((h) => h.id === hero.id) as HeroRecord),
			status: "fled",
		};
		next = withWorld(withGame(next, (prevGame) => ({ ...prevGame, heroes: gameOf(next).heroes.filter((h) => h.id !== hero.id), fledHeroes: [...gameOf(next).fledHeroes, fledHero] })), removeTriggersAppliedBySource(
				removeModifiersForSource(worldOf(withEntityRetired(next, hero.id)), hero.id),
				hero.id,
			));
		next = resolveSkillWindow(engine, next, {
			event: "evt_leave_play",
			ctx: {
				triggeredBy: "evt_leave_play",
				sourceHeroId: hero.id,
				targetHeroIds: [hero.id],
				round: gameOf(next).combat?.round ?? 0,
			},
		});
		if (pendingTriggerInterruptOf(next) || pendingSkillChoiceOf(next)) return next;
		next = log(
			next,
			`${cardName(engine, hero.cardId)} fugiu do combate com sucesso!`,
		);
		return endHeroTurnAndAdvance(next, roll!.heroId, "fugiu");
	}

	// A destruição precisa ser decidida antes de qualquer dano deste ataque ser
	// aplicado. Assim, uma escolha no Encanto da Última Defesa pode retomar o
	// ataque inteiro sem repetir o dano que já foi aplicado ao outro lado.
	const reducedHeroDamage =
		result.heroDamageTaken > 0
			? reduceHeroDamage(engine, next, hero, result.heroDamageTaken, "attack")
			: null;
	if (
		result.enemyDamageTaken >= enemy.currentLife &&
		result.enemyDamageTaken > 0
	) {
		next = resolveSkillWindow(engine, next, {
			event: "evt_would_be_destroyed",
			resume: { type: "resolve_attack" },
			ctx: {
				triggeredBy: "evt_would_be_destroyed",
				sourceHeroId: hero.id,
				targetHeroIds: [],
				targetEnemyIds: [enemy.id],
				value: result.enemyDamageTaken,
				round: gameOf(next).combat?.round ?? 0,
			},
		});
		if (pendingTriggerInterruptOf(next) || pendingSkillChoiceOf(next)) return next;
	}
	if (
		reducedHeroDamage &&
		reducedHeroDamage.damage >= hero.currentLife &&
		reducedHeroDamage.damage > 0
	) {
		next = resolveSkillWindow(engine, next, {
			event: "evt_would_be_destroyed",
			resume: { type: "resolve_attack" },
			ctx: {
				triggeredBy: "evt_would_be_destroyed",
				sourceEnemyId: enemy.id,
				targetHeroIds: [hero.id],
				targetEnemyIds: [enemy.id],
				value: reducedHeroDamage.damage,
				round: gameOf(next).combat?.round ?? 0,
			},
		});
		if (pendingTriggerInterruptOf(next) || pendingSkillChoiceOf(next)) return next;
	}

	next = appendAlphaLog(next,
		`Cálculo do ataque: ${cardName(engine, hero.cardId)} (${roll!.heroTotal}) × ${cardName(engine, enemy.cardId)} (${roll!.enemyTotal}); margem ${rollMargin >= 0 ? "+" : ""}${rollMargin}; dano do herói ${hero.damage} ${heroDamage.breakdown.map((part) => `${part.source} ${part.value >= 0 ? "+" : ""}${part.value}`).join(", ") || "sem bônus"} = ${heroDamage.damage}; dano do inimigo ${enemy.damage} ${enemyDamage.breakdown.map((part) => `${part.source} ${part.value >= 0 ? "+" : ""}${part.value}`).join(", ") || "sem bônus"} = ${enemyDamage.damage}; dano previsto: herói ${reducedHeroDamage?.damage ?? 0}, inimigo ${result.enemyDamageTaken}.`);
	const enemyDamageLog =
		result.enemyDamageTaken > 0
			? `${cardName(engine, enemy.cardId)} sofreu ${result.enemyDamageTaken} de dano${result.outcome === "tie" ? " (empate)" : ""}${formatDamageBonusNote(hero.damage, heroDamage.damage, heroDamage.breakdown)}. Herói: ${fmtRoll(roll!.heroResults, roll!.heroBreakdown, roll!.heroTotal)} vs inimigo: ${roll!.enemyTotal}.`
			: undefined;
	const heroDamageLog = reducedHeroDamage
		? `${cardName(engine, hero.cardId)} sofreu ${reducedHeroDamage.damage} de dano${result.outcome === "tie" ? " (empate)" : ""}${reducedHeroDamage.breakdown.length ? ` [${reducedHeroDamage.breakdown.join(", ")}]` : ""}. Inimigo: ${fmtRoll(roll!.enemyResults, roll!.enemyBreakdown, roll!.enemyTotal)} vs herói: ${roll!.heroTotal}.`
		: undefined;
	const attackResume: AttackResume = {
		stage: "after_enemy_damage",
		heroId: hero.id,
		enemyId: enemy.id,
		heroDamageAmount: reducedHeroDamage?.damage ?? 0,
		enemyDamageLog,
		heroDamageLog,
	};

	// on_deal_damage: agora via TriggerComponent em emit(DamageDealt) dentro de applyDamage
	if (result.enemyDamageTaken > 0) {
		next = applyDamage(engine, next, enemy.id, result.enemyDamageTaken, {
			sourceId: hero.id,
			damageType: "attack",
			skipWouldBeDestroyed: true,
		});
		if (
			pendingTriggerInterruptOf(next) ||
			pendingSkillChoiceOf(next) ||
			pendingSkillTargetOf(next)
		)
			return attachAttackResume(next, attackResume);
	}
	return resumeAttackAfterDamage(engine, next, attackResume);
}

function recordExtraAttack(state: GameState, enemy: EnemyState, heroId: string): { state: GameState; extraAttackId: number } {
	const previous = gameOf(state).extraAttackFeedback ?? [];
	const extraAttackId = (previous.at(-1)?.id ?? 0) + 1;
	return {
		extraAttackId,
		state: withGame(state, (g) => ({
			...g,
			extraAttackFeedback: [...previous.slice(-31), { id: extraAttackId, enemyId: enemy.id, enemyCardId: enemy.cardId, heroId }],
		})),
	};
}

function resolveExtraPhysicalAttack(engine: GameEngine, state: GameState, roll: CombatRollResult): GameState {
	const backToDamage = (base: GameState): GameState =>
		withGame(clearLastRoll(base), (g) => ({ ...g, status: "DIRECT_DAMAGE" }));
	const target = heroesOf(state).find((hero) => hero.id === roll.heroId && hero.status === "active");
	const enemy = enemiesOf(state).find((entry) => entry.id === roll.enemyId && entry.status === "active");
	if (!target || !enemy) return backToDamage(state);
	const recorded = recordExtraAttack(state, enemy, target.id);
	let next = recorded.state;
	if (roll.enemyTotal <= roll.heroTotal) {
		return log(backToDamage(next),
			`Ataque extra: ${cardName(engine, enemy.cardId)} rolou ${roll.enemyTotal} contra ${cardName(engine, target.cardId)} (${roll.heroTotal}) e não causou dano.`);
	}
	const enemyDamage = effectiveEnemyDamage(enemy, next);
	const reduced = reduceHeroDamage(engine, next, target, enemyDamage.damage, "attack");
	const dmg = reduced.damage;
	next = applyDamage(engine, next, target.id, dmg, { sourceId: enemy.id, damageType: "attack", extraAttackId: recorded.extraAttackId });
	if (pendingTriggerInterruptOf(next)) return next;
	const enemyRollStr = fmtRoll(roll.enemyResults, roll.enemyBreakdown, roll.enemyTotal);
	const reductionStr = reduced.breakdown.length ? ` [${reduced.breakdown.join(", ")}]` : "";
	return log(backToDamage(next),
		`Ataque extra: ${cardName(engine, enemy.cardId)} venceu ${cardName(engine, target.cardId)} e causou ${dmg} de dano${reductionStr}. Inimigo: ${enemyRollStr} vs ${roll.heroTotal}.`);
}

function attachAttackResume(state: GameState, attack: AttackResume): GameState {
	const window = pendingSkillWindowOf(state);
	if (!window || window.resume.type !== "continue_damage") return state;
	return withPendingSkillWindow(state, {
			...window,
			resume: { ...window.resume, afterAttack: attack },
		});
}

export function resumeAttackAfterDamage(engine: GameEngine, 
	state: GameState,
	attack: AttackResume,
): GameState {
	let next = state;
	if (attack.stage === "after_enemy_damage") {
		const hero = heroesOf(next).find((entry) => entry.id === attack.heroId);
		if (attack.enemyDamageLog) {
			if (hero) next = logItemLifeDrain(engine, next, hero);
			next = log(next, attack.enemyDamageLog);
		}
		if (attack.heroDamageAmount > 0) {
			next = applyDamage(engine, next, attack.heroId, attack.heroDamageAmount, {
				sourceId: attack.enemyId,
				damageType: "attack",
				skipWouldBeDestroyed: true,
			});
			if (
				pendingTriggerInterruptOf(next) ||
				pendingSkillChoiceOf(next) ||
				pendingSkillTargetOf(next)
			)
				return attachAttackResume(next, {
					...attack,
					stage: "after_hero_damage",
				});
		}
	}
	if (attack.heroDamageLog) next = log(next, attack.heroDamageLog);
	for (const mage of heroesOf(next).filter((entry) =>
		skillsOf(engine, entry.cardId).some(({ def }) => def.id === HERO_ABILITY_IDS.skill_rift_rune))) {
		const key = `${mage.id}:${attack.heroId}`;
		if (!scopedFlagOf(next, "combat", "riftRuneTarget", key)) continue;
		next = withScopedFlag(next, "combat", "riftRuneTarget", key, false);
		next = withWorld(next, removeComponent(worldOf(next), attack.heroId,
			(component) => component.type === "modifier" && component.source === `${HERO_ABILITY_IDS.skill_rift_rune}:${mage.id}`));
		if (enemiesOf(next).some((enemy) => enemy.id === attack.enemyId && enemy.status === "defeated")) {
			next = withScopedFlag(next, "round", "oncePer", `${HERO_ABILITY_IDS.skill_rift_rune}::${mage.id}`, false);
			next = applyDamage(engine, next, mage.id, 2, { sourceId: mage.id, damageType: "direct" });
			if (pendingTriggerInterruptOf(next) || pendingSkillChoiceOf(next) || pendingSkillTargetOf(next)) {
				return attachAttackResume(next, { ...attack, stage: "after_hero_damage" });
			}
		}
	}
	next = withWorld(next, removeComponent(worldOf(next), attack.heroId,
		(component) => component.type === "modifier" && component.source === HERO_ABILITY_IDS.power_deep_veil_echo));
	next = withWorld(next, tickModifierDurations(worldOf(next), "once_consumed"));
	return advanceAfterEnemyDefeat(
		endHeroTurnAndAdvance(next, attack.heroId, "atacou"),
	);
}

// ─── DIRECT_DAMAGE ───────────────────────────────────────────────────────────

function resolveExtraEnemyCombatRoll(engine: GameEngine, 
	state: GameState,
	enemy: EnemyState,
): GameState {
	const target = selectTargetHero(heroesOf(state));
	if (!target) return state;

	let next = state;

	next = resolveSkillWindow(engine, next, {
		event: "evt_targeted",
		ctx: {
			triggeredBy: "evt_targeted",
			sourceEnemyId: enemy.id,
			targetHeroIds: [target.id],
			round: gameOf(next).combat?.round ?? 0,
		},
	});
	if (pendingTriggerInterruptOf(next)) return next;

	if (
		gameOf(next).combat &&
		scopedFlagOf(next, "combat", "targetProtection", target.id)
	) {
		return log(
			withScopedFlag(next, "combat", "targetProtection", target.id, false),
			`${cardName(engine, target.cardId)} ignorou o efeito que o escolheria como alvo.`,
		);
	}

	next = resolveSkillWindow(engine, next, {
		event: "evt_attack_declared",
		ctx: {
			triggeredBy: "evt_attack_declared",
			sourceEnemyId: enemy.id,
			targetHeroIds: [target.id],
			targetEnemyIds: [enemy.id],
			round: gameOf(next).combat?.round ?? 0,
		},
	});
	if (pendingTriggerInterruptOf(next)) return next;
	next = drainStack(engine, next);

	const currentTarget = heroesOf(next).find(
		(h) => h.id === target.id && h.status === "active",
	);
	const currentEnemy = enemiesOf(next).find(
		(e) => e.id === enemy.id && e.status === "active",
	);
	if (!currentTarget || !currentEnemy) return next;

	const { result: heroRollResult, next: rng1 } = rollDiceRng(
		currentTarget.dice,
		gameOf(next).rng,
	);
	const { result: enemyRollResult, next: rng2 } = rollDiceRng(
		currentEnemy.dice,
		rng1,
	);
	next = withGame(next, (prevGame) => ({ ...prevGame, rng: rng2 }));

	const heroBonuses = collectHeroBonuses(engine, currentTarget, next, currentEnemy);
	const enemyBonuses = collectEnemyBonuses(currentEnemy, next);
	const heroCalc = calculateTotal(heroRollResult.results, heroBonuses);
	const enemyCalc = calculateTotal(enemyRollResult.results, enemyBonuses);

	next = recordEvent(next, "RollResolved", {
		heroId: currentTarget.id,
		enemyId: currentEnemy.id,
		heroTotal: heroCalc.total,
		enemyTotal: enemyCalc.total,
		heroResults: heroRollResult.results,
		enemyResults: enemyRollResult.results,
	});
	next = resolveSkillWindow(engine, next, {
		event: "evt_roll",
		ctx: {
			triggeredBy: "evt_roll",
			sourceHeroId: currentTarget.id,
			sourceEnemyId: currentEnemy.id,
			targetHeroIds: [currentTarget.id],
			targetEnemyIds: [currentEnemy.id],
			value: heroCalc.total - enemyCalc.total,
			round: gameOf(next).combat?.round ?? 0,
		},
	});
	if (pendingTriggerInterruptOf(next)) return next;

	const recorded = recordExtraAttack(next, currentEnemy, currentTarget.id);
	const extraAttackId = recorded.extraAttackId;
	next = recorded.state;

	if (enemyCalc.total <= heroCalc.total) {
		return log(
			next,
			`Ataque extra: ${cardName(engine, currentEnemy.cardId)} rolou ${enemyCalc.total} contra ${cardName(engine, currentTarget.cardId)} (${heroCalc.total}) e não causou dano.`,
		);
	}

	const enemyDamage = effectiveEnemyDamage(currentEnemy, next);
	const reduced = reduceHeroDamage(engine, 
		next,
		currentTarget,
		enemyDamage.damage,
		"attack",
	);
	const dmg = reduced.damage;

	next = applyDamage(engine, next, currentTarget.id, dmg, {
		sourceId: currentEnemy.id,
		damageType: "attack",
		extraAttackId,
	});
	if (pendingTriggerInterruptOf(next)) return next;

	const enemyRollStr = fmtRoll(
		enemyRollResult.results,
		enemyBonuses,
		enemyCalc.total,
	);
	const reductionStr = reduced.breakdown.length
		? ` [${reduced.breakdown.join(", ")}]`
		: "";

	return log(
		next,
		`Ataque extra: ${cardName(engine, currentEnemy.cardId)} venceu ${cardName(engine, currentTarget.cardId)} e causou ${dmg} de dano${reductionStr}. Inimigo: ${enemyRollStr} vs herói: ${heroCalc.total}.`,
	);
}

export function handleDirectDamage(engine: GameEngine, state: GameState): GameState {
	if (!gameOf(state).combat) return state;
	const attacked = new Set(gameOf(state).combat!.pairs.map((p) => p.enemyId));
	const activeEnemies = enemiesOf(state).filter(
		(e) => e.status === "active",
	);
	// Mantém a mesma regra para o caminho legado sem rolagem física.
	// Inimigos que não tiveram par na rodada ainda têm direito ao ataque.
	const extraEnemies = activeEnemies.filter((e) => !attacked.has(e.id));
	let next = state;
	if (extraEnemies.length === 0)
		return withGame(state, (prevGame) => ({ ...prevGame, status: "CHECK_COMBAT_END" }));

	for (const enemy of extraEnemies) {
		next = resolveExtraEnemyCombatRoll(engine, next, enemy);
	}

	return withGame(next, (prevGame) => ({ ...prevGame, status: "CHECK_COMBAT_END" }));
}

// ─── CHECK_COMBAT_END ─────────────────────────────────────────────────────────

export function handleCheckCombatEnd(engine: GameEngine, state: GameState): GameState {
	const allEnemiesDone = enemiesOf(state).every(
		(e) => e.status !== "active",
	);
	const activeHeroes = heroesOf(state).filter((h) => h.status === "active");

	// Todos os heróis fugiram enquanto há inimigos → reiniciar masmorra
	if (
		activeHeroes.length === 0 &&
		fledHeroesOf(state).length > 0 &&
		!allEnemiesDone
	) {
		return log(
			withGame(clearDamageOverTime(state), (prevGame) => ({ ...prevGame, status: "DUNGEON_RESTART_PROMPT" })),
			"Todos os heróis fugiram. Reiniciar masmorra?",
		);
	}

	const heroDefeated = heroesOf(state).every((h) => h.status !== "active");

	if (heroDefeated && fledHeroesOf(state).length === 0) {
		return log(withGame(clearDamageOverTime(state), (prevGame) => ({ ...prevGame, status: "DEFEAT" })), "Derrota: herói eliminado.");
	}

	if (allEnemiesDone) {
		const defeated = gameOf(state).activeEnemies.filter((e) => e.status === "defeated");
		// Inimigos que fugiram voltam ao deck
		const fled = enemiesOf(state).filter((e) => e.status === "fled");
		let next = clearDamageOverTime(state);
		if (fled.length > 0) {
			const fleeIds = fled.map((e) => e.cardId);
			next = shuffleDeck(
				withDeck(next, "enemyDeck", {
					...deckOf(next, "enemyDeck"),
					available: [...deckOf(next, "enemyDeck").available, ...fleeIds],
				}),
				"enemyDeck",
			);
		}
		return log(
			withGame(next, (prevGame) => ({ ...prevGame, status: "REWARD_PHASE", creaturesDefeated: gameOf(next).creaturesDefeated + defeated.length, enemyGraveyard: [...gameOf(next).enemyGraveyard, ...defeated], activeEnemies: [], combat: gameOf(next).combat
					? {
							...gameOf(next).combat!,
							round: gameOf(next).combat!.round + 1,
							pairs: [],
							heroesActed: [],
							disabled: {},
						}
					: null })),
			"Sala limpa! Avançando para recompensa.",
		);
	}

	// Próxima rodada — reset completo com phase="selecting_hero"
	const nextRound = (gameOf(state).combat?.round ?? 0) + 1;
	const nextCombat = gameOf(state).combat
		? {
				...gameOf(state).combat!,
				round: nextRound,
				phase: "selecting_hero" as const,
				selectedHeroId: null,
				pairs: [],
				heroesActed: [],
				lastRoll: null,
				disabled: ActivationTracker.clearLocks(gameOf(state).combat!.disabled, "round"),
			}
		: createEmptyCombatState();
	const currentRound = gameOf(state).combat?.round ?? 0;
	let nextState = resolveSkillWindow(engine, state, {
		event: "evt_round_end",
		ctx: {
			triggeredBy: "evt_round_end",
			round: currentRound,
		},
	});
	if (pendingTriggerInterruptOf(nextState)) return nextState;
	nextState = drainStack(engine, nextState);
	nextState = resolvePoisonRound(engine, nextState);
	nextState = resolveDamageOverTimeRound(engine, nextState);
	if (heroesOf(nextState).every((hero) => hero.status !== "active") ||
		enemiesOf(nextState).every((enemy) => enemy.status !== "active")) {
		return handleCheckCombatEnd(engine, nextState);
	}

	// Expirar modificadores ECS de duração "end_of_round" (this_turn) e decrementar rounds.
	const worldAfterTick = decrementRoundsModifiers(
		tickModifierDurations(worldOf(nextState), "end_of_round"),
	);
	const rolledOver = withGame(nextState, (prevGame) => ({ ...prevGame, status: "HERO_ACTION" as const, combat: nextCombat }));
	nextState = tickBlockEntries(
		withWorld(
			gameOf(state).combat ? beginRound(engine, rolledOver) : beginCombat(engine, rolledOver),
			worldAfterTick,
		),
		"end_of_round",
	);

	nextState = resolveSkillWindow(engine, nextState, {
		event: "evt_round_start",
		ctx: {
			triggeredBy: "evt_round_start",
			round: nextRound,
			targetHeroIds: gameOf(nextState).heroes
				.filter((hero) => hero.status === "active")
				.map((hero) => hero.id),
			targetEnemyIds: gameOf(nextState).activeEnemies
				.filter((enemy) => enemy.status === "active")
				.map((enemy) => enemy.id),
		},
	});

	return log(nextState, `Rodada ${nextRound + 1} de combate.`);
}

// ─── USE_ITEM ─────────────────────────────────────────────────────────────────

export function handleUseItem(engine: GameEngine, 
	state: GameState,
	itemId: string,
	heroId: string,
	targetHeroId?: string,
	targetEnemyId?: string,
): GameState {
	// Resolve a skill do item via catálogo
	const itemCard = cardById(engine, itemId);
	const explicitGrant = itemCard?.grants?.find(
		(grant) => grant.activation.kind === "manual",
	);
	const eventGrant = itemCard?.grants?.find(
		(grant) => grant.activation.kind === "event" && grant.activation.decision === "optional",
	);
	if (itemCard?.grants?.length) {
		if (eventGrant && !explicitGrant) {
			const unavailable = manualItemUnavailableReason(engine, state, heroId, itemId);
			if (unavailable) return log(state, `[AVISO] ${unavailable}`);
			const key = preparedAbilityKey("item", heroId, itemId,
				eventGrant.abilityId, eventGrant.id);
			return log(togglePreparedAbility(state, {
				key, sourceKind: "item", sourceHeroId: heroId,
				sourceCardId: itemId, abilityId: eventGrant.abilityId,
				grantId: eventGrant.id, event: eventGrant.activation.event!,
			}), `${cardName(engine, itemId)}: ${isAbilityPrepared(state, key) ? "preparação cancelada" : "preparado"}.`);
		}
		if (!explicitGrant) {
			return log(
				state,
				`${cardName(engine, itemId)} reage a uma janela do jogo e não pode ser usado manualmente.`,
			);
		}
		const unavailable = manualItemUnavailableReason(engine, state, heroId, itemId);
		if (unavailable) return log(state, `[AVISO] ${unavailable}`);
		const source = {
			kind: "item" as const,
			cardId: itemId,
			sourceHeroId: heroId,
		};
		const selection = resolveManualGrantTarget(engine, 
			state,
			source,
			explicitGrant,
			targetHeroId || targetEnemyId
				? [targetHeroId ?? targetEnemyId!]
				: undefined,
		);
		if (selection.kind !== "ready") {
			return log(
				state,
				selection.kind === "unavailable" ? selection.reason : selection.prompt,
			);
		}
		return advanceAfterEnemyDefeat(
			executeAbilityGrant(engine, state, {
				source,
				grant: explicitGrant,
				triggeredBy: "manual",
				targetIds: selection.targetIds,
			}),
		);
	}
	const itemSkillRef = itemCard ? skillsOf(engine, itemCard.id)[0] : null;
	const skillDef = itemSkillRef?.def ?? null;
	const itemName = cardName(engine, itemId);
	if (!skillDef) {
		return log(state, `[TODO] Efeito de item não catalogado: ${itemName}`);
	}
	if (skillDef.operate_type === "op_triggered") {
		if (!isVoluntaryTrigger(skillDef, "item", skillDef.trigger!.event))
			return log(state, "[AVISO] Esta habilidade é automática.");
		const unavailable = manualItemUnavailableReason(engine, state, heroId, itemId);
		if (unavailable) return log(state, `[AVISO] ${unavailable}`);
		const key = preparedAbilityKey("item", heroId, itemId, skillDef.id);
		return log(togglePreparedAbility(state, {
			key, sourceKind: "item", sourceHeroId: heroId,
			sourceCardId: itemId, abilityId: skillDef.id,
			event: skillDef.trigger!.event,
		}), `${itemName}: ${isAbilityPrepared(state, key) ? "preparação cancelada" : "preparado"}.`);
	}

	// Alguns itens reativos tambem podem ser acionados manualmente pelo jogador
	// (ex: prevenir o proximo descarte de dungeon).
	if (!itemCanBeUsedManually(skillDef)) {
		return log(
			state,
			`${itemName} não pode ser usado agora (efeito: ${skillDef.trigger}).`,
		);
	}

	const unavailable = manualItemUnavailableReason(engine, state, heroId, itemId);
	if (unavailable) return log(state, `[AVISO] ${unavailable}`);
	const hero = heroesOf(state).find((h) => h.id === heroId)!;
	const selection = resolveManualSkillTarget(engine, 
		state,
		skillDef,
		heroId,
		targetHeroId || targetEnemyId
			? [targetHeroId ?? targetEnemyId!]
			: undefined,
	);
	if (selection.kind !== "ready") {
		return log(
			state,
			selection.kind === "unavailable" ? selection.reason : selection.prompt,
		);
	}

	const grant = abilityGrants(engine, itemId).find((entry) =>
		entry.abilityId === skillDef.id && entry.activation.kind === "manual");
	if (!grant) return log(state, `[AVISO] Concessão manual não encontrada: ${skillDef.id}`);
	const source = { kind: "item" as const, cardId: itemId, sourceHeroId: heroId };
	const grantUnavailable = canExecuteAbilityGrant(engine, state, source, grant, "manual");
	if (grantUnavailable) return log(state, `[AVISO] ${grantUnavailable}`);
	const heroName = hero ? cardName(engine, hero.cardId) : heroId;
	const consumed = itemShouldBeConsumed(engine, itemId);
	const afterCost = consumed ? removeHeroItem(state, heroId, itemId) : state;
	const withItemCost: GameState = log(
		consumed
			? withDecks(afterCost, {
						...decksOf(afterCost),
						itemDeck: {
							...deckOf(afterCost, "itemDeck"),
							discarded: [...deckOf(afterCost, "itemDeck").discarded, itemId],
						},
					})
			: state,
		consumed
			? `${heroName} descartou ${itemName} para ativar o efeito.`
			: `${heroName} usou ${itemName}.`,
	);
	const executeItem = (current: GameState): GameState => {
		const used = executeAbilityGrant(engine, current, {
			source, grant, triggeredBy: "manual", targetIds: selection.targetIds,
		});
		return advanceAfterEnemyDefeat(maybeDisableReusableItem(engine, 
			log(used, `${heroName} usou ${itemName}.`), heroId, itemId, consumed,
		));
	};

	// itemControl: inimigo do par atual pode ignorar o 1º efeito de item
	const currentPairEnemyId = selection.targetIds.find((id) =>
		enemiesOf(state).some((enemy) => enemy.id === id),
	);
	if (currentPairEnemyId) {
		// itemControl: inimigo do par atual pode ignorar o 1º efeito de item (Evasão das Fendas)
		if (
			gameOf(withItemCost).combat &&
			scopedFlagOf(withItemCost, "combat", "itemControl", currentPairEnemyId)
		) {
			const blocked = log(
				withScopedFlag(
					withItemCost,
					"combat",
					"itemControl",
					currentPairEnemyId,
					false,
				),
				`${currentPairEnemyId}: Evasão das Fendas — efeito de item bloqueado.`,
			);
			return maybeDisableReusableItem(engine, blocked, heroId, itemId, consumed);
		}
		const roomFirstTime =
			!gameOf(state).flags[`itemEffect::${currentPairEnemyId}::${heroId}`];
		let afterItemEmit = roomFirstTime
			? withGame(state, (prevGame) => ({ ...prevGame, flags: {
						...gameOf(state).flags,
						[`itemEffect::${currentPairEnemyId}::${heroId}`]: true,
					} }))
			: state;
		({ state: afterItemEmit } = emit(engine, afterItemEmit, {
			type: "ItemEffectAppliedTo",
			payload: { heroId, itemId, sourceId: currentPairEnemyId, roomFirstTime },
		}));
		return executeItem(afterItemEmit);
	}

	return executeItem(state);
}

// ─── USE_POWER ────────────────────────────────────────────────────────────────

export function handleUsePower(engine: GameEngine, state: GameState, heroId: string): GameState {
	const hero = heroesOf(state).find((h) => h.id === heroId);
	if (!hero) return state;
	if (gameOf(state).flags.powerUseBlocked) {
		return log(state, "Uso de poder bloqueado nesta sala.");
	}
	if (gameOf(state).combat && ActivationTracker.isHeroDisabledThisRound(state, heroId)) {
		return log(state, `[AVISO] Herói ${heroId} já agiu nesta rodada.`);
	}

	const heroCard = cardById(engine, hero.cardId);
	const powerEntry = heroCard
		? skillsOf(engine, heroCard.id).find(({ def }) => def.category === "hero_power")
		: null;
	const powerDef = powerEntry?.def ?? null;
	if (!powerDef) {
		return log(
			state,
			`[TODO] Poder não catalogado para: ${cardName(engine, hero.cardId)}`,
		);
	}

	return handleUseSkill(engine, state, { skillId: powerDef.id, sourceId: heroId });
}

export function handleUseSkill(engine: GameEngine, 
	state: GameState,
	payload: UseSkillPayload,
): GameState {
	const hero = heroesOf(state).find(
		(h) => h.id === payload.sourceId && h.status === "active",
	);
	if (!hero) return fireOnUseSkill(engine, state, payload);

	const skillDef = skillById(engine, payload.skillId);
	if (!skillDef) {
		return fireOnUseSkill(engine, state, payload);
	}
	if (skillDef.operate_type === "op_triggered") {
		if (!isVoluntaryTrigger(skillDef, "hero", skillDef.trigger!.event))
			return log(state, "[AVISO] Esta habilidade reage automaticamente ao evento da carta.");
		if (pausedOf(state) || pendingSkillChoiceOf(state) || pendingSkillTargetOf(state) || pendingTriggerInterruptOf(state))
			return log(state, "[AVISO] Conclua a escolha pendente primeiro.");
		if (["SETUP", "VICTORY", "DEFEAT", "ROLL_DICE", "RESOLVE_ATTACK", "DIRECT_DAMAGE"].includes(gameOf(state).status))
			return log(state, "[AVISO] Esta reação não pode ser preparada agora.");
		if (!skillsOf(engine, hero.cardId).some(({ def }) => def.id === skillDef.id))
			return log(state, "[AVISO] Esta habilidade não pertence ao herói.");
		const key = preparedAbilityKey("hero", hero.id, hero.cardId, skillDef.id);
		if (!isAbilityPrepared(state, key) && (
			(gameOf(state).combat && ActivationTracker.isHeroDisabledThisRound(state, hero.id) &&
				![HERO_ABILITY_IDS.power_supreme_rift_rune, HERO_ABILITY_IDS.skill_preserved_path].some((allowedId) => allowedId === skillDef.id)) ||
			!guardPassed(state, skillDef, hero.id) ||
			hero.currentLife <= (skillDef.cost?.hp ?? 0)
		)) return log(state, "[AVISO] Esta reação está indisponível.");
		return log(togglePreparedAbility(state, {
			key, sourceKind: "hero", sourceHeroId: hero.id,
			sourceCardId: hero.cardId, abilityId: skillDef.id,
			event: skillDef.trigger!.event,
			...(skillDef.id === HERO_ABILITY_IDS.power_supreme_rift_rune ? { roundPrepared: gameOf(state).combat?.round } : {}),
		}), `${skillDef.id}: ${isAbilityPrepared(state, key) ? "preparação cancelada" : "preparada"}.`);
	}
	if (!isManuallyActivatable(skillDef)) return fireOnUseSkill(engine, state, payload);
	if (
		pendingSkillChoiceOf(state) ||
		pendingSkillTargetOf(state) ||
		pendingTriggerInterruptOf(state) ||
		pausedOf(state)
	) {
		return log(state, "[AVISO] Conclua a escolha pendente primeiro.");
	}
	if (
		(gameOf(state).status === "HERO_ACTION" || gameOf(state).status === "BOSS_COMBAT") &&
		gameOf(state).combat?.phase !== "selecting_hero" &&
		gameOf(state).combat?.phase !== "selecting_target"
	) {
		return log(state, "[AVISO] Aguarde uma janela de ação para usar a habilidade.");
	}

	if (gameOf(state).combat && ActivationTracker.isHeroDisabledThisRound(state, payload.sourceId) &&
		!([HERO_ABILITY_IDS.skill_return_rite, HERO_ABILITY_IDS.skill_prey_mark, HERO_ABILITY_IDS.spend_deep_veil_echo].some((allowedId) => allowedId === skillDef.id))) {
		return log(
			state,
			`[AVISO] Herói ${payload.sourceId} já agiu nesta rodada.`,
		);
	}

	if (!skillsOf(engine, hero.cardId).some(({ def }) => def.id === skillDef.id)) {
		return log(state, "[AVISO] Esta habilidade não pertence ao herói.");
	}
	const currentPreyId = gameOf(state).combat?.preyByHero[hero.id];
	const currentPrey = enemiesOf(state).find(
		(enemy) => enemy.id === currentPreyId && enemy.status === "active",
	);
	if (skillDef.effect?.some((effect) => effect.kind === "i_mark_target") && currentPrey) {
		return log(
			state,
			"A Presa atual deve ser derrotada antes de marcar outro inimigo.",
		);
	}
	if (
		!guardPassed(state, skillDef, hero.id) ||
		hero.currentLife <= (skillDef.cost?.hp ?? 0)
	) {
		return log(
			state,
			"[AVISO] Habilidade indisponível: limite de uso ou custo de vida.",
		);
	}
	if (skillDef.id === HERO_ABILITY_IDS.skill_return_rite && deckOf(state, "dungeonDeck").discarded.length === 0) {
		return log(state, "[AVISO] Não há cartas de masmorra descartadas para recuperar.");
	}
	if (skillDef.id === HERO_ABILITY_IDS.skill_rift_rune && !["HERO_ACTION", "BOSS_COMBAT"].includes(gameOf(state).status)) {
		return log(state, "[AVISO] Runa das Fendas só pode ser usada durante o combate.");
	}
	if (skillDef.id === HERO_ABILITY_IDS.spend_deep_veil_echo && (!["HERO_ACTION", "BOSS_COMBAT"].includes(gameOf(state).status) || scopedCountOf(state, "game", "eco", hero.id) <= 0)) {
		return log(state, "[AVISO] Não há Eco disponível para gastar neste combate.");
	}

	const target = resolveManualSkillTarget(engine, 
		state,
		skillDef,
		payload.sourceId,
		payload.targetIds,
	);
	if (target.kind === "unavailable") {
		return log(state, `[AVISO] ${skillDef.id}: ${target.reason}`);
	}
	if (target.kind === "needs_selection") {
		return withPendingSkillTarget(state, {
				skillId: payload.skillId,
				sourceId: payload.sourceId,
				prompt: target.prompt,
				candidates: target.candidates,
			});
	}

	const used = advanceAfterEnemyDefeat(fireOnUseSkill(engine, state, {
		...payload, targetIds: [...target.targetIds],
	}));
	return skillDef.action_cost === "consume_hero_action" && gameOf(used).combat &&
		!pendingSkillChoiceOf(used) && !pendingSkillTargetOf(used) && !pendingTriggerInterruptOf(used)
		? advanceAfterHeroDisabledForRound(used) : used;
}

export function handleSelectSkillTarget(engine: GameEngine, 
	state: GameState,
	targetId: string,
): GameState {
	const pending = pendingSkillTargetOf(state);
	if (!pending) return state;
	if (!pending.candidates.some((candidate) => candidate.id === targetId)) {
		return log(state, `[AVISO] Alvo inválido para ${pending.skillId}.`);
	}
	return handleUseSkill(engine, 
		withPendingSkillTarget(state, undefined),
		{
			skillId: pending.skillId,
			sourceId: pending.sourceId,
			targetIds: [targetId],
		},
	);
}

export function handleCancelSkillTarget(state: GameState): GameState {
	const pending = pendingSkillTargetOf(state);
	if (!pending) return state;
	const cleared = withPendingSkillTarget(state, undefined);
	return log(cleared, "Seleção de alvo cancelada sem consumir uso.");
}

// ─── SELECT_DIE ──────────────────────────────────────────────────────────────

export function handleSelectDie(
	engine: GameEngine,
	state: GameState,
	side: "hero" | "enemy",
	index: number,
	value?: number,
): GameState {
	const sel = gameOf(state).combat?.pendingDiceSelection;
	if (!sel || !gameOf(state).combat?.lastRoll) return state;
	const roll = gameOf(state).combat!.lastRoll!;

	// Verificar filtro
	const results =
		side === "hero" ? [...roll!.heroResults] : [...roll!.enemyResults];
	const dieValue = results[index];
	if (dieValue === undefined)
		return log(state, "[AVISO] Índice de dado inválido.");
	if (!isEligibleDie(sel, side, index, results)) {
		return log(state, "[AVISO] Este dado não é elegível para a ação.");
	}

	let newValue: number;
	let stateAfterRng = state;
	if (sel.deltaMax !== undefined || sel.action === "set_to") {
		const allowed = dieReplacementValues(sel, dieValue);
		const chosen = sel.deltaMax !== undefined ? value : (sel.setToValue ?? 6);
		if (chosen === undefined || !allowed.includes(chosen)) {
			return log(state, "[AVISO] Escolha um valor permitido pela habilidade.");
		}
		newValue = chosen;
		if (newValue === dieValue) return log(state, "[AVISO] Escolha um valor diferente do atual.");
	} else {
		if (value !== undefined) {
			if (!Number.isInteger(value) || value < 1 || value > 6) return state;
			newValue = value;
		} else {
			const { result, next: rngNext } = rollDiceRng(1, gameOf(state).rng);
			newValue = result.results[0] ?? 1;
			stateAfterRng = withGame(state, (prevGame) => ({ ...prevGame, rng: rngNext }));
		}
	}

	results[index] = newValue;

	// Recalcular total
	const breakdownToUse =
		side === "hero" ? roll!.heroBreakdown : roll!.enemyBreakdown;
	const newCalc = calculateTotal(results, [...breakdownToUse]);

	const newRoll =
		side === "hero"
			? { ...roll, heroResults: results, heroTotal: newCalc.total }
			: { ...roll, enemyResults: results, enemyTotal: newCalc.total };

	const charge = gameOf(stateAfterRng).combat?.pendingDiceCommit;
	let committed = withGame(stateAfterRng, (prevGame) => ({ ...prevGame, combat: {
		...gameOf(stateAfterRng).combat!,
		lastRoll: newRoll,
		pendingDiceSelection: undefined,
		pendingDiceCommit: undefined,
	} }));
	if (charge) {
		const source = {
			kind: charge.sourceKind,
			cardId: charge.sourceCardId,
			...(charge.sourceHeroId ? { sourceHeroId: charge.sourceHeroId } : {}),
			...(charge.sourceEnemyId ? { sourceEnemyId: charge.sourceEnemyId } : {}),
		};
		const grant = abilityGrants(engine, charge.sourceCardId).find((entry) => entry.id === charge.grantId);
		if (grant) committed = markGrantUsed(engine, committed, source, grant);
		if (charge.preparedKey) committed = removePreparedAbility(committed, charge.preparedKey);
	}
	committed = log(committed,
		`Dado ${side === "hero" ? "aliado" : "inimigo"} [${index}] alterado de ${dieValue} para ${newValue}.`);
	const window = pendingSkillWindowOf(committed);
	if (!window) return committed;
	// Continue remaining reactions with the NEW margin, not the original one.
	const updatedWindow = window.event === "evt_roll"
		? { ...window, ctx: { ...window.ctx, value: newRoll.heroTotal - newRoll.enemyTotal } }
		: window;
	return resolveSkillWindow(engine, withPendingSkillWindow(committed, undefined), updatedWindow);
}

// ─── CANCEL_HERO_SELECTION ───────────────────────────────────────────────────

export function handleCancelHeroSelection(state: GameState): GameState {
	if (!gameOf(state).combat) return state;
	return log(
		withGame(state, (prevGame) => ({ ...prevGame, combat: {
				...gameOf(state).combat!,
				phase: "selecting_hero",
				selectedHeroId: null,
			} })),
		"Seleção de herói cancelada.",
	);
}

// ─── CHOOSE_HERO ──────────────────────────────────────────────────────────────
// Com 1 herói: auto-seleciona sem precisar de payload.
// Com múltiplos: valida que o herói está ativo e ainda não agiu nesta rodada.

export function handleChooseHero(state: GameState, heroId?: string): GameState {
	const activeHeroes = heroesOf(state).filter((h) => h.status === "active");
	if (activeHeroes.length === 0) {
		return log(withGame(state, (prevGame) => ({ ...prevGame, status: "DEFEAT" })), "Sem heróis ativos.");
	}

	// Validar herói específico, se informado
	if (heroId) {
		const hero = activeHeroes.find((h) => h.id === heroId);
		if (!hero) {
			return log(state, `[AVISO] Herói ${heroId} não está ativo.`);
		}
		if (ActivationTracker.isHeroDisabledThisRound(state, heroId)) {
			return log(state, `[AVISO] Herói ${heroId} já agiu nesta rodada.`);
		}
	}

	return withGame(state, (prevGame) => ({ ...prevGame, status: "HERO_ACTION" }));
}

export const combatHandler: GameHandler = {
	id: "combat",
	phases: [
		"COMBAT_START",
		"HERO_ACTION",
		"ROLL_DICE",
		"RESOLVE_ATTACK",
		"DIRECT_DAMAGE",
		"CHECK_COMBAT_END",
	],
	actions: [
		"START_COMBAT",
		"CHOOSE_HERO",
		"CHOOSE_HERO_FOR_ROUND",
		"PASS_HERO_ACTION",
		"CANCEL_HERO_SELECTION",
		"CHOOSE_TARGET",
		"ROLL_DICE",
		"RESOLVE_ATTACK",
		"APPLY_DAMAGE",
		"CHECK_COMBAT_END",
		"DIRECT_DAMAGE",
		"USE_ITEM",
		"USE_POWER",
		"USE_SKILL",
		"SELECT_DIE",
		"DECLARE_FLEE",
	],
	accepts(state, action) {
		if (action.type === "ROLL_DICE") return !isBossRoll(state);
		if (action.type === "RESOLVE_ATTACK") return !isBossAttack(state);
		return true;
	},
	legalActions(state) {
		switch (gameOf(state).status) {
			case "COMBAT_START":
				return [{ type: "START_COMBAT" }];
			case "HERO_ACTION":
				return [...targetPairs(state), { type: "CHECK_COMBAT_END" }];
			case "ROLL_DICE":
				return [{ type: "ROLL_DICE" }];
			case "RESOLVE_ATTACK":
				return [{ type: "RESOLVE_ATTACK" }];
			case "DIRECT_DAMAGE":
				return [{ type: "DIRECT_DAMAGE" }];
			case "CHECK_COMBAT_END":
				return [{ type: "CHECK_COMBAT_END" }];
			default:
				return [];
		}
	},
	apply(state, action, engine) {
		switch (action.type) {
			case "START_COMBAT":
				return handleStartCombat(engine, state);
			case "CHOOSE_HERO":
				return handleChooseHero(state, action.payload?.heroId);
			case "CHOOSE_HERO_FOR_ROUND":
				return handleChooseHeroForRound(engine, state, action.payload.heroId);
			case "PASS_HERO_ACTION":
				return handlePassHeroAction(engine, state, action.payload.heroId);
			case "CANCEL_HERO_SELECTION":
				return handleCancelHeroSelection(state);
			case "CHOOSE_TARGET":
				return handleChooseTarget(
					engine,
					state,
					action.payload.heroId,
					action.payload.enemyId,
				);
			case "ROLL_DICE":
				return handleRollDice(engine, state);
			case "RESOLVE_ATTACK":
				return handleResolveAttack(engine, state);
			case "APPLY_DAMAGE":
				return state;
			case "CHECK_COMBAT_END":
				return handleCheckCombatEnd(engine, state);
			case "DIRECT_DAMAGE":
				return handleDirectDamage(engine, state);
			case "USE_ITEM":
				return handleUseItem(
					engine,
					state,
					action.payload.itemId,
					action.payload.heroId,
					action.payload.targetHeroId,
					action.payload.targetEnemyId,
				);
			case "USE_POWER":
				return handleUsePower(engine, state, action.payload.heroId);
			case "USE_SKILL":
				return handleUseSkill(engine, state, action.payload);
			case "SELECT_DIE":
				return handleSelectDie(
					engine, state,
					action.payload.side,
					action.payload.index,
					action.payload.value,
				);
			case "DECLARE_FLEE":
				return handleDeclareFlee(engine, state, action.payload.heroId);
			default:
				return state;
		}
	},
};

export const physicalRollHandler: GameHandler = {
	id: "physical-roll",
	phases: ANY_PHASE,
	actions: ["PREPARE_PHYSICAL_ROLL", "PREPARE_EXTRA_ATTACK", "CONFIRM_DICE_ROLL"],
	legalActions: () => [],
	apply(state, action, engine) {
		switch (action.type) {
			case "PREPARE_PHYSICAL_ROLL":
				return handlePreparePhysicalRoll(engine, state);
			case "PREPARE_EXTRA_ATTACK":
				return handlePrepareExtraAttack(engine, state);
			case "CONFIRM_DICE_ROLL":
				return handleConfirmPhysicalRoll(engine, state, action.payload);
			default:
				return state;
		}
	},
};
