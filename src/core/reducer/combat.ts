// Handlers do loop de combate: START_COMBAT → CHOOSE_TARGET → ROLL_DICE → RESOLVE_ATTACK → DIRECT_DAMAGE → CHECK_COMBAT_END.
// Implementa efeitos de: Adaga Enferrujada, Escudo Rachado, Poção de Vigor Menor, Bárbaro Rubro.

import { calculateTotal, resolveAttack } from "../rules/combat";
import { rollDice } from "../rules/dice";
import { applyShield } from "../rules/shield";
import type { BonusEntry, CombatRollResult } from "../state/combatState";
import { createEmptyCombatState } from "../state/combatState";
import type { GameState } from "../state/gameState";
import type { HeroState } from "../state/heroState";
import { selectTargetHero } from "../strategies/targetSelection";
import { log, mapEnemy, mapHero } from "./utils";

// ─── START_COMBAT ────────────────────────────────────────────────────────────

export function handleStartCombat(state: GameState): GameState {
	return log(
		{ ...state, status: "HERO_ACTION", combat: createEmptyCombatState() },
		"Combate iniciado.",
	);
}

// ─── CHOOSE_TARGET ───────────────────────────────────────────────────────────

export function handleChooseTarget(
	state: GameState,
	heroId: string,
	enemyId: string,
): GameState {
	if (!state.combat) return state;

	// Validações multi-herói: herói não agiu e inimigo não foi engajado na rodada
	if (state.combat.heroesActed.includes(heroId)) {
		return log(state, `[AVISO] Herói ${heroId} já agiu nesta rodada.`);
	}
	if (state.combat.enemiesEngaged.includes(enemyId)) {
		return log(state, `[AVISO] Inimigo ${enemyId} já está engajado nesta rodada.`);
	}

	const pair = { heroId, enemyId };
	return {
		...state,
		status: "ROLL_DICE",
		combat: {
			...state.combat,
			pairs: [...state.combat.pairs, pair],
			enemiesEngaged: [...state.combat.enemiesEngaged, enemyId],
		},
	};
}

// ─── ROLL_DICE ───────────────────────────────────────────────────────────────

function collectHeroBonuses(hero: HeroState, state: GameState): BonusEntry[] {
	const bonuses: BonusEntry[] = [{ source: "hitBonus", value: hero.hitBonus }];

	// Adaga Enferrujada: +1 no total
	if (hero.activeItems.weapon === "Adaga Enferrujada") {
		bonuses.push({ source: "Adaga Enferrujada", value: 1 });
	}
	// Bárbaro Rubro: +3 quando em metade da vida ou menos
	if (
		hero.cardName === "Bárbaro Rubro" &&
		hero.currentLife <= Math.floor(hero.maxLife / 2)
	) {
		bonuses.push({ source: "Bárbaro Rubro — habilidade", value: 3 });
	}
	// Dados extras do poder do Bárbaro
	const extraDice = state.combat?.extraDice[hero.id] ?? 0;
	if (extraDice > 0) {
		bonuses.push({ source: "Bárbaro Rubro — poder", value: 0 }); // valor 0: dado extra é contado abaixo
	}
	return bonuses;
}

export function handleRollDice(state: GameState): GameState {
	if (!state.combat || state.combat.pairs.length === 0) return state;
	// Rola para o par mais recente (último adicionado nesta rodada)
	const pair = state.combat.pairs[state.combat.pairs.length - 1];
	if (!pair) return state;

	const hero = state.heroes.find((h) => h.id === pair.heroId);
	const enemy = state.activeEnemies.find((e) => e.id === pair.enemyId);
	if (!hero || !enemy) return state;

	const extraDice = state.combat.extraDice[hero.id] ?? 0;
	const heroDiceCount = hero.dice + extraDice;
	const heroRoll = rollDice(heroDiceCount);
	const enemyRoll = rollDice(enemy.dice);

	const heroBonuses = collectHeroBonuses(hero, state);
	const enemyBonuses: BonusEntry[] = [
		{ source: "hitBonus", value: enemy.hitBonus },
	];

	const heroCalc = calculateTotal(heroRoll.results, heroBonuses);
	const enemyCalc = calculateTotal(enemyRoll.results, enemyBonuses);

	const roll: CombatRollResult = {
		heroId: hero.id,
		enemyId: enemy.id,
		heroResults: heroRoll.results,
		heroTotal: heroCalc.total,
		heroBreakdown: heroBonuses,
		enemyResults: enemyRoll.results,
		enemyTotal: enemyCalc.total,
		enemyBreakdown: enemyBonuses,
	};

	return log(
		{
			...state,
			status: "RESOLVE_ATTACK",
			combat: { ...state.combat, lastRoll: roll },
		},
		`Herói rolou ${heroCalc.total} | Inimigo rolou ${enemyCalc.total}.`,
	);
}

// ─── RESOLVE_ATTACK ───────────────────────────────────────────────────────────

export function handleResolveAttack(state: GameState): GameState {
	if (!state.combat?.lastRoll) return state;
	const roll = state.combat.lastRoll;

	const hero = state.heroes.find((h) => h.id === roll.heroId);
	const enemy = state.activeEnemies.find((e) => e.id === roll.enemyId);
	if (!hero || !enemy) return state;

	const result = resolveAttack(
		roll.heroTotal,
		roll.enemyTotal,
		hero.damage,
		enemy.damage,
	);

	let next = state;

	if (result.enemyDamageTaken > 0) {
		let dmg = result.enemyDamageTaken;
		// Adaga: +1 dano se vencer por 4 ou mais
		if (
			hero.activeItems.weapon === "Adaga Enferrujada" &&
			roll.heroTotal - roll.enemyTotal >= 4
		) {
			dmg += 1;
			next = log(next, "Adaga Enferrujada: +1 dano bônus.");
		}
		next = mapEnemy(next, enemy.id, (e) => ({
			...e,
			currentLife: Math.max(0, e.currentLife - dmg),
			status: e.currentLife - dmg <= 0 ? "defeated" : e.status,
		}));
		next = log(next, `${enemy.cardName} sofreu ${dmg} de dano.`);
	}

	if (result.heroDamageTaken > 0) {
		const hasShield = hero.activeItems.armor === "Escudo Rachado";
		const shieldUsed = state.combat.shieldsUsedThisCombat[hero.id] ?? false;
		const dmg = applyShield(result.heroDamageTaken, !shieldUsed, hasShield);
		const newShields =
			hasShield && !shieldUsed
				? { ...state.combat.shieldsUsedThisCombat, [hero.id]: true }
				: state.combat.shieldsUsedThisCombat;

		next = mapHero(next, hero.id, (h) => ({
			...h,
			currentLife: Math.max(0, h.currentLife - dmg),
			status: h.currentLife - dmg <= 0 ? "defeated" : h.status,
		}));
		next = {
			...next,
			combat: next.combat
				? { ...next.combat, shieldsUsedThisCombat: newShields }
				: null,
		};
		next = log(next, `${hero.cardName} sofreu ${dmg} de dano.`);
	}

	// Registrar herói como tendo agido nesta rodada
	const updatedActed = [...(next.combat?.heroesActed ?? []), roll.heroId];
	next = {
		...next,
		combat: next.combat ? { ...next.combat, heroesActed: updatedActed } : null,
	};

	// Verificar se ainda há heróis ativos que não agiram
	const activeHeroes = next.heroes.filter((h) => h.status === "active");
	const pendingHeroes = activeHeroes.filter(
		(h) => !updatedActed.includes(h.id),
	);

	if (pendingHeroes.length > 0) {
		// Há heróis que ainda não agiram — voltar para HERO_ACTION
		return log(
			{ ...next, status: "HERO_ACTION" },
			`Aguardando ação de ${pendingHeroes.length} herói(s).`,
		);
	}

	// Todos os heróis ativos agiram — passar para dano direto
	return { ...next, status: "DIRECT_DAMAGE" };
}

// ─── DIRECT_DAMAGE ───────────────────────────────────────────────────────────

export function handleDirectDamage(state: GameState): GameState {
	if (!state.combat) return state;
	const engaged = new Set(state.combat.enemiesEngaged);
	const unengaged = state.activeEnemies.filter(
		(e) => e.status === "active" && !engaged.has(e.id),
	);
	if (unengaged.length === 0) return { ...state, status: "CHECK_COMBAT_END" };

	const target = selectTargetHero(state.heroes);
	if (!target) return { ...state, status: "CHECK_COMBAT_END" };

	let next = state;
	for (const enemy of unengaged) {
		next = mapHero(next, target.id, (h) => ({
			...h,
			currentLife: Math.max(0, h.currentLife - enemy.damage),
			status: h.currentLife - enemy.damage <= 0 ? "defeated" : h.status,
		}));
		next = log(
			next,
			`${enemy.cardName} causa ${enemy.damage} de dano direto em ${target.cardName}.`,
		);
	}

	return { ...next, status: "CHECK_COMBAT_END" };
}

// ─── CHECK_COMBAT_END ─────────────────────────────────────────────────────────

export function handleCheckCombatEnd(state: GameState): GameState {
	const allEnemiesDone = state.activeEnemies.every(
		(e) => e.status !== "active",
	);
	const heroDefeated = state.heroes.every((h) => h.status !== "active");

	if (heroDefeated) {
		return log({ ...state, status: "DEFEAT" }, "Derrota: herói eliminado.");
	}

	if (allEnemiesDone) {
		const defeated = state.activeEnemies.filter((e) => e.status === "defeated");
		return log(
			{
				...state,
				status: "REWARD_PHASE",
				creaturesDefeated: state.creaturesDefeated + defeated.length,
				enemyGraveyard: [...state.enemyGraveyard, ...state.activeEnemies],
				activeEnemies: [],
				combat: state.combat
					? {
							...state.combat,
							round: state.combat.round + 1,
							pairs: [],
							heroesActed: [],
							enemiesEngaged: [],
						}
					: null,
			},
			"Sala limpa! Avançando para recompensa.",
		);
	}

	// Próxima rodada
	const nextCombat = state.combat
		? {
				...state.combat,
				round: state.combat.round + 1,
				pairs: [],
				heroesActed: [],
				enemiesEngaged: [],
				lastRoll: null,
			}
		: createEmptyCombatState();
	return log(
		{ ...state, status: "HERO_ACTION", combat: nextCombat },
		`Rodada ${nextCombat.round + 1} de combate.`,
	);
}

// ─── USE_ITEM ─────────────────────────────────────────────────────────────────

export function handleUseItem(
	state: GameState,
	itemName: string,
	heroId: string,
	targetHeroId?: string,
): GameState {
	switch (itemName) {
		case "Poção de Vigor Menor": {
			const targetId = targetHeroId ?? heroId;
			const target = state.heroes.find((h) => h.id === targetId);
			if (!target) return state;
			const healed = Math.min(target.maxLife, target.currentLife + 2);
			const next = mapHero(state, targetId, (h) => ({
				...h,
				currentLife: healed,
				backpack: h.backpack.filter((i) => i !== "Poção de Vigor Menor"),
			}));
			return log(
				next,
				`${target.cardName} curou 2 de vida com Poção de Vigor Menor.`,
			);
		}
		default:
			return log(state, `[TODO] Efeito de item não implementado: ${itemName}`);
	}
}

// ─── USE_POWER ────────────────────────────────────────────────────────────────

export function handleUsePower(state: GameState, heroId: string): GameState {
	const hero = state.heroes.find((h) => h.id === heroId);
	if (!hero || !state.combat) return state;

	switch (hero.cardName) {
		case "Bárbaro Rubro": {
			if (state.combat.powersUsedThisRoom[heroId]) {
				return log(state, "Poder do Bárbaro Rubro já foi usado nesta sala.");
			}
			const nextCombat = {
				...state.combat,
				extraDice: {
					...state.combat.extraDice,
					[heroId]: (state.combat.extraDice[heroId] ?? 0) + 1,
				},
				powersUsedThisRoom: {
					...state.combat.powersUsedThisRoom,
					[heroId]: true,
				},
			};
			const next = mapHero({ ...state, combat: nextCombat }, heroId, (h) => ({
				...h,
				currentLife: Math.max(0, h.currentLife - 1),
			}));
			return log(next, "Bárbaro Rubro: -1 vida, +1 dado extra neste combate.");
		}
		default:
			return log(state, `[TODO] Poder não implementado para: ${hero.cardName}`);
	}
}

// ─── CHOOSE_HERO ──────────────────────────────────────────────────────────────
// Com 1 herói: auto-seleciona sem precisar de payload.
// Com múltiplos: valida que o herói está ativo e ainda não agiu nesta rodada.

export function handleChooseHero(
	state: GameState,
	heroId?: string,
): GameState {
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
		if (state.combat?.heroesActed.includes(heroId)) {
			return log(state, `[AVISO] Herói ${heroId} já agiu nesta rodada.`);
		}
	}

	return { ...state, status: "HERO_ACTION" };
}
