import { z } from "zod";
import { enterArea, leaveArea } from "./areas";
import { clampPools, poolMax, setPool, testCondition } from "./attributes";
import {
	type DslKind,
	defineTypedKind,
	type KindNode,
	type KindPackage,
} from "./kinds";
import { applyDamage, applyHeal } from "./pipeline";
import {
	type EngineEventMap,
	type EngineState,
	type GameState,
	recordEvent,
} from "./state";
import { addBlock, applyStatus, removeStatus } from "./statuses";
import { patchUnit, type UnitCatalog, type UnitId, unitOf } from "./units";
import type { BuiltinCtx } from "./builtinKinds";

export interface UnitCtx extends BuiltinCtx {
	readonly units: UnitCatalog;
	readonly world?: EngineState<EngineEventMap>;
	readonly subject?: UnitId;
}

const Target = z.string().min(1);
const Source = z.string().min(1).optional();
const Amount = z.number().int().min(0);
const Negate = z.boolean().optional();
const COMPARISONS = ["lt", "lte", "eq", "gte", "gt"] as const;

type Node<T> = KindNode & T;

export function unitKinds<
	TGame,
	TMap extends EngineEventMap = EngineEventMap,
>(): KindPackage<GameState<TGame, TMap>, UnitCtx, UnitCtx> {
	type S = GameState<TGame, TMap>;
	const define = <T extends object>(
		definition: DslKind<S, UnitCtx, Node<T>, UnitCtx>,
	) => defineTypedKind<Node<T>, S, UnitCtx, UnitCtx>(definition);
	const meta = (ctx: UnitCtx) => ({ cause: ctx.cause });
	const engineStep = (state: S, engine: EngineState<TMap>) => ({
		state: { ...state, engine },
	});

	const damage = define<{
		target: string;
		amount: number;
		type: string;
		source?: string;
	}>({
		kind: "damage",
		category: "effect",
		schema: z.object({
			kind: z.literal("damage"),
			target: Target,
			amount: Amount,
			type: z.string().min(1),
			source: Source,
		}),
		resolve: (state, node, ctx) =>
			engineStep(state, applyDamage(state.engine, ctx.units, node, meta(ctx))),
	});

	const heal = define<{
		target: string;
		amount: number;
		tags?: readonly string[];
		pool?: string;
		source?: string;
	}>({
		kind: "heal",
		category: "effect",
		schema: z.object({
			kind: z.literal("heal"),
			target: Target,
			amount: Amount,
			tags: z.array(z.string()).optional(),
			pool: z.string().min(1).optional(),
			source: Source,
		}),
		resolve: (state, node, ctx) =>
			engineStep(state, applyHeal(state.engine, ctx.units, node, meta(ctx))),
	});

	const apply = define<{ target: string; status: string; source?: string }>({
		kind: "apply_status",
		category: "effect",
		schema: z.object({
			kind: z.literal("apply_status"),
			target: Target,
			status: z.string().min(1),
			source: Source,
		}),
		resolve: (state, node, ctx) =>
			engineStep(
				state,
				applyStatus(
					state.engine,
					ctx.units,
					node.target,
					node.status,
					node.source,
					meta(ctx),
				),
			),
	});

	const remove = define<{ target: string; status?: string; tag?: string }>({
		kind: "remove_status",
		category: "effect",
		schema: z
			.object({
				kind: z.literal("remove_status"),
				target: Target,
				status: z.string().min(1).optional(),
				tag: z.string().min(1).optional(),
			})
			.refine(
				(node) => (node.status === undefined) !== (node.tag === undefined),
				{
					message: 'exige exatamente um entre "status" e "tag"',
				},
			),
		resolve: (state, node, ctx) =>
			engineStep(
				state,
				removeStatus(
					state.engine,
					ctx.units,
					node.target,
					node,
					"removido",
					meta(ctx),
				),
			),
	});

	const modify = define<{
		target: string;
		attr: string;
		delta: number;
		mode: "base" | "atual";
	}>({
		kind: "modify_attribute",
		category: "effect",
		vocabulary: { mode: ["base", "atual"] },
		schema: z.object({
			kind: z.literal("modify_attribute"),
			target: Target,
			attr: z.string().min(1),
			delta: z.number(),
			mode: z.enum(["base", "atual"]),
		}),
		resolve: (state, node, ctx) => {
			const def = ctx.units.attributeDef(node.attr);
			const unit = unitOf(state.engine, node.target);
			if (node.mode === "atual" && def.kind !== "pool") {
				throw new Error(`"${node.attr}" não é um recurso (mode "atual")`);
			}
			if (node.mode === "base" && def.kind !== "stat") {
				throw new Error(`"${node.attr}" é um recurso (mode "base")`);
			}
			let engine = state.engine;
			let from: number;
			let to: number;
			if (node.mode === "base") {
				from = unit.base[node.attr] ?? def.default ?? 0;
				to = from + node.delta;
				engine = patchUnit(engine, node.target, {
					base: { ...unit.base, [node.attr]: to },
				});
			} else {
				from = unit.pools[node.attr] ?? def.default ?? 0;
				const max = poolMax(engine, ctx.units, node.target, node.attr);
				to = Math.min(Math.max(from + node.delta, def.min ?? 0), max);
				engine = setPool(engine, node.target, node.attr, to);
			}
			engine = recordEvent(
				engine,
				"atributo.alterado",
				{ unit: node.target, attr: node.attr, from, to, reason: node.mode },
				meta(ctx),
			);
			return engineStep(
				state,
				clampPools(engine, ctx.units, node.target, meta(ctx)),
			);
		},
	});

	const block = define<{ target: string; action: string; turns: number }>({
		kind: "block_action",
		category: "effect",
		schema: z.object({
			kind: z.literal("block_action"),
			target: Target,
			action: z.string().min(1),
			turns: z.number().int().min(1),
		}),
		resolve: (state, node) =>
			engineStep(
				state,
				addBlock(state.engine, node.target, node.action, node.turns),
			),
	});

	const move = define<{ target: string; area: string }>({
		kind: "move_to_area",
		category: "effect",
		schema: z.object({
			kind: z.literal("move_to_area"),
			target: Target,
			area: Target,
		}),
		resolve: (state, node, ctx) => {
			let engine = state.engine;
			for (const area of unitOf(engine, node.target).presentIn) {
				if (area !== node.area) {
					engine = leaveArea(engine, ctx.units, node.target, area, meta(ctx));
				}
			}
			return engineStep(
				state,
				enterArea(engine, ctx.units, node.target, node.area, meta(ctx)),
			);
		},
	});

	const holds = (node: KindNode, ctx: UnitCtx) => {
		if (!ctx.world || ctx.subject === undefined) {
			throw new Error(
				`Condição "${node.kind}" exige estado e unidade de contexto`,
			);
		}
		return testCondition(ctx.world, ctx.units, ctx.subject, node);
	};

	const inArea = define<{ area: string; negate?: boolean }>({
		kind: "in_area",
		category: "condition",
		schema: z.object({
			kind: z.literal("in_area"),
			area: Target,
			negate: Negate,
		}),
		test: holds,
	});

	const hasStatus = define<{ status?: string; tag?: string; negate?: boolean }>(
		{
			kind: "has_status",
			category: "condition",
			schema: z
				.object({
					kind: z.literal("has_status"),
					status: z.string().min(1).optional(),
					tag: z.string().min(1).optional(),
					negate: Negate,
				})
				.refine(
					(node) => (node.status === undefined) !== (node.tag === undefined),
					{
						message: 'exige exatamente um entre "status" e "tag"',
					},
				),
			test: holds,
		},
	);

	const attrCompare = define<{
		attr: string;
		op: (typeof COMPARISONS)[number];
		value: number;
		negate?: boolean;
	}>({
		kind: "attr_compare",
		category: "condition",
		vocabulary: { op: COMPARISONS },
		schema: z.object({
			kind: z.literal("attr_compare"),
			attr: z.string().min(1),
			op: z.enum(COMPARISONS),
			value: z.number(),
			negate: Negate,
		}),
		test: holds,
	});

	return {
		id: "engine-units",
		kinds: [
			damage,
			heal,
			apply,
			remove,
			modify,
			block,
			move,
			inArea,
			hasStatus,
			attrCompare,
		] as unknown as KindPackage<S, UnitCtx, UnitCtx>["kinds"],
	};
}
