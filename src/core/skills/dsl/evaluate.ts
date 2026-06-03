// Evaluator da DSL de efeitos (Patch-12 Fase 1).
// evaluate(effects, ctx) → GameState
//
// Cada nó despacha para ctx.action.* (pipeline ECS) — sem mutação direta de state.
// ctx.withState() é chamado entre efeitos para encadear o estado resultante.

import { resolveCondition } from "./resolveCondition";
import {
	SkipEffect,
	resolveEntityListRef,
	resolveEntityRef,
	resolveExpr,
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

		case "apply_damage": {
			const to = resolveEntityRef(node.to, ctx) ?? node.to;
			const amount = resolveExpr(node.amount, ctx);
			const clamped =
				node.minimum !== undefined ? Math.max(node.minimum, amount) : amount;
			return ctx.action.pushEffect({
				kind: "apply_damage",
				to,
				amount: clamped,
			});
		}

		case "apply_heal": {
			const to = resolveEntityRef(node.to, ctx) ?? node.to;
			const amount = resolveExpr(node.amount, ctx);
			return ctx.action.pushEffect({ kind: "apply_heal", to, amount });
		}

		case "apply_full_heal": {
			const to = resolveEntityRef(node.to, ctx) ?? node.to;
			return ctx.action.pushEffect({ kind: "apply_full_heal", to });
		}

		case "prevent_destroy": {
			const to = resolveEntityRef(node.to, ctx) ?? node.to;
			return ctx.action.pushEffect({ kind: "prevent_destroy", to });
		}

		// ── Modificadores / componentes ECS ───────────────────────────────────

		case "add_modifier": {
			const to = resolveEntityRef(node.to, ctx) ?? node.to;
			const value = resolveExpr(node.value, ctx);
			// Vai para o drainStack que faz dual-write (ECS world + legacy combat state)
			return ctx.action.pushEffect({
				kind: "add_modifier",
				to,
				stat: node.stat,
				operation: node.operation,
				value,
				duration: node.duration,
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

		case "block_action":
			return ctx.action.pushEffect({ kind: "block_action", what: node.what });

		// ── Decks ─────────────────────────────────────────────────────────────

		case "discard_from": {
			const count = resolveExpr(node.count, ctx);
			return ctx.action.pushEffect({
				kind: "discard_from",
				pile: node.pile,
				count,
			});
		}

		case "draw_from": {
			const count = resolveExpr(node.count, ctx);
			return ctx.action.pushEffect({
				kind: "draw_from",
				pile: node.pile,
				count,
			});
		}

		// ── Dungeon ───────────────────────────────────────────────────────────

		case "advance_dungeon_level": {
			const amount = resolveExpr(node.amount, ctx);
			return ctx.action.pushEffect({ kind: "advance_dungeon_level", amount });
		}

		// ── Misc ──────────────────────────────────────────────────────────────

		case "set_no_reward": {
			const to = resolveEntityRef(node.to, ctx) ?? node.to;
			return ctx.action.pushEffect({ kind: "set_no_reward", to });
		}

		// ── Patch-16 Lote B ───────────────────────────────────────────────────

		case "prevent_next_damage": {
			const to = resolveEntityRef(node.to, ctx) ?? node.to;
			return ctx.action.pushEffect({ kind: "prevent_next_damage", to });
		}

		case "ignore_next_targeting": {
			const to = resolveEntityRef(node.to, ctx) ?? node.to;
			return ctx.action.pushEffect({ kind: "ignore_next_targeting", to });
		}

		case "recover_dungeon": {
			const count = resolveExpr(node.count, ctx);
			return ctx.action.pushEffect({ kind: "recover_dungeon", count });
		}

		case "mark_target": {
			const to = resolveEntityRef(node.to, ctx) ?? node.to;
			return ctx.action.pushEffect({ kind: "mark_target", to });
		}

		case "prevent_dungeon_discard":
			return ctx.action.pushEffect({ kind: "prevent_dungeon_discard" });

		case "draw_and_choose": {
			const reveal = resolveExpr(node.reveal, ctx);
			const keep = resolveExpr(node.keep, ctx);
			return ctx.action.pushEffect({
				kind: "draw_and_choose",
				pile: node.pile,
				reveal,
				keep,
			});
		}

		case "reveal_dungeon": {
			const count = resolveExpr(node.count, ctx);
			return ctx.action.pushEffect({ kind: "reveal_dungeon", count });
		}

		case "grant_pending_reward":
			return ctx.action.pushEffect({
				kind: "grant_pending_reward",
				rewardType: node.rewardType,
				cardName: node.cardName,
			});

		// ── Composição ────────────────────────────────────────────────────────

		case "if": {
			const cond = resolveCondition(node.when, ctx);
			const branch = cond ? node.then : (node.else ?? []);
			return evaluate(branch, ctx);
		}

		case "choose_one": {
			const options = node.options.map((opt) => ({
				id: opt.label,
				label: opt.label,
				effect: opt.effect, // ramo DSL armazenado no pendingSkillChoice
			}));
			return ctx.action.requestChoice(options);
		}

		case "for_each": {
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

		case "noop":
			return ctx.state;
	}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

import type { Duration } from "../../ecs/types";
import type { DurationNode } from "./types";

function mapDuration(d: DurationNode): Duration {
	switch (d.kind) {
		case "once":
			return { kind: "once" };
		case "until_end_of_round":
			return { kind: "this_turn" }; // proxy: this_turn ≈ fim da rodada
		case "until_end_of_combat":
			return { kind: "this_combat" };
		case "while_in_play":
			return { kind: "permanent" }; // proxy: enquanto ativo
		case "passive":
			return { kind: "permanent" };
		case "once_per_round":
			return { kind: "rounds", remaining: 1 };
	}
}
