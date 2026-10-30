import { z } from "zod";
import type { DslKind, KindNode, RefUse } from "../../../../engine/kinds";
import type { ModifierComponent } from "../../../ecs/types";
import type { DamageType } from "../../../events/types";
import type { GameEngine, ResolveCtx } from "../../../gameEngine";
import type { GameState } from "../../../state/gameState";
import type { ConditionNode, EffectNode, EvalCtx } from "../types";

export type GameKind = DslKind<GameState, ResolveCtx, never, EvalCtx, never>;

export interface ModifierStatSpec {
	readonly target: ModifierComponent["target"];
	readonly negate?: boolean;
	readonly dedup?: boolean;
	readonly reduction?: boolean;
	readonly damageType?: DamageType;
}

export function modifierStatSpec(
	engine: GameEngine,
	stat: string,
): ModifierStatSpec | undefined {
	// O resolvedor de stat depende só do nome, nunca do contexto de avaliação.
	return engine.kinds.ref<ModifierStatSpec>(
		"modifier_stat",
		stat,
		undefined as never,
	);
}

export type EffectOf<K extends EffectNode["kind"]> = Extract<
	EffectNode,
	{ kind: K }
>;

export const NodeLike = z.looseObject({ kind: z.string().min(1) });
export const NodeList = z.array(NodeLike);
export const ConditionLike = z.union([
	NodeLike,
	z.looseObject({ any_of: z.array(z.unknown()) }),
]);

export function asKindNode(condition: ConditionNode): KindNode {
	return "any_of" in condition
		? { kind: "any_of", any_of: condition.any_of }
		: (condition as KindNode);
}

export function effectKind<K extends EffectNode["kind"]>(definition: {
	readonly kind: K;
	readonly schema: z.ZodType;
	readonly aliases?: readonly string[];
	readonly vocabulary?: Readonly<Record<string, readonly string[]>>;
	readonly children?: (node: EffectOf<K>) => readonly KindNode[];
	readonly refsOf?: (node: EffectOf<K>) => readonly RefUse[];
	readonly evaluate?: (node: EffectOf<K>, ctx: EvalCtx) => GameState;
	readonly resolve?: (
		state: GameState,
		effect: KindNode,
		ctx: ResolveCtx,
	) => GameState;
}): GameKind {
	const { resolve, ...rest } = definition;
	return {
		...rest,
		category: "effect",
		...(resolve
			? {
					resolve: (state: GameState, effect: KindNode, ctx: ResolveCtx) => ({
						state: resolve(state, effect, ctx),
					}),
				}
			: {}),
	} as unknown as GameKind;
}

export function targetOf(effect: KindNode): string | undefined {
	return (effect["to"] ?? effect["targetId"]) as string | undefined;
}

export function unresolvedEntityRef(
	ctx: EvalCtx,
	effectKind: string,
	ref: string,
): GameState {
	return ctx.action.log(
		`[ERRO] ${effectKind}: referência de entidade "${ref}" não resolveu para a habilidade "${ctx.skillId}".`,
	);
}
