/**
 * Cenários P0 de heróis usando o reducer e o ECS reais.
 * Cada PASS comprova apenas as asserções do cenário (cobertura PARTIAL);
 * preparação isolada não equivale à verificação do efeito.
 */
import type { GameEngine } from "@/core/gameEngine";
import type { GameState } from "@/core/state/gameState";
import { reducer } from "@/core/reducer";
import { getModifierTotal } from "@/core/ecs/world";
import { applyDamage } from "@/core/systems/damageSystem";
import { gameOf, withGame } from "@/engine/state";
import { createEmptyCombatState } from "@/core/state/combatState";
import {
	deckOf, heroesOf, pendingSkillChoiceOf, pendingTriggerInterruptOf,
	scopedCountOf, withAwakening, withDeck, withScopedCount,
	withUnitStats, worldOf,
} from "@/core/state/access";
import { legalActions } from "@/core/legalActions";
import { canStartHeroAttack } from "@/core/rules/attackAvailability";
import { playerView } from "@/core/projection/playerView";
import type { RuntimeScenarioResult } from "./runtime";

type CombatFixture = (heroIds: string | readonly string[], enemyCount?: 1 | 2) => GameState;

interface Scenario {
	readonly id: string;
	readonly sourceCardId: string;
	readonly abilityId: string;
	readonly detail: string;
	readonly check: () => void;
}

function ensure(condition: unknown, detail: string): asserts condition {
	if (!condition) throw new Error(detail);
}

export function runHeroCoverageScenarios(engine: GameEngine, combat: CombatFixture): RuntimeScenarioResult[] {
	const hero = (s: GameState) => {
		const id = heroesOf(s)[0]?.id;
		ensure(id, "Fixture sem herói");
		return id;
	};
	const hasModifier = (s: GameState, id: string, target: "hit_bonus" | "damage_dealt" | "damage_taken") =>
		getModifierTotal(worldOf(s), id, target);
	const wounded = (s: GameState, id: string, amount = 5) => {
		const current = heroesOf(s).find((entry) => entry.id === id);
		ensure(current, "Herói não encontrado");
		return withUnitStats(s, id, { currentLife: current.maxLife - amount });
	};
	const withDungeonDiscard = (s: GameState, count: number) => {
		const deck = deckOf(s, "dungeonDeck");
		return withDeck(s, "dungeonDeck", {
			...deck,
			discarded: [...deck.discarded, ...Array(count).fill("room_dungeon_room")],
		});
	};
	const prepared = (s: GameState, sourceId: string, abilityId: string) =>
		Object.values(gameOf(s).preparedAbilities ?? {}).some((entry) =>
			entry.sourceHeroId === sourceId && entry.abilityId === abilityId);
	const activateSkill = (s: GameState, id: string, abilityId: string, value?: number) =>
		reducer(engine, s, { type: "USE_SKILL", payload: {
			skillId: abilityId, sourceId: id, ...(value === undefined ? {} : { value }),
		} });
	const choose = (s: GameState, id: string) => {
		const pending = pendingSkillChoiceOf(s);
		ensure(pending?.options.some((opt) => opt.id === id),
			"Escolha " + id + " não foi oferecida");
		return reducer(engine, s, { type: "SKILL_CHOICE", payload: {
			skillId: pending.skillId, choice: id,
		} });
	};
	const power = (s: GameState, id: string) =>
		reducer(engine, s, { type: "USE_POWER", payload: { heroId: id } });

	const manualHeal = (cardId: string, abilityId: string, expected: number, clearPoison: boolean) => {
		let s = combat(cardId);
		const id = hero(s);
		s = wounded(s, id, 5);
		if (clearPoison) s = withUnitStats(s, id, { conditions: ["poison"] });
		const before = heroesOf(s)[0]!.currentLife;
		s = activateSkill(s, id, abilityId, expected);
		ensure(heroesOf(s)[0]!.currentLife === before + expected,
			abilityId + ": cura não alterou a vida na quantidade solicitada");
		if (clearPoison) ensure(!heroesOf(s)[0]!.conditions.includes("poison"),
			abilityId + ": veneno não foi removido");
		ensure(!canStartHeroAttack(s, id), abilityId + ": ação não foi consumida");
	};

	const checkPrepared = (cardId: string, abilityId: string, isPower = false) => {
		let s = combat(cardId);
		const id = hero(s);
		s = isPower ? power(s, id) : activateSkill(s, id, abilityId);
		ensure(prepared(s, id, abilityId), abilityId + ": reação não foi preparada");
		ensure(canStartHeroAttack(s, id, "audit-enemy"),
			abilityId + ": preparação consumiu o ataque indevidamente");
		// Preparação validada; o efeito no evento real permanece pendente.
	};

	const checkRune = () => {
		let s = combat("hero_crimson_rune_mage");
		const id = hero(s);
		const before = hasModifier(s, id, "hit_bonus");
		s = activateSkill(s, id, "skill_rift_rune");
		ensure(hasModifier(s, id, "hit_bonus") === before + 3,
			"Runa das Fendas não aplicou +3 de acerto ao alvo");
		ensure(!canStartHeroAttack(s, id),
			"Runa das Fendas não consumiu a ação do Mago");
	};

	const checkReturnRite = () => {
		let s = withDungeonDiscard(combat("hero_deep_veil_necromancer"), 1);
		const id = hero(s);
		const beforeLife = heroesOf(s)[0]!.currentLife;
		const beforeDiscard = deckOf(s, "dungeonDeck").discarded.length;
		s = activateSkill(s, id, "skill_return_rite", 1);
		ensure(heroesOf(s)[0]!.currentLife === beforeLife - 3,
			"Rito de Retorno não cobrou 3 PV");
		ensure(deckOf(s, "dungeonDeck").discarded.length === beforeDiscard - 1,
			"Rito de Retorno não recuperou uma carta do descarte");
		ensure(canStartHeroAttack(s, id, "audit-enemy"),
			"Rito de Retorno consumiu indevidamente o ataque");
	};

	const checkDeepVeilEcho = () => {
		let s = combat("hero_deep_veil_necromancer");
		const id = hero(s);
		s = applyDamage(engine, s, "audit-enemy", 25, { sourceId: id });
		ensure(scopedCountOf(s, "game", "eco", id) === 1,
			"Eco Profundo não concedeu um Eco após abate");
	};

	const checkSpendEcho = () => {
		let s = combat("hero_deep_veil_necromancer");
		const id = hero(s);
		s = withScopedCount(s, "game", "eco", id, 1);
		const hit = hasModifier(s, id, "hit_bonus");
		s = activateSkill(s, id, "spend_deep_veil_echo");
		s = choose(s, "tohit");
		ensure(scopedCountOf(s, "game", "eco", id) === 0,
			"Eco Profundo não consumiu o único Eco disponível");
		ensure(hasModifier(s, id, "hit_bonus") === hit + 2,
			"Eco Profundo não concedeu +2 acerto");
		ensure(canStartHeroAttack(s, id, "audit-enemy"),
			"Eco Profundo consumiu o ataque");
	};

	const checkPaladinPassive = () => {
		const s = combat("hero_last_light_paladin");
		const id = hero(s);
		const action = (state: GameState) =>
			playerView(engine, state).abilityActionsByHero[id]?.find(
				(a) => a.abilityId === "skill_final_dawn_light");
		ensure(action(s)?.status !== "active",
			"Luz da Aurora Final ativou antes do Despertar exigido");
		const awakened = withAwakening(s, 4);
		ensure(action(awakened)?.status === "active",
			"Luz da Aurora Final não ativou no Despertar roxo");
		let attack = reducer(engine, awakened, { type: "CHOOSE_TARGET", payload: {
			heroId: id, enemyId: "audit-enemy",
		} });
		attack = reducer(engine, attack, { type: "ROLL_DICE" });
		ensure(gameOf(attack).combat?.lastRoll?.heroBreakdown.some(
			(entry) => entry.source === "Luz da Aurora Final" && entry.value === 2),
			"Luz da Aurora Final não entrou no cálculo real do acerto");
	};

	const checkAreaGuard = (cardId: string, powerId: string) => {
		let s = combat([cardId, "hero_eternal_rest_cleric"]);
		const id = hero(s);
		const ids = heroesOf(s).map((h) => h.id);
		const before = ids.map((h) => hasModifier(s, h, "damage_taken"));
		s = power(s, id);
		ensure(ids.every((h, i) => hasModifier(s, h, "damage_taken") === before[i]! - 1),
			powerId + ": proteção de 1 ponto não chegou a todos os aliados");
		ensure(canStartHeroAttack(s, id, "audit-enemy"),
			powerId + ": proteção coletiva consumiu o ataque");
	};

	const checkRecoveryPower = (cardId: string, abilityId: string, count: number) => {
		let s = withDungeonDiscard(combat(cardId), count);
		const id = hero(s);
		const before = deckOf(s, "dungeonDeck").discarded.length;
		s = power(s, id);
		ensure(deckOf(s, "dungeonDeck").discarded.length === before - count,
			abilityId + ": poder não recuperou " + count + " cartas");
		ensure(canStartHeroAttack(s, id, "audit-enemy"),
			abilityId + ": poder consumiu o ataque");
	};

	const checkWhiteAshMercy = () => {
		let s = combat("hero_white_ashes_sister");
		const id = hero(s);
		s = wounded(s, id);
		s = power(s, id);
		ensure(heroesOf(s)[0]!.currentLife === heroesOf(s)[0]!.maxLife,
			"Misericórdia das Cinzas Brancas não restaurou a vida totalmente");
		ensure(gameOf(s).oncePer.game["witch_power_white_ash_mercy::" + id],
			"Misericórdia não registrou limite uma vez por jogo");
		ensure(canStartHeroAttack(s, id, "audit-enemy"),
			"Misericórdia consumiu o ataque");
	};

	const checkMiracle = () => {
		let s = combat("hero_eternal_rest_cleric");
		const id = hero(s);
		s = wounded(s, id);
		s = power(s, id);
		s = choose(s, "full_heal");
		ensure(heroesOf(s)[0]!.currentLife === heroesOf(s)[0]!.maxLife,
			"Milagre da Última Luz não aplicou cura completa");
		ensure(canStartHeroAttack(s, id, "audit-enemy"),
			"Milagre consumiu o ataque");
	};

	const checkLastLightOath = () => {
		let s = combat(["hero_last_light_paladin", "hero_eternal_rest_cleric"]);
		const ids = heroesOf(s).map((entry) => entry.id);
		for (const id of ids) s = wounded(s, id, 5);
		s = power(s, ids[0]!);
		s = choose(s, "heal_all");
		ensure(heroesOf(s).every((h) => h.currentLife === h.maxLife),
			"Juramento da Última Luz não curou os dois heróis");
		ensure(canStartHeroAttack(s, ids[0]!, "audit-enemy"),
			"Juramento consumiu o ataque");
	};

	const checkMightyCrimson = () => {
		let s = combat("hero_crimson_barbarian");
		const id = hero(s);
		s = power(s, id);
		ensure(prepared(s, id, "power_mighty_crimson_fury"),
			"Poderoso Furor não foi preparado");
		const before = hasModifier(s, id, "damage_dealt");
		s = applyDamage(engine, s, "audit-enemy", 3, { sourceId: id });
		ensure(hasModifier(s, id, "damage_dealt") === before + 6,
			"Poderoso Furor não aplicou +6 dano ao causar dano");
	};

	const checkHunterExecution = () => {
		let s = combat("hero_broken_veil_hunter");
		const id = hero(s);
		s = activateSkill(s, id, "skill_prey_mark");
		s = power(s, id);
		ensure(prepared(s, id, "power_hunter_execution"),
			"Execução do Caçador não foi preparada");
		s = reducer(engine, s, { type: "CHOOSE_TARGET", payload: {
			heroId: id, enemyId: "audit-enemy",
		} });
		s = reducer(engine, s, { type: "ROLL_DICE" });
		ensure(gameOf(s).combat?.lastRoll?.heroBreakdown.some(
			(entry) => entry.value === 6),
			"Execução não aplicou o bônus +6 de acerto à presa marcada");
	};

	const checkRollPower = (cardId: string, abilityId: string, optionId: string) => {
		let s = combat(cardId);
		const id = hero(s);
		s = power(s, id);
		ensure(prepared(s, id, abilityId),
			abilityId + ": poder não foi preparado");
		s = withGame(s, (game) => ({
			...game, status: "ROLL_DICE",
			combat: { ...createEmptyCombatState(), phase: "resolving",
				pairs: [{ heroId: id, enemyId: "audit-enemy" }] },
		}));
		s = reducer(engine, s, { type: "PREPARE_PHYSICAL_ROLL" });
		const dice = gameOf(s).combat?.pendingPhysicalRoll;
		ensure(dice, abilityId + ": rolagem física não foi preparada");
		s = reducer(engine, s, { type: "CONFIRM_DICE_ROLL", payload: {
			rollId: dice.id, heroId: dice.heroId, enemyId: dice.enemyId,
			heroResults: Array(dice.heroDiceCount).fill(1),
			enemyResults: Array(dice.enemyDiceCount).fill(5),
			source: "physics",
		} });
		const interrupt = pendingTriggerInterruptOf(s);
		ensure(interrupt?.skillId === abilityId,
			abilityId + ": interrupção não apareceu após rolagem");
		s = reducer(engine, s, { type: "APPLY_TRIGGER_INTERRUPT", payload: {
			interruptId: interrupt.id,
		} });
		s = choose(s, optionId);
		const options = legalActions(engine, s).filter((action) => action.type === "SELECT_DIE");
		ensure(options.length > 0, abilityId + ": não ofereceu escolha do dado");
		const selected = options.find((action) => action.type === "SELECT_DIE" &&
			action.payload.side === "hero" && action.payload.value === 6);
		ensure(selected, abilityId + ": opção de colocar dado do herói em 6 não foi oferecida");
		s = reducer(engine, s, selected);
		ensure(gameOf(s).combat?.lastRoll?.heroResults.includes(6),
			abilityId + ": dado escolhido não foi alterado para 6");
	};

	const cases: Scenario[] = [
		{ id: "hero-cleric-healing", sourceCardId: "hero_eternal_rest_cleric",
			abilityId: "skill_last_light_healing", check: () =>
				manualHeal("hero_eternal_rest_cleric", "skill_last_light_healing", 3, false),
			detail: "Cura efetiva de 3 PV e consumo da ação" },
		{ id: "hero-warrior-bastion-preparation", sourceCardId: "hero_broken_bastion_warrior",
			abilityId: "skill_bastion_guard", check: () =>
				checkPrepared("hero_broken_bastion_warrior", "skill_bastion_guard"),
			detail: "Preparação da reação de defesa sem consumir ataque; redução pendente" },
		{ id: "hero-rogue-preserved-path-preparation", sourceCardId: "hero_rift_rogue",
			abilityId: "skill_preserved_path", check: () =>
				checkPrepared("hero_rift_rogue", "skill_preserved_path"),
			detail: "Preparação de reação ao descarte; consumo de carga pendente" },
		{ id: "hero-mage-rift-rune", sourceCardId: "hero_crimson_rune_mage",
			abilityId: "skill_rift_rune", check: checkRune,
			detail: "Runa: +3 acerto no alvo e consumo da ação" },
		{ id: "hero-necromancer-return-rite", sourceCardId: "hero_deep_veil_necromancer",
			abilityId: "skill_return_rite", check: checkReturnRite,
			detail: "Rito: custo 3 PV e recuperação de uma carta de masmorra" },
		{ id: "hero-necromancer-kill-echo", sourceCardId: "hero_deep_veil_necromancer",
			abilityId: "power_deep_veil_echo", check: checkDeepVeilEcho,
			detail: "Eco automático após matar criatura com o Necromante" },
		{ id: "hero-necromancer-spend-echo", sourceCardId: "hero_deep_veil_necromancer",
			abilityId: "spend_deep_veil_echo", check: checkSpendEcho,
			detail: "Gasto de 1 Eco por +2 acerto; preserva ação" },
		{ id: "hero-paladin-final-dawn", sourceCardId: "hero_last_light_paladin",
			abilityId: "skill_final_dawn_light", check: checkPaladinPassive,
			detail: "Passiva ativa apenas em Despertar alto e +2 acerto no ataque" },
		{ id: "hero-oak-bark-preparation", sourceCardId: "hero_oak_guardian",
			abilityId: "witch_skill_oak_bark", check: () =>
				checkPrepared("hero_oak_guardian", "witch_skill_oak_bark"),
			detail: "Preparação defensiva do Carvalho; reação ao dano pendente" },
		{ id: "hero-oak-power-protection", sourceCardId: "hero_oak_guardian",
			abilityId: "witch_power_ancient_oak", check: () =>
				checkAreaGuard("hero_oak_guardian", "witch_power_ancient_oak"),
			detail: "Proteção coletiva real de 1 dano em dois heróis" },
		{ id: "hero-green-eclipse-roll", sourceCardId: "hero_green_moon_sorceress",
			abilityId: "witch_power_green_eclipse", check: () =>
				checkRollPower("hero_green_moon_sorceress", "witch_power_green_eclipse", "witch_eclipse_hero_six"),
			detail: "Poder preparado, interrupção de rolagem e dado alterado para 6" },
		{ id: "hero-swamp-route-preparation", sourceCardId: "hero_swamp_stalker",
			abilityId: "witch_skill_swamp_route", check: () =>
				checkPrepared("hero_swamp_stalker", "witch_skill_swamp_route"),
			detail: "Preparação de preservação do descarte; efeito no evento pendente" },
		{ id: "hero-swamp-power-recovery", sourceCardId: "hero_swamp_stalker",
			abilityId: "witch_power_swamp_return", check: () =>
				checkRecoveryPower("hero_swamp_stalker", "witch_power_swamp_return", 2),
			detail: "Retorno do Brejo recupera duas cartas do descarte" },
		{ id: "hero-white-ash-balm", sourceCardId: "hero_white_ashes_sister",
			abilityId: "witch_skill_white_ash_balm", check: () =>
				manualHeal("hero_white_ashes_sister", "witch_skill_white_ash_balm", 2, true),
			detail: "Bálsamo remove veneno, cura 2 PV e consome a ação" },
		{ id: "hero-white-ash-mercy", sourceCardId: "hero_white_ashes_sister",
			abilityId: "witch_power_white_ash_mercy", check: checkWhiteAshMercy,
			detail: "Misericórdia restaura totalmente a vida e registra uso único" },
		{ id: "hero-cleric-miracle-effect", sourceCardId: "hero_eternal_rest_cleric",
			abilityId: "power_greater_last_light_miracle", check: checkMiracle,
			detail: "Poder da Clériga: escolha e cura completa real" },
		{ id: "hero-warrior-power-area", sourceCardId: "hero_broken_bastion_warrior",
			abilityId: "power_unbreakable_bastion_guard", check: () =>
				checkAreaGuard("hero_broken_bastion_warrior", "power_unbreakable_bastion_guard"),
			detail: "Poder do Bastião protege os dois heróis do grupo" },
		{ id: "hero-rogue-power-recovery", sourceCardId: "hero_rift_rogue",
			abilityId: "power_restored_path", check: () =>
				checkRecoveryPower("hero_rift_rogue", "power_restored_path", 1),
			detail: "Poder da Ladina recupera carta descartada e preserva ataque" },
		{ id: "hero-mage-supreme-rune-effect", sourceCardId: "hero_crimson_rune_mage",
			abilityId: "power_supreme_rift_rune", check: () =>
				checkRollPower("hero_crimson_rune_mage", "power_supreme_rift_rune", "ally_six"),
			detail: "Poder do Mago altera dado de herói para 6 após rolagem" },
		{ id: "hero-barbarian-mighty-effect", sourceCardId: "hero_crimson_barbarian",
			abilityId: "power_mighty_crimson_fury", check: checkMightyCrimson,
			detail: "Poder do Bárbaro: gatilho de dano e bônus +6" },
		{ id: "hero-paladin-oath-effect", sourceCardId: "hero_last_light_paladin",
			abilityId: "power_last_light_oath", check: checkLastLightOath,
			detail: "Poder do Paladino cura dois aliados em 5 PV" },
		{ id: "hero-hunter-execution-effect", sourceCardId: "hero_broken_veil_hunter",
			abilityId: "power_hunter_execution", check: checkHunterExecution,
			detail: "Execução: bônus +6 ao atacar presa marcada" },
	];
	return cases.map(({ id, sourceCardId, abilityId, detail, check }) => {
		try {
			check();
			return { id, sourceCardId, abilityId, status: "PASS" as const, detail };
		} catch (error) {
			return { id, sourceCardId, abilityId, status: "FAIL" as const,
				detail: error instanceof Error ? error.message : String(error) };
		}
	});
}
