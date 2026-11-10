import type { Difficulty } from "@/core/state/gameState";
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
}

export interface BenchmarkCase {
	readonly seed: number;
	readonly repetition: number;
	readonly heroId: string;
	readonly expansionId: string;
	readonly profile: BotProfile;
	readonly difficulty: Difficulty;
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
	readonly abilityOpportunities: number;
	readonly skillOpportunities: number;
	readonly powerOpportunities: number;
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
	readonly skillUses: number;
	readonly powerUses: number;
	readonly items?: ItemTelemetry;
	readonly progression?: ProgressionTelemetry;
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

export function runBenchmarkCase(test: BenchmarkCase, maxSteps: number): BenchmarkTrial {
	const setup = { ...setupForRun(test.seed, [test.heroId], test.difficulty), bossCardId: benchmarkBoss(test.expansionId) };
	const starting = createHeadlessPort(setup).observe().view;
	const purchases: Record<string, number> = {};
	const spent: Record<string, number> = {};
	let gained = 0, spentTotal = 0, otherLoss = 0, peakXp = starting.groupXp;
	let levelPeak = Math.max(0, ...starting.heroes.map((hero) => hero.impeto));
	let finalLevel = levelPeak;
	let levelUpOpportunities = 0, levelUpPurchases = 0, levelUpAttempts = 0, levelUpNoEffect = 0;
	let abilityOpportunities = 0, skillOpportunities = 0, powerOpportunities = 0;
	let triggeredSkillUses = 0, triggeredPowerUses = 0;
	let itemsAcquired = 0, itemsUsed = 0, itemsDiscarded = 0;
	const usesByItem: Record<string, number> = {};
	let inventoryAfterRoom7: number | null = null, inventoryAfterRoom8: number | null = null;
	let usesAfterRoom7 = 0, usesAfterRoom8 = 0, emptyInventoryActionsAfterRoom8 = 0;
	const result = playAiGame(setup, maxSteps, (step) => {
		const action = step.chosen.action;
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
			purchases[option] = (purchases[option] ?? 0) + 1;
			if (option === "level_up") {
				levelUpAttempts++;
				const before = step.before.heroes.find((hero) => hero.id === step.chosen.action.payload.heroId);
				const after = step.after.heroes.find((hero) => hero.id === step.chosen.action.payload.heroId);
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
			if (category === "hero_power") triggeredPowerUses++;
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
		peakXp = Math.max(peakXp, step.after.groupXp);
		finalLevel = Math.max(0, ...step.after.heroes.map((hero) => hero.impeto));
		levelPeak = Math.max(levelPeak, finalLevel);
	}, test.profile);
	const state = gameOf(result.final);
	const allFinalHeroes = [...state.heroes, ...state.defeatedHeroes, ...state.fledHeroes];
	const remainingInventory = inventoryCounts(allFinalHeroes);
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
		skillUses: result.actions.filter((action) => action.type === "USE_SKILL" &&
			skillById(engine, action.payload.skillId)?.category === "hero_skill").length + triggeredSkillUses,
		powerUses: result.actions.filter((action) => action.type === "USE_POWER" ||
			(action.type === "USE_SKILL" && skillById(engine, action.payload.skillId)?.category === "hero_power")).length + triggeredPowerUses,
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
		},
		progression: {
			xpGained: gained, xpSpent: spentTotal, xpSpentByOption: spent,
			xpPurchasesByOption: purchases, xpOtherLoss: otherLoss,
			xpFinal: state.groupXp, xpPeak: peakXp,
			levelInitial: Math.max(0, ...starting.heroes.map((hero) => hero.impeto)),
			levelFinal: finalLevel,
			levelPeak, levelUpOpportunities, levelUpPurchases,
			levelUpAttempts, levelUpNoEffect, abilityOpportunities, skillOpportunities, powerOpportunities,
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
