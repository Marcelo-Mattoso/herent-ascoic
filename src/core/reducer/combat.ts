// Handlers do loop de combate.
// Patch 2: fluxo sequencial — CHOOSE_HERO_FOR_ROUND → CHOOSE_TARGET → ROLL_DICE → RESOLVE_ATTACK → DIRECT_DAMAGE → CHECK_COMBAT_END.
// Vários heróis podem atacar o mesmo inimigo; inimigos excedentes fazem rolagens extras.
// Implementa efeitos de: item_rusty_dagger, item_cracked_shield, item_lesser_vigor_potion, hero_crimson_barbarian.

import { getCardName } from "../data/cardLocale";
import { getCardById } from "../data/cards";
import { cardAbilityGrants } from "../data/abilities";
import {
	canExecuteAbilityGrant,
	executeAbilityGrant,
	resolveManualGrantTarget,
} from "../abilities/executor";
import { preparedAbilityKey, togglePreparedAbility, isAbilityPrepared } from "../abilities/prepared";
import {
	decrementRoundsModifiers,
	removeEntity,
	removeModifiersForSource,
	removeTriggersAppliedBySource,
	tickModifierDurations,
} from "../ecs/world";
import { drainStack } from "../effects/resolver";
import { emit } from "../events/bus";
import type { DamageType } from "../events/types";
import { calculateTotal, resolveAttack } from "../rules/combat";
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
import { cardSkills, lookupSkillById } from "../skills/lookup";
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
import type { HeroState } from "../state/heroState";
import { selectTargetHero } from "../strategies/targetSelection";
import { applyDamage } from "../systems/damageSystem";
import { applyHeal } from "../systems/healSystem";
import { log, shuffleRng } from "./utils";

function activeHeroesPendingActivation(state: GameState): HeroState[] {
	return state.heroes.filter(
		(h) =>
			h.status === "active" &&
			!ActivationTracker.isHeroDisabledThisRound(state, h.id),
	);
}

export function advanceAfterHeroDisabledForRound(state: GameState): GameState {
	if (!state.combat) return state;
	const pendingHeroes = activeHeroesPendingActivation(state);

	if (pendingHeroes.length > 0) {
		const livingEnemies = state.activeEnemies.filter(
			(e) => e.status === "active",
		);
		if (livingEnemies.length === 0) {
			return {
				...state,
				status: "DIRECT_DAMAGE" as const,
				combat: {
					...state.combat,
					phase: "direct_damage" as const,
					selectedHeroId: null,
				},
			};
		}
		return log(
			{
				...state,
				status: (state.status === "BOSS_COMBAT"
					? "BOSS_COMBAT"
					: "HERO_ACTION") as "BOSS_COMBAT" | "HERO_ACTION",
				combat: {
					...state.combat,
					phase: "selecting_hero" as const,
					selectedHeroId: null,
				},
			},
			`Aguardando ação de ${pendingHeroes.length} herói(s).`,
		);
	}

	return {
		...state,
		status: "DIRECT_DAMAGE" as const,
		combat: {
			...state.combat,
			phase: "direct_damage" as const,
			selectedHeroId: null,
		},
	};
}

function endHeroTurnAndAdvance(
	state: GameState,
	heroId: string,
	_reason: string,
): GameState {
	const afterTurn = ActivationTracker.endHeroTurn(state, heroId);
	return advanceAfterHeroDisabledForRound(afterTurn);
}

/**
 * Itens de uso rápido não consomem a ação do herói. Se um deles eliminar a
 * última criatura, porém, ainda é preciso entrar no estado auto-avançável que
 * encerra o combate; caso contrário a tela permanece em HERO_ACTION sem alvo.
 */
export function advanceAfterEnemyDefeat(state: GameState): GameState {
	if (
		state.pendingTriggerInterrupt ||
		state.pendingSkillChoice ||
		state.pendingSkillTarget ||
		!state.combat ||
		(state.status !== "HERO_ACTION" &&
			state.status !== "RESOLVE_ATTACK" &&
			state.status !== "DIRECT_DAMAGE" &&
			state.status !== "CHECK_COMBAT_END") ||
		state.activeEnemies.some((enemy) => enemy.status === "active")
	) {
		return state;
	}
	return {
		...state,
		status: "CHECK_COMBAT_END",
		combat: {
			...state.combat,
			phase: "direct_damage",
			selectedHeroId: null,
		},
	};
}

// ─── START_COMBAT ────────────────────────────────────────────────────────────

export function handleStartCombat(state: GameState): GameState {
	let next: GameState = {
		...state,
		status: "HERO_ACTION",
		oncePer: {
			...state.oncePer,
			room: state.oncePer.room ?? state.combat?.oncePer.room ?? {},
		},
		combat: { ...createEmptyCombatState(), phase: "selecting_hero" },
	};
	const targetEnemyIds = next.activeEnemies
		.filter((enemy) => enemy.status === "active")
		.map((enemy) => enemy.id);
	const targetHeroIds = next.heroes
		.filter((hero) => hero.status === "active")
		.map((hero) => hero.id);
	next = resolveSkillWindow(next, {
		event: "evt_combat_start",
		ctx: {
			triggeredBy: "evt_combat_start",
			targetEnemyIds,
			targetHeroIds,
		},
	});
	if (next.pendingTriggerInterrupt) return next;
	next = resolveSkillWindow(next, {
		event: "evt_round_start",
		ctx: {
			triggeredBy: "evt_round_start",
			round: 1,
			targetHeroIds,
			targetEnemyIds,
		},
	});
	if (next.pendingTriggerInterrupt) return next;
	return log(next, "Combate iniciado.");
}

// ─── DECLARE_FLEE ────────────────────────────────────────────────────────────

export function handleDeclareFlee(state: GameState, heroId: string): GameState {
	if (!state.combat) {
		return log(state, "[AVISO] Fuga só possível durante combate.");
	}
	if (state.flags?.fleeBlocked) {
		return log(state, "[AVISO] Fuga bloqueada nesta sala.");
	}
	const hero = state.heroes.find(
		(h) => h.id === heroId && h.status === "active",
	);
	if (!hero) {
		return log(state, "[AVISO] Herói inválido ou inativo.");
	}
	if (hero.currentLife !== 1) {
		return log(state, "[AVISO] Fuga só permitida com 1 de vida.");
	}
	let next: GameState = {
		...state,
		combat: {
			...state.combat,
			fleeAttemptByHero: {
				...state.combat.fleeAttemptByHero,
				[heroId]: true,
			},
		},
	};
	// Lote E: emite HeroFled ao declarar fuga
	({ state: next } = emit(next, { type: "HeroFled", payload: { heroId } }));
	return log(
		next,
		`${getCardName(hero.cardId)} declara fuga! O próximo confronto será uma tentativa de fuga.`,
	);
}

// ─── CHOOSE_HERO_FOR_ROUND ────────────────────────────────────────────────────

export function handleChooseHeroForRound(
	state: GameState,
	heroId: string,
): GameState {
	if (!state.combat) return state;
	if (ActivationTracker.isHeroDisabledThisRound(state, heroId)) {
		return log(state, `[AVISO] Herói ${heroId} já agiu nesta rodada.`);
	}
	const hero = state.heroes.find(
		(h) => h.id === heroId && h.status === "active",
	);
	if (!hero) return log(state, `[AVISO] Herói ${heroId} inválido ou inativo.`);

	return log(
		{
			...state,
			combat: {
				...state.combat,
				phase: "selecting_target",
				selectedHeroId: heroId,
			},
		},
		`${getCardName(hero.cardId)} selecionado para agir.`,
	);
}

// ─── PASS_HERO_ACTION ─────────────────────────────────────────────────────────

export function handlePassHeroAction(
	state: GameState,
	heroId: string,
): GameState {
	if (!state.combat) return state;
	const hero = state.heroes.find((h) => h.id === heroId);
	if (ActivationTracker.isHeroDisabledThisRound(state, heroId)) {
		return log(state, `[AVISO] Herói ${heroId} já agiu nesta rodada.`);
	}
	const next = ActivationTracker.endHeroTurn(state, heroId);
	const pendingHeroes = activeHeroesPendingActivation(next);

	if (pendingHeroes.length > 0) {
		return log(
			{
				...next,
				combat: next.combat
					? {
							...next.combat,
							selectedHeroId: null,
							phase: "selecting_hero" as const,
						}
					: null,
			},
			`${getCardName(hero?.cardId ?? heroId)} passou a rodada.`,
		);
	}
	return log(
		{
			...next,
			status: "DIRECT_DAMAGE",
			combat: next.combat
				? {
						...next.combat,
						selectedHeroId: null,
						phase: "direct_damage" as const,
					}
				: null,
		},
		"Todos os heróis agiram. Dano direto.",
	);
}

// ─── CHOOSE_TARGET ───────────────────────────────────────────────────────────

export function handleChooseTarget(
	state: GameState,
	heroId: string,
	enemyId: string,
): GameState {
	if (!state.combat) return state;

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
	const roomFirstTime = !state.flags[roomTargetKey];
	let afterEmit = afterTrigger;
	if (roomFirstTime) {
		afterEmit = {
			...afterEmit,
			flags: { ...afterEmit.flags, [roomTargetKey]: true },
		};
	}
	({ state: afterEmit } = emit(afterEmit, {
		type: "TargetChosen",
		payload: {
			sourceId: heroId,
			targetId: enemyId,
			sourceType: "hero",
			roomFirstTime,
		},
	}));

	if (
		afterEmit.pendingTriggerInterrupt ||
		afterEmit.pendingSkillChoice ||
		afterEmit.pendingSkillTarget
	) {
		return afterEmit;
	}
	const pair = { heroId, enemyId };
	return {
		...afterEmit,
		status: "ROLL_DICE",
		combat: {
			...afterEmit.combat!,
			phase: "resolving",
			selectedHeroId: heroId,
			pairs: [...(afterEmit.combat?.pairs ?? []), pair],
		},
	};
}

// ─── ROLL_DICE ───────────────────────────────────────────────────────────────

function collectHeroBonuses(
	hero: HeroState,
	state: GameState,
	enemy?: EnemyState,
): BonusEntry[] {
	const bonuses: BonusEntry[] = [{ source: "hitBonus", value: hero.hitBonus }];

	// Bônus de acerto — lê do ECS world (Lote C)
	const entity = state.world.entities[hero.id];
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

	if (state.combat?.preyByHero[hero.id] === enemy?.id) {
		const preyMark = cardSkills(hero.cardId).find(
			({ def }) => def.id === "skill_prey_mark",
		);
		const value = preyMark?.ref.params?.value;
		if (typeof value === "number" && value !== 0) {
			bonuses.push({ source: "Marca da Presa", value });
		}
	}

	bonuses.push(...collectHeroHitBonusesFromItems(hero, state, enemy));

	return bonuses;
}

function collectEnemyBonuses(
	enemy: EnemyState,
	state: GameState,
): BonusEntry[] {
	const bonuses: BonusEntry[] = [{ source: "hitBonus", value: enemy.hitBonus }];
	const enemyEntity = state.world.entities[enemy.id];
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
	const entity = state.world.entities[entityId];
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

function effectiveHeroDamage(
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
	const itemEntries = collectHeroDamageBonusesFromItems(
		hero,
		state,
		enemy,
		rollMargin,
	);
	const breakdown = [...worldEntries, ...itemEntries];
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
		damage: Math.max(0, enemy.damage + totalItemValue(breakdown)),
		breakdown,
	};
}

function reduceHeroDamage(
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
	const itemEntries = collectHeroDamageReductionsFromItems(
		hero,
		state,
		damageType,
	);
	const itemReduction = totalItemValue(itemEntries);
	const finalDamage = Math.max(0, amount - worldReduction - itemReduction);
	const breakdown = [
		...formatItemBreakdown(itemEntries, "-"),
		...(worldReduction > 0
			? [`redução -${worldReduction}`]
			: worldReduction < 0
				? [`vulnerabilidade +${Math.abs(worldReduction)}`]
				: []),
	];
	return { damage: finalDamage, breakdown };
}

function logItemLifeDrain(state: GameState, hero: HeroState): GameState {
	const drains = collectHeroLifeDrainFromItems(hero, state);
	const amount = totalItemValue(drains);
	if (amount <= 0) return state;
	const healed = applyHeal(state, hero.id, amount);
	const sources = drains.map((d) => d.source).join(", ");
	return log(
		healed,
		`${getCardName(hero.cardId)} recuperou ${amount} de vida (${sources}).`,
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

function maybeDisableReusableItem(
	state: GameState,
	heroId: string,
	itemId: string,
	consumed: boolean,
): GameState {
	if (consumed) return state;
	return ActivationTracker.disable(state, {
		kind: "item",
		id: itemActivationId(heroId, itemId),
		scope: cardSkills(itemId)[0]?.def.cooldown?.scope ?? "room",
		sourceId: heroId,
		reason: "item usado",
	});
}

export function handleRollDice(state: GameState): GameState {
	if (!state.combat || state.combat.pairs.length === 0) return state;
	// Rola para o par mais recente (último adicionado nesta rodada)
	const pair = state.combat.pairs[state.combat.pairs.length - 1];
	if (!pair) return state;

	const hero = state.heroes.find((h) => h.id === pair.heroId);
	const enemy = state.activeEnemies.find((e) => e.id === pair.enemyId);
	if (!hero || !enemy) return state;

	let preRoll = resolveSkillWindow(state, {
		event: "evt_attack_declared",
		resume: { type: "roll_dice" },
		ctx: {
			triggeredBy: "evt_attack_declared",
			sourceHeroId: hero.id,
			sourceEnemyId: enemy.id,
			targetHeroIds: [hero.id],
			targetEnemyIds: [enemy.id],
			round: state.combat?.round ?? 0,
		},
	});
	if (preRoll.pendingTriggerInterrupt) {
		return { ...preRoll, status: "ROLL_DICE" };
	}
	// Drena a stack de efeitos acumulados pelos TriggerComponents (modificadores de combate)
	preRoll = drainStack(preRoll);

	const extraDice = preRoll.combat?.extraDice[hero.id] ?? 0;
	const heroDiceCount = hero.dice + extraDice;
	const { result: heroRollResult, next: rng1 } = rollDiceRng(
		heroDiceCount,
		preRoll.rng,
	);
	const { result: enemyRollResult, next: rng2 } = rollDiceRng(enemy.dice, rng1);
	preRoll = { ...preRoll, rng: rng2 };

	const heroBonuses = collectHeroBonuses(hero, preRoll, enemy);
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

	let postRoll: GameState = {
		...preRoll,
		status: "RESOLVE_ATTACK",
		combat: preRoll.combat ? { ...preRoll.combat, lastRoll: roll } : null,
	};

	postRoll = resolveSkillWindow(postRoll, {
		event: "evt_roll",
		ctx: {
			triggeredBy: "evt_roll",
			sourceHeroId: hero.id,
			sourceEnemyId: enemy.id,
			targetHeroIds: [hero.id],
			targetEnemyIds: [enemy.id],
			value: heroCalc.total - enemyCalc.total,
			round: postRoll.combat?.round ?? 0,
		},
	});
	if (postRoll.pendingTriggerInterrupt) return postRoll;

	return log(
		postRoll,
		`Herói rolou ${heroCalc.total} | Inimigo rolou ${enemyCalc.total}.`,
	);
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

export function handleResolveAttack(state: GameState): GameState {
	if (!state.combat?.lastRoll) return state;
	const roll = state.combat.lastRoll;

	const hero = state.heroes.find((h) => h.id === roll.heroId);
	const enemy = state.activeEnemies.find((e) => e.id === roll.enemyId);
	if (!hero || !enemy) return state;

	const rollMargin = roll.heroTotal - roll.enemyTotal;
	const heroDamage = effectiveHeroDamage(hero, state, enemy, rollMargin);
	const enemyDamage = effectiveEnemyDamage(enemy, state);
	const result = resolveAttack(
		roll.heroTotal,
		roll.enemyTotal,
		heroDamage.damage,
		enemyDamage.damage,
	);

	const isFleeAttempt = !!state.combat.fleeAttemptByHero?.[hero.id];
	let next =
		result.heroDamageTaken > 0
			? resolveSkillWindow(state, {
					event: "evt_damage_taken",
					resume: { type: "resolve_attack" },
					ctx: {
						triggeredBy: "evt_damage_taken",
						sourceEnemyId: enemy.id,
						targetHeroIds: [hero.id],
						targetEnemyIds: [enemy.id],
						value: result.heroDamageTaken,
						round: state.combat?.round ?? 0,
					},
				})
			: state;
	if (next.pendingTriggerInterrupt || next.pendingSkillChoice) return next;

	// Limpar flag de fuga independente do resultado
	if (isFleeAttempt && next.combat) {
		next = {
			...next,
			combat: {
				...next.combat,
				fleeAttemptByHero: {
					...next.combat.fleeAttemptByHero,
					[hero.id]: false,
				},
			},
		};
	}

	// Fuga bem-sucedida: herói venceu o confronto de fuga
	if (isFleeAttempt && result.enemyDamageTaken > 0) {
		const fledHero: HeroState = { ...hero, status: "fled" };
		next = {
			...next,
			heroes: next.heroes.filter((h) => h.id !== hero.id),
			fledHeroes: [...next.fledHeroes, fledHero],
			world: removeTriggersAppliedBySource(
				removeModifiersForSource(removeEntity(next.world, hero.id), hero.id),
				hero.id,
			),
		};
		next = resolveSkillWindow(next, {
			event: "evt_leave_play",
			ctx: {
				triggeredBy: "evt_leave_play",
				sourceHeroId: hero.id,
				targetHeroIds: [hero.id],
				round: next.combat?.round ?? 0,
			},
		});
		if (next.pendingTriggerInterrupt || next.pendingSkillChoice) return next;
		next = log(
			next,
			`${getCardName(hero.cardId)} fugiu do combate com sucesso!`,
		);
		return endHeroTurnAndAdvance(next, roll.heroId, "fugiu");
	}

	// A destruição precisa ser decidida antes de qualquer dano deste ataque ser
	// aplicado. Assim, uma escolha no Encanto da Última Defesa pode retomar o
	// ataque inteiro sem repetir o dano que já foi aplicado ao outro lado.
	const reducedHeroDamage =
		result.heroDamageTaken > 0
			? reduceHeroDamage(next, hero, result.heroDamageTaken)
			: null;
	if (
		result.enemyDamageTaken >= enemy.currentLife &&
		result.enemyDamageTaken > 0
	) {
		next = resolveSkillWindow(next, {
			event: "evt_would_be_destroyed",
			resume: { type: "resolve_attack" },
			ctx: {
				triggeredBy: "evt_would_be_destroyed",
				sourceHeroId: hero.id,
				targetHeroIds: [],
				targetEnemyIds: [enemy.id],
				value: result.enemyDamageTaken,
				round: next.combat?.round ?? 0,
			},
		});
		if (next.pendingTriggerInterrupt || next.pendingSkillChoice) return next;
	}
	if (
		reducedHeroDamage &&
		reducedHeroDamage.damage >= hero.currentLife &&
		reducedHeroDamage.damage > 0
	) {
		next = resolveSkillWindow(next, {
			event: "evt_would_be_destroyed",
			resume: { type: "resolve_attack" },
			ctx: {
				triggeredBy: "evt_would_be_destroyed",
				sourceEnemyId: enemy.id,
				targetHeroIds: [hero.id],
				targetEnemyIds: [enemy.id],
				value: reducedHeroDamage.damage,
				round: next.combat?.round ?? 0,
			},
		});
		if (next.pendingTriggerInterrupt || next.pendingSkillChoice) return next;
	}

	const enemyDamageLog =
		result.enemyDamageTaken > 0
			? `${getCardName(enemy.cardId)} sofreu ${result.enemyDamageTaken} de dano${result.outcome === "tie" ? " (empate)" : ""}${formatDamageBonusNote(hero.damage, heroDamage.damage, heroDamage.breakdown)}. Herói: ${fmtRoll(roll.heroResults, roll.heroBreakdown, roll.heroTotal)} vs inimigo: ${roll.enemyTotal}.`
			: undefined;
	const heroDamageLog = reducedHeroDamage
		? `${getCardName(hero.cardId)} sofreu ${reducedHeroDamage.damage} de dano${result.outcome === "tie" ? " (empate)" : ""}${reducedHeroDamage.breakdown.length ? ` [${reducedHeroDamage.breakdown.join(", ")}]` : ""}. Inimigo: ${fmtRoll(roll.enemyResults, roll.enemyBreakdown, roll.enemyTotal)} vs herói: ${roll.heroTotal}.`
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
		next = applyDamage(next, enemy.id, result.enemyDamageTaken, {
			sourceId: hero.id,
			damageType: "attack",
			skipWouldBeDestroyed: true,
		});
		if (
			next.pendingTriggerInterrupt ||
			next.pendingSkillChoice ||
			next.pendingSkillTarget
		)
			return attachAttackResume(next, attackResume);
	}
	return resumeAttackAfterDamage(next, attackResume);
}

function attachAttackResume(state: GameState, attack: AttackResume): GameState {
	const window = state.pendingSkillWindow;
	if (!window || window.resume.type !== "continue_damage") return state;
	return {
		...state,
		pendingSkillWindow: {
			...window,
			resume: { ...window.resume, afterAttack: attack },
		},
	};
}

export function resumeAttackAfterDamage(
	state: GameState,
	attack: AttackResume,
): GameState {
	let next = state;
	if (attack.stage === "after_enemy_damage") {
		const hero = next.heroes.find((entry) => entry.id === attack.heroId);
		if (attack.enemyDamageLog) {
			if (hero) next = logItemLifeDrain(next, hero);
			next = log(next, attack.enemyDamageLog);
		}
		if (attack.heroDamageAmount > 0) {
			next = applyDamage(next, attack.heroId, attack.heroDamageAmount, {
				sourceId: attack.enemyId,
				damageType: "attack",
				skipWouldBeDestroyed: true,
			});
			if (
				next.pendingTriggerInterrupt ||
				next.pendingSkillChoice ||
				next.pendingSkillTarget
			)
				return attachAttackResume(next, {
					...attack,
					stage: "after_hero_damage",
				});
		}
	}
	if (attack.heroDamageLog) next = log(next, attack.heroDamageLog);
	next = { ...next, world: tickModifierDurations(next.world, "once_consumed") };
	return advanceAfterEnemyDefeat(
		endHeroTurnAndAdvance(next, attack.heroId, "atacou"),
	);
}

// ─── DIRECT_DAMAGE ───────────────────────────────────────────────────────────

function resolveExtraEnemyCombatRoll(
	state: GameState,
	enemy: EnemyState,
): GameState {
	const target = selectTargetHero(state.heroes);
	if (!target) return state;

	let next = state;

	next = resolveSkillWindow(next, {
		event: "evt_targeted",
		ctx: {
			triggeredBy: "evt_targeted",
			sourceEnemyId: enemy.id,
			targetHeroIds: [target.id],
			round: next.combat?.round ?? 0,
		},
	});
	if (next.pendingTriggerInterrupt) return next;

	if (next.combat?.targetProtectionByHero[target.id]) {
		return log(
			{
				...next,
				combat: {
					...next.combat,
					targetProtectionByHero: {
						...next.combat.targetProtectionByHero,
						[target.id]: false,
					},
				},
			},
			`${getCardName(target.cardId)} ignorou o efeito que o escolheria como alvo.`,
		);
	}

	next = resolveSkillWindow(next, {
		event: "evt_attack_declared",
		ctx: {
			triggeredBy: "evt_attack_declared",
			sourceEnemyId: enemy.id,
			targetHeroIds: [target.id],
			targetEnemyIds: [enemy.id],
			round: next.combat?.round ?? 0,
		},
	});
	if (next.pendingTriggerInterrupt) return next;
	next = drainStack(next);

	const currentTarget = next.heroes.find(
		(h) => h.id === target.id && h.status === "active",
	);
	const currentEnemy = next.activeEnemies.find(
		(e) => e.id === enemy.id && e.status === "active",
	);
	if (!currentTarget || !currentEnemy) return next;

	const { result: heroRollResult, next: rng1 } = rollDiceRng(
		currentTarget.dice,
		next.rng,
	);
	const { result: enemyRollResult, next: rng2 } = rollDiceRng(
		currentEnemy.dice,
		rng1,
	);
	next = { ...next, rng: rng2 };

	const heroBonuses = collectHeroBonuses(currentTarget, next, currentEnemy);
	const enemyBonuses = collectEnemyBonuses(currentEnemy, next);
	const heroCalc = calculateTotal(heroRollResult.results, heroBonuses);
	const enemyCalc = calculateTotal(enemyRollResult.results, enemyBonuses);

	next = resolveSkillWindow(next, {
		event: "evt_roll",
		ctx: {
			triggeredBy: "evt_roll",
			sourceEnemyId: currentEnemy.id,
			targetHeroIds: [currentTarget.id],
			targetEnemyIds: [currentEnemy.id],
			value: heroCalc.total - enemyCalc.total,
			round: next.combat?.round ?? 0,
		},
	});
	if (next.pendingTriggerInterrupt) return next;

	if (enemyCalc.total <= heroCalc.total) {
		return log(
			next,
			`Ataque extra: ${getCardName(currentEnemy.cardId)} rolou ${enemyCalc.total} contra ${getCardName(currentTarget.cardId)} (${heroCalc.total}) e não causou dano.`,
		);
	}

	const enemyDamage = effectiveEnemyDamage(currentEnemy, next);
	const reduced = reduceHeroDamage(
		next,
		currentTarget,
		enemyDamage.damage,
		"attack",
	);
	const dmg = reduced.damage;

	next = applyDamage(next, currentTarget.id, dmg, {
		sourceId: currentEnemy.id,
		damageType: "attack",
	});
	if (next.pendingTriggerInterrupt) return next;

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
		`Ataque extra: ${getCardName(currentEnemy.cardId)} venceu ${getCardName(currentTarget.cardId)} e causou ${dmg} de dano${reductionStr}. Inimigo: ${enemyRollStr} vs herói: ${heroCalc.total}.`,
	);
}

export function handleDirectDamage(state: GameState): GameState {
	if (!state.combat) return state;
	const attacked = new Set(state.combat.pairs.map((p) => p.enemyId));
	const activeEnemies = state.activeEnemies.filter(
		(e) => e.status === "active",
	);
	const activeHeroes = state.heroes.filter((h) => h.status === "active");
	const extraEnemyCount = Math.max(
		0,
		activeEnemies.length - activeHeroes.length,
	);
	const unengaged = activeEnemies.filter((e) => !attacked.has(e.id));
	let next = state;
	const extraEnemies = unengaged.slice(0, extraEnemyCount);
	if (extraEnemies.length === 0)
		return { ...state, status: "CHECK_COMBAT_END" };

	for (const enemy of extraEnemies) {
		next = resolveExtraEnemyCombatRoll(next, enemy);
	}

	return { ...next, status: "CHECK_COMBAT_END" };
}

// ─── CHECK_COMBAT_END ─────────────────────────────────────────────────────────

export function handleCheckCombatEnd(state: GameState): GameState {
	const allEnemiesDone = state.activeEnemies.every(
		(e) => e.status !== "active",
	);
	const activeHeroes = state.heroes.filter((h) => h.status === "active");

	// Todos os heróis fugiram enquanto há inimigos → reiniciar masmorra
	if (
		activeHeroes.length === 0 &&
		state.fledHeroes.length > 0 &&
		!allEnemiesDone
	) {
		return log(
			{ ...state, status: "DUNGEON_RESTART_PROMPT" },
			"Todos os heróis fugiram. Reiniciar masmorra?",
		);
	}

	const heroDefeated = state.heroes.every((h) => h.status !== "active");

	if (heroDefeated && state.fledHeroes.length === 0) {
		return log({ ...state, status: "DEFEAT" }, "Derrota: herói eliminado.");
	}

	if (allEnemiesDone) {
		const defeated = state.activeEnemies.filter((e) => e.status === "defeated");
		// Inimigos que fugiram voltam ao deck
		const fled = state.activeEnemies.filter((e) => e.status === "fled");
		let next = state;
		if (fled.length > 0) {
			const fleeIds = fled.map((e) => e.cardId);
			const { value: shuffled, next: rngAfterShuffle } = shuffleRng(
				[...next.decks.enemyDeck.available, ...fleeIds],
				next.rng,
			);
			next = {
				...next,
				rng: rngAfterShuffle,
				decks: {
					...next.decks,
					enemyDeck: {
						...next.decks.enemyDeck,
						available: shuffled,
					},
				},
			};
		}
		return log(
			{
				...next,
				status: "REWARD_PHASE",
				creaturesDefeated: next.creaturesDefeated + defeated.length,
				enemyGraveyard: [...next.enemyGraveyard, ...defeated],
				activeEnemies: [],
				combat: next.combat
					? {
							...next.combat,
							round: next.combat.round + 1,
							pairs: [],
							heroesActed: [],
							disabled: {},
						}
					: null,
			},
			"Sala limpa! Avançando para recompensa.",
		);
	}

	// Próxima rodada — reset completo com phase="selecting_hero"
	const nextRound = (state.combat?.round ?? 0) + 1;
	const nextCombat = state.combat
		? {
				...state.combat,
				round: nextRound,
				phase: "selecting_hero" as const,
				selectedHeroId: null,
				pairs: [],
				heroesActed: [],
				lastRoll: null,
				disabled: ActivationTracker.clearLocks(state.combat.disabled, "round"),
				oncePer: {
					...state.combat.oncePer,
					round: {}, // reset por rodada
				},
			}
		: createEmptyCombatState();
	const currentRound = state.combat?.round ?? 0;
	let nextState = resolveSkillWindow(state, {
		event: "evt_round_end",
		ctx: {
			triggeredBy: "evt_round_end",
			round: currentRound,
		},
	});
	if (nextState.pendingTriggerInterrupt) return nextState;

	// Expirar modificadores ECS de duração "end_of_round" (this_turn) e decrementar rounds.
	const worldAfterTick = decrementRoundsModifiers(
		tickModifierDurations(nextState.world, "end_of_round"),
	);
	nextState = tickBlockEntries(
		{
			...nextState,
			status: "HERO_ACTION",
			combat: nextCombat,
			world: worldAfterTick,
		},
		"end_of_round",
	);

	nextState = resolveSkillWindow(nextState, {
		event: "evt_round_start",
		ctx: {
			triggeredBy: "evt_round_start",
			round: nextRound,
			targetHeroIds: nextState.heroes
				.filter((hero) => hero.status === "active")
				.map((hero) => hero.id),
			targetEnemyIds: nextState.activeEnemies
				.filter((enemy) => enemy.status === "active")
				.map((enemy) => enemy.id),
		},
	});

	return log(nextState, `Rodada ${nextRound + 1} de combate.`);
}

// ─── USE_ITEM ─────────────────────────────────────────────────────────────────

export function handleUseItem(
	state: GameState,
	itemId: string,
	heroId: string,
	targetHeroId?: string,
	targetEnemyId?: string,
): GameState {
	// Resolve a skill do item via catálogo
	const itemCard = getCardById(itemId);
	const explicitGrant = itemCard?.grants?.find(
		(grant) => grant.activation.kind === "manual",
	);
	const eventGrant = itemCard?.grants?.find(
		(grant) => grant.activation.kind === "event" && grant.activation.decision === "optional",
	);
	if (itemCard?.grants?.length) {
		if (eventGrant && !explicitGrant) {
			const unavailable = manualItemUnavailableReason(state, heroId, itemId);
			if (unavailable) return log(state, `[AVISO] ${unavailable}`);
			const key = preparedAbilityKey("item", heroId, itemId,
				eventGrant.abilityId, eventGrant.id);
			return log(togglePreparedAbility(state, {
				key, sourceKind: "item", sourceHeroId: heroId,
				sourceCardId: itemId, abilityId: eventGrant.abilityId,
				grantId: eventGrant.id, event: eventGrant.activation.event!,
			}), `${getCardName(itemId)}: ${isAbilityPrepared(state, key) ? "preparação cancelada" : "preparado"}.`);
		}
		if (!explicitGrant) {
			return log(
				state,
				`${getCardName(itemId)} reage a uma janela do jogo e não pode ser usado manualmente.`,
			);
		}
		const unavailable = manualItemUnavailableReason(state, heroId, itemId);
		if (unavailable) return log(state, `[AVISO] ${unavailable}`);
		const source = {
			kind: "item" as const,
			cardId: itemId,
			sourceHeroId: heroId,
		};
		const selection = resolveManualGrantTarget(
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
			executeAbilityGrant(state, {
				source,
				grant: explicitGrant,
				triggeredBy: "manual",
				targetIds: selection.targetIds,
			}),
		);
	}
	const itemSkillRef = itemCard ? cardSkills(itemCard.id)[0] : null;
	const skillDef = itemSkillRef?.def ?? null;
	const itemName = getCardName(itemId);
	if (!skillDef) {
		return log(state, `[TODO] Efeito de item não catalogado: ${itemName}`);
	}
	if (skillDef.operate_type === "op_triggered") {
		if (!isVoluntaryTrigger(skillDef, "item", skillDef.trigger!.event))
			return log(state, "[AVISO] Esta habilidade é automática.");
		const unavailable = manualItemUnavailableReason(state, heroId, itemId);
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

	const unavailable = manualItemUnavailableReason(state, heroId, itemId);
	if (unavailable) return log(state, `[AVISO] ${unavailable}`);
	const hero = state.heroes.find((h) => h.id === heroId)!;
	const selection = resolveManualSkillTarget(
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

	const grant = cardAbilityGrants(itemId).find((entry) =>
		entry.abilityId === skillDef.id && entry.activation.kind === "manual");
	if (!grant) return log(state, `[AVISO] Concessão manual não encontrada: ${skillDef.id}`);
	const source = { kind: "item" as const, cardId: itemId, sourceHeroId: heroId };
	const grantUnavailable = canExecuteAbilityGrant(state, source, grant, "manual");
	if (grantUnavailable) return log(state, `[AVISO] ${grantUnavailable}`);
	const heroName = hero ? getCardName(hero.cardId) : heroId;
	const consumed = itemShouldBeConsumed(itemId);
	const afterCost = consumed ? removeHeroItem(state, heroId, itemId) : state;
	const withItemCost: GameState = log(
		consumed
			? {
					...afterCost,
					decks: {
						...afterCost.decks,
						itemDeck: {
							...afterCost.decks.itemDeck,
							discarded: [...afterCost.decks.itemDeck.discarded, itemId],
						},
					},
				}
			: state,
		consumed
			? `${heroName} descartou ${itemName} para ativar o efeito.`
			: `${heroName} usou ${itemName}.`,
	);
	const executeItem = (current: GameState): GameState => {
		const used = executeAbilityGrant(current, {
			source, grant, triggeredBy: "manual", targetIds: selection.targetIds,
		});
		return advanceAfterEnemyDefeat(maybeDisableReusableItem(
			log(used, `${heroName} usou ${itemName}.`), heroId, itemId, consumed,
		));
	};

	// itemControl: inimigo do par atual pode ignorar o 1º efeito de item
	const currentPairEnemyId = selection.targetIds.find((id) =>
		state.activeEnemies.some((enemy) => enemy.id === id),
	);
	if (currentPairEnemyId) {
		// itemControl: inimigo do par atual pode ignorar o 1º efeito de item (Evasão das Fendas)
		if (withItemCost.combat?.itemControlByEnemy[currentPairEnemyId]) {
			const blocked = log(
				{
					...withItemCost,
					combat: {
						...withItemCost.combat!,
						itemControlByEnemy: {
							...withItemCost.combat!.itemControlByEnemy,
							[currentPairEnemyId]: false,
						},
					},
				},
				`${currentPairEnemyId}: Evasão das Fendas — efeito de item bloqueado.`,
			);
			return maybeDisableReusableItem(blocked, heroId, itemId, consumed);
		}
		const roomFirstTime =
			!state.flags[`itemEffect::${currentPairEnemyId}::${heroId}`];
		let afterItemEmit = roomFirstTime
			? {
					...state,
					flags: {
						...state.flags,
						[`itemEffect::${currentPairEnemyId}::${heroId}`]: true,
					},
				}
			: state;
		({ state: afterItemEmit } = emit(afterItemEmit, {
			type: "ItemEffectAppliedTo",
			payload: { heroId, itemId, sourceId: currentPairEnemyId, roomFirstTime },
		}));
		return executeItem(afterItemEmit);
	}

	return executeItem(state);
}

// ─── USE_POWER ────────────────────────────────────────────────────────────────

export function handleUsePower(state: GameState, heroId: string): GameState {
	const hero = state.heroes.find((h) => h.id === heroId);
	if (!hero) return state;
	if (state.flags.powerUseBlocked) {
		return log(state, "Uso de poder bloqueado nesta sala.");
	}
	if (state.combat && ActivationTracker.isHeroDisabledThisRound(state, heroId)) {
		return log(state, `[AVISO] Herói ${heroId} já agiu nesta rodada.`);
	}

	const heroCard = getCardById(hero.cardId);
	const powerEntry = heroCard
		? cardSkills(heroCard.id).find(({ def }) => def.category === "hero_power")
		: null;
	const powerDef = powerEntry?.def ?? null;
	if (!powerDef) {
		return log(
			state,
			`[TODO] Poder não catalogado para: ${getCardName(hero.cardId)}`,
		);
	}

	return handleUseSkill(state, { skillId: powerDef.id, sourceId: heroId });
}

export function handleUseSkill(
	state: GameState,
	payload: UseSkillPayload,
): GameState {
	const hero = state.heroes.find(
		(h) => h.id === payload.sourceId && h.status === "active",
	);
	if (!hero) return fireOnUseSkill(state, payload);

	const skillDef = lookupSkillById(payload.skillId);
	if (!skillDef) {
		return fireOnUseSkill(state, payload);
	}
	if (skillDef.operate_type === "op_triggered") {
		if (!isVoluntaryTrigger(skillDef, "hero", skillDef.trigger!.event))
			return log(state, "[AVISO] Esta habilidade reage automaticamente ao evento da carta.");
		if (state.paused || state.pendingSkillChoice || state.pendingSkillTarget || state.pendingTriggerInterrupt)
			return log(state, "[AVISO] Conclua a escolha pendente primeiro.");
		if (["SETUP", "VICTORY", "DEFEAT", "ROLL_DICE", "RESOLVE_ATTACK", "DIRECT_DAMAGE"].includes(state.status))
			return log(state, "[AVISO] Esta reação não pode ser preparada agora.");
		if (!cardSkills(hero.cardId).some(({ def }) => def.id === skillDef.id))
			return log(state, "[AVISO] Esta habilidade não pertence ao herói.");
		const key = preparedAbilityKey("hero", hero.id, hero.cardId, skillDef.id);
		if (!isAbilityPrepared(state, key) && (
			(state.combat && ActivationTracker.isHeroDisabledThisRound(state, hero.id)) ||
			!guardPassed(state, skillDef, hero.id) ||
			hero.currentLife <= (skillDef.cost?.hp ?? 0)
		)) return log(state, "[AVISO] Esta reação está indisponível.");
		return log(togglePreparedAbility(state, {
			key, sourceKind: "hero", sourceHeroId: hero.id,
			sourceCardId: hero.cardId, abilityId: skillDef.id,
			event: skillDef.trigger!.event,
		}), `${skillDef.id}: ${isAbilityPrepared(state, key) ? "preparação cancelada" : "preparada"}.`);
	}
	if (!isManuallyActivatable(skillDef)) return fireOnUseSkill(state, payload);
	if (
		state.pendingSkillChoice ||
		state.pendingSkillTarget ||
		state.pendingTriggerInterrupt ||
		state.paused
	) {
		return log(state, "[AVISO] Conclua a escolha pendente primeiro.");
	}
	if (
		(state.status === "HERO_ACTION" || state.status === "BOSS_COMBAT") &&
		state.combat?.phase !== "selecting_hero" &&
		state.combat?.phase !== "selecting_target"
	) {
		return log(state, "[AVISO] Aguarde uma janela de ação para usar a habilidade.");
	}

	if (state.combat && ActivationTracker.isHeroDisabledThisRound(state, payload.sourceId)) {
		return log(
			state,
			`[AVISO] Herói ${payload.sourceId} já agiu nesta rodada.`,
		);
	}

	if (!cardSkills(hero.cardId).some(({ def }) => def.id === skillDef.id)) {
		return log(state, "[AVISO] Esta habilidade não pertence ao herói.");
	}
	const currentPreyId = state.combat?.preyByHero[hero.id];
	const currentPrey = state.activeEnemies.find(
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

	const target = resolveManualSkillTarget(
		state,
		skillDef,
		payload.sourceId,
		payload.targetIds,
	);
	if (target.kind === "unavailable") {
		return log(state, `[AVISO] ${skillDef.id}: ${target.reason}`);
	}
	if (target.kind === "needs_selection") {
		return {
			...state,
			pendingSkillTarget: {
				skillId: payload.skillId,
				sourceId: payload.sourceId,
				prompt: target.prompt,
				candidates: target.candidates,
			},
		};
	}

	return advanceAfterEnemyDefeat(fireOnUseSkill(state, {
		...payload, targetIds: [...target.targetIds],
	}));
}

export function handleSelectSkillTarget(
	state: GameState,
	targetId: string,
): GameState {
	const pending = state.pendingSkillTarget;
	if (!pending) return state;
	if (!pending.candidates.some((candidate) => candidate.id === targetId)) {
		return log(state, `[AVISO] Alvo inválido para ${pending.skillId}.`);
	}
	return handleUseSkill(
		{ ...state, pendingSkillTarget: undefined },
		{
			skillId: pending.skillId,
			sourceId: pending.sourceId,
			targetIds: [targetId],
		},
	);
}

export function handleCancelSkillTarget(state: GameState): GameState {
	const pending = state.pendingSkillTarget;
	if (!pending) return state;
	const cleared = { ...state, pendingSkillTarget: undefined };
	return log(cleared, "Seleção de alvo cancelada sem consumir uso.");
}

// ─── SELECT_DIE ──────────────────────────────────────────────────────────────

export function handleSelectDie(
	state: GameState,
	side: "hero" | "enemy",
	index: number,
	value?: number,
): GameState {
	const sel = state.combat?.pendingDiceSelection;
	if (!sel || !state.combat?.lastRoll) return state;
	const roll = state.combat.lastRoll;

	// Verificar filtro
	const results =
		side === "hero" ? [...roll.heroResults] : [...roll.enemyResults];
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
	} else {
		const { result, next: rngNext } = rollDiceRng(1, state.rng);
		newValue = result.results[0] ?? 1;
		stateAfterRng = { ...state, rng: rngNext };
	}

	results[index] = newValue;

	// Recalcular total
	const breakdownToUse =
		side === "hero" ? roll.heroBreakdown : roll.enemyBreakdown;
	const newCalc = calculateTotal(results, [...breakdownToUse]);

	const newRoll =
		side === "hero"
			? { ...roll, heroResults: results, heroTotal: newCalc.total }
			: { ...roll, enemyResults: results, enemyTotal: newCalc.total };

	return log(
		{
			...stateAfterRng,
			combat: {
				...stateAfterRng.combat!,
				lastRoll: newRoll,
				pendingDiceSelection: undefined,
			},
		},
		`Dado ${side === "hero" ? "aliado" : "inimigo"} [${index}] alterado de ${dieValue} para ${newValue}.`,
	);
}

// ─── CANCEL_HERO_SELECTION ───────────────────────────────────────────────────

export function handleCancelHeroSelection(state: GameState): GameState {
	if (!state.combat) return state;
	return log(
		{
			...state,
			combat: {
				...state.combat,
				phase: "selecting_hero",
				selectedHeroId: null,
			},
		},
		"Seleção de herói cancelada.",
	);
}

// ─── CHOOSE_HERO ──────────────────────────────────────────────────────────────
// Com 1 herói: auto-seleciona sem precisar de payload.
// Com múltiplos: valida que o herói está ativo e ainda não agiu nesta rodada.

export function handleChooseHero(state: GameState, heroId?: string): GameState {
	const activeHeroes = state.heroes.filter((h) => h.status === "active");
	if (activeHeroes.length === 0) {
		return log({ ...state, status: "DEFEAT" }, "Sem heróis ativos.");
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

	return { ...state, status: "HERO_ACTION" };
}
