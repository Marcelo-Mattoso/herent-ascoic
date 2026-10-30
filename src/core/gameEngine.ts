import type { ContentPort, Engine, SourceRef } from "../engine/compose";
import type { KindPackage, KindRegistry } from "../engine/kinds";
import type { PhaseFlow, PhaseHandler } from "../engine/phases";
import type { Action } from "./actions/types";
import type { PendingEffect } from "./effects/stack";
import type { EvalCtx } from "./skills/dsl/types";
import type { AbilityDefinition, AbilityGrant } from "./data/abilityTypes";
import type { AnyCard, SkillRef } from "./data/cardTypes";
import type { SkillDefinition } from "./data/skillTypes";
import type { ScriptHandler, SkillContinuation } from "./scripts/types";
import type { GameState } from "./state/gameState";
import type { GameStatus } from "./state/status";

export interface GameContent extends ContentPort<AnyCard, SkillDefinition> {
	abilitiesOf(
		cardId: string,
	): readonly { def: SkillDefinition; ref: SkillRef }[];
	cardsOfType<T extends AnyCard["type"]>(
		type: T,
	): Extract<AnyCard, { type: T }>[];
	grants(cardId: string): readonly AbilityGrant[];
	abilityDef(id: string): AbilityDefinition | null;
	script(ref: string): ScriptHandler | null;
	continuationOf(skillId: string): SkillContinuation | null;
}

export interface GameBalance {
	readonly xpCosts: {
		readonly recover_dungeon: number;
		readonly level_up: number;
		readonly buy_item: number;
		readonly lower_despertar: number;
		readonly buy_artifact: number;
	};
	readonly dungeonExhaustionCost: number;
	readonly difficultyPresets: Readonly<
		Record<
			"very_easy" | "easy" | "normal" | "hard" | "nightmare",
			{ readonly heroOffset: number; readonly despertarOffset: number }
		>
	>;
	readonly backpackLimit: number | null;
	readonly featureFlags: {
		readonly enableSubBosses: boolean;
		readonly enableSave: boolean;
	};
}

export type GameTransitions = Partial<Record<GameStatus, readonly GameStatus[]>>;

export type EventOrder = "fifo" | "lifo";

export interface ResolveCtx {
	readonly engine: GameEngine;
	readonly pending: PendingEffect;
}

export type GameKinds = KindRegistry<GameState, ResolveCtx, EvalCtx>;
export type GameKindPackage = KindPackage<GameState, ResolveCtx, EvalCtx>;

export type GameFlow = PhaseFlow<GameState, Action, GameEngine>;
export type GameHandler = PhaseHandler<GameState, Action, GameEngine>;

export interface GameEngine
	extends Engine<
		GameState,
		AnyCard,
		SkillDefinition,
		GameBalance,
		GameTransitions,
		GameContent,
		GameKinds,
		GameFlow
	> {}

export function refRequirementMet(
	engine: GameEngine,
	state: GameState,
	requiresAwakening: boolean | undefined,
	src: SourceRef = { kind: "card", id: "" },
): boolean {
	return engine.requirements.met(
		state,
		{ kind: "awakening", required: requiresAwakening === true },
		src,
	);
}

export function cardById(engine: GameEngine, id: string): AnyCard | undefined {
	return engine.content.hasCard(id) ? engine.content.card(id) : undefined;
}

export function cardsOfType<T extends AnyCard["type"]>(
	engine: GameEngine,
	type: T,
): Extract<AnyCard, { type: T }>[] {
	return engine.content.cardsOfType(type);
}

export function bossCard(engine: GameEngine) {
	return engine.content.cardsOfType("boss")[0];
}

export function cardName(engine: GameEngine, id: string): string {
	return engine.content.text("card.name", { id });
}

export function cardScaling(engine: GameEngine, id: string): string {
	return engine.content.text("card.dungeonScaling", { id });
}

export function skillName(engine: GameEngine, id: string): string {
	return engine.content.text("ability.name", { id });
}

export function skillText(engine: GameEngine, id: string): string {
	return engine.content.text("ability.text", { id });
}

export function skillOptionLabel(
	engine: GameEngine,
	id: string,
	option: string,
): string {
	return engine.content.text("ability.option", { id, option });
}

export function skillById(
	engine: GameEngine,
	id: string,
): SkillDefinition | null {
	return engine.content.hasAbility(id) ? engine.content.ability(id) : null;
}

export function skillsOf(engine: GameEngine, cardId: string) {
	return engine.content.abilitiesOf(cardId);
}

export function abilityGrants(
	engine: GameEngine,
	cardId: string,
): readonly AbilityGrant[] {
	return engine.content.grants(cardId);
}

export function abilityById(
	engine: GameEngine,
	id: string,
): AbilityDefinition | null {
	return engine.content.abilityDef(id);
}

export function balanceOf(engine: GameEngine): GameBalance {
	return engine.ruleset.balance;
}

export function backpackCapacity(engine: GameEngine): number {
	return engine.ruleset.balance.backpackLimit ?? 3;
}

export function transitionsOf(engine: GameEngine): GameTransitions {
	return engine.ruleset.transitions;
}

export function eventOrderOf(
	engine: GameEngine,
	type: string,
): EventOrder | undefined {
	return (engine.ruleset.eventRules as Record<string, EventOrder>)[type];
}

export function windowPolicyOf(
	engine: GameEngine,
): (cause: string) => EventOrder {
	return (cause) => eventOrderOf(engine, cause) ?? "lifo";
}

export function gameVersion(engine: GameEngine): string {
	return engine.ruleset.version;
}

export function skillOwners(engine: GameEngine, skillId: string): string[] {
	return engine.content
		.cards()
		.filter((card) =>
			engine.content
				.abilitiesOf(card.id)
				.some(({ def }) => def.id === skillId),
		)
		.map((card) => card.id);
}
export type XpSpendOption = keyof GameBalance["xpCosts"];

export function scriptOf(engine: GameEngine, ref: string): ScriptHandler | null {
	return engine.content.script(ref);
}
