import { HERO_ABILITY_IDS } from "../data/heroAbilityIds";
import { checkBossCondition } from "../rules/conditions";
import { inlineBossHitBonus, inlineBossDamageReduction, markInlineBossSkillsUsed } from "../rules/bossSkills";
import { resolveSkillWindow } from "../skills/resolveSkillWindow";
import { drainStack } from "../effects/resolver";
import { decrementRoundsModifiers, removeComponent, tickModifierDurations } from "../ecs/world";
import { calculateTotal, resolveAttack } from "../rules/combat";
import { dungeonAwakeningEffect, piercedItemReduction } from "../rules/dungeonAwakening";
import { rollDiceRng } from "../rules/dice";
import {
	collectHeroDamageBonusesFromItems,
	collectHeroDamageReductionsFromItems,
	collectHeroHitBonusesFromItems,
	formatItemBreakdown,
	totalItemValue,
} from "../rules/itemEffects";
import { ActivationTracker } from "../state/activation";
import { tickBlockEntries } from "../state/blockHelpers";
import type { BonusEntry, CombatRollResult } from "../state/combatState";
import { createEmptyCombatState } from "../state/combatState";
import type { EnemyState } from "../state/enemyState";
import type { GameState } from "../state/gameState";
import type { HeroState } from "../state/heroState";
import { applyDamage } from "../systems/damageSystem";
import { resolvePoisonRound } from "../rules/poison";
import { resolveDamageOverTimeRound, clearDamageOverTime } from "../rules/damageOverTime";
import { recordEvent } from "../events/record";
import { log } from "./utils";
import { cardById, cardName, skillsOf } from "../gameEngine";
import type { GameEngine, GameHandler } from "../gameEngine";
import type { Action } from "../actions/types";
import { activeEnemies, partyHeroIds } from "./legal";

import { awakeningOf, enemiesOf, heroesOf, recordOfEnemy, spawnEnemy, scopedFlagOf, withScopedFlag, withWorld, worldOf, pendingTriggerInterruptOf, pendingSkillChoiceOf, pendingSkillTargetOf } from "../state/access";
import { beginCombat, beginRound } from "../state/lifecycle";
import { gameOf, withGame } from "../../engine/state";
function collectWorldModifierEntries(
	state: GameState,
	entityId: string,
	target: "damage_dealt" | "damage_taken" | "hit_bonus",
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
	boss: EnemyState,
	rollMargin: number,
): { damage: number; breakdown: readonly { source: string; value: number }[] } {
	const breakdown = [
		...collectWorldModifierEntries(state, hero.id, "damage_dealt"),
		...collectHeroDamageBonusesFromItems(engine, hero, state, boss, rollMargin),
	];
	if (awakeningOf(state) >= 3 && skillsOf(engine, hero.cardId).some(({ def }) => def.id === HERO_ABILITY_IDS.skill_final_dawn_light)) {
		breakdown.push({ source: "Luz da Aurora Final", value: 2 });
	}
	return {
		damage: Math.max(0, hero.damage + totalItemValue(breakdown)),
		breakdown,
	};
}

function effectiveEnemyDamage(enemy: EnemyState, state: GameState): number {
	return Math.max(
		0,
		enemy.damage + dungeonAwakeningEffect(awakeningOf(state)).damageBonus +
			totalItemValue(
				collectWorldModifierEntries(state, enemy.id, "damage_dealt"),
			),
	);
}

function reduceHeroDamage(engine: GameEngine,
	state: GameState,
	hero: HeroState,
	amount: number,
): { damage: number; breakdown: string[] } {
	const worldReduction = -totalItemValue(
		collectWorldModifierEntries(state, hero.id, "damage_taken"),
	);
	const itemEntries = collectHeroDamageReductionsFromItems(engine,
		hero,
		state,
		"attack",
	);
	const itemReduction = totalItemValue(itemEntries);
	const adjustedReduction = piercedItemReduction(itemReduction, dungeonAwakeningEffect(awakeningOf(state)).armorPenetration);
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

function formatDamageBonusNote(
	baseDamage: number,
	damage: number,
	breakdown: readonly { source: string; value: number }[],
): string {
	if (damage === baseDamage || breakdown.length === 0) return "";
	const parts = breakdown.map(
		(entry) => `${entry.source} ${entry.value > 0 ? "+" : ""}${entry.value}`,
	);
	return ` [dano ${baseDamage}→${damage}: ${parts.join(", ")}]`;
}

// ─── REVEAL_BOSS ─────────────────────────────────────────────────────────────

export function handleRevealBoss(engine: GameEngine, state: GameState): GameState {
	const card = cardById(engine, gameOf(state).bossCardId);
	const bossCard = card?.type === "boss" ? card : undefined;
	if (!bossCard) return log(state, "[ERRO] Carta do boss não encontrada.");
	if (!checkBossCondition(engine, state, bossCard.id)) {
		return log(state, "[AVISO] Condição de acesso ao boss ainda não atendida.");
	}
	const hasBonusArtifact = bossCard.artifactBonus &&
		gameOf(state).groupArtifacts.some((artifact) => artifact.cardId === bossCard.artifactBonus?.artifactId);
	const lifeBase = hasBonusArtifact ? bossCard.artifactBonus!.lifeBase : bossCard.lifeBase;
	const totalLife = lifeBase + awakeningOf(state) * (bossCard.scaling?.lifePerAwakening ?? 2);
	const totalHitBonus = bossCard.hitBonusBase + awakeningOf(state) * (bossCard.scaling?.hitBonusPerAwakening ?? 1);

	const bossEnemy: EnemyState = {
		id: "boss",
		cardId: bossCard.id,
		maxLife: totalLife,
		currentLife: totalLife,
		damage: bossCard.damage,
		hitBonus: totalHitBonus,
		dice: bossCard.dice ?? 1,
		tokens: {},
		conditions: [],
		firstDamageTakenThisTurn: false,
		status: "active",
	};

	return log(
		withWorld(beginCombat(engine, withGame(state, (prevGame) => ({ ...prevGame, activeEnemies: [recordOfEnemy(bossEnemy)], status: "BOSS_COMBAT", combat: createEmptyCombatState() }))), spawnEnemy(worldOf(state), bossEnemy)),
		`${cardName(engine, bossCard.id)} revelado! Vida: ${totalLife}, Bônus de Acerto: ${totalHitBonus}.`,
	);
}

// ─── BOSS_COMBAT ─────────────────────────────────────────────────────────────
// O boss combat reutiliza a mesma sequência: CHOOSE_TARGET → ROLL_DICE → RESOLVE_ATTACK no status BOSS_COMBAT.
// O reducer raiz redireciona as actions de combate para os handlers normais quando status === "BOSS_COMBAT",
// mas RESOLVE_ATTACK chama handleBossResolveAttack que aplica habilidades especiais.

export function handleBossResolveAttack(engine: GameEngine, state: GameState): GameState {
	if (!gameOf(state).combat?.lastRoll || gameOf(state).combat?.pendingDiceSelection) return state;
	const roll = gameOf(state).combat!.lastRoll;

	const hero = heroesOf(state).find((h) => h.id === roll!.heroId);
	const boss = enemiesOf(state).find((e) => e.id === "boss");
	if (!hero || !boss) return state;

	const hitBonus = inlineBossHitBonus(engine, boss);
	const enemyTotal = roll!.enemyTotal + hitBonus;
	let next = state;
	if (hitBonus !== 0) next = log(next, `Habilidade do chefe: ${hitBonus > 0 ? "+" : ""}${hitBonus} no acerto.`);

	const heroDamage = effectiveHeroDamage(engine,
		hero,
		state,
		boss,
		roll!.heroTotal - enemyTotal,
	);
	const result = resolveAttack(
		roll!.heroTotal,
		enemyTotal,
		heroDamage.damage,
		effectiveEnemyDamage(boss, state),
	);

	if (result.enemyDamageTaken > 0) {
		let dmg = result.enemyDamageTaken;
		const reduction = inlineBossDamageReduction(engine, next, boss);
		if (reduction.amount > 0) {
			dmg = Math.max(0, dmg - reduction.amount);
			next = markInlineBossSkillsUsed(next, reduction.usedIds);
			next = log(next, `Habilidade do chefe: dano reduzido em ${reduction.amount}.`);
		}
		const newLife = Math.max(0, boss.currentLife - dmg);
		next = applyDamage(engine, next, "boss", dmg, {
			sourceId: hero.id,
			damageType: "attack",
		});
		const damageNote = formatDamageBonusNote(
			hero.damage,
			heroDamage.damage,
			heroDamage.breakdown,
		);
		next = log(
			next,
			`Boss sofreu ${dmg} de dano${damageNote}. Vida restante: ${newLife}.`,
		);
	}

	if (result.heroDamageTaken > 0) {
		const reduced = reduceHeroDamage(engine, next, hero, result.heroDamageTaken);
		const dmg = reduced.damage;
		next = applyDamage(engine, next, hero.id, dmg, {
			sourceId: boss.id,
			damageType: "attack",
		});
		const reductionStr = reduced.breakdown.length
			? ` [${reduced.breakdown.join(", ")}]`
			: "";
		next = log(
			next,
			`${cardName(engine, hero.cardId)} sofreu ${dmg} de dano do boss${reductionStr}.`,
		);
	}

	for (const mage of heroesOf(next).filter((entry) =>
		skillsOf(engine, entry.cardId).some(({ def }) => def.id === HERO_ABILITY_IDS.skill_rift_rune))) {
		const key = `${mage.id}:${hero.id}`;
		if (!scopedFlagOf(next, "combat", "riftRuneTarget", key)) continue;
		next = withScopedFlag(next, "combat", "riftRuneTarget", key, false);
		next = withWorld(next, removeComponent(worldOf(next), hero.id,
			(component) => component.type === "modifier" && component.source === `${HERO_ABILITY_IDS.skill_rift_rune}:${mage.id}`));
		if (enemiesOf(next).some((enemy) => enemy.id === "boss" && enemy.status === "defeated")) {
			next = withScopedFlag(next, "round", "oncePer", `${HERO_ABILITY_IDS.skill_rift_rune}::${mage.id}`, false);
			next = applyDamage(engine, next, mage.id, 2, { sourceId: mage.id, damageType: "direct" });
		}
	}
	next = withWorld(next, removeComponent(worldOf(next), hero.id,
		(component) => component.type === "modifier" && component.source === HERO_ABILITY_IDS.power_deep_veil_echo));
	next = withWorld(next, tickModifierDurations(worldOf(next), "once_consumed"));
	return checkBossEnd(engine, next);
}

function checkBossEnd(engine: GameEngine, state: GameState): GameState {
	const boss = enemiesOf(state).find((e) => e.id === "boss");
	const heroDefeated = heroesOf(state).every((h) => h.status !== "active");

	if (boss?.status === "defeated" || (boss && boss.currentLife <= 0)) {
		// Em modo competitivo, o vencedor é o herói ativo com mais XP individual
		const winner =
			gameOf(state).mode === "competitive"
				? heroesOf(state)
						.filter((h) => h.status === "active")
						.sort((a, b) => b.xp - a.xp)[0]?.cardId
				: undefined;
		return log(
			withGame(clearDamageOverTime(state), (prevGame) => ({ ...prevGame, status: "VICTORY", bossDefeated: true, winner })),
			"Boss derrotado! Vitória!",
		);
	}

	if (heroDefeated) {
		return log(
			withGame(clearDamageOverTime(state), (prevGame) => ({ ...prevGame, status: "DEFEAT" })),
			"Derrota: herói eliminado pelo boss.",
		);
	}

	// Efeitos de rodada são emitidos conforme as skills declaradas na ficha.
	let afterRoundEnd = resolveSkillWindow(engine, state, {
		event: "evt_round_end",
		ctx: { triggeredBy: "evt_round_end", round: gameOf(state).combat?.round },
	});
	if (pendingTriggerInterruptOf(afterRoundEnd) || pendingSkillChoiceOf(afterRoundEnd) ||
		pendingSkillTargetOf(afterRoundEnd)) return afterRoundEnd;
	afterRoundEnd = drainStack(engine, afterRoundEnd);
	afterRoundEnd = resolvePoisonRound(engine, afterRoundEnd);
	afterRoundEnd = resolveDamageOverTimeRound(engine, afterRoundEnd);
	if (heroesOf(afterRoundEnd).every((hero) => hero.status !== "active") ||
		enemiesOf(afterRoundEnd).every((enemy) => enemy.status !== "active")) {
		return checkBossEnd(engine, afterRoundEnd);
	}

	// Próxima rodada de boss
	const nextCombat = gameOf(afterRoundEnd).combat
		? {
				...gameOf(afterRoundEnd).combat!,
				round: gameOf(afterRoundEnd).combat!.round + 1,
				phase: "selecting_hero" as const,
				selectedHeroId: null,
				pairs: [],
				heroesActed: [],
				lastRoll: null,
				disabled: ActivationTracker.clearLocks(
					gameOf(afterRoundEnd).combat!.disabled,
					"round",
				),
			}
		: createEmptyCombatState();

	const worldAfterTick = decrementRoundsModifiers(
		tickModifierDurations(worldOf(afterRoundEnd), "end_of_round"),
	);
	const rolledOver = withGame(afterRoundEnd, (prevGame) => ({ ...prevGame, status: "BOSS_COMBAT" as const, combat: nextCombat }));
	afterRoundEnd = tickBlockEntries(
		withWorld(
			gameOf(state).combat ? beginRound(engine, rolledOver) : beginCombat(engine, rolledOver),
			worldAfterTick,
		),
		"end_of_round",
	);
	return log(afterRoundEnd, "Boss sobreviveu. Próxima rodada.");
}

// Reutiliza o ROLL_DICE normal mas com o boss no par
export function buildBossRoll(engine: GameEngine,
	state: GameState,
): { roll: CombatRollResult; nextState: GameState } | null {
	if (!gameOf(state).combat || gameOf(state).combat!.pairs.length === 0) return null;
	const pair = gameOf(state).combat!.pairs[0];
	if (!pair) return null;

	const hero = heroesOf(state).find((h) => h.id === pair.heroId);
	const boss = enemiesOf(state).find((e) => e.id === "boss");
	if (!hero || !boss) return null;

	const { result: heroRoll, next: rng1 } = rollDiceRng(hero.dice, gameOf(state).rng);
	const { result: bossRoll, next: rng2 } = rollDiceRng(boss.dice, rng1);
	const roll = buildBossRollFromResults(engine, state, heroRoll.results, bossRoll.results);
	if (!roll) return null;
	return {
		roll,
		nextState: recordEvent(withGame(state, (prevGame) => ({ ...prevGame, rng: rng2 })), "RollResolved", {
			heroId: hero.id,
			enemyId: boss.id,
			heroTotal: roll.heroTotal,
			enemyTotal: roll.enemyTotal,
			heroResults: heroRoll.results,
			enemyResults: bossRoll.results,
		}),
	};
}

export function buildBossRollFromResults(
	engine: GameEngine,
	state: GameState,
	heroResults: readonly number[],
	bossResults: readonly number[],
): CombatRollResult | null {
	const pair = gameOf(state).combat?.pairs[0];
	const hero = heroesOf(state).find((h) => h.id === pair?.heroId);
	const boss = enemiesOf(state).find((e) => e.id === "boss");
	if (!hero || !boss) return null;
	const heroBonuses: BonusEntry[] = [
		{ source: "hitBonus", value: hero.hitBonus },
		...(awakeningOf(state) >= 3 && skillsOf(engine, hero.cardId).some(({ def }) => def.id === HERO_ABILITY_IDS.skill_final_dawn_light)
			? [{ source: "Luz da Aurora Final", value: 2 }] : []),
		...collectWorldModifierEntries(state, hero.id, "hit_bonus"),
		...collectHeroHitBonusesFromItems(engine, hero, state, boss),
	];
	const bossBonuses: BonusEntry[] = [
		{ source: "hitBonus", value: boss.hitBonus },
		...(dungeonAwakeningEffect(awakeningOf(state)).hitBonus > 0 ? [{ source: "Despertar da Masmorra", value: dungeonAwakeningEffect(awakeningOf(state)).hitBonus }] : []),
		...collectWorldModifierEntries(state, boss.id, "hit_bonus"),
	];

	const heroCalc = calculateTotal(heroResults, heroBonuses);
	const bossCalc = calculateTotal(bossResults, bossBonuses);

	const roll: CombatRollResult = {
		heroId: hero.id,
		enemyId: boss.id,
		heroResults,
		heroTotal: heroCalc.total,
		heroBreakdown: heroBonuses,
		enemyResults: bossResults,
		enemyTotal: bossCalc.total,
		enemyBreakdown: bossBonuses,
	};
	return roll;
}

export function isBossRoll(state: GameState): boolean {
	return gameOf(state).status === "BOSS_COMBAT";
}

export function isBossAttack(state: GameState): boolean {
	return (
		gameOf(state).status === "BOSS_COMBAT" ||
		(gameOf(state).status === "RESOLVE_ATTACK" &&
			gameOf(state).activeEnemies.some((e) => e.id === "boss"))
	);
}

function handleBossRoll(engine: GameEngine, state: GameState): GameState {
	const bossResult = buildBossRoll(engine, state);
	if (!bossResult) return state;
	const { roll, nextState } = bossResult;
	const rolled = withGame(nextState, (prevGame) => ({
		...prevGame,
		status: "RESOLVE_ATTACK",
		combat: gameOf(nextState).combat
			? { ...gameOf(nextState).combat!, lastRoll: roll }
			: null,
	}));
	return resolveSkillWindow(engine, rolled, {
		event: "evt_roll",
		ctx: {
			triggeredBy: "evt_roll", sourceHeroId: roll.heroId,
			sourceEnemyId: roll.enemyId,
			targetHeroIds: [roll.heroId], targetEnemyIds: [roll.enemyId],
			value: roll.heroTotal - roll.enemyTotal,
			round: gameOf(rolled).combat?.round ?? 0,
		},
	});
}

export const bossHandler: GameHandler = {
	id: "boss",
	phases: ["BOSS_REVEAL", "BOSS_COMBAT", "VICTORY", "DEFEAT"],
	actions: [
		"REVEAL_BOSS",
		"START_BOSS_COMBAT",
		"ROLL_DICE",
		"RESOLVE_ATTACK",
		"VICTORY",
		"DEFEAT",
	],
	accepts(state, action) {
		if (action.type === "ROLL_DICE") return isBossRoll(state);
		if (action.type === "RESOLVE_ATTACK") return isBossAttack(state);
		return true;
	},
	legalActions(state) {
		switch (gameOf(state).status) {
			case "BOSS_REVEAL":
				return [{ type: "REVEAL_BOSS" }];
			case "BOSS_COMBAT":
				return [
					...partyHeroIds(state).flatMap((heroId): Action[] => [
						...activeEnemies(state).map((enemy) => ({
							type: "CHOOSE_TARGET" as const,
							payload: { heroId, enemyId: enemy.id },
						})),
						{ type: "CHOOSE_HERO_FOR_ROUND", payload: { heroId } },
					]),
					{ type: "START_BOSS_COMBAT" },
				];
			default:
				return [];
		}
	},
	apply(state, action, engine) {
		switch (action.type) {
			case "REVEAL_BOSS":
				return handleRevealBoss(engine, state);
			case "START_BOSS_COMBAT":
				return withGame(state, (prevGame) => ({
					...prevGame,
					status: "BOSS_COMBAT",
				}));
			case "ROLL_DICE":
				return handleBossRoll(engine, state);
			case "RESOLVE_ATTACK":
				return handleBossResolveAttack(engine, state);
			case "VICTORY":
				return withGame(state, (prevGame) => ({
					...prevGame,
					status: "VICTORY",
					bossDefeated: true,
				}));
			case "DEFEAT":
				return withGame(state, (prevGame) => ({
					...prevGame,
					status: "DEFEAT",
				}));
			default:
				return state;
		}
	},
};
