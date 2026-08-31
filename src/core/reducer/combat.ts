// Handlers do loop de combate.
// Patch 2: fluxo sequencial — CHOOSE_HERO_FOR_ROUND → CHOOSE_TARGET → ROLL_DICE → RESOLVE_ATTACK → DIRECT_DAMAGE → CHECK_COMBAT_END.
// Engajamento é 1-para-1 por rodada: um monstro só pode ser alvo de 1 herói.
// Implementa efeitos de: item_rusty_dagger, item_cracked_shield, item_lesser_vigor_potion, hero_crimson_barbarian.

import { getCardName } from "../data/cardLocale";
import { getCardById } from "../data/cards";
import {
	decrementRoundsModifiers,
	getModifierTotal,
	tickModifierDurations,
} from "../ecs/world";
import { drainStack } from "../effects/resolver";
import { emit } from "../events/bus";
import { calculateTotal, resolveAttack } from "../rules/combat";
import { rollDiceRng } from "../rules/dice";
import { applyShield } from "../rules/shield";
import { cardSkills } from "../skills/lookup";
import { fireOnUseSkill, isManuallyActivatable } from "../skills/useSkill";
import { tickBlockEntries } from "../state/blockHelpers";
import type { BonusEntry, CombatRollResult } from "../state/combatState";
import { createEmptyCombatState } from "../state/combatState";
import type { GameState } from "../state/gameState";
import type { HeroState } from "../state/heroState";
import { selectTargetHero } from "../strategies/targetSelection";
import { applyDamage } from "../systems/damageSystem";
import { log, mapHero, shuffleRng } from "./utils";

// ─── START_COMBAT ────────────────────────────────────────────────────────────

export function handleStartCombat(state: GameState): GameState {
	let next: GameState = {
		...state,
		status: "HERO_ACTION",
		combat: { ...createEmptyCombatState(), phase: "selecting_hero" },
	};
	// start_of_combat / on_enter_combat: agora via TriggerComponents (emit CombatStarted abaixo)
	// while_in_play: passivo via installPassive — fireTrigger mantido durante transição
	// Lote E: emite CombatStarted + RoundStarted(1) para triggers reativos ECS
	({ state: next } = emit(next, {
		type: "CombatStarted",
		payload: { roomId: next.currentRoom?.cardId ?? "" },
	}));
	({ state: next } = emit(next, {
		type: "RoundStarted",
		payload: { round: 1 },
	}));
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
	if (state.combat.heroesActed.includes(heroId)) {
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
	const updatedActed = [...state.combat.heroesActed, heroId];
	const activeHeroes = state.heroes.filter((h) => h.status === "active");
	const pendingHeroes = activeHeroes.filter(
		(h) => !updatedActed.includes(h.id),
	);

	const nextCombat = {
		...state.combat,
		heroesActed: updatedActed,
		selectedHeroId: null,
		phase: (pendingHeroes.length > 0 ? "selecting_hero" : "direct_damage") as
			| "selecting_hero"
			| "direct_damage",
	};
	const next = { ...state, combat: nextCombat };

	if (pendingHeroes.length > 0) {
		return log(next, `${getCardName(hero?.cardId ?? heroId)} passou a rodada.`);
	}
	return log(
		{ ...next, status: "DIRECT_DAMAGE" },
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
	if (state.combat.heroesActed.includes(heroId)) {
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

function collectHeroBonuses(hero: HeroState, state: GameState): BonusEntry[] {
	const bonuses: BonusEntry[] = [{ source: "hitBonus", value: hero.hitBonus }];

	// Bônus de dano/acerto — lê do ECS world (Lote C)
	const entity = state.world.entities[hero.id];
	if (entity) {
		for (const comp of entity.components) {
			if (
				comp.type === "modifier" &&
				(comp.target === "damage_dealt" || comp.target === "hit_bonus") &&
				comp.value > 0
			) {
				bonuses.push({ source: comp.source, value: comp.value });
			}
		}
	}

	// Penalidade de acerto via ECS world (hit_bonus com valor negativo) — Lote C/D
	if (entity) {
		for (const comp of entity.components) {
			if (
				comp.type === "modifier" &&
				comp.target === "hit_bonus" &&
				comp.value < 0
			) {
				bonuses.push({ source: comp.source, value: comp.value });
			}
		}
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

	// Lote E+F: emit(RollAboutToHappen) dispara TriggerComponents instalados
	// (before_attack, combat_*, when_half_life_or_less via condições no world)
	let preRoll = state;
	({ state: preRoll } = emit(preRoll, {
		type: "RollAboutToHappen",
		payload: {
			heroId: hero.id,
			enemyId: enemy.id,
			round: preRoll.combat?.round ?? 0,
		},
	}));
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

	const heroBonuses = collectHeroBonuses(hero, preRoll);
	// Bônus do inimigo — lê do ECS world (Lote C)
	const enemyBonuses: BonusEntry[] = [
		{ source: "hitBonus", value: enemy.hitBonus },
	];
	const enemyEntity = preRoll.world.entities[enemy.id];
	if (enemyEntity) {
		for (const comp of enemyEntity.components) {
			if (
				comp.type === "modifier" &&
				(comp.target === "damage_dealt" || comp.target === "hit_bonus")
			) {
				enemyBonuses.push({ source: comp.source, value: comp.value });
			}
		}
	}

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

	// after_roll: via TriggerComponents (emit RollResolved abaixo)
	let postRoll = preRoll;

	// Lote E: emite RollResolved
	({ state: postRoll } = emit(postRoll, {
		type: "RollResolved",
		payload: {
			heroId: hero.id,
			enemyId: enemy.id,
			heroTotal: heroCalc.total,
			enemyTotal: enemyCalc.total,
			heroResults: heroRollResult.results,
			enemyResults: enemyRollResult.results,
		},
	}));

	return log(
		{
			...postRoll,
			status: "RESOLVE_ATTACK",
			combat: postRoll.combat ? { ...postRoll.combat, lastRoll: roll } : null,
		},
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

	const result = resolveAttack(
		roll.heroTotal,
		roll.enemyTotal,
		hero.damage,
		enemy.damage,
	);

	const isFleeAttempt = !!state.combat.fleeAttemptByHero?.[hero.id];
	let next = state;

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
		// Registrar herói como tendo agido e checar heróis restantes
		const updatedActed = [...(next.combat?.heroesActed ?? []), roll.heroId];
		next = {
			...next,
			combat: next.combat
				? { ...next.combat, heroesActed: updatedActed }
				: null,
		};
		const activeHeroes = next.heroes.filter((h) => h.status === "active");
		const pendingHeroes = activeHeroes.filter(
			(h) => !updatedActed.includes(h.id),
		);
		if (pendingHeroes.length > 0) {
			return log(
				{
					...next,
					status: "HERO_ACTION" as const,
					combat: next.combat
						? {
								...next.combat,
								phase: "selecting_hero" as const,
								selectedHeroId: null,
							}
						: null,
				},
				`Aguardando ação de ${pendingHeroes.length} herói(s).`,
			);
		}
		return {
			...next,
			status: "DIRECT_DAMAGE" as const,
			combat: next.combat
				? {
						...next.combat,
						phase: "direct_damage" as const,
						selectedHeroId: null,
					}
				: null,
		};
	}

	// on_deal_damage: agora via TriggerComponent em emit(DamageDealt) dentro de applyDamage
	if (result.enemyDamageTaken > 0) {
		const dmg = result.enemyDamageTaken;
		next = applyDamage(next, enemy.id, dmg);
		const heroRollStr = fmtRoll(
			roll.heroResults,
			roll.heroBreakdown,
			roll.heroTotal,
		);
		const tieNote = result.outcome === "tie" ? " (empate)" : "";
		next = log(
			next,
			`${getCardName(enemy.cardId)} sofreu ${dmg} de dano${tieNote}. Herói: ${heroRollStr} vs inimigo: ${roll.enemyTotal}.`,
		);

		// on_destroy_creature_with_attack + on_destroyed: via TriggerComponents (emit EnemyDestroyed)
	}

	if (result.heroDamageTaken > 0) {
		const hasShield =
			hero.activeItems.weapon === "item_cracked_shield" ||
			hero.activeItems.armor === "item_cracked_shield";
		const shieldUsed = next.combat?.shieldsUsedThisCombat[hero.id] ?? false;
		// Redução via ECS world (Lote B: leitura migrada do legacy)
		const engineReduction = -getModifierTotal(
			next.world,
			hero.id,
			"damage_taken",
		);
		let dmg = applyShield(result.heroDamageTaken, !shieldUsed, hasShield);
		dmg = Math.max(0, dmg - engineReduction);
		const newShields =
			hasShield && !shieldUsed
				? { ...next.combat!.shieldsUsedThisCombat, [hero.id]: true }
				: next.combat!.shieldsUsedThisCombat;

		next = applyDamage(next, hero.id, dmg);
		next = {
			...next,
			combat: next.combat
				? { ...next.combat, shieldsUsedThisCombat: newShields }
				: null,
		};
		const enemyRollStr = fmtRoll(
			roll.enemyResults,
			roll.enemyBreakdown,
			roll.enemyTotal,
		);
		const tieNoteHero = result.outcome === "tie" ? " (empate)" : "";
		const reductionParts: string[] = [];
		if (hasShield && !shieldUsed) reductionParts.push("escudo −1");
		if (engineReduction > 0) reductionParts.push(`redução −${engineReduction}`);
		const reductionStr = reductionParts.length
			? ` [${reductionParts.join(", ")}]`
			: "";
		next = log(
			next,
			`${getCardName(hero.cardId)} sofreu ${dmg} de dano${tieNoteHero}${reductionStr}. Inimigo: ${enemyRollStr} vs herói: ${roll.heroTotal}.`,
		);
	}

	// Consumir modificadores "once" após o ataque ser resolvido (Lote C)
	next = { ...next, world: tickModifierDurations(next.world, "once_consumed") };

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
		const livingEnemies = next.activeEnemies.filter(
			(e) => e.status === "active",
		);
		if (livingEnemies.length === 0) {
			// Inimigos todos derrotados — pula heróis restantes e vai para dano direto
			return {
				...next,
				status: "DIRECT_DAMAGE" as const,
				combat: next.combat
					? {
							...next.combat,
							phase: "direct_damage" as const,
							selectedHeroId: null,
						}
					: null,
			};
		}
		// Há heróis que ainda não agiram — voltar para seleção de herói
		const withPhase = {
			...next,
			status: "HERO_ACTION" as const,
			combat: next.combat
				? {
						...next.combat,
						phase: "selecting_hero" as const,
						selectedHeroId: null,
					}
				: null,
		};
		return log(
			withPhase,
			`Aguardando ação de ${pendingHeroes.length} herói(s).`,
		);
	}

	// Todos os heróis ativos agiram — passar para dano direto
	const withPhase = {
		...next,
		status: "DIRECT_DAMAGE" as const,
		combat: next.combat
			? {
					...next.combat,
					phase: "direct_damage" as const,
					selectedHeroId: null,
				}
			: null,
	};
	return withPhase;
}

// ─── DIRECT_DAMAGE ───────────────────────────────────────────────────────────

export function handleDirectDamage(state: GameState): GameState {
	if (!state.combat) return state;
	const attacked = new Set(state.combat.pairs.map((p) => p.enemyId));
	const unengaged = state.activeEnemies.filter(
		(e) => e.status === "active" && !attacked.has(e.id),
	);
	if (unengaged.length === 0) return { ...state, status: "CHECK_COMBAT_END" };

	const target = selectTargetHero(state.heroes);
	if (!target) return { ...state, status: "CHECK_COMBAT_END" };

	// on_deal_damage: agora via TriggerComponent em emit(DamageDealt) dentro de applyDamage
	let next = state;
	for (const enemy of unengaged) {
		next = applyDamage(next, target.id, enemy.damage);
		next = log(
			next,
			`${getCardName(enemy.cardId)} causa ${enemy.damage} de dano direto em ${getCardName(target.cardId)}.`,
		);
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
				oncePer: {
					...state.combat.oncePer,
					round: {}, // reset por rodada
				},
			}
		: createEmptyCombatState();
	// Lote E: emite RoundEnded para a rodada que terminou
	const currentRound = state.combat?.round ?? 0;
	let nextState: GameState = state;
	({ state: nextState } = emit(nextState, {
		type: "RoundEnded",
		payload: { round: currentRound },
	}));

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

	// Lote E+F: emit(RoundStarted) dispara TriggerComponents (inclui first_round_in_room via condição round===1)
	({ state: nextState } = emit(nextState, {
		type: "RoundStarted",
		payload: { round: nextRound },
	}));

	return log(nextState, `Rodada ${nextRound + 1} de combate.`);
}

// ─── USE_ITEM ─────────────────────────────────────────────────────────────────

export function handleUseItem(
	state: GameState,
	itemId: string,
	heroId: string,
	targetHeroId?: string,
): GameState {
	// Resolve a skill do item via catálogo
	const itemCard = getCardById(itemId);
	const itemSkillRef = itemCard ? cardSkills(itemCard.id)[0] : null;
	const skillDef = itemSkillRef?.def ?? null;
	const itemName = getCardName(itemId);
	if (!skillDef) {
		return log(state, `[TODO] Efeito de item não catalogado: ${itemName}`);
	}

	// Skill do item não é ativável manualmente (ex: trigger before_attack).
	// Não consumir — sinaliza ao jogador que o item não pode ser usado dessa forma.
	if (!isManuallyActivatable(skillDef)) {
		return log(
			state,
			`${itemName} não pode ser usado agora (efeito: ${skillDef.trigger}).`,
		);
	}

	// Consumir o item da mochila antes de executar o efeito
	const hero = state.heroes.find((h) => h.id === heroId);
	const heroName = hero ? getCardName(hero.cardId) : heroId;
	const withItemRemoved: GameState = log(
		mapHero(state, heroId, (h) => ({
			...h,
			backpack: h.backpack.filter((i) => i !== itemId),
		})),
		`${heroName} usou ${itemName}.`,
	);

	// itemControl: inimigo do par atual pode ignorar o 1º efeito de item
	const currentPairEnemyId = state.combat?.pairs.find(
		(p) => p.heroId === heroId,
	)?.enemyId;
	if (currentPairEnemyId) {
		// itemControl: inimigo do par atual pode ignorar o 1º efeito de item (Evasão das Fendas)
		if (withItemRemoved.combat?.itemControlByEnemy[currentPairEnemyId]) {
			return log(
				{
					...withItemRemoved,
					combat: {
						...withItemRemoved.combat!,
						itemControlByEnemy: {
							...withItemRemoved.combat!.itemControlByEnemy,
							[currentPairEnemyId]: false,
						},
					},
				},
				`${currentPairEnemyId}: Evasão das Fendas — efeito de item bloqueado.`,
			);
		}
		const roomFirstTime =
			!withItemRemoved.flags[`itemEffect::${currentPairEnemyId}::${heroId}`];
		let afterItemEmit = roomFirstTime
			? {
					...withItemRemoved,
					flags: {
						...withItemRemoved.flags,
						[`itemEffect::${currentPairEnemyId}::${heroId}`]: true,
					},
				}
			: withItemRemoved;
		({ state: afterItemEmit } = emit(afterItemEmit, {
			type: "ItemEffectAppliedTo",
			payload: { heroId, itemId, sourceId: currentPairEnemyId, roomFirstTime },
		}));
		const targetIds = targetHeroId ? [targetHeroId] : [heroId];
		return fireOnUseSkill(afterItemEmit, {
			skillId: skillDef.id,
			sourceId: heroId,
			targetIds,
		});
	}

	const targetIds = targetHeroId ? [targetHeroId] : [heroId];
	return fireOnUseSkill(withItemRemoved, {
		skillId: skillDef.id,
		sourceId: heroId,
		targetIds,
	});
}

// ─── USE_POWER ────────────────────────────────────────────────────────────────

export function handleUsePower(state: GameState, heroId: string): GameState {
	const hero = state.heroes.find((h) => h.id === heroId);
	if (!hero || !state.combat) return state;

	// Verificar se algum item equipado tem trigger once_per_combat_instead_of_attack
	const equippedItems = Object.values(hero.activeItems).filter(
		Boolean,
	) as string[];
	for (const itemId of equippedItems) {
		const equippedCard = getCardById(itemId);
		const itemSkillEntry = equippedCard ? cardSkills(equippedCard.id)[0] : null;
		const itemSkill = itemSkillEntry?.def ?? null;
		if (itemSkill?.trigger === "once_per_combat_instead_of_attack") {
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
			// Marcar herói como tendo agido nesta rodada
			const updatedActed = [...next.combat!.heroesActed, heroId];
			next = {
				...next,
				combat: {
					...next.combat!,
					heroesActed: updatedActed,
					selectedHeroId: null,
					phase: "selecting_hero" as const,
				},
			};
			const activeHeroes = next.heroes.filter((h) => h.status === "active");
			const pendingHeroes = activeHeroes.filter(
				(h) => !updatedActed.includes(h.id),
			);
			if (pendingHeroes.length === 0) {
				return {
					...next,
					status: "DIRECT_DAMAGE" as const,
					combat: { ...next.combat!, phase: "direct_damage" as const },
				};
			}
			return { ...next, status: "HERO_ACTION" as const };
		}
	}

	if (state.combat.powersUsedThisRoom[heroId]) {
		return log(
			state,
			`Poder de ${getCardName(hero.cardId)} já foi usado nesta sala.`,
		);
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

	// Marcar como usado nesta sala
	const withMark: GameState = {
		...state,
		combat: {
			...state.combat,
			powersUsedThisRoom: {
				...state.combat.powersUsedThisRoom,
				[heroId]: true,
			},
		},
	};

	return fireOnUseSkill(withMark, { skillId: powerDef.id, sourceId: heroId });
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
		if (state.combat?.heroesActed.includes(heroId)) {
			return log(state, `[AVISO] Herói ${heroId} já agiu nesta rodada.`);
		}
	}

	return { ...state, status: "HERO_ACTION" };
}
