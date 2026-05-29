// Resolvedor de efeitos da stack.
// Passo 8: drena a stack de efeitos pendentes sem recursão direta no call stack.
//
// Lote 1 (Patch-12): adicionados handlers para os kinds da DSL.
// `kind` (DSL) e `type` (legado) são tratados como equivalentes.

import eventRules from "../../data/event_rules.json";
import type { EntityId } from "../ecs/types";
import type { GameState } from "../state/gameState";
import { applyDamage } from "../systems/damageSystem";
import { applyHeal, applyFullHeal, applySurvive } from "../systems/healSystem";
import { discardFromDungeonDeck } from "../reducer/exploration";
import { log, mapEnemy, mapHero } from "../reducer/utils";
import type { ColorIndex } from "../state/color";
import { MAX_STACK_DEPTH, orderPending } from "./stack";
import type { PendingEffect } from "./stack";

type EventRule = "lifo" | "fifo";
const rules = eventRules as Record<string, EventRule>;

const MAX_DUNGEON_LEVEL: ColorIndex = 4;

function ruleFor(cause: string): EventRule {
	return rules[cause] ?? "lifo";
}

// Aplica um único efeito pendente ao estado.
// Aceita tanto `type` (legado) quanto `kind` (DSL) no campo discriminante.
// Aceita tanto `targetId` (legado) quanto `to` (DSL) para o alvo.
export function resolveEffect(state: GameState, pending: PendingEffect): GameState {
	const effect = pending.effect;
	// Normaliza: kind (DSL) tem prioridade sobre type (legado)
	const effectKind = (effect["kind"] ?? effect["type"]) as string | undefined;
	// Normaliza alvo: to (DSL) tem prioridade sobre targetId (legado)
	const targetId = (effect["to"] ?? effect["targetId"]) as EntityId | undefined;

	switch (effectKind) {
		// ── Dano ─────────────────────────────────────────────────────────────

		case "apply_damage": {
			if (!targetId) return state;
			const amount = effect["amount"] as number;
			return applyDamage(state, targetId, amount, {
				sourceId: pending.source,
				damageType: "physical",
			});
		}

		// ── Cura ─────────────────────────────────────────────────────────────

		case "apply_heal": {
			if (!targetId) return state;
			const amount = effect["amount"] as number;
			return applyHeal(state, targetId, amount);
		}

		case "apply_full_heal": {
			if (!targetId) return state;
			return applyFullHeal(state, targetId);
		}

		case "prevent_destroy": {
			if (!targetId) return state;
			return applySurvive(state, targetId);
		}

		// ── Dungeon ───────────────────────────────────────────────────────────

		case "advance_dungeon_level": {
			const amount = (effect["amount"] as number) ?? 1;
			const newLevel = Math.min(MAX_DUNGEON_LEVEL, state.despertar + amount) as ColorIndex;
			return log({ ...state, despertar: newLevel }, `Despertar avançou para nível ${newLevel}.`);
		}

		case "discard_from": {
			const pile = effect["pile"] as string;
			if (pile === "dungeon") {
				const count = (effect["count"] as number) ?? 1;
				return discardFromDungeonDeck(state, count);
			}
			// pile === "item": deferred (Lote 3/4)
			return state;
		}

		// ── Flags de mecânica ─────────────────────────────────────────────────

		case "block_action": {
			const what = effect["what"] as string;
			switch (what) {
				case "flee":
					return log(
						{ ...state, flags: { ...state.flags, fleeBlocked: true } },
						"Fuga bloqueada.",
					);
				case "heal": {
					// Aplica a todos os heróis ativos (behavior de forge_smoke/healing_rupture)
					// ou ao alvo específico se `who` estiver presente.
					const who = effect["who"] as string | undefined;
					let next = state;
					const targets = who
						? [who]
						: state.heroes.filter((h) => h.status === "active").map((h) => h.id);
					for (const heroId of targets) {
						next = mapHero(next, heroId, (h) => ({ ...h, healBlocked: true }));
					}
					return log(next, "Cura bloqueada.");
				}
				case "dungeon_discard":
					return log(
						{ ...state, flags: { ...state.flags, discardDungeonLocked: true } },
						"Prevenção de descarte de dungeon bloqueada.",
					);
				case "power_use":
				case "dungeon_level_reduction":
					// Implementado via flags — adicionado quando ECS estiver wired (Fase 7)
					return log(state, `[block_action:${what}] — aguarda Fase 7.`);
			}
			return state;
		}

		// ── Modificadores (dual-write: ECS world + legacy combat state) ─────────

		case "add_modifier": {
			const entityId = targetId ?? (effect["to"] as string | undefined);
			if (!entityId) return state;
			const stat = effect["stat"] as string;
			const value = effect["value"] as number;
			const source = pending.source;

			switch (stat) {
				case "damage_bonus":
				case "tohit_bonus": {
					// Ambos adicionam ao bonusNextAttack — mecanismo unificado de bônus de rolagem
					if (!state.combat) return state;
					const prev = state.combat.bonusNextAttack[entityId] ?? [];
					return {
						...state,
						combat: {
							...state.combat,
							bonusNextAttack: {
								...state.combat.bonusNextAttack,
								[entityId]: [...prev, { label: source, value }],
							},
						},
					};
				}
				case "damage_reduction": {
					if (!state.combat) return state;
					const prevRed = state.combat.damageReduction[entityId] ?? 0;
					return {
						...state,
						combat: {
							...state.combat,
							damageReduction: {
								...state.combat.damageReduction,
								[entityId]: prevRed + value,
							},
						},
					};
				}
				case "purple_damage_reduction": {
					// Corrige bug do handler antigo: armazena como número, não boolean
					const key = `purpleDmgReduction::${entityId}`;
					const prevPurple = (state.flags[key] as number | boolean | undefined);
					const prevNum = typeof prevPurple === "number" ? prevPurple : 0;
					return {
						...state,
						flags: { ...state.flags, [key]: prevNum + value },
					};
				}
				default:
					// Stat desconhecido: apenas adiciona ao ECS world (Fase 7 usará isto)
					return state;
			}
		}

		// ── Misc ──────────────────────────────────────────────────────────────

		case "set_no_reward": {
			if (!targetId) return state;
			return log(
				mapEnemy(state, targetId, (e) => ({ ...e, noReward: true })),
				`${targetId}: sem recompensas ao ser derrotado.`,
			);
		}

		case "noop":
			return state;

		default:
			// Efeito desconhecido: ignorado silenciosamente.
			// Passo 9+ adicionará log de aviso.
			return state;
	}
}

// Drena a stack até esvaziar, aplicando efeitos na ordem determinística.
// Garante terminação via MAX_STACK_DEPTH.
export function drainStack(state: GameState): GameState {
	let iterations = 0;

	while (state.effectStack.pending.length > 0) {
		if (++iterations > MAX_STACK_DEPTH) {
			throw new Error(
				`[effectStack] profundidade máxima atingida (${MAX_STACK_DEPTH}). ` +
				"Possível loop de efeito — verifique TriggerComponents encadeados.",
			);
		}

		if (state.paused !== null) break;

		const rule = ruleFor(state.effectStack.pending[0]!.cause);
		const ordered = orderPending(state.effectStack.pending, rule);
		const [next, ...remaining] = ordered as [PendingEffect, ...PendingEffect[]];

		state = {
			...state,
			effectStack: {
				pending: state.effectStack.pending.filter((p) => p.id !== next.id),
				resolving: next,
			},
		};

		state = resolveEffect(state, next);

		state = {
			...state,
			effectStack: { ...state.effectStack, resolving: null },
		};
	}

	return state;
}
