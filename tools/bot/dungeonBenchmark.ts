import type { Difficulty } from "@/core/state/gameState";
import type { GameBalance } from "@/core/gameEngine";
import type { PoisonTelemetry } from "@/core/rules/poisonTelemetry";
import { preparedTransitions } from "./preparedTelemetry";
import { observeAbilityStep } from "./abilityTelemetry";
import { deckOf } from "@/core/state/access";
import { playerView } from "@/core/projection/playerView";
import { gameOf } from "@/engine/state";
import { cardName, skillById } from "@/core/gameEngine";
import { getBoss } from "@/core/data/cards";
import { getEnabledExpansions } from "@/core/data/expansions";
import { engine } from "../golden/lib";
import { playAiGame } from "./ai";
import { BOT_HEROES } from "./play";
import { createHeadlessPort } from "./port";
import { BOT_PROFILES, type BotProfile, setupForRun } from "./profiles";
import { healingItemOptions, itemHealingAmount } from "./healing";
import { recordRoomEncounterStep, type RoomEncounterTelemetry } from "./encounterTelemetry";

export const BENCHMARK_DIFFICULTIES: readonly Difficulty[] = [
	"very_easy", "easy", "normal", "hard", "nightmare",
];

export interface DungeonBenchmarkOptions {
	readonly seed: number;
	readonly runs: number;
	readonly maxSteps: number;
	readonly heroes: readonly string[];
	readonly expansions: readonly string[];
	readonly profiles: readonly BotProfile[];
	readonly difficulties: readonly Difficulty[];
	/** Override opt-in exclusivo do laboratório (padrão: preços oficiais). */
	readonly xpExperiment?: Partial<GameBalance["xpCosts"]>;
}

export interface BenchmarkCase {
	readonly seed: number;
	readonly repetition: number;
	readonly heroId: string;
	readonly expansionId: string;
	readonly profile: BotProfile;
	readonly difficulty: Difficulty;
}

export interface PowerTimingStage {
  /** Usos aceitos pelo motor, incluindo poderes sem cooldown contabilizados pelo runner. */
  readonly uses: number;
  /** Usos que posteriormente tiveram ao menos um efeito observável do mesmo poder. */
  readonly effectfulUses: number;
  /** Eventos com alteração observável, que não são necessariamente usos distintos. */
  readonly effectEvents: number;
  readonly chargesConsumed: number;
  readonly usesById: Readonly<Record<string, number>>;
  readonly effectsById: Readonly<Record<string, number>>;
}

export interface ProgressionTelemetry {
	/** XP efetivamente recebido, medido por mudanças positivas do saldo coletivo. */
	readonly xpGained: number;
	readonly xpSpent: number;
	readonly xpSpentByOption: Readonly<Record<string, number>>;
	readonly xpPurchasesByOption: Readonly<Record<string, number>>;
	readonly xpOtherLoss: number;
	readonly xpFinal: number;
	readonly xpPeak: number;
	/** Maior índice de Ímpeto alcançado pelo herói (0=branco, 4=roxo). */
	readonly levelInitial: number;
	readonly levelFinal: number;
	readonly levelPeak: number;
	readonly levelUpOpportunities: number;
	readonly levelUpPurchases: number;
	readonly levelUpAttempts: number;
	readonly levelUpNoEffect: number;
	/** Compras opcionais realizadas apesar de haver level up legal naquela escolha. */
	readonly itemsBoughtWhileLevelAvailable?: number;
	readonly artifactsBoughtWhileLevelAvailable?: number;
	/** Ações de recuperação do deck de dungeon, distintas da compra de itens. */
	readonly dungeonRecoveries?: number;
	readonly abilityOpportunities: number;
	readonly skillOpportunities: number;
	readonly powerOpportunities: number;
	/** Preparações de reações (não contam como uso do efeito). */
	readonly skillPreparations: number;
	readonly powerPreparations: number;
  /** P0.2: ativação antes/na luta do chefe e efeito observado no reducer. */
  readonly powerTiming?: {
    readonly beforeBoss: PowerTimingStage;
    readonly atBoss: PowerTimingStage;
  };
	/** Ações efetivamente aceitas pelo motor; NÃO comprova que o efeito foi aplicado. */
	readonly abilityDecisions?: {
		readonly offeredById: Readonly<Record<string, number>>;
		readonly chosenById: Readonly<Record<string, number>>;
		readonly offeredAtBossById: Readonly<Record<string, number>>;
		readonly chosenAtBossById: Readonly<Record<string, number>>;
	};
	/** P0: ações propostas/confirmadas, efeitos observáveis e cargas em trilhas separadas. */
	readonly abilityLifecycle?: {
		readonly attemptedById: Readonly<Record<string, number>>;
		readonly preparedById: Readonly<Record<string, number>>;
		readonly confirmedById: Readonly<Record<string, number>>;
		readonly effectsObservedById: Readonly<Record<string, number>>;
		readonly chargesConsumedById: Readonly<Record<string, number>>;
		/** Chave = sourceCardId::abilityId, incluindo itens e artefatos. */
		readonly bySource: Readonly<Record<string, {
			readonly attempted: number; readonly prepared: number; readonly confirmed: number;
			readonly effectsObserved: number; readonly chargesConsumed: number;
		}>>;
		/** Chave = abilityId::targetCardId, somente mudanças observáveis. */
		readonly effectsByTarget: Readonly<Record<string, number>>;
		/** Chave = abilityId::healing/damage/modifier/dice/etc. */
		readonly effectKindsById: Readonly<Record<string, number>>;
	};
	readonly abilityActivity?: {
		readonly preparationsById: Readonly<Record<string, number>>;
		readonly armedById: Readonly<Record<string, number>>;
		readonly clearedDuringAttackById: Readonly<Record<string, number>>;
		readonly clearedElsewhereById: Readonly<Record<string, number>>;
		readonly manualActionsById: Readonly<Record<string, number>>;
		readonly powerActivationsById: Readonly<Record<string, number>>;
		readonly triggersAcceptedById: Readonly<Record<string, number>>;
		readonly triggersSkippedById: Readonly<Record<string, number>>;
	};
}

export interface ItemTelemetry {
	/** Itens levados, equipados ou guardados (sem contar artefatos). */
	readonly acquired: number;
	/** Usos manuais de item, inclusive consumíveis da mesa. */
	readonly uses: number;
	readonly usesByItem: Readonly<Record<string, number>>;
	readonly finalInventoryByItem: Readonly<Record<string, number>>;
	/** Itens descartados diretamente da mesa. */
	readonly discarded: number;
	/** Estoque restante de todos os heróis, inclusive derrotados. */
	readonly inventoryFinal: number;
	readonly equippedFinal: number;
	readonly backpackFinal: number;
	readonly usableFinal: number;
	readonly itemDeckAvailableFinal: number;
	/** Estoque de inventário ao vencer a sala 7/8; null se não alcançada. */
	readonly inventoryAfterRoom7: number | null;
	readonly inventoryAfterRoom8: number | null;
	readonly usesAfterRoom7: number;
	readonly usesAfterRoom8: number;
	/** Menor estoque nas etapas posteriores, útil para flagrar falta de recursos. */
	readonly emptyInventoryActionsAfterRoom8: number;
	/** Decisões com cura legal disponível para um herói ferido. */
	readonly healingDecisionPoints: number;
	readonly healingIgnoredDecisionPoints: number;
	readonly healingItemsUsed: number;
	/** Mortes nas quais havia uma ação legal de cura antes do golpe fatal. */
	readonly deathsWithAvailableHeal: number;
	readonly recoverableHpAtDeaths: number;
	/** Derrotados com uma cura ainda equipada (pode não estar legal na ação final). */
	readonly defeatedHeroesWithEquippedHeal: number;
	readonly unusedHealingCapacityOnDefeat: number;
}

export interface BenchmarkTrial extends BenchmarkCase {
	readonly outcome: string;
	readonly violation: string | null;
	readonly violationMessage: string | null;
	readonly steps: number;
	readonly roomsCleared: number;
	readonly creaturesDefeated: number;
	readonly bossDefeated: boolean;
	readonly artifacts: number;
	/** Observações por ID de sala, coletadas nas transições reais. */
	readonly rooms?: Readonly<Record<string, RoomEncounterTelemetry>>;
	readonly initialDespertar?: number;
	readonly initialHeroLevel?: number;
	readonly skillUses: number;
	readonly powerUses: number;
	readonly items?: ItemTelemetry;
	readonly progression?: ProgressionTelemetry;
	/** Ticks, origens e remoções de veneno, por partida. */
	readonly poison?: PoisonTelemetry;
	/** Checkpoint da primeira entrada real no confronto com o chefe. */
	readonly bossEncounter?: {
		readonly roomsCleared: number;
		readonly heroLevel: number;
		readonly heroLife: number;
		readonly heroMaxLife: number;
		readonly xpAvailable: number;
		readonly artifacts: number;
		readonly hasCorruptedHeart: boolean;
	};
}

export interface BenchmarkSummary {
	readonly profile: BotProfile;
	readonly difficulty: Difficulty;
	readonly heroId: string;
	readonly heroName: string;
	readonly expansionId: string;
	readonly games: number;
	readonly victories: number;
	readonly defeats: number;
	readonly stalls: number;
	readonly victoryRate: number;
	readonly avgRooms: number;
	readonly avgCreatures: number;
	readonly avgSteps: number;
	readonly avgArtifacts: number;
	readonly avgSkillUses: number;
}

export function benchmarkExpansionIds(): string[] {
	return getEnabledExpansions().filter((pack) => getBoss(pack.id)).map((pack) => pack.id);
}

export function benchmarkBoss(expansionId: string): string {
	const boss = getBoss(expansionId);
	if (!boss) throw new Error("Expansão sem chefe disponível: " + expansionId);
	return boss.id;
}

export function defaultBenchmarkOptions(): DungeonBenchmarkOptions {
	return {
		seed: 1,
		runs: 10,
		maxSteps: 1000,
		heroes: [...BOT_HEROES],
		expansions: benchmarkExpansionIds(),
		profiles: [...BOT_PROFILES],
		difficulties: [...BENCHMARK_DIFFICULTIES],
	};
}

/** Cada repetição usa uma seed nova, reaplicada a todas as combinações. */
export function benchmarkPlan(options: DungeonBenchmarkOptions): BenchmarkCase[] {
	const cases: BenchmarkCase[] = [];
	for (let repetition = 0; repetition < options.runs; repetition++) {
		const seed = options.seed + repetition;
		for (const expansionId of options.expansions)
			for (const profile of options.profiles)
				for (const difficulty of options.difficulties)
					for (const heroId of options.heroes)
						cases.push({ seed, repetition: repetition + 1, expansionId, profile, difficulty, heroId });
	}
	return cases;
}

export function benchmarkCaseKey(test: BenchmarkCase): string {
	return [test.seed, test.expansionId, test.profile, test.difficulty, test.heroId].join("|");
}

/** Mesmo seed = mesma sala inicial e mesma ordem dos decks, antes das escolhas do bot.
 * A progressão posterior pode divergir por herói, dificuldade ou perfil.
 */
export function initialDungeonSignature(test: Pick<BenchmarkCase, "seed" | "heroId" | "difficulty" | "expansionId">): string {
	const setup = { ...setupForRun(test.seed, [test.heroId], test.difficulty), bossCardId: benchmarkBoss(test.expansionId) };
	const state = createHeadlessPort(setup).inspect();
	return JSON.stringify({
		boss: gameOf(state).bossCardId,
		firstRoom: gameOf(state).currentRoom?.cardId ?? null,
		dungeon: deckOf(state, "dungeonDeck").available,
		enemies: deckOf(state, "enemyDeck").available,
		items: deckOf(state, "itemDeck").available,
		artifacts: deckOf(state, "artifactDeck").available,
	});
}

export function ensureComparableDungeons(
	options: DungeonBenchmarkOptions,
	signature: (test: Pick<BenchmarkCase, "seed" | "heroId" | "difficulty" | "expansionId">) => string = initialDungeonSignature,
): void {
	for (let index = 0; index < options.runs; index++) {
		const seed = options.seed + index;
		for (const expansionId of options.expansions) {
			let reference: string | undefined;
			for (const difficulty of options.difficulties) {
				for (const heroId of options.heroes) {
					const current = signature({ seed, expansionId, difficulty, heroId });
					if (reference === undefined) reference = current;
					else if (current !== reference)
						throw new Error(`Masmorra inicial diferente na seed ${seed} para ${expansionId}/${heroId}/${difficulty}; comparação abortada.`);
				}
			}
		}
	}
}

function inventoryCounts(heroes: readonly { activeItems: object; backpack: readonly string[] }[]) {
	return heroes.reduce((total, hero) => ({
		equipped: total.equipped + Object.values(hero.activeItems).filter(Boolean).length,
		backpack: total.backpack + hero.backpack.length,
	}), { equipped: 0, backpack: 0 });
}

export function runBenchmarkCase(
	test: BenchmarkCase,
	maxSteps: number,
	xpCostsOverride?: Partial<GameBalance["xpCosts"]>,
): BenchmarkTrial {
	const setup = { ...setupForRun(test.seed, [test.heroId], test.difficulty), bossCardId: benchmarkBoss(test.expansionId) };
	const startingPort = createHeadlessPort(setup, xpCostsOverride);
	const starting = startingPort.observe().view;
	const rooms: Record<string, RoomEncounterTelemetry> = {};
	const initialRoomId = gameOf(startingPort.inspect()).currentRoom?.cardId;
	// START_GAME é executado antes da primeira decisão do bot.
	if (initialRoomId) rooms[initialRoomId] = {
		entered: 1, cleared: 0, creaturesThreeXpSeen: 0, subbossesSeen: 0, subbossesDefeated: 0,
		xpAwardedOnClear: 0, roomCardXpOnClear: 0,
	};
	const purchases: Record<string, number> = {};
	const spent: Record<string, number> = {};
	let gained = 0, spentTotal = 0, otherLoss = 0, peakXp = starting.groupXp;
	let levelPeak = Math.max(0, ...starting.heroes.map((hero) => hero.impeto));
	let finalLevel = levelPeak;
	let levelUpOpportunities = 0, levelUpPurchases = 0, levelUpAttempts = 0, levelUpNoEffect = 0;
	let itemsBoughtWhileLevelAvailable = 0, artifactsBoughtWhileLevelAvailable = 0, dungeonRecoveries = 0;
	let bossEncounter: BenchmarkTrial["bossEncounter"];
	let abilityOpportunities = 0, skillOpportunities = 0, powerOpportunities = 0;
	let triggeredSkillUses = 0, triggeredPowerUses = 0, manualSkillUses = 0, manualPowerUses = 0;
	let skillPreparations = 0, powerPreparations = 0;
	const preparationsById: Record<string, number> = {};
	const armedById: Record<string, number> = {};
	const clearedDuringAttackById: Record<string, number> = {};
	const clearedElsewhereById: Record<string, number> = {};
	const manualActionsById: Record<string, number> = {};
	const powerActivationsById: Record<string, number> = {};
	const triggersAcceptedById: Record<string, number> = {};
	const triggersSkippedById: Record<string, number> = {};
	const offeredById: Record<string, number> = {};
	const chosenById: Record<string, number> = {};
	const attemptedById: Record<string, number> = {};
	const preparedById: Record<string, number> = {};
	const confirmedById: Record<string, number> = {};
	const effectsObservedById: Record<string, number> = {};
	const chargesConsumedById: Record<string, number> = {};
	const effectsByTarget: Record<string, number> = {};
	const effectKindsById: Record<string, number> = {};
	const bySource: Record<string, { attempted: number; prepared: number; confirmed: number;
		effectsObserved: number; chargesConsumed: number }> = {};

	const offeredAtBossById: Record<string, number> = {};
	const chosenAtBossById: Record<string, number> = {};
  type PowerPhase = "beforeBoss" | "atBoss";
  type MutableTiming = { uses: number; effectfulUses: number; effectEvents: number;
    chargesConsumed: number; usesById: Record<string, number>; effectsById: Record<string, number> };
  const freshTiming = (): MutableTiming => ({
    uses: 0, effectfulUses: 0, effectEvents: 0, chargesConsumed: 0,
    usesById: {}, effectsById: {},
  });
  const powerTiming: Record<PowerPhase, MutableTiming> = {
    beforeBoss: freshTiming(), atBoss: freshTiming(),
  };
  const powerSpentAt = new Map<string, PowerPhase>();
  const effectfulPowerIds = new Set<string>();
  const recordPowerUse = (id: string, phase: PowerPhase) => {
    const current = powerTiming[phase];
    current.uses++;
    current.usesById[id] = (current.usesById[id] ?? 0) + 1;
    if (!powerSpentAt.has(id)) powerSpentAt.set(id, phase);
  };
	const increment = (counts: Record<string, number>, id: string) => {
		counts[id] = (counts[id] ?? 0) + 1;
	};
	let healingDecisionPoints = 0, healingIgnoredDecisionPoints = 0, healingItemsUsed = 0;
	let deathsWithAvailableHeal = 0, recoverableHpAtDeaths = 0;
	let itemsAcquired = 0, itemsUsed = 0, itemsDiscarded = 0;
	const usesByItem: Record<string, number> = {};
	let inventoryAfterRoom7: number | null = null, inventoryAfterRoom8: number | null = null;
	let usesAfterRoom7 = 0, usesAfterRoom8 = 0, emptyInventoryActionsAfterRoom8 = 0;
	const result = playAiGame(setup, maxSteps, (step) => {
		const action = step.chosen.action;
		recordRoomEncounterStep(engine, step.beforeState, step.afterState, rooms);
		// Logs de decisões voluntárias. Não inferir execução de efeitos passivos.
		const inBoss = step.before.status === "BOSS_COMBAT" ||
			step.before.enemies.some((enemy) => enemy.id === "boss" && enemy.status === "active");
    const phase: PowerPhase = inBoss ? "atBoss" : "beforeBoss";
    const powerEffectsThisStep = new Set<string>();
		const heroAbilityId = (move: typeof step.chosen): string | undefined => {
			if (move.action.type === "USE_SKILL") {
				const { sourceId, skillId } = move.action.payload;
				return step.before.abilityActionsByHero[sourceId]?.find(
					(entry) => entry.abilityId === skillId &&
						(entry.kind === "skill" || entry.kind === "power"))?.abilityId;
			}
			if (move.action.type === "USE_POWER")
				return step.before.abilityActionsByHero[move.action.payload.heroId]?.find(
					(entry) => entry.kind === "power" && entry.status === "available")?.abilityId;
			if ((move.action.type === "APPLY_TRIGGER_INTERRUPT" ||
				move.action.type === "SKIP_TRIGGER_INTERRUPT") && step.before.pendingTriggerInterrupt) {
				const id = step.before.pendingTriggerInterrupt.skillId;
				const category = skillById(engine, id)?.category;
				return category === "hero_skill" || category === "hero_power" ? id : undefined;
			}
			return undefined;
		};
		const offered = new Set(step.options.map(heroAbilityId).filter((id): id is string => Boolean(id)));
		for (const id of offered) {
			increment(offeredById, id);
			if (inBoss) increment(offeredAtBossById, id);
		}
		const chosenHeroAbility = heroAbilityId(step.chosen);
		if (chosenHeroAbility && step.chosen.action.type !== "SKIP_TRIGGER_INTERRUPT") {
			increment(chosenById, chosenHeroAbility);
			if (inBoss) increment(chosenAtBossById, chosenHeroAbility);
		}
		if (!bossEncounter && step.before.status !== "BOSS_COMBAT" && step.after.status === "BOSS_COMBAT") {
			const hero = step.after.heroes.find((entry) => entry.status === "active");
			bossEncounter = {
				roomsCleared: step.after.roomsCleared,
				heroLevel: hero?.impeto ?? -1,
				heroLife: hero?.currentLife ?? 0,
				heroMaxLife: hero?.maxLife ?? 0,
				xpAvailable: step.after.groupXp,
				artifacts: step.after.groupArtifacts.length,
				hasCorruptedHeart: step.after.groupArtifacts.some((artifact) =>
					artifact.cardId === "artifact_corrupted_forest_heart"),
			};
		}
		// Evidências reais do motor: preparação, confirmação, mudança e uso único
		// são sinais independentes. Nenhum deles é inferido de um clique isolado.
		for (const evidence of observeAbilityStep(step, engine)) {
      if (evidence.sourceCardId.startsWith("hero_") &&
          skillById(engine, evidence.abilityId)?.category === "hero_power") {
        const stage = powerTiming[phase];
        if (evidence.effectKinds.length) {
          stage.effectEvents++;
          stage.effectsById[evidence.abilityId] = (stage.effectsById[evidence.abilityId] ?? 0) + 1;
          powerEffectsThisStep.add(evidence.abilityId);
        }
        if (evidence.chargeConsumed) stage.chargesConsumed++;
      }
			const { abilityId, sourceCardId } = evidence;
			if (evidence.attempted) increment(attemptedById, abilityId);
			if (evidence.prepared) increment(preparedById, abilityId);
			if (evidence.confirmed) increment(confirmedById, abilityId);
			if (evidence.chargeConsumed) increment(chargesConsumedById, abilityId);
			if (evidence.effectKinds.length) increment(effectsObservedById, abilityId);
			for (const kind of evidence.effectKinds) increment(effectKindsById, `${abilityId}::${kind}`);
			if (evidence.effectKinds.length) for (const targetId of evidence.affectedIds) {
				const target = [...step.before.heroes, ...step.before.enemies].find((unit) => unit.id === targetId);
				if (target) increment(effectsByTarget, `${abilityId}::${target.cardId}`);
			}
			const key = `${sourceCardId}::${abilityId}`;
			const stats = bySource[key] ?? { attempted: 0, prepared: 0, confirmed: 0,
				effectsObserved: 0, chargesConsumed: 0 };
			if (evidence.attempted) stats.attempted++;
			if (evidence.prepared) stats.prepared++;
			if (evidence.confirmed) stats.confirmed++;
			if (evidence.effectKinds.length) stats.effectsObserved++;
			if (evidence.chargeConsumed) stats.chargesConsumed++;
			bySource[key] = stats;
		}
		const transition = preparedTransitions(gameOf(step.beforeState).preparedAbilities,
			gameOf(step.afterState).preparedAbilities, action.type);
		for (const id of transition.armedHeroAbilities) increment(armedById, id);
		for (const id of transition.clearedDuringAttack) increment(clearedDuringAttackById, id);
		for (const id of transition.clearedElsewhere) increment(clearedElsewhereById, id);
		const healOptions = healingItemOptions(step.before).filter((heal) =>
			step.options.some((move) => move.action.type === "USE_ITEM" &&
				move.action.payload.heroId === heal.ownerId && move.action.payload.itemId === heal.itemId &&
				(move.action.payload.targetHeroId ?? heal.ownerId) === heal.targetId));
		if (healOptions.length) {
			healingDecisionPoints++;
			const consumed = action.type === "USE_ITEM" && healOptions.some((heal) =>
				heal.ownerId === action.payload.heroId && heal.itemId === action.payload.itemId &&
				(action.payload.targetHeroId ?? heal.ownerId) === heal.targetId);
			if (consumed) healingItemsUsed++;
			else healingIgnoredDecisionPoints++;
			for (const hero of step.before.heroes.filter((entry) => entry.status === "active")) {
				if (step.after.heroes.some((entry) => entry.id === hero.id && entry.status === "active")) continue;
				const available = healOptions.filter((heal) => heal.targetId === hero.id);
				if (!available.length) continue;
				deathsWithAvailableHeal++;
				recoverableHpAtDeaths += Math.max(...available.map((heal) => Math.min(heal.missing, heal.amount)));
			}
		}
		if (action.type === "USE_SKILL") {
			const projected = step.before.abilityActionsByHero[action.payload.sourceId]?.find((entry) =>
				entry.abilityId === action.payload.skillId);
			const isPreparation = projected?.activation === "prepare" ||
				(projected?.activation === "manual_prepare" && projected.status === "available");
			if (isPreparation) {
				increment(preparationsById, action.payload.skillId);
				if (projected?.kind === "skill") skillPreparations++;
				if (projected?.kind === "power") powerPreparations++;
			} else {
				increment(manualActionsById, action.payload.skillId);
				if (projected?.kind === "skill") manualSkillUses++;
				if (projected?.kind === "power" && !skillById(engine, action.payload.skillId)?.cooldown) {
          manualPowerUses++;
          recordPowerUse(action.payload.skillId, phase);
        }
			}
		}
		// Contabilizar ativação por limite efetivamente consumido, nunca pelo
		// simples clique em USE_POWER/USE_SKILL que pode só preparar/cancelar.
		const previousGameUses = gameOf(step.beforeState).oncePer?.game ?? {};
		const currentGameUses = gameOf(step.afterState).oncePer?.game ?? {};
		for (const [key, consumed] of Object.entries(currentGameUses)) {
			if (!consumed || previousGameUses[key]) continue;
			const id = key.split("::")[0]!;
			if (skillById(engine, id)?.category === "hero_power") {
        increment(powerActivationsById, id);
        recordPowerUse(id, phase);
      }
		}
		if ((action.type === "APPLY_TRIGGER_INTERRUPT" || action.type === "SKIP_TRIGGER_INTERRUPT") &&
			step.before.pendingTriggerInterrupt) {
			increment(action.type === "APPLY_TRIGGER_INTERRUPT" ? triggersAcceptedById : triggersSkippedById,
				step.before.pendingTriggerInterrupt.skillId);
		}
		const usedItem = action.type === "USE_ITEM" || action.type === "USE_REWARD_ITEM" ||
			(action.type === "USE_SKILL" &&
				(step.before.abilityActionsByHero[action.payload.sourceId] ?? []).some(
					(ability) => ability.kind === "item" && ability.abilityId === action.payload.skillId));
		if (usedItem) {
			itemsUsed++;
			const itemId = action.type === "USE_ITEM" || action.type === "USE_REWARD_ITEM"
				? action.payload.itemId
				: action.type === "USE_SKILL"
					? step.before.abilityActionsByHero[action.payload.sourceId]?.find(
						(entry) => entry.kind === "item" && entry.abilityId === action.payload.skillId)?.sourceCardId
					: undefined;
			if (itemId) usesByItem[itemId] = (usesByItem[itemId] ?? 0) + 1;
		}
		if (action.type === "CHOOSE_ITEM_DESTINATION") {
			if (action.payload.destination === "discard") itemsDiscarded++;
			else itemsAcquired++;
		}
		const beforeInventory = inventoryCounts(step.before.heroes);
		const afterInventory = inventoryCounts(step.after.heroes);
		const beforeTotal = beforeInventory.equipped + beforeInventory.backpack;
		const afterTotal = afterInventory.equipped + afterInventory.backpack;
		// Itens comprados/recebidos fora da fase de recompensa também contam.
		if (afterTotal > beforeTotal && action.type !== "CHOOSE_ITEM_DESTINATION")
			itemsAcquired += afterTotal - beforeTotal;
		if (step.before.roomsCleared < 7 && step.after.roomsCleared >= 7)
			inventoryAfterRoom7 = afterTotal;
		if (step.before.roomsCleared < 8 && step.after.roomsCleared >= 8)
			inventoryAfterRoom8 = afterTotal;
		if (step.before.roomsCleared >= 7 && usedItem) usesAfterRoom7++;
		if (step.before.roomsCleared >= 8 && usedItem) usesAfterRoom8++;
		if (step.before.roomsCleared >= 8 && beforeTotal === 0) emptyInventoryActionsAfterRoom8++;
		const delta = step.after.groupXp - step.before.groupXp;
		if (delta > 0) gained += delta;
		if (delta < 0) {
			if (step.chosen.action.type === "SPEND_XP") {
				const option = step.chosen.action.payload.option;
				spent[option] = (spent[option] ?? 0) - delta;
				spentTotal -= delta;
			} else otherLoss -= delta;
		}
		if (step.chosen.action.type === "SPEND_XP") {
			const option = step.chosen.action.payload.option;
			const levelWasAvailable = step.options.some((move) =>
				move.action.type === "SPEND_XP" && move.action.payload.option === "level_up");
			if (option === "buy_item" && levelWasAvailable) itemsBoughtWhileLevelAvailable++;
			if (option === "buy_artifact" && levelWasAvailable) artifactsBoughtWhileLevelAvailable++;
			if (option === "recover_dungeon") dungeonRecoveries++;
			purchases[option] = (purchases[option] ?? 0) + 1;
			if (option === "level_up") {
				levelUpAttempts++;
				const heroId = step.chosen.action.payload.heroId;
				const before = step.before.heroes.find((hero) => hero.id === heroId);
				const after = step.after.heroes.find((hero) => hero.id === heroId);
				if (before && after && after.impeto > before.impeto) levelUpPurchases++;
				else levelUpNoEffect++;
			}
		}
		if (step.options.some((move) => move.action.type === "SPEND_XP" && move.action.payload.option === "level_up"))
			levelUpOpportunities++;
		const trigger = step.before.pendingTriggerInterrupt;
		if (trigger && step.chosen.action.type === "APPLY_TRIGGER_INTERRUPT") {
			const category = skillById(engine, trigger.skillId)?.category;
			if (category === "hero_skill") triggeredSkillUses++;
			if (category === "hero_power" && !skillById(engine, trigger.skillId)?.cooldown) {
        triggeredPowerUses++;
        recordPowerUse(trigger.skillId, phase);
      }
		}
		const triggerCategory = trigger && skillById(engine, trigger.skillId)?.category;
		if (triggerCategory === "hero_skill") skillOpportunities++;
		if (triggerCategory === "hero_power") powerOpportunities++;
		const abilityOptions = step.options.filter((move) => move.action.type === "USE_SKILL");
		if (abilityOptions.length || triggerCategory === "hero_skill" || triggerCategory === "hero_power") {
			abilityOpportunities++;
			if (abilityOptions.some((move) => move.action.type === "USE_SKILL" && skillById(engine, move.action.payload.skillId)?.category === "hero_skill")) skillOpportunities++;
			if (abilityOptions.some((move) => move.action.type === "USE_SKILL" && skillById(engine, move.action.payload.skillId)?.category === "hero_power")) powerOpportunities++;
		}
    // Um poder preparado pode produzir efeito somente em ações posteriores.
    // Atribuir o primeiro efeito observado à fase em que a carga foi gasta.
    for (const id of powerEffectsThisStep) {
      const spent = powerSpentAt.get(id);
      if (spent && !effectfulPowerIds.has(id)) {
        effectfulPowerIds.add(id);
        powerTiming[spent].effectfulUses++;
      }
    }
		peakXp = Math.max(peakXp, step.after.groupXp);
		finalLevel = Math.max(0, ...step.after.heroes.map((hero) => hero.impeto));
		levelPeak = Math.max(levelPeak, finalLevel);
	}, test.profile, xpCostsOverride);
	const state = gameOf(result.final);
	const allFinalHeroes = [...state.heroes, ...state.defeatedHeroes, ...state.fledHeroes];
	const remainingInventory = inventoryCounts(allFinalHeroes);
	const equippedHealingAtDefeat = state.defeatedHeroes.map((hero) =>
		Object.values(hero.activeItems).filter((id): id is string => Boolean(id))
			.map(itemHealingAmount).filter((amount): amount is number => amount !== null));
	const defeatedHeroesWithEquippedHeal = equippedHealingAtDefeat.filter((amounts) => amounts.length > 0).length;
	const unusedHealingCapacityOnDefeat = equippedHealingAtDefeat.reduce((sum, amounts) =>
		sum + amounts.reduce((total, amount) => total + (Number.isFinite(amount) ? amount : 0), 0), 0);
	const finalInventoryByItem: Record<string, number> = {};
	for (const hero of allFinalHeroes) {
		for (const id of [...Object.values(hero.activeItems).filter((value): value is string => Boolean(value)), ...hero.backpack])
			finalInventoryByItem[id] = (finalInventoryByItem[id] ?? 0) + 1;
	}
	const finalView = playerView(engine, result.final);
	const usableFinal = Object.values(finalView.inventoryByHero).reduce((n, inv) => n + inv.usableItemIds.length, 0);
	return {
		...test,
		outcome: result.outcome,
		violation: result.violation?.invariant ?? null,
		violationMessage: result.violation?.message ?? null,
		steps: result.steps,
		roomsCleared: result.roomsCleared,
		creaturesDefeated: state.creaturesDefeated,
		bossDefeated: state.bossDefeated,
		artifacts: state.groupArtifacts.length,
		rooms,
		initialDespertar: starting.despertar,
		initialHeroLevel: Math.max(0, ...starting.heroes.map((hero) => hero.impeto)),
		poison: state.poisonTelemetry ?? { toHeroes: 0, toEnemies: 0, preventedByHeart: 0 },
		...(bossEncounter ? { bossEncounter } : {}),
		skillUses: manualSkillUses + triggeredSkillUses,
		powerUses: Object.values(powerActivationsById).reduce((total, count) => total + count, 0) +
			manualPowerUses + triggeredPowerUses,
		items: {
			acquired: itemsAcquired, uses: itemsUsed, usesByItem, finalInventoryByItem,
			discarded: itemsDiscarded,
			inventoryFinal: remainingInventory.equipped + remainingInventory.backpack,
			equippedFinal: remainingInventory.equipped,
			backpackFinal: remainingInventory.backpack,
			usableFinal,
			itemDeckAvailableFinal: deckOf(result.final, "itemDeck").available.length,
			inventoryAfterRoom7, inventoryAfterRoom8,
			usesAfterRoom7, usesAfterRoom8, emptyInventoryActionsAfterRoom8,
			healingDecisionPoints, healingIgnoredDecisionPoints, healingItemsUsed,
			deathsWithAvailableHeal, recoverableHpAtDeaths,
			defeatedHeroesWithEquippedHeal, unusedHealingCapacityOnDefeat,
		},
		progression: {
			xpGained: gained, xpSpent: spentTotal, xpSpentByOption: spent,
			xpPurchasesByOption: purchases, xpOtherLoss: otherLoss,
			xpFinal: state.groupXp, xpPeak: peakXp,
			levelInitial: Math.max(0, ...starting.heroes.map((hero) => hero.impeto)),
			levelFinal: finalLevel,
			levelPeak, levelUpOpportunities, levelUpPurchases,
			levelUpAttempts, levelUpNoEffect, abilityOpportunities, skillOpportunities, powerOpportunities,
			itemsBoughtWhileLevelAvailable, artifactsBoughtWhileLevelAvailable, dungeonRecoveries,
			skillPreparations, powerPreparations, powerTiming,
			abilityDecisions: { offeredById, chosenById, offeredAtBossById, chosenAtBossById },
			abilityLifecycle: { attemptedById, preparedById, confirmedById,
				effectsObservedById, chargesConsumedById, bySource, effectsByTarget, effectKindsById },
			abilityActivity: { preparationsById, armedById, clearedDuringAttackById,
				clearedElsewhereById, manualActionsById, powerActivationsById,
				triggersAcceptedById, triggersSkippedById },
		},
	};
}

export function classifyTrial(trial: BenchmarkTrial): "victory" | "defeat" | "stall" {
	if (trial.violation) return "stall";
	if (trial.outcome === "VICTORY") return "victory";
	if (trial.outcome === "DEFEAT") return "defeat";
	return "stall";
}

export function summarizeBenchmark(
	options: DungeonBenchmarkOptions,
	trials: readonly BenchmarkTrial[],
): BenchmarkSummary[] {
	const byKey = new Map<string, BenchmarkTrial[]>();
	for (const trial of trials) {
		const key = [trial.expansionId, trial.profile, trial.difficulty, trial.heroId].join("|");
		const group = byKey.get(key);
		if (group) group.push(trial);
		else byKey.set(key, [trial]);
	}
	const avg = (data: readonly BenchmarkTrial[], f: (trial: BenchmarkTrial) => number) =>
		data.length ? data.reduce((total, trial) => total + f(trial), 0) / data.length : 0;
	const summaries: BenchmarkSummary[] = [];
	for (const expansionId of options.expansions) {
		for (const profile of options.profiles) {
			for (const difficulty of options.difficulties) {
				for (const heroId of options.heroes) {
					const group = byKey.get([expansionId, profile, difficulty, heroId].join("|")) ?? [];
				const victories = group.filter((trial) => classifyTrial(trial) === "victory").length;
				const defeats = group.filter((trial) => classifyTrial(trial) === "defeat").length;
				summaries.push({
					profile, difficulty, heroId, expansionId, heroName: cardName(engine, heroId),
					games: group.length, victories, defeats,
					stalls: group.length - victories - defeats,
					victoryRate: group.length ? victories / group.length : 0,
					avgRooms: avg(group, (trial) => trial.roomsCleared),
					avgCreatures: avg(group, (trial) => trial.creaturesDefeated),
					avgSteps: avg(group, (trial) => trial.steps),
					avgArtifacts: avg(group, (trial) => trial.artifacts),
					avgSkillUses: avg(group, (trial) => trial.skillUses),
				});
				}
			}
		}
	}
	return summaries;
}
