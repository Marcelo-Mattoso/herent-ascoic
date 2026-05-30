// Resolvedor de efeitos da stack.
// Passo 8: drena a stack de efeitos pendentes sem recursão direta no call stack.
//
// Lote 1 (Patch-12): adicionados handlers para os kinds da DSL.
// `kind` (DSL) e `type` (legado) são tratados como equivalentes.

import eventRules from "../../data/event_rules.json";
import type { EntityId } from "../ecs/types";
import { discardFromDungeonDeck } from "../reducer/exploration";
import { log, mapEnemy, mapHero, shuffleRng } from "../reducer/utils";
import type { ColorIndex } from "../state/color";
import type { GameState, PendingReward } from "../state/gameState";
import { applyDamage } from "../systems/damageSystem";
import { applyFullHeal, applyHeal, applySurvive } from "../systems/healSystem";
import type { PendingEffect } from "./stack";
import { MAX_STACK_DEPTH, orderPending } from "./stack";

type EventRule = "lifo" | "fifo";
const rules = eventRules as Record<string, EventRule>;

const MAX_DUNGEON_LEVEL: ColorIndex = 4;

function ruleFor(cause: string): EventRule {
	return rules[cause] ?? "lifo";
}

// Aplica um único efeito pendente ao estado.
// Aceita tanto `type` (legado) quanto `kind` (DSL) no campo discriminante.
// Aceita tanto `targetId` (legado) quanto `to` (DSL) para o alvo.
export function resolveEffect(
	state: GameState,
	pending: PendingEffect,
): GameState {
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
			const newLevel = Math.min(
				MAX_DUNGEON_LEVEL,
				state.despertar + amount,
			) as ColorIndex;
			return log(
				{ ...state, despertar: newLevel },
				`Despertar avançou para nível ${newLevel}.`,
			);
		}

		case "discard_from": {
			const pile = effect["pile"] as string;
			const count = (effect["count"] as number) ?? 1;
			if (pile === "dungeon") {
				return discardFromDungeonDeck(state, count);
			}
			if (pile === "item") {
				// Descarta automaticamente o primeiro item disponível (mochila ou slot equipado).
				// Comportamento compatível com o handler item_or_discardDungeon legado.
				let next = state;
				for (let i = 0; i < count; i++) {
					next = discardFirstAvailableItem(next);
				}
				return next;
			}
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
						: state.heroes
								.filter((h) => h.status === "active")
								.map((h) => h.id);
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
				case "tohit_penalty": {
					if (!state.combat) return state;
					const prevPenalty = state.combat.tohitPenaltyByHero[entityId] ?? 0;
					return {
						...state,
						combat: {
							...state.combat,
							tohitPenaltyByHero: {
								...state.combat.tohitPenaltyByHero,
								[entityId]: prevPenalty + value,
							},
						},
					};
				}
				case "purple_damage_reduction": {
					// Corrige bug do handler antigo: armazena como número, não boolean
					const key = `purpleDmgReduction::${entityId}`;
					const prevPurple = state.flags[key] as number | boolean | undefined;
					const prevNum = typeof prevPurple === "number" ? prevPurple : 0;
					return {
						...state,
						flags: {
							...state.flags,
							[key]: (prevNum + value) as unknown as boolean,
						},
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

		// ── Patch-16 Lote B — novos kinds ────────────────────────────────────

		case "prevent_next_damage": {
			const entityId = targetId;
			if (!entityId) return state;
			return log(
				{
					...state,
					flags: {
						...state.flags,
						[`firstDamagePrevented::${entityId}`]: true,
					},
				},
				`${entityId}: próximo dano prevenido.`,
			);
		}

		case "ignore_next_targeting": {
			const heroId = targetId;
			if (!heroId || !state.combat) return state;
			return log(
				{
					...state,
					combat: {
						...state.combat,
						targetProtectionByHero: {
							...state.combat.targetProtectionByHero,
							[heroId]: true,
						},
					},
				},
				`${heroId}: próximo efeito que escolha este herói será ignorado.`,
			);
		}

		case "recover_dungeon": {
			const count = (effect["count"] as number) ?? 1;
			const { discarded } = state.decks.dungeonDeck;
			if (discarded.length === 0)
				return log(state, "Descarte de dungeon vazio — nada a recuperar.");
			const toRecover = discarded.slice(0, count);
			const remaining = discarded.slice(count);
			const { value: reshuffled, next: rng } = shuffleRng(
				[...state.decks.dungeonDeck.available, ...toRecover],
				state.rng,
			);
			return log(
				{
					...state,
					rng,
					decks: {
						...state.decks,
						dungeonDeck: {
							...state.decks.dungeonDeck,
							available: reshuffled,
							discarded: remaining,
						},
					},
				},
				`${count} carta(s) de dungeon recuperada(s) do descarte.`,
			);
		}

		case "mark_target": {
			const preyId = targetId;
			if (!preyId || !state.combat) return state;
			return log(
				{ ...state, combat: { ...state.combat, prey: preyId } },
				`${preyId} marcado como Presa.`,
			);
		}

		case "prevent_dungeon_discard":
			return log(
				{ ...state, flags: { ...state.flags, dungeonDiscardPrevented: true } },
				"Próximo descarte de dungeon será prevenido.",
			);

		case "draw_from": {
			const pile = effect["pile"] as string;
			const count = (effect["count"] as number) ?? 1;
			if (pile === "artifact_deck") {
				const { available } = state.decks.artifactDeck;
				const drawn = available.slice(0, count);
				if (drawn.length === 0)
					return log(state, "Deck de artefatos vazio — nenhum artefato sacado.");
				const newRewards: PendingReward[] = drawn.map((name) => ({
					type: "artifact" as const,
					cardName: name as string,
					requiresBearer: false,
				}));
				return log(
					{
						...state,
						decks: {
							...state.decks,
							artifactDeck: {
								...state.decks.artifactDeck,
								available: available.slice(count),
							},
						},
						pendingRewards: [...state.pendingRewards, ...newRewards],
					},
					`${drawn.length} artefato(s) sacado(s).`,
				);
			}
			if (pile === "item_deck") {
				const { available } = state.decks.itemDeck;
				const drawn = available.slice(0, count);
				if (drawn.length === 0)
					return log(state, "Deck de itens vazio — nenhum item sacado.");
				const newRewards: PendingReward[] = drawn.map((name) => ({
					type: "item" as const,
					cardName: name as string,
					requiresBearer: false,
				}));
				return log(
					{
						...state,
						decks: {
							...state.decks,
							itemDeck: {
								...state.decks.itemDeck,
								available: available.slice(count),
							},
						},
						pendingRewards: [...state.pendingRewards, ...newRewards],
					},
					`${drawn.length} item(s) sacado(s).`,
				);
			}
			return state;
		}

		case "draw_and_choose": {
			const pile = effect["pile"] as string;
			const reveal = (effect["reveal"] as number) ?? 2;
			const skillId = (pending.source as string | undefined) ?? "draw_and_choose";
			const deckKey =
				pile === "item_deck"
					? "itemDeck"
					: pile === "artifact_deck"
						? "artifactDeck"
						: null;
			if (!deckKey) return state;
			const deck = state.decks[deckKey as keyof typeof state.decks];
			const drawn = deck.available.slice(0, reveal);
			if (drawn.length === 0)
				return log(state, "Deck vazio — nenhuma carta revelada.");
			const rewardType: "item" | "artifact" =
				pile === "item_deck" ? "item" : "artifact";
			const options = drawn.map((name) => ({
				id: name as string,
				label: name as string,
				effect: [
					{
						kind: "grant_pending_reward" as const,
						rewardType,
						cardName: name as string,
					},
				],
			}));
			return log(
				{
					...state,
					decks: {
						...state.decks,
						[deckKey]: { ...deck, available: deck.available.slice(reveal) },
					},
					pendingSkillChoice: {
						skillId,
						prompt: "Escolha 1 carta para ficar (as outras são descartadas):",
						options,
					},
				},
				`${drawn.length} carta(s) revelada(s) para escolha.`,
			);
		}

		case "reveal_dungeon": {
			const count = (effect["count"] as number) ?? 1;
			const skillId = (pending.source as string | undefined) ?? "reveal_dungeon";
			const topCards = state.decks.dungeonDeck.available.slice(0, count);
			if (topCards.length === 0)
				return log(state, "Deck de dungeon vazio.");
			const options = [
				...topCards.map((name, i) => ({
					id: `card_${i}`,
					label: name as string,
				})),
				{ id: "ok", label: "Confirmar (manter ordem atual)" },
			];
			return {
				...state,
				pendingSkillChoice: {
					skillId,
					prompt: `Próxima(s) ${topCards.length} carta(s) do deck de dungeon:`,
					options,
				},
			};
		}

		case "grant_pending_reward": {
			const cardName = effect["cardName"] as string;
			const rewardType = effect["rewardType"] as "item" | "artifact";
			const reward: PendingReward = { type: rewardType, cardName, requiresBearer: false };
			return log(
				{ ...state, pendingRewards: [...state.pendingRewards, reward] },
				`${cardName} adicionado às recompensas pendentes.`,
			);
		}

		default:
			// Efeito desconhecido: ignorado silenciosamente.
			// Passo 9+ adicionará log de aviso.
			return state;
	}
}

// Descarta o primeiro item disponível (mochila primeiro, depois slot equipado).
function discardFirstAvailableItem(state: GameState): GameState {
	// Tentar mochila primeiro
	const heroWithBackpack = state.heroes.find(
		(h) => h.status === "active" && h.backpack.length > 0,
	);
	if (heroWithBackpack) {
		const [removed, ...rest] = heroWithBackpack.backpack;
		return log(
			mapHero(state, heroWithBackpack.id, (h) => ({ ...h, backpack: rest })),
			`Tributo: ${removed} descartado da mochila.`,
		);
	}
	// Fallback: primeiro slot equipado de qualquer herói ativo
	const heroWithItem = state.heroes.find(
		(h) => h.status === "active" && Object.values(h.activeItems).some(Boolean),
	);
	if (heroWithItem) {
		const slot = (
			Object.keys(
				heroWithItem.activeItems,
			) as (keyof typeof heroWithItem.activeItems)[]
		).find((k) => heroWithItem.activeItems[k]);
		if (slot) {
			return log(
				mapHero(state, heroWithItem.id, (h) => {
					const items = { ...h.activeItems };
					delete items[slot];
					return { ...h, activeItems: items };
				}),
				`Tributo: ${heroWithItem.activeItems[slot]} descartado.`,
			);
		}
	}
	return log(state, "Tributo: nenhum item disponível para descartar.");
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
		const [next] = ordered as [PendingEffect, ...PendingEffect[]];

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
