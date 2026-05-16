// Handlers de combate com o boss Azhakar.
// Implementa: Trono Vivo (reduz 1 no primeiro dano do turno), Ascensão Final (+2 hit abaixo da metade).

import { getBoss } from "../../data/cards";
import { calculateTotal, resolveAttack } from "../rules/combat";
import { rollDice } from "../rules/dice";
import { applyShield } from "../rules/shield";
import type { BonusEntry, CombatRollResult } from "../state/combatState";
import { createEmptyCombatState } from "../state/combatState";
import type { EnemyState } from "../state/enemyState";
import type { GameState } from "../state/gameState";
import { log, mapHero } from "./utils";

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
		cardName: bossCard.name,
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
			status: "BOSS_COMBAT",
			combat: createEmptyCombatState(),
		},
		`${bossCard.name} revelado! Vida: ${totalLife}, Bônus de Acerto: ${totalHitBonus}.`,
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
	if (boss.currentLife <= Math.floor(boss.maxLife / 2)) {
		enemyTotal += 2;
		log(state, "Ascensão Final ativada: +2 no acerto do boss.");
	}

	const result = resolveAttack(
		roll.heroTotal,
		enemyTotal,
		hero.damage,
		boss.damage,
	);

	let next = state;

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
		next = {
			...next,
			activeEnemies: next.activeEnemies.map((e) =>
				e.id === "boss"
					? {
							...e,
							currentLife: newLife,
							status: newLife <= 0 ? "defeated" : e.status,
						}
					: e,
			),
		};
		next = log(next, `Boss sofreu ${dmg} de dano. Vida restante: ${newLife}.`);
	}

	if (result.heroDamageTaken > 0) {
		const hasShield = hero.activeItems.armor === "Escudo Rachado";
		const shieldUsed = state.combat.shieldsUsedThisCombat[hero.id] ?? false;
		const dmg = applyShield(result.heroDamageTaken, !shieldUsed, hasShield);
		next = mapHero(next, hero.id, (h) => ({
			...h,
			currentLife: Math.max(0, h.currentLife - dmg),
			status: h.currentLife - dmg <= 0 ? "defeated" : h.status,
		}));
		next = log(next, `${hero.cardName} sofreu ${dmg} de dano do boss.`);
	}

	return checkBossEnd(next);
}

function checkBossEnd(state: GameState): GameState {
	const boss = state.activeEnemies.find((e) => e.id === "boss");
	const heroDefeated = state.heroes.every((h) => h.status !== "active");

	if (boss?.status === "defeated" || (boss && boss.currentLife <= 0)) {
		return log(
			{ ...state, status: "VICTORY", bossDefeated: true },
			"Boss derrotado! Vitória!",
		);
	}

	if (heroDefeated) {
		return log(
			{ ...state, status: "DEFEAT" },
			"Derrota: herói eliminado pelo boss.",
		);
	}

	// Próxima rodada de boss
	const nextCombat = state.combat
		? {
				...state.combat,
				round: state.combat.round + 1,
				pairs: [],
				heroesActed: [],
				enemiesEngaged: [],
				lastRoll: null,
				bossFirstDamageReduced: false,
			}
		: createEmptyCombatState();

	return log(
		{ ...state, status: "BOSS_COMBAT", combat: nextCombat },
		"Boss sobreviveu. Próxima rodada.",
	);
}

// Reutiliza o ROLL_DICE normal mas com o boss no par
export function buildBossRoll(state: GameState): CombatRollResult | null {
	if (!state.combat || state.combat.pairs.length === 0) return null;
	const pair = state.combat.pairs[0];
	if (!pair) return null;

	const hero = state.heroes.find((h) => h.id === pair.heroId);
	const boss = state.activeEnemies.find((e) => e.id === "boss");
	if (!hero || !boss) return null;

	const heroRoll = rollDice(hero.dice);
	const bossRoll = rollDice(boss.dice);

	const heroBonuses: BonusEntry[] = [
		{ source: "hitBonus", value: hero.hitBonus },
	];
	const bossBonuses: BonusEntry[] = [
		{ source: "hitBonus", value: boss.hitBonus },
	];

	const heroCalc = calculateTotal(heroRoll.results, heroBonuses);
	const bossCalc = calculateTotal(bossRoll.results, bossBonuses);

	return {
		heroId: hero.id,
		enemyId: boss.id,
		heroResults: heroRoll.results,
		heroTotal: heroCalc.total,
		heroBreakdown: heroBonuses,
		enemyResults: bossRoll.results,
		enemyTotal: bossCalc.total,
		enemyBreakdown: bossBonuses,
	};
}
