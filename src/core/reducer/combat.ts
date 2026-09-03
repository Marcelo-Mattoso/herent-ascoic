// Handlers do loop de combate.
// Patch 2: fluxo sequencial — CHOOSE_HERO_FOR_ROUND → CHOOSE_TARGET → ROLL_DICE → RESOLVE_ATTACK → DIRECT_DAMAGE → CHECK_COMBAT_END.
// Vários heróis podem atacar o mesmo inimigo; inimigos excedentes fazem rolagens extras.
// Implementa efeitos de: item_rusty_dagger, item_cracked_shield, item_lesser_vigor_potion, hero_crimson_barbarian.

import { getCardName } from "../data/cardLocale";
import { getCardById } from "../data/cards";
import { decrementRoundsModifiers, tickModifierDurations } from "../ecs/world";
import { drainStack } from "../effects/resolver";
import { emit } from "../events/bus";
import type { DamageType } from "../events/types";
import { calculateTotal, resolveAttack } from "../rules/combat";
import { rollDiceRng } from "../rules/dice";
import {
	collectHeroDamageBonusesFromItems,
	collectHeroDamageReductionsFromItems,
	collectHeroHitBonusesFromItems,
	collectHeroLifeDrainFromItems,
	findHeroItemLocation,
	formatItemBreakdown,
	itemActivationId,
	itemCanBeUsedManually,
	itemShouldBeConsumed,
	itemUseTargetIds,
	removeHeroItem,
	totalItemValue,
} from "../rules/itemEffects";
import { ActivationTracker } from "../state/activation";
import { cardSkills, lookupSkillById } from "../skills/lookup";
import {
	fireOnUseSkill,
	isManuallyActivatable,
	type UseSkillPayload,
} from "../skills/useSkill";
import { resolveManualSkillTarget } from "../skills/targeting";
import { resolveSkillWindow } from "../skills/resolveSkillWindow";
import { buildScriptCtx } from "../scripts/context";
import { evaluate } from "../skills/dsl/evaluate";
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

function isManualCombatActivationWindow(state: GameState): boolean {
	return (
		(state.status === "HERO_ACTION" || state.status === "BOSS_COMBAT") &&
		state.combat?.phase === "selecting_target"
	);
}

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

function disableHeroForRoundAndAdvance(
	state: GameState,
	heroId: string,
	reason: string,
): GameState {
	const disabled = ActivationTracker.disableHeroForRound(state, heroId, reason);
	return advanceAfterHeroDisabledForRound(disabled);
}

function finishManualHeroUse(
	beforeUse: GameState,
	afterUse: GameState,
	heroId: string,
	reason: string,
): GameState {
	if (!isManualCombatActivationWindow(beforeUse)) return afterUse;
	const disabled = ActivationTracker.disableHeroForRound(
		afterUse,
		heroId,
		reason,
	);
	if (disabled.pendingSkillChoice) return disabled;
	return advanceAfterHeroDisabledForRound(disabled);
}

// ─── START_COMBAT ────────────────────────────────────────────────────────────

export function handleStartCombat(state: GameState): GameState {
	let next: GameState = {
		...state,
		status: "HERO_ACTION",
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
	const next = ActivationTracker.disableHeroForRound(
		state,
		heroId,
		"passou a rodada",
	);
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

	const pair = { heroId, enemyId };
	return {
		...afterEmit,
		status: "ROLL_DICE",
		combat: {
			...afterTrigger.combat!,
			phase: "resolving",
			selectedHeroId: heroId,
			pairs: [...(afterTrigger.combat?.pairs ?? []), pair],
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

function runItemSkill(
	state: GameState,
	skillDef: NonNullable<ReturnType<typeof lookupSkillById>>,
	heroId: string,
	targetIds: string[],
	value: number | string | null | undefined,
	params: Readonly<Record<string, unknown>>,
): GameState {
	if (isManuallyActivatable(skillDef)) {
		return fireOnUseSkill(state, {
			skillId: skillDef.id,
			sourceId: heroId,
			targetIds,
			value,
		});
	}

	if (!skillDef.effect) return state;
	const ctx = buildScriptCtx(
		state,
		{
			triggeredBy: "on_use",
			sourceHeroId: heroId,
			targetHeroIds: targetIds.filter((id) =>
				state.heroes.some((h) => h.id === id),
			),
			targetEnemyIds: targetIds.filter((id) =>
				state.activeEnemies.some((e) => e.id === id),
			),
			skillId: skillDef.id,
			value: (value ?? null) as number | string | null,
		},
		params,
	);
	return drainStack(evaluate(skillDef.effect, ctx));
}

function maybeDisableReusableItem(
	state: GameState,
	heroId: string,
	itemId: string,
	consumed: boolean,
): GameState {
	if (consumed || !state.combat) return state;
	return ActivationTracker.disable(state, {
		kind: "item",
		id: itemActivationId(heroId, itemId),
		scope: "combat",
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
		};
		next = log(
			next,
			`${getCardName(hero.cardId)} fugiu do combate com sucesso!`,
		);
		return disableHeroForRoundAndAdvance(next, roll.heroId, "fugiu");
	}

	// on_deal_damage: agora via TriggerComponent em emit(DamageDealt) dentro de applyDamage
	if (result.enemyDamageTaken > 0) {
		const dmg = result.enemyDamageTaken;
		next = applyDamage(next, enemy.id, dmg);
		if (next.pendingTriggerInterrupt) return next;
		next = logItemLifeDrain(next, hero);
		const heroRollStr = fmtRoll(
			roll.heroResults,
			roll.heroBreakdown,
			roll.heroTotal,
		);
		const tieNote = result.outcome === "tie" ? " (empate)" : "";
		const damageNote = formatDamageBonusNote(
			hero.damage,
			heroDamage.damage,
			heroDamage.breakdown,
		);
		next = log(
			next,
			`${getCardName(enemy.cardId)} sofreu ${dmg} de dano${tieNote}${damageNote}. Herói: ${heroRollStr} vs inimigo: ${roll.enemyTotal}.`,
		);

		// on_destroy_creature_with_attack + on_destroyed: via TriggerComponents (emit EnemyDestroyed)
	}

	if (result.heroDamageTaken > 0) {
		const reduced = reduceHeroDamage(next, hero, result.heroDamageTaken);
		const dmg = reduced.damage;

		next = applyDamage(next, hero.id, dmg);
		if (next.pendingTriggerInterrupt) return next;
		const enemyRollStr = fmtRoll(
			roll.enemyResults,
			roll.enemyBreakdown,
			roll.enemyTotal,
		);
		const tieNoteHero = result.outcome === "tie" ? " (empate)" : "";
		const reductionStr = reduced.breakdown.length
			? ` [${reduced.breakdown.join(", ")}]`
			: "";
		next = log(
			next,
			`${getCardName(hero.cardId)} sofreu ${dmg} de dano${tieNoteHero}${reductionStr}. Inimigo: ${enemyRollStr} vs herói: ${roll.heroTotal}.`,
		);
	}

	// Consumir modificadores "once" após o ataque ser resolvido (Lote C)
	next = { ...next, world: tickModifierDurations(next.world, "once_consumed") };

	return disableHeroForRoundAndAdvance(next, roll.heroId, "atacou");
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
	const itemSkillRef = itemCard ? cardSkills(itemCard.id)[0] : null;
	const skillDef = itemSkillRef?.def ?? null;
	const itemName = getCardName(itemId);
	if (!skillDef) {
		return log(state, `[TODO] Efeito de item não catalogado: ${itemName}`);
	}

	// Alguns itens reativos tambem podem ser acionados manualmente pelo jogador
	// (ex: prevenir o proximo descarte de dungeon).
	if (!itemCanBeUsedManually(skillDef)) {
		return log(
			state,
			`${itemName} não pode ser usado agora (efeito: ${skillDef.trigger}).`,
		);
	}

	const hero = state.heroes.find((h) => h.id === heroId);
	if (!hero || hero.status !== "active") {
		return log(state, `[AVISO] Herói ${heroId} inválido ou inativo.`);
	}
	if (!findHeroItemLocation(hero, itemId)) {
		return log(
			state,
			`[AVISO] ${getCardName(hero.cardId)} não possui ${itemName}.`,
		);
	}
	if (
		isManualCombatActivationWindow(state) &&
		ActivationTracker.isHeroDisabledThisRound(state, heroId)
	) {
		return log(state, `[AVISO] Herói ${heroId} já agiu nesta rodada.`);
	}
	if (
		ActivationTracker.isDisabled(
			state,
			"item",
			itemActivationId(heroId, itemId),
		)
	) {
		return log(state, `[AVISO] ${itemName} já foi usado neste combate.`);
	}

	const params = {
		...(skillDef.params ?? {}),
		...(itemSkillRef?.ref.params ?? {}),
	};
	const heroName = hero ? getCardName(hero.cardId) : heroId;
	const consumed = itemShouldBeConsumed(itemId, skillDef.id);
	const withItemCost: GameState = log(
		consumed ? removeHeroItem(state, heroId, itemId) : state,
		consumed
			? `${heroName} descartou ${itemName} para ativar o efeito.`
			: `${heroName} usou ${itemName}.`,
	);
	const itemSkillValue =
		(itemSkillRef?.ref.params?.value as number | string | undefined) ??
		(skillDef.params?.value as number | string | undefined);

	// itemControl: inimigo do par atual pode ignorar o 1º efeito de item
	const currentPairEnemyId = state.combat?.pairs.find(
		(p) => p.heroId === heroId,
	)?.enemyId;
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
			return finishManualHeroUse(
				state,
				maybeDisableReusableItem(blocked, heroId, itemId, consumed),
				heroId,
				`usou ${itemName}`,
			);
		}
		const roomFirstTime =
			!withItemCost.flags[`itemEffect::${currentPairEnemyId}::${heroId}`];
		let afterItemEmit = roomFirstTime
			? {
					...withItemCost,
					flags: {
						...withItemCost.flags,
						[`itemEffect::${currentPairEnemyId}::${heroId}`]: true,
					},
				}
			: withItemCost;
		({ state: afterItemEmit } = emit(afterItemEmit, {
			type: "ItemEffectAppliedTo",
			payload: { heroId, itemId, sourceId: currentPairEnemyId, roomFirstTime },
		}));
		const targetIds = itemUseTargetIds(
			state,
			skillDef,
			heroId,
			targetHeroId,
			targetEnemyId,
		);
		const afterUse = runItemSkill(
			afterItemEmit,
			skillDef,
			heroId,
			targetIds,
			itemSkillValue,
			params,
		);
		return finishManualHeroUse(
			state,
			maybeDisableReusableItem(afterUse, heroId, itemId, consumed),
			heroId,
			`usou ${itemName}`,
		);
	}

	const targetIds = itemUseTargetIds(
		state,
		skillDef,
		heroId,
		targetHeroId,
		targetEnemyId,
	);
	const afterUse = runItemSkill(
		withItemCost,
		skillDef,
		heroId,
		targetIds,
		itemSkillValue,
		params,
	);
	return finishManualHeroUse(
		state,
		maybeDisableReusableItem(afterUse, heroId, itemId, consumed),
		heroId,
		`usou ${itemName}`,
	);
}

// ─── USE_POWER ────────────────────────────────────────────────────────────────

export function handleUsePower(state: GameState, heroId: string): GameState {
	const hero = state.heroes.find((h) => h.id === heroId);
	if (!hero) return state;
	if (
		isManualCombatActivationWindow(state) &&
		ActivationTracker.isHeroDisabledThisRound(state, heroId)
	) {
		return log(state, `[AVISO] Herói ${heroId} já agiu nesta rodada.`);
	}

	// Verificar se algum item equipado tem trigger once_per_combat_instead_of_attack
	const equippedItems = Object.values(hero.activeItems).filter(
		Boolean,
	) as string[];
	if (state.combat) {
		for (const itemId of equippedItems) {
			const equippedCard = getCardById(itemId);
			const itemSkillEntry = equippedCard
				? cardSkills(equippedCard.id)[0]
				: null;
			const itemSkill = itemSkillEntry?.def ?? null;
			if (itemSkill?.id === "skill_opportunity_shot") {
				if (
					ActivationTracker.isDisabled(
						state,
						"item",
						itemActivationId(heroId, itemId),
					)
				) {
					return log(
						state,
						`${getCardName(itemId)} já foi usado neste combate.`,
					);
				}
				const guardKey = `${itemSkill.id}::${heroId}`;
				if (state.combat.oncePer.combat[guardKey]) {
					return log(
						state,
						`${getCardName(itemId)}: Tiro de Oportunidade já usado neste combate.`,
					);
				}
				// Aplicar dano direto ao inimigo do par atual (ou primeiro inimigo ativo)
				const targetEnemyId =
					state.combat.pairs.find((p) => p.heroId === heroId)?.enemyId ??
					state.activeEnemies.find((e) => e.status === "active")?.id;
				if (!targetEnemyId)
					return log(
						state,
						"Nenhum inimigo disponível para Tiro de Oportunidade.",
					);

				const enemy = state.activeEnemies.find((e) => e.id === targetEnemyId);
				if (!enemy || enemy.status !== "active") return state;

				const dmg = hero.damage;
				let next: GameState = {
					...state,
					combat: {
						...state.combat,
						oncePer: {
							...state.combat.oncePer,
							combat: { ...state.combat.oncePer.combat, [guardKey]: true },
						},
					},
				};
				next = applyDamage(next, targetEnemyId, dmg);
				next = log(
					next,
					`${getCardName(hero.cardId)} — Tiro de Oportunidade: ${getCardName(enemy.cardId)} sofreu ${dmg} de dano direto.`,
				);
				return disableHeroForRoundAndAdvance(
					maybeDisableReusableItem(next, heroId, itemId, false),
					heroId,
					`usou ${getCardName(itemId)}`,
				);
			}
		}
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
	if (!skillDef || !isManuallyActivatable(skillDef)) {
		return fireOnUseSkill(state, payload);
	}

	if (
		skillDef.category === "hero_power" &&
		state.combat?.powersUsedThisRoom[payload.sourceId]
	) {
		return log(
			state,
			`Poder de ${getCardName(hero.cardId)} já foi usado nesta sala.`,
		);
	}

	if (
		isManualCombatActivationWindow(state) &&
		ActivationTracker.isHeroDisabledThisRound(state, payload.sourceId)
	) {
		return log(
			state,
			`[AVISO] Herói ${payload.sourceId} já agiu nesta rodada.`,
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

	const withPowerMark =
		skillDef.category === "hero_power" && state.combat
			? {
					...state,
					combat: {
						...state.combat,
						powersUsedThisRoom: {
							...state.combat.powersUsedThisRoom,
							[payload.sourceId]: true,
						},
					},
				}
			: state;

	const afterUse = fireOnUseSkill(withPowerMark, {
		...payload,
		targetIds: [...target.targetIds],
	});
	return finishManualHeroUse(
		state,
		afterUse,
		payload.sourceId,
		`usou habilidade ${payload.skillId}`,
	);
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
	if (!state.pendingSkillTarget) return state;
	return { ...state, pendingSkillTarget: undefined };
}

// ─── SELECT_DIE ──────────────────────────────────────────────────────────────

export function handleSelectDie(
	state: GameState,
	side: "hero" | "enemy",
	index: number,
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
	if (sel.filter?.value !== undefined && dieValue !== sel.filter.value) {
		return log(state, "[AVISO] Este dado não é elegível para a ação.");
	}

	// Aplicar ação
	let newValue: number;
	let stateAfterRng = state;
	if (sel.action === "reroll") {
		const { result, next: rngNext } = rollDiceRng(1, state.rng);
		newValue = result.results[0] ?? 1;
		stateAfterRng = { ...state, rng: rngNext };
	} else {
		newValue = sel.setToValue ?? 6;
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
