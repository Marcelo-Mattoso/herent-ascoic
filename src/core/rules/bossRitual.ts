import { cardById } from "../gameEngine";
import type { GameEngine } from "../gameEngine";
import type { BossCard } from "../data/cardTypes";
import type { GameState } from "../state/gameState";
import { gameOf } from "../../engine/state";

type RitualStat = "life" | "hitBonus" | "damage";

/**
 * Bônus do ritual que ainda alimentam o chefe.
 *
 * O artefato neutraliza somente a parcela sobrenatural: nunca reduz os
 * atributos naturais do chefe abaixo de sua ficha original.
 */
export function remainingBossRitualBonus(
	card: BossCard,
	state: GameState,
	stat: RitualStat,
): number {
	const granted = Math.max(0, card.ritualBonuses?.[stat] ?? 0);
	if (!granted) return 0;
	const collected = new Set(gameOf(state).groupArtifacts.map((artifact) => artifact.cardId));
	const removed = (card.artifactCounters ?? [])
		.filter((counter) => collected.has(counter.artifactId))
		.reduce((sum, counter) => sum + Math.max(0, counter.removes?.[stat] ?? 0), 0);
	return Math.max(0, granted - removed);
}

/** A neutralização vale para os artefatos coletados pelo grupo, mesmo sem portador. */
export function bossSkillNeutralized(
	engine: GameEngine,
	state: GameState,
	bossCardId: string,
	skillId: string,
): boolean {
	const card = cardById(engine, bossCardId);
	if (card?.type !== "boss") return false;
	const collected = new Set(gameOf(state).groupArtifacts.map((artifact) => artifact.cardId));
	return (card.artifactCounters ?? []).some(
		(counter) => collected.has(counter.artifactId) &&
			(counter.disablesSkillIds?.includes(skillId) ?? false),
	);
}
