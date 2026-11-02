import { decrementRoundsModifiers, tickModifierDurations } from "../ecs/world";
import { calculateTotal, resolveAttack } from "../rules/combat";
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
import { discardFromDungeonDeck } from "./exploration";
import { recordEvent } from "../events/record";
import { log } from "./utils";
import { bossCard as bossCardOf, cardName } from "../gameEngine";
import type { GameEngine, GameHandler } from "../gameEngine";
import type { Action } from "../actions/types";
import { activeEnemies, partyHeroIds } from "./legal";

import { awakeningOf, enemiesOf, heroesOf, recordOfEnemy, spawnEnemy, withWorld, worldOf, pendingTriggerInterruptOf, pendingSkillChoiceOf, pendingSkillTargetOf } from "../state/access";
import { scopedFlagOf, withScopedFlag } from "../state/access";
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
	return {
		damage: Math.max(0, hero.damage + totalItemValue(breakdown)),
		breakdown,
	};
}

function effectiveEnemyDamage(enemy: EnemyState, state: GameState): number {
	return Math.max(
		0,
		enemy.damage +
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
	const finalDamage = Math.max(
		0,
		amount - worldReduction - totalItemValue(itemEntries),
	);
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

function bossRulesOf(engine: GameEngine) {
	const card = bossCardOf(engine);
	if (!card) throw new Error("Carta do boss não encontrada");
	return card.rules;
}

// ─── REVEAL_BOSS ─────────────────────────────────────────────────────────────

export function handleRevealBoss(engine: GameEngine, state: GameState): GameState {
	const bossCard = bossCardOf(engine);
	if (!bossCard) return log(state, "[ERRO] Carta do boss não encontrada.");

	const { rules } = bossCard;
	const hasFullArtifacts =
		gameOf(state).groupArtifacts.length >= rules.fullArtifacts.count;
	const lifeBase = hasFullArtifacts ? rules.fullArtifacts.life : bossCard.lifeBase;
	const totalLife = lifeBase + awakeningOf(state) * 2;
	const totalHitBonus = bossCard.hitBonusBase + awakeningOf(state);

	const bossEnemy: EnemyState = {
		id: "boss",
		cardId: bossCard.id,
		maxLife: totalLife,
		currentLife: totalLife,
		damage: bossCard.damage,
		hitBonus: totalHitBonus,
		dice: rules.dice,
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
	if (!gameOf(state).combat?.lastRoll) return state;
	const roll = gameOf(state).combat!.lastRoll;

	const hero = heroesOf(state).find((h) => h.id === roll!.heroId);
	const boss = enemiesOf(state).find((e) => e.id === "boss");
	if (!hero || !boss) return state;

	const rules = bossRulesOf(engine);
	let enemyTotal = roll!.enemyTotal;
	let next = state;
	if (
		boss.currentLife <=
		Math.floor(boss.maxLife * rules.ascension.atOrBelowLifeFraction)
	) {
		enemyTotal += rules.ascension.hitBonus;
		next = log(
			next,
			`Ascensão Final ativada: +${rules.ascension.hitBonus} no acerto do boss.`,
		);
	}

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
		if (!scopedFlagOf(state, "round", "bossFirstDamageReduced", "boss")) {
			dmg = Math.max(0, dmg - rules.firstDamageReduction);
			if (gameOf(next).combat) {
				next = withScopedFlag(next, "round", "bossFirstDamageReduced", "boss");
			}
			next = log(
				next,
				`Trono Vivo: dano ao boss reduzido em ${rules.firstDamageReduction}.`,
			);
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
			withGame(state, (prevGame) => ({ ...prevGame, status: "VICTORY", bossDefeated: true, winner })),
			"Boss derrotado! Vitória!",
		);
	}

	if (heroDefeated) {
		return log(
			withGame(state, (prevGame) => ({ ...prevGame, status: "DEFEAT" })),
			"Derrota: herói eliminado pelo boss.",
		);
	}

	// O boss é dono de suas três regras (Trono Vivo, Ascensão Final e Pressão
	// da Forja). A janela genérica ignora boss_skill para não somá-las em dobro.
	let afterRoundEnd = state;

	const { pressure } = bossRulesOf(engine);
	if (awakeningOf(afterRoundEnd) >= pressure.atAwakening) {
		afterRoundEnd = discardFromDungeonDeck(
			engine,
			afterRoundEnd,
			pressure.discardDungeon,
		);
		if (
			pendingTriggerInterruptOf(afterRoundEnd) ||
			pendingSkillChoiceOf(afterRoundEnd) ||
			pendingSkillTargetOf(afterRoundEnd)
		) {
			return afterRoundEnd;
		}
		afterRoundEnd = log(
			afterRoundEnd,
			`Pressão da Forja Sombria: ${pressure.discardDungeon} carta de masmorra descartada.`,
		);
	}

	// Próxima rodada de boss
	const nextCombat = gameOf(state).combat
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
		...collectWorldModifierEntries(state, hero.id, "hit_bonus"),
		...collectHeroHitBonusesFromItems(engine, hero, state, boss),
	];
	const bossBonuses: BonusEntry[] = [
		{ source: "hitBonus", value: boss.hitBonus },
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
	return withGame(nextState, (prevGame) => ({
		...prevGame,
		status: "RESOLVE_ATTACK",
		combat: gameOf(nextState).combat
			? { ...gameOf(nextState).combat!, lastRoll: roll }
			: null,
	}));
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
