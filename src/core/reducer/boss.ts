// Handlers de combate com o boss Azhakar.
// Implementa: Trono Vivo (reduz 1 no primeiro dano do turno), Ascensão Final (+2 hit abaixo da metade).

import { getCardName } from "../data/cardLocale";
import { getBoss } from "../data/cards";
import { syncEntityFromEnemy } from "../ecs/sync";
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
import { log } from "./utils";

function collectWorldModifierEntries(
	state: GameState,
	entityId: string,
	target: "damage_dealt" | "damage_taken" | "hit_bonus",
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
	boss: EnemyState,
	rollMargin: number,
): { damage: number; breakdown: readonly { source: string; value: number }[] } {
	const breakdown = [
		...collectWorldModifierEntries(state, hero.id, "damage_dealt"),
		...collectHeroDamageBonusesFromItems(hero, state, boss, rollMargin),
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

function reduceHeroDamage(
	state: GameState,
	hero: HeroState,
	amount: number,
): { damage: number; breakdown: string[] } {
	const worldReduction = -totalItemValue(
		collectWorldModifierEntries(state, hero.id, "damage_taken"),
	);
	const itemEntries = collectHeroDamageReductionsFromItems(
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

// ─── REVEAL_BOSS ─────────────────────────────────────────────────────────────

export function handleRevealBoss(state: GameState): GameState {
	const bossCard = getBoss();
	if (!bossCard) return log(state, "[ERRO] Carta do boss não encontrada.");

	const has3Artifacts = state.groupArtifacts.length >= 3;
	const lifeBase = has3Artifacts ? 16 : bossCard.lifeBase;
	const totalLife = lifeBase + state.despertar * 2;
	const totalHitBonus = bossCard.hitBonusBase + state.despertar;

	const bossEnemy: EnemyState = {
		id: "boss",
		cardId: bossCard.id,
		maxLife: totalLife,
		currentLife: totalLife,
		damage: bossCard.damage,
		hitBonus: totalHitBonus,
		dice: 3, // Azhakar usa 3 dados
		tokens: {},
		conditions: [],
		firstDamageTakenThisTurn: false,
		status: "active",
	};

	return log(
		{
			...state,
			activeEnemies: [bossEnemy],
			world: syncEntityFromEnemy(state.world, bossEnemy),
			status: "BOSS_COMBAT",
			combat: createEmptyCombatState(),
		},
		`${getCardName(bossCard.id)} revelado! Vida: ${totalLife}, Bônus de Acerto: ${totalHitBonus}.`,
	);
}

// ─── BOSS_COMBAT ─────────────────────────────────────────────────────────────
// O boss combat reutiliza a mesma sequência: CHOOSE_TARGET → ROLL_DICE → RESOLVE_ATTACK no status BOSS_COMBAT.
// O reducer raiz redireciona as actions de combate para os handlers normais quando status === "BOSS_COMBAT",
// mas RESOLVE_ATTACK chama handleBossResolveAttack que aplica habilidades especiais.

export function handleBossResolveAttack(state: GameState): GameState {
	if (!state.combat?.lastRoll) return state;
	const roll = state.combat.lastRoll;

	const hero = state.heroes.find((h) => h.id === roll.heroId);
	const boss = state.activeEnemies.find((e) => e.id === "boss");
	if (!hero || !boss) return state;

	// Ascensão Final: +2 hit bonus quando boss está na metade da vida ou menos
	let enemyTotal = roll.enemyTotal;
	let next = state;
	if (boss.currentLife <= Math.floor(boss.maxLife / 2)) {
		enemyTotal += 2;
		next = log(next, "Ascensão Final ativada: +2 no acerto do boss.");
	}

	const heroDamage = effectiveHeroDamage(
		hero,
		state,
		boss,
		roll.heroTotal - enemyTotal,
	);
	const result = resolveAttack(
		roll.heroTotal,
		enemyTotal,
		heroDamage.damage,
		effectiveEnemyDamage(boss, state),
	);

	if (result.enemyDamageTaken > 0) {
		let dmg = result.enemyDamageTaken;
		// Trono Vivo: reduz o primeiro dano do turno em 1
		if (!state.combat.bossFirstDamageReduced) {
			dmg = Math.max(0, dmg - 1);
			next = {
				...next,
				combat: next.combat
					? { ...next.combat, bossFirstDamageReduced: true }
					: null,
			};
			next = log(next, "Trono Vivo: dano ao boss reduzido em 1.");
		}
		const newLife = Math.max(0, boss.currentLife - dmg);
		next = applyDamage(next, "boss", dmg, {
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
		const reduced = reduceHeroDamage(next, hero, result.heroDamageTaken);
		const dmg = reduced.damage;
		next = applyDamage(next, hero.id, dmg, {
			sourceId: boss.id,
			damageType: "attack",
		});
		const reductionStr = reduced.breakdown.length
			? ` [${reduced.breakdown.join(", ")}]`
			: "";
		next = log(
			next,
			`${getCardName(hero.cardId)} sofreu ${dmg} de dano do boss${reductionStr}.`,
		);
	}

	return checkBossEnd(next);
}

function checkBossEnd(state: GameState): GameState {
	const boss = state.activeEnemies.find((e) => e.id === "boss");
	const heroDefeated = state.heroes.every((h) => h.status !== "active");

	if (boss?.status === "defeated" || (boss && boss.currentLife <= 0)) {
		// Em modo competitivo, o vencedor é o herói ativo com mais XP individual
		const winner =
			state.mode === "competitive"
				? state.heroes
						.filter((h) => h.status === "active")
						.sort((a, b) => b.xp - a.xp)[0]?.cardId
				: undefined;
		return log(
			{ ...state, status: "VICTORY", bossDefeated: true, winner },
			"Boss derrotado! Vitória!",
		);
	}

	if (heroDefeated) {
		return log(
			{ ...state, status: "DEFEAT" },
			"Derrota: herói eliminado pelo boss.",
		);
	}

	// O boss é dono de suas três regras (Trono Vivo, Ascensão Final e Pressão
	// da Forja). A janela genérica ignora boss_skill para não somá-las em dobro.
	let afterRoundEnd = state;

	if (afterRoundEnd.despertar >= 4) {
		afterRoundEnd = discardFromDungeonDeck(afterRoundEnd, 1);
		if (
			afterRoundEnd.pendingTriggerInterrupt ||
			afterRoundEnd.pendingSkillChoice ||
			afterRoundEnd.pendingSkillTarget
		) {
			return afterRoundEnd;
		}
		afterRoundEnd = log(
			afterRoundEnd,
			"Pressão da Forja Sombria: 1 carta de masmorra descartada.",
		);
	}

	// Próxima rodada de boss
	const nextCombat = state.combat
		? {
				...afterRoundEnd.combat!,
				round: afterRoundEnd.combat!.round + 1,
				phase: "selecting_hero" as const,
				selectedHeroId: null,
				pairs: [],
				heroesActed: [],
				lastRoll: null,
				bossFirstDamageReduced: false,
				disabled: ActivationTracker.clearLocks(
					afterRoundEnd.combat!.disabled,
					"round",
				),
				oncePer: { ...afterRoundEnd.combat!.oncePer, round: {} },
			}
		: createEmptyCombatState();

	const worldAfterTick = decrementRoundsModifiers(
		tickModifierDurations(afterRoundEnd.world, "end_of_round"),
	);
	afterRoundEnd = tickBlockEntries(
		{
			...afterRoundEnd,
			status: "BOSS_COMBAT",
			combat: nextCombat,
			world: worldAfterTick,
		},
		"end_of_round",
	);
	return log(
		afterRoundEnd,
		"Boss sobreviveu. Próxima rodada.",
	);
}

// Reutiliza o ROLL_DICE normal mas com o boss no par
export function buildBossRoll(
	state: GameState,
): { roll: CombatRollResult; nextState: GameState } | null {
	if (!state.combat || state.combat.pairs.length === 0) return null;
	const pair = state.combat.pairs[0];
	if (!pair) return null;

	const hero = state.heroes.find((h) => h.id === pair.heroId);
	const boss = state.activeEnemies.find((e) => e.id === "boss");
	if (!hero || !boss) return null;

	const { result: heroRoll, next: rng1 } = rollDiceRng(hero.dice, state.rng);
	const { result: bossRoll, next: rng2 } = rollDiceRng(boss.dice, rng1);
	const roll = buildBossRollFromResults(state, heroRoll.results, bossRoll.results);
	return roll ? { roll, nextState: { ...state, rng: rng2 } } : null;
}

export function buildBossRollFromResults(
	state: GameState,
	heroResults: readonly number[],
	bossResults: readonly number[],
): CombatRollResult | null {
	const pair = state.combat?.pairs[0];
	const hero = state.heroes.find((h) => h.id === pair?.heroId);
	const boss = state.activeEnemies.find((e) => e.id === "boss");
	if (!hero || !boss) return null;
	const heroBonuses: BonusEntry[] = [
		{ source: "hitBonus", value: hero.hitBonus },
		...collectWorldModifierEntries(state, hero.id, "hit_bonus"),
		...collectHeroHitBonusesFromItems(hero, state, boss),
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
