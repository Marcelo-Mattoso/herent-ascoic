import type { ModifierComponent } from "../ecs/types";
import { itemIsExhausted } from "../rules/itemEffects";
import { ActivationTracker } from "../state/activation";
import type { CombatState } from "../state/combatState";
import type { EnemyState } from "../state/enemyState";
import type { AscensaoGame, GameState } from "../state/gameState";
import type { HeroState } from "../state/heroState";

import type { ColorIndex } from "../state/color";
import { type DeckName, allHeroesOf, awakeningOf, decksOf, enemiesOf, graveyardOf, impetoOf, powerUsedThisRoom, worldOf, pendingTriggerInterruptOf, pendingSkillChoiceOf, pendingSkillTargetOf, pendingSkillWindowOf } from "../state/access";
import { gameOf } from "../../engine/state";
export interface JournalHeroSource {
	readonly hero: HeroState;
	readonly impeto: ColorIndex;
	readonly exhaustedItemIds: readonly string[];
	readonly powerUsedThisRoom: boolean;
	readonly modifiers: readonly ModifierComponent[];
}

export interface JournalEnemySource {
	readonly enemy: EnemyState;
	readonly modifiers: readonly ModifierComponent[];
}

export interface JournalSnapshot {
	readonly gameId: string;
	readonly actionCount: number;
	readonly lastActionSeq: number | undefined;
	readonly status: AscensaoGame["status"];
	readonly mode: AscensaoGame["mode"];
	readonly difficulty: AscensaoGame["difficulty"];
	readonly combat: {
		readonly round: number;
		readonly phase: CombatState["phase"];
		readonly selectedHeroId: string | null;
		readonly pairs: CombatState["pairs"];
		readonly heroesActed: readonly string[];
		readonly lastRoll: CombatState["lastRoll"];
	} | null;
	readonly preparedAbilities: readonly {
		readonly key: string;
		readonly abilityId: string;
		readonly sourceCardId: string;
		readonly event: string;
	}[];
	readonly groupXp: number;
	readonly despertar: number;
	readonly roomsCleared: number;
	readonly creaturesDefeated: number;
	readonly currentRoom: {
		readonly cardId: string;
		readonly status: string;
		readonly effect: string;
	} | null;
	readonly heroes: readonly JournalHeroSource[];
	readonly enemies: readonly JournalEnemySource[];
	readonly defeatedEnemies: readonly JournalEnemySource[];
	readonly artifacts: readonly {
		readonly cardId: string;
		readonly carriedBy: string | null;
		readonly disabled: boolean;
	}[];
	readonly decks: readonly {
		readonly id: DeckName;
		readonly available: number;
		readonly discarded: readonly string[];
		readonly removed: number;
	}[];
	readonly paths: readonly string[];
	readonly pendingRewardCardIds: readonly string[];
	readonly pendingSkillChoice: {
		readonly prompt: string;
		readonly optionLabels: readonly string[];
	} | null;
	readonly pendingSkillTarget: {
		readonly prompt: string;
		readonly candidateLabels: readonly string[];
	} | null;
	readonly pendingInterrupt: {
		readonly id: string;
		readonly skillId: string;
		readonly event: string;
		readonly sourceCardId: string;
		readonly reason: string;
		readonly continuation: string;
	} | null;
	readonly enabledFlags: readonly string[];
	readonly blocks: readonly {
		readonly key: string;
		readonly sources: readonly string[];
	}[];
	readonly tokens: readonly { readonly key: string; readonly count: number }[];
	readonly worldModifiers: readonly {
		readonly targetId: string;
		readonly modifier: ModifierComponent;
	}[];
	readonly eventLog: readonly string[];
}

function modifiersOf(state: GameState, entityId: string): ModifierComponent[] {
	return (worldOf(state).entities[entityId]?.components ?? []).filter(
		(component): component is ModifierComponent => component.type === "modifier",
	);
}

function heroSource(state: GameState, hero: HeroState): JournalHeroSource {
	return {
		hero,
		impeto: impetoOf(state, hero.id),
		exhaustedItemIds: Object.values(hero.activeItems)
			
			.filter((id): id is string => !!id && itemIsExhausted(state, hero.id, id)),
		powerUsedThisRoom: powerUsedThisRoom(state, hero.id),
		modifiers: modifiersOf(state, hero.id),
	};
}

function enemySource(state: GameState, enemy: EnemyState): JournalEnemySource {
	return { enemy, modifiers: modifiersOf(state, enemy.id) };
}

export function journalSnapshotOf(state: GameState): JournalSnapshot {
	const interrupt = pendingTriggerInterruptOf(state);
	const skillChoice = pendingSkillChoiceOf(state);
	const skillTarget = pendingSkillTargetOf(state);
	return {
		gameId: gameOf(state).gameId,
		actionCount: gameOf(state).actionLog.length,
		lastActionSeq: gameOf(state).actionLog.at(-1)?.seq,
		status: gameOf(state).status,
		mode: gameOf(state).mode,
		difficulty: gameOf(state).difficulty,
		combat: gameOf(state).combat
			? {
					round: gameOf(state).combat!.round,
					phase: gameOf(state).combat!.phase,
					selectedHeroId: gameOf(state).combat!.selectedHeroId,
					pairs: gameOf(state).combat!.pairs,
					heroesActed: gameOf(state).combat!.heroesActed,
					lastRoll: gameOf(state).combat!.lastRoll,
				}
			: null,
		preparedAbilities: Object.values(gameOf(state).preparedAbilities ?? {}).map(
			(entry) => ({
				key: entry.key,
				abilityId: entry.abilityId,
				sourceCardId: entry.sourceCardId,
				event: entry.event,
			}),
		),
		groupXp: gameOf(state).groupXp,
		despertar: awakeningOf(state),
		roomsCleared: gameOf(state).roomsCleared,
		creaturesDefeated: gameOf(state).creaturesDefeated,
		currentRoom: gameOf(state).currentRoom
			? {
					cardId: gameOf(state).currentRoom!.cardId,
					status: gameOf(state).currentRoom!.status,
					effect: gameOf(state).currentRoom!.effect,
				}
			: null,
		heroes: allHeroesOf(state).map(
			(hero) => heroSource(state, hero),
		),
		enemies: enemiesOf(state).map((enemy) => enemySource(state, enemy)),
		defeatedEnemies: graveyardOf(state).map((enemy) =>
			enemySource(state, enemy),
		),
		artifacts: gameOf(state).groupArtifacts.map((artifact) => ({
			cardId: artifact.cardId,
			carriedBy: artifact.carriedBy,
			disabled: ActivationTracker.isDisabled(state, "artifact", artifact.cardId),
		})),
		decks: (Object.keys(decksOf(state)) as (DeckName)[]).map(
			(id) => ({
				id,
				available: decksOf(state)[id].available.length,
				discarded: decksOf(state)[id].discarded,
				removed: decksOf(state)[id].removed.length,
			}),
		),
		paths: gameOf(state).paths,
		pendingRewardCardIds: gameOf(state).pendingRewards.map((reward) => reward.cardId),
		pendingSkillChoice: skillChoice
			? {
					prompt: skillChoice.prompt,
					optionLabels: skillChoice.options.map((o) => o.label),
				}
			: null,
		pendingSkillTarget: skillTarget
			? {
					prompt: skillTarget.prompt,
					candidateLabels: skillTarget.candidates.map(
						(candidate) => candidate.label,
					),
				}
			: null,
		pendingInterrupt: interrupt
			? {
					id: interrupt.id,
					skillId: interrupt.skillId,
					event: interrupt.event,
					sourceCardId: interrupt.sourceCardId,
					reason: interrupt.reason,
					continuation: pendingSkillWindowOf(state)?.resume.type ?? "none",
				}
			: null,
		enabledFlags: Object.entries(gameOf(state).flags)
			.filter(([, enabled]) => enabled)
			.map(([key]) => key),
		blocks: Object.entries(gameOf(state).blocks).map(([key, entries]) => ({
			key,
			sources: entries.map((entry) => entry.source),
		})),
		tokens: Object.entries(gameOf(state).tokens).map(([key, token]) => ({
			key,
			count: token.count,
		})),
		worldModifiers: Object.values(worldOf(state).entities).flatMap((entity) =>
			entity.components
				.filter(
					(component): component is ModifierComponent =>
						component.type === "modifier",
				)
				.map((modifier) => ({ targetId: entity.id, modifier })),
		),
		eventLog: gameOf(state).eventLog,
	};
}
