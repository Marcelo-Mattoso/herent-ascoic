// Evaluator da DSL de efeitos (Patch-12 Fase 1).
// evaluate(effects, ctx) → GameState
//
// Cada nó despacha para ctx.action.* (pipeline ECS) — sem mutação direta de state.
// ctx.withState() é chamado entre efeitos para encadear o estado resultante.

import { getSkillLocale } from "../../data/skillLocale";
import { resolveCondition } from "./resolveCondition";
import {
	resolveEntityListRef,
	resolveEntityRef,
	resolveExpr,
	SkipEffect,
} from "./resolveExpr";
import type { EffectNode, EvalCtx } from "./types";

/**
 * Avalia um array de EffectNode em sequência, encadeando o estado resultante.
 */
export function evaluate(
	effects: readonly EffectNode[],
	ctx: EvalCtx,
): import("../../state/gameState").GameState {
	let cur = ctx;
	for (const node of effects) {
		try {
			const next = evaluateOne(node, cur);
			cur = cur.withState(next);
		} catch (e) {
			if (e instanceof SkipEffect) continue;
			throw e;
		}
	}
	return cur.state;
}

function evaluateOne(
	node: EffectNode,
	ctx: EvalCtx,
): import("../../state/gameState").GameState {
	switch (node.kind) {
		// ── Dano / cura ───────────────────────────────────────────────────────

		case "i_damage": {
			const to = resolveEntityRef(node.to, ctx) ?? node.to;
			const amount = resolveExpr(node.amount, ctx);
			const clamped =
				node.minimum !== undefined ? Math.max(node.minimum, amount) : amount;
			return ctx.action.pushEffect({
				kind: "i_damage",
				to,
				amount: clamped,
			});
		}

		case "i_heal": {
			const to = resolveEntityRef(node.to, ctx) ?? node.to;
			const amount = resolveExpr(node.amount, ctx);
			return ctx.action.pushEffect({ kind: "i_heal", to, amount });
		}

		case "i_full_heal": {
			const to = resolveEntityRef(node.to, ctx) ?? node.to;
			return ctx.action.pushEffect({ kind: "i_full_heal", to });
		}

		case "i_prevent_destroy": {
			const to = resolveEntityRef(node.to, ctx) ?? node.to;
			return ctx.action.pushEffect({ kind: "i_prevent_destroy", to });
		}

		// ── Modificadores / componentes ECS ───────────────────────────────────

		case "p_modifier": {
			const to = resolveEntityRef(node.to, ctx) ?? node.to;
			const value = resolveExpr(node.value, ctx);
			// Vai para o drainStack que faz dual-write (ECS world + legacy combat state)
			// sourceEntityId propagado para permitir limpeza de while_source_in_play.
			return ctx.action.pushEffect({
				kind: "p_modifier",
				to,
				stat: node.stat,
				operation: node.operation,
				value,
				duration: node.duration,
				sourceEntityId: ctx.sourceId ?? undefined,
			});
		}

		case "add_trigger": {
			const entityId = resolveEntityRef(node.to, ctx);
			if (!entityId)
				return ctx.action.log(
					`[evaluate] add_trigger: alvo "${node.to}" não resolveu`,
				);
			return ctx.action.addComponent(entityId, {
				type: "trigger",
				on: node.on,
				effect:
					node.effect as unknown as import("../../ecs/types").EffectDescriptor,
				source: ctx.skillId,
				duration: mapDuration(node.duration),
				priority: node.priority ?? 0,
				condition: undefined,
			});
		}

		case "p_block":
			return ctx.action.pushEffect({ kind: "p_block", what: node.what });

		// ── Decks ─────────────────────────────────────────────────────────────

		case "i_discard": {
			const count = resolveExpr(node.count, ctx);
			return ctx.action.pushEffect({
				kind: "i_discard",
				pile: node.pile,
				count,
			});
		}

		case "i_draw": {
			const count = resolveExpr(node.count, ctx);
			return ctx.action.pushEffect({
				kind: "i_draw",
				pile: node.pile,
				count,
			});
		}

		// ── Dungeon ───────────────────────────────────────────────────────────

		case "i_advance_dungeon": {
			const amount = resolveExpr(node.amount, ctx);
			return ctx.action.pushEffect({ kind: "i_advance_dungeon", amount });
		}

		// ── Misc ──────────────────────────────────────────────────────────────

		case "i_set_no_reward": {
			const to = resolveEntityRef(node.to, ctx) ?? node.to;
			return ctx.action.pushEffect({ kind: "i_set_no_reward", to });
		}

		// ── Patch-16 Lote B ───────────────────────────────────────────────────

		case "i_prevent_next_damage": {
			const to = resolveEntityRef(node.to, ctx) ?? node.to;
			return ctx.action.pushEffect({ kind: "i_prevent_next_damage", to });
		}

		case "i_ignore_next_targeting": {
			const to = resolveEntityRef(node.to, ctx) ?? node.to;
			return ctx.action.pushEffect({ kind: "i_ignore_next_targeting", to });
		}

		case "i_recover_dungeon": {
			const count = resolveExpr(node.count, ctx);
			return ctx.action.pushEffect({ kind: "i_recover_dungeon", count });
		}

		case "i_mark_target": {
			const to = resolveEntityRef(node.to, ctx) ?? node.to;
			return ctx.action.pushEffect({ kind: "i_mark_target", to });
		}

		case "i_prevent_dungeon_discard":
			return ctx.action.pushEffect({ kind: "i_prevent_dungeon_discard" });

		case "i_draw_and_choose": {
			const reveal = resolveExpr(node.reveal, ctx);
			const keep = resolveExpr(node.keep, ctx);
			return ctx.action.pushEffect({
				kind: "i_draw_and_choose",
				pile: node.pile,
				reveal,
				keep,
			});
		}

		case "i_reveal_dungeon": {
			const count = resolveExpr(node.count, ctx);
			return ctx.action.pushEffect({ kind: "i_reveal_dungeon", count });
		}

		case "i_grant_reward":
			return ctx.action.pushEffect({
				kind: "i_grant_reward",
				rewardType: node.rewardType,
				cardId: node.cardId,
			});

		// ── Composição ────────────────────────────────────────────────────────

		case "i_if": {
			const cond = resolveCondition(node.when, ctx);
			const branch = cond ? node.then : (node.else ?? []);
			return evaluate(branch, ctx);
		}

		case "i_choose_one": {
			const localeOptions = getSkillLocale(ctx.skillId).options ?? {};
			const options = node.options.map((opt) => {
				const template = localeOptions[opt.id] ?? opt.id;
				const label = template.replace(/\{(\w+)\}/g, (_m, k: string) =>
					String((opt.params ?? {})[k] ?? "?"),
				);
				return { id: opt.id, label, params: opt.params, effect: opt.effect };
			});
			return ctx.action.requestChoice(options);
		}

		case "i_for_each": {
			const ids = resolveEntityListRef(node.over, ctx);
			let cur = ctx;
			for (const id of ids) {
				// Rebind $target a cada iteração
				const iterCtx: EvalCtx = {
					...cur,
					targetId: id,
					targetIds: [id],
					withState: cur.withState,
				};
				const next = evaluate(node.do, iterCtx);
				cur = cur.withState(next);
			}
			return cur.state;
		}

		case "i_noop":
			return ctx.state;

		// ── Dado (Lote F) ─────────────────────────────────────────────────────

		case "i_modify_die": {
			const delta = resolveExpr(node.delta, ctx);
			return ctx.action.pushEffect({
				kind: "i_modify_die",
				delta,
				die_side: node.die_side,
				hero_id: ctx.sourceId ?? undefined,
				skill_id: ctx.skillId,
			});
		}

		case "i_reroll": {
			const only_if_value =
				node.only_if_value !== undefined
					? resolveExpr(node.only_if_value, ctx)
					: undefined;
			return ctx.action.pushEffect({
				kind: "i_reroll",
				die_side: node.die_side,
				hero_id: ctx.sourceId ?? undefined,
				skill_id: ctx.skillId,
				only_if_value,
			});
		}

		case "i_set_die": {
			const value = resolveExpr(node.value, ctx);
			return ctx.action.pushEffect({
				kind: "i_set_die",
				value,
				die_side: node.die_side,
				hero_id: ctx.sourceId ?? undefined,
				skill_id: ctx.skillId,
			});
		}

		// ── Status (Lote F) ───────────────────────────────────────────────────

		case "i_dispel":
			return ctx.action.pushEffect({
				kind: "i_dispel",
				category: node.category,
			});

		case "i_remove_status":
			return ctx.action.pushEffect({
				kind: "i_remove_status",
				status: node.status,
			});
	}
	return ctx.state;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

import type { Duration } from "../../ecs/types";
import type { DurationNode } from "./types";

function mapDuration(d: DurationNode): Duration {
	switch (d.kind) {
		case "once":
			return { kind: "once" };
		case "until_end_of_round":
			return { kind: "this_turn" };
		case "until_end_of_combat":
			return { kind: "this_combat" };
		case "while_in_play":
			return { kind: "while_source_in_play" };
		case "permanent":
		case "passive":
			return { kind: "permanent" };
		case "once_per_round":
			return { kind: "rounds", remaining: 1 };
	}
}
