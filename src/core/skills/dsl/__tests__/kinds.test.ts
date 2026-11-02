import { describe, expect, it } from "vitest";
import { testEngine } from "@/core/__tests__/testEngine";
import { createAscensaoKinds } from "../../../composition";
import { createEngine } from "../../../../engine/compose";
import { seededDice } from "../../../../engine/dice";
import {
	createKindRegistryFrom,
	type KindNode,
} from "../../../../engine/kinds";
import { resolveEffect } from "../../../effects/resolver";
import { createEmptyCombatState } from "../../../state/combatState";
import type { EnemyState } from "../../../state/enemyState";
import type { GameState } from "../../../state/gameState";
import { createInitialGameState } from "../../../state/gameState";
import type { HeroState } from "../../../state/heroState";
import { evaluate } from "../evaluate";
import { builtinPackage } from "../kinds/builtin";
import { ascensaoPackage } from "../kinds/ascensao";
import { resolveCondition } from "../resolveCondition";
import {
	resolveEntityListRef,
	resolveEntityRef,
	resolveExpr,
} from "../resolveExpr";
import type { EffectNode, EvalCtx } from "../types";
import type { GameKinds } from "../../../gameEngine";
import { awakeningOf, deckOf, decksOf, enemiesOf, heroesOf, withAwakening, withDecks } from "@/core/state/access";
import { settled } from "../../../__tests__/fixtures";
import { pendingSkillChoiceOf, scopedFlagOf } from "../../../state/access";
import { withGame, gameOf } from "../../../../engine/state";

function hero(overrides: Partial<HeroState> = {}): HeroState {
	return {
		id: "h1",
		cardId: "hero_crimson_barbarian",
		maxLife: 10,
		currentLife: 5,
		damage: 3,
		hitBonus: 0,
		dice: 2,
		activeItems: {},
		backpack: [],
		usedPowers: {},
		conditions: [],
		status: "active",
		playerIndex: 0,
		xp: 0,
		...overrides,
	};
}

function enemy(overrides: Partial<EnemyState> = {}): EnemyState {
	return {
		id: "e1",
		cardId: "creature_dark_cave_goblin",
		maxLife: 5,
		currentLife: 5,
		damage: 2,
		hitBonus: 0,
		dice: 1,
		tokens: {},
		conditions: [],
		firstDamageTakenThisTurn: false,
		status: "active",
		...overrides,
	};
}

function baseState(): GameState {
	return settled(withGame(createInitialGameState({ heroCardIds: ["hero_crimson_barbarian"] }), (prevGame) => ({ ...prevGame, heroes: [hero()], activeEnemies: [enemy()], combat: createEmptyCombatState() })));
}

type Pushed = { kind: string; [key: string]: unknown };

function makeCtx(
	state: GameState,
	opts: {
		params?: Record<string, unknown>;
		pushed?: Pushed[];
		components?: unknown[];
		choices?: unknown[];
		logs?: string[];
	} = {},
): EvalCtx {
	const pushed = opts.pushed ?? [];
	const ctx: EvalCtx = {
		engine: testEngine,
		state,
		skillId: "skill_teste",
		params: opts.params ?? {},
		sourceId: "h1",
		targetId: "e1",
		targetIds: ["e1"],
		query: {
			creatureHasSkill: (id, skill) => id === "e1" && skill === "skill_x",
			dungeonLevel: () => 2,
			roomEnemyCount: () => 3,
			heroWithLowestLife: () => "h1",
		},
		action: {
			pushEffect(node) {
				pushed.push(node as Pushed);
				return state;
			},
			addComponent(_id, component) {
				opts.components?.push(component);
				return state;
			},
			requestChoice(options) {
				opts.choices?.push(options);
				return state;
			},
			log(message) {
				opts.logs?.push(message);
				return state;
			},
		},
		withState: (next) => makeCtx(next, opts),
	};
	return ctx;
}

function pushedBy(node: EffectNode, state = baseState()): Pushed[] {
	const pushed: Pushed[] = [];
	evaluate([node], makeCtx(state, { pushed }));
	return pushed;
}

function resolveWith(state: GameState, effect: Record<string, unknown>) {
	return resolveEffect(testEngine, state, {
		id: "p",
		seq: 0,
		cause: "teste",
		effect,
		source: "skill_teste",
	});
}

describe("kinds genéricos (builtin) — evaluate e resolve", () => {
	it("i_damage: empurra o descritor e o resolve aplica dano (alias apply_damage)", () => {
		expect(
			pushedBy({ kind: "i_damage", to: "$target", amount: 3, minimum: 4 }),
		).toEqual([{ kind: "i_damage", to: "e1", amount: 4 }]);
		for (const name of ["i_damage", "apply_damage"]) {
			const next = resolveWith(baseState(), {
				kind: name,
				to: "e1",
				amount: 2,
			});
			expect(enemiesOf(next)[0]?.currentLife).toBe(3);
		}
	});

	it("i_heal e i_full_heal", () => {
		expect(pushedBy({ kind: "i_heal", to: "$source", amount: 3 })).toEqual([
			{ kind: "i_heal", to: "h1", amount: 3 },
		]);
		expect(
			heroesOf(
				resolveWith(baseState(), { kind: "i_heal", to: "h1", amount: 3 }),
			)[0]?.currentLife,
		).toBe(8);
		expect(pushedBy({ kind: "i_full_heal", to: "$source" })).toEqual([
			{ kind: "i_full_heal", to: "h1" },
		]);
		expect(
			heroesOf(
				resolveWith(baseState(), { kind: "apply_full_heal", targetId: "h1" }),
			)[0]?.currentLife,
		).toBe(10);
	});

	it("i_prevent_destroy mantém o herói em pé com 1 de vida", () => {
		expect(pushedBy({ kind: "i_prevent_destroy", to: "$source" })).toHaveLength(
			1,
		);
		const state = settled(withGame(baseState(), (prevGame) => ({ ...prevGame, heroes: [hero({ currentLife: 0 })] })));
		expect(
			heroesOf(resolveWith(state, { kind: "prevent_destroy", to: "h1" }))[0]
				?.currentLife,
		).toBe(1);
	});

	it("p_modifier empurra com origem e o resolve grava o modificador no ECS", () => {
		const [pushed] = pushedBy({
			kind: "p_modifier",
			to: "$source",
			stat: "s_hit_bonus",
			operation: "add",
			value: 2,
			duration: { kind: "until_end_of_combat" },
		});
		expect(pushed).toMatchObject({
			kind: "p_modifier",
			to: "h1",
			value: 2,
			sourceEntityId: "h1",
		});
		const next = resolveWith(baseState(), pushed as Record<string, unknown>);
		expect(gameOf(next).world).not.toBe(gameOf(baseState()).world);
	});

	it("add_trigger instala o componente com a duração mapeada", () => {
		const components: unknown[] = [];
		evaluate(
			[
				{
					kind: "add_trigger",
					to: "$source",
					on: "evt_hit",
					effect: [{ kind: "i_noop" }],
					duration: { kind: "until_end_of_round" },
					priority: 3,
				},
			],
			makeCtx(baseState(), { components }),
		);
		expect(components).toEqual([
			expect.objectContaining({
				type: "trigger",
				on: "evt_hit",
				duration: { kind: "this_turn" },
				priority: 3,
				source: "skill_teste",
			}),
		]);
	});

	it("i_if escolhe o ramo pela condição registrada", () => {
		const node = (level: number): EffectNode => ({
			kind: "i_if",
			when: {
				kind: "compare",
				op: "gte",
				left: "$dungeon.level",
				right: level,
			},
			then: [{ kind: "i_heal", to: "$source", amount: 1 }],
			else: [{ kind: "i_heal", to: "$source", amount: 2 }],
		});
		expect(pushedBy(node(2))[0]).toMatchObject({ amount: 1 });
		expect(pushedBy(node(3))[0]).toMatchObject({ amount: 2 });
	});

	it("i_choose_one pede a escolha com rótulos do locale", () => {
		const choices: unknown[] = [];
		evaluate(
			[
				{
					kind: "i_choose_one",
					options: [
						{ id: "a", effect: [{ kind: "i_noop" }] },
						{ id: "b", effect: [{ kind: "i_noop" }] },
					],
				},
			],
			makeCtx(baseState(), { choices }),
		);
		expect(choices).toHaveLength(1);
		expect((choices[0] as { id: string }[]).map((o) => o.id)).toEqual([
			"a",
			"b",
		]);
	});

	it("i_for_each repete o corpo por entidade com $target rebindado", () => {
		const pushed: Pushed[] = [];
		evaluate(
			[
				{
					kind: "i_for_each",
					over: "all_heroes",
					as: "h",
					do: [{ kind: "i_heal", to: "$target", amount: 1 }],
				},
			],
			makeCtx(baseState(), { pushed }),
		);
		expect(pushed).toEqual([{ kind: "i_heal", to: "h1", amount: 1 }]);
	});

	it("i_noop não altera o estado (alias noop)", () => {
		const state = baseState();
		expect(pushedBy({ kind: "i_noop" }, state)).toEqual([]);
		expect(resolveWith(state, { type: "noop" })).toBe(state);
	});

	it("dados: i_modify_die, i_reroll e i_set_die abrem a seleção de dado", () => {
		const state: GameState = withGame(baseState(), (prevGame) => ({ ...prevGame, combat: {
				...createEmptyCombatState(),
				lastRoll: {
					heroResults: [3],
					enemyResults: [2],
				} as never,
			} }));
		const modify = pushedBy({
			kind: "i_modify_die",
			delta: 1,
			die_side: "hero",
		})[0];
		expect(modify).toMatchObject({ kind: "i_modify_die", hero_id: "h1" });
		expect(
			gameOf(resolveWith(state, modify as Record<string, unknown>)).combat
				?.pendingDiceSelection,
		).toMatchObject({ deltaMax: 1, side: "hero" });

		const reroll = pushedBy({
			kind: "i_reroll",
			die_side: "any",
			only_if_value: 3,
		})[0];
		expect(
			gameOf(resolveWith(state, reroll as Record<string, unknown>)).combat
				?.pendingDiceSelection,
		).toMatchObject({ action: "reroll", filter: { value: 3 } });

		const set = pushedBy({ kind: "i_set_die", value: 6, die_side: "enemy" })[0];
		expect(
			gameOf(resolveWith(state, set as Record<string, unknown>)).combat
				?.pendingDiceSelection,
		).toMatchObject({ action: "set_to", setToValue: 6 });
		expect(
			gameOf(resolveWith(baseState(), set as Record<string, unknown>)).combat
				?.pendingDiceSelection,
		).toBeUndefined();
	});

	it("i_dispel e i_remove_status limpam condições", () => {
		const state: GameState = settled(withGame(baseState(), (prevGame) => ({ ...prevGame, heroes: [hero({ conditions: ["poison_1", "stun"] })], activeEnemies: [enemy({ conditions: ["poison_2"] })] })));
		expect(pushedBy({ kind: "i_dispel", category: "poison" })).toEqual([
			{ kind: "i_dispel", category: "poison" },
		]);
		const dispelled = resolveWith(state, {
			kind: "i_dispel",
			category: "poison",
		});
		expect(heroesOf(dispelled)[0]?.conditions).toEqual(["stun"]);
		expect(enemiesOf(dispelled)[0]?.conditions).toEqual([]);

		expect(pushedBy({ kind: "i_remove_status", status: "stun" })).toEqual([
			{ kind: "i_remove_status", status: "stun" },
		]);
		const removed = resolveWith(state, {
			kind: "i_remove_status",
			status: "stun",
			to: "h1",
		});
		expect(heroesOf(removed)[0]?.conditions).toEqual(["poison_1"]);
	});

	it("i_mark_target grava a presa do herói", () => {
		const [pushed] = pushedBy({ kind: "i_mark_target", to: "$target" });
		expect(pushed).toEqual({ kind: "i_mark_target", to: "e1", hero_id: "h1" });
		const next = resolveWith(baseState(), pushed as Record<string, unknown>);
		expect(gameOf(next).combat?.preyByHero["h1"]).toBe("e1");
	});

	it("i_prevent_next_damage e i_ignore_next_targeting marcam o estado", () => {
		expect(pushedBy({ kind: "i_prevent_next_damage", to: "$source" })).toEqual([
			{ kind: "i_prevent_next_damage", to: "h1" },
		]);
		expect(
			gameOf(resolveWith(baseState(), { kind: "prevent_next_damage", to: "h1" })).flags[
				"firstDamagePrevented::h1"
			],
		).toBe(true);
		expect(
			pushedBy({ kind: "i_ignore_next_targeting", to: "$source" }),
		).toEqual([{ kind: "i_ignore_next_targeting", to: "h1" }]);
		expect(
			scopedFlagOf(resolveWith(baseState(), { kind: "ignore_next_targeting", to: "h1" }), "combat", "targetProtection", "h1"),
		).toBe(true);
	});

	it("referência não resolvida vira [ERRO] no log da habilidade", () => {
		const logs: string[] = [];
		const ctx = { ...makeCtx(baseState(), { logs }), sourceId: null };
		evaluate([{ kind: "i_heal", to: "$source", amount: 1 }], ctx);
		expect(logs[0]).toContain("[ERRO] i_heal");
	});
});

describe("kinds do jogo — evaluate e resolve", () => {
	it("i_advance_dungeon sobe o Despertar até o teto (alias advance_dungeon_level)", () => {
		expect(pushedBy({ kind: "i_advance_dungeon", amount: 2 })).toEqual([
			{ kind: "i_advance_dungeon", amount: 2 },
		]);
		const state = withAwakening(baseState(), 1);
		expect(
			awakeningOf(resolveWith(state, { kind: "i_advance_dungeon", amount: 2 })),
		).toBe(3);
		expect(
			awakeningOf(resolveWith(state, { kind: "advance_dungeon_level", amount: 9 })),
		).toBe(4);
	});

	it("i_recover_dungeon e i_reveal_dungeon operam sobre o deck", () => {
		const base = baseState();
		const withDeck: GameState = withDecks({
			...base,
		}, {
				...decksOf(base),
				dungeonDeck: {
					...deckOf(base, "dungeonDeck"),
					available: ["a", "b"] as never,
					discarded: ["c", "d"] as never,
				},
			});
		expect(pushedBy({ kind: "i_recover_dungeon", count: 1 })).toEqual([
			{ kind: "i_recover_dungeon", count: 1 },
		]);
		const recovered = resolveWith(withDeck, {
			kind: "i_recover_dungeon",
			count: 1,
		});
		expect(deckOf(recovered, "dungeonDeck").discarded).toEqual(["d"]);
		expect(deckOf(recovered, "dungeonDeck").available).toHaveLength(3);

		expect(pushedBy({ kind: "i_reveal_dungeon", count: 2 })).toEqual([
			{ kind: "i_reveal_dungeon", count: 2 },
		]);
		const revealed = resolveWith(withDeck, {
			kind: "i_reveal_dungeon",
			count: 2,
		});
		expect(pendingSkillChoiceOf(revealed)?.options.map((o) => o.id)).toEqual([
			"card_0",
			"card_1",
			"ok",
		]);
	});

	it("i_grant_reward, i_set_no_reward e i_prevent_dungeon_discard", () => {
		expect(
			pushedBy({
				kind: "i_grant_reward",
				rewardType: "item",
				cardId: "item_x",
			}),
		).toEqual([
			{ kind: "i_grant_reward", rewardType: "item", cardId: "item_x" },
		]);
		const granted = resolveWith(baseState(), {
			kind: "i_grant_reward",
			rewardType: "item",
			cardId: "item_x",
		});
		expect(gameOf(granted).pendingRewards).toEqual([
			{ type: "item", cardId: "item_x", requiresBearer: false },
		]);

		expect(pushedBy({ kind: "i_set_no_reward", to: "$target" })).toEqual([
			{ kind: "i_set_no_reward", to: "e1" },
		]);
		expect(
			gameOf(resolveWith(baseState(), { kind: "i_set_no_reward", to: "e1" })).activeEnemies[0]?.noReward,
		).toBe(true);

		expect(pushedBy({ kind: "i_prevent_dungeon_discard" })).toEqual([
			{ kind: "i_prevent_dungeon_discard" },
		]);
		expect(
			gameOf(resolveWith(baseState(), { kind: "i_prevent_dungeon_discard" })).flags[
				"dungeonDiscardPrevented"
			],
		).toBe(true);
	});

	it("i_draw, i_discard, i_draw_and_choose e p_block usam o vocabulário do jogo", () => {
		const kinds = createAscensaoKinds();
		expect(kinds.vocabularyOf("p_block")["what"]).toContain("dungeon_discard");
		expect(kinds.vocabularyOf("i_draw")["pile"]).toEqual([
			"dungeon",
			"item_deck",
			"artifact_deck",
		]);
		expect(pushedBy({ kind: "p_block", what: "flee" })[0]).toMatchObject({
			kind: "p_block",
			what: "flee",
		});
		expect(
			gameOf(resolveWith(baseState(), { kind: "p_block", what: "flee" })).flags[
				"fleeBlocked"
			],
		).toBe(true);
		expect(
			pushedBy({ kind: "i_draw", pile: "item_deck", count: 1 }),
		).toHaveLength(1);
		expect(
			pushedBy({ kind: "i_discard", pile: "item", count: 1 }),
		).toHaveLength(1);
		expect(
			pushedBy({
				kind: "i_draw_and_choose",
				pile: "item_deck",
				reveal: 2,
				keep: 1,
			}),
		).toHaveLength(1);
	});
});

describe("kind sem implementação em runtime", () => {
	it("evaluate registra [ERRO] e segue", () => {
		const logs: string[] = [];
		evaluate(
			[{ kind: "i_inexistente" } as never],
			makeCtx(baseState(), { logs }),
		);
		expect(logs[0]).toMatch(/\[ERRO\] i_inexistente: kind sem implementação/);
	});

	it("resolveEffect registra [ERRO] no log do estado", () => {
		const next = resolveWith(baseState(), { kind: "i_inexistente" });
		expect(gameOf(next).eventLog.at(-1)).toMatch(/\[ERRO\] efeito "i_inexistente"/);
	});
});

describe("condições registradas", () => {
	const ctx = makeCtx(baseState());
	it("has_skill, compare, and, or, not e any_of", () => {
		expect(
			resolveCondition(
				{ kind: "has_skill", of: "e1", skillId: "skill_x" },
				ctx,
			),
		).toBe(true);
		expect(
			resolveCondition({ kind: "has_skill", of: "e1", skillId: "outra" }, ctx),
		).toBe(false);
		const gte = {
			kind: "compare",
			op: "gte",
			left: "$dungeon.level",
			right: 2,
		} as const;
		const lt = {
			kind: "compare",
			op: "lt",
			left: "$dungeon.level",
			right: 2,
		} as const;
		expect(resolveCondition({ kind: "and", children: [gte, gte] }, ctx)).toBe(
			true,
		);
		expect(resolveCondition({ kind: "and", children: [gte, lt] }, ctx)).toBe(
			false,
		);
		expect(resolveCondition({ kind: "or", children: [lt, gte] }, ctx)).toBe(
			true,
		);
		expect(resolveCondition({ kind: "not", child: lt }, ctx)).toBe(true);
		expect(resolveCondition({ any_of: [lt, gte] }, ctx)).toBe(true);
		expect(
			resolveCondition(
				{ kind: "compare", op: "in", left: "$dungeon.level", right: "$niveis" },
				makeCtx(baseState(), { params: { niveis: [1, 2] } }),
			),
		).toBe(true);
	});

	it("has_condition (jogo) olha as condições da entidade", () => {
		const state = settled(withGame(baseState(), (prevGame) => ({ ...prevGame, heroes: [hero({ conditions: ["stun"] })] })));
		expect(
			resolveCondition(
				{ kind: "has_condition", of: "h1", conditionType: "stun" },
				makeCtx(state),
			),
		).toBe(true);
	});

	it("condição não registrada é recusada", () => {
		expect(() =>
			resolveCondition({ kind: "inexistente" } as never, ctx),
		).toThrow(/sem implementação registrada/);
	});
});

describe("refs registradas", () => {
	const ctx = makeCtx(baseState(), { params: { dano: 4, alvo: "e1" } });
	it("números: params, refs do jogo e propriedades de entidade", () => {
		expect(resolveExpr("$dano", ctx)).toBe(4);
		expect(resolveExpr("$dungeon.level", ctx)).toBe(2);
		expect(resolveExpr("$room.enemy_count", ctx)).toBe(3);
		expect(resolveExpr("$self.currentLife", ctx)).toBe(5);
		expect(resolveExpr("$target.maxLife", ctx)).toBe(5);
		expect(() => resolveExpr("$nada", ctx)).toThrow(/ref desconhecida/);
	});

	it("entidades e listas", () => {
		expect(resolveEntityRef("$source", ctx)).toBe("h1");
		expect(resolveEntityRef("$lowest_life_hero", ctx)).toBe("h1");
		expect(resolveEntityRef("$alvo", ctx)).toBe("e1");
		expect(resolveEntityRef("literal", ctx)).toBe("literal");
		expect(resolveEntityListRef("all_enemies", ctx)).toEqual(["e1"]);
		expect(resolveEntityListRef("$targets", ctx)).toEqual(["e1"]);
	});
});

describe("registro por pacotes", () => {
	const engineSemJogo = () =>
		createKindRegistryFrom<GameState, never, EvalCtx>(
			builtinPackage as never,
		) as unknown as GameKinds;

	it("kinds do jogo não existem sem o pacote do jogo", () => {
		const gameKinds = ascensaoPackage.kinds.map((k) => k.kind);
		expect(gameKinds).toEqual(
			expect.arrayContaining([
				"i_advance_dungeon",
				"i_recover_dungeon",
				"i_reveal_dungeon",
				"i_grant_reward",
				"i_set_no_reward",
				"i_prevent_dungeon_discard",
			]),
		);
		const semJogo = engineSemJogo();
		for (const kind of gameKinds) expect(semJogo.has(kind)).toBe(false);
		expect(semJogo.has("i_damage")).toBe(true);
		const comJogo = createAscensaoKinds();
		for (const kind of gameKinds) expect(comJogo.has(kind)).toBe(true);
	});

	it("nenhum kind do jogo é registrado pelo pacote builtin", () => {
		const builtin = new Set(builtinPackage.kinds.map((k) => k.kind));
		for (const k of ascensaoPackage.kinds)
			expect(builtin.has(k.kind)).toBe(false);
	});

	it("validação recusa kind não registrado, inclusive aninhado", () => {
		const kinds = createAscensaoKinds();
		const semJogo = engineSemJogo();
		const node = {
			kind: "i_if",
			when: { kind: "compare", op: "eq", left: 1, right: 1 },
			then: [{ kind: "i_advance_dungeon", amount: 1 }],
		} as KindNode;
		expect(() => kinds.validate(node, "teste")).not.toThrow();
		expect(() => semJogo.validate(node, "teste")).toThrow(
			/teste > i_if\[1\]: kind "i_advance_dungeon" sem implementação registrada/,
		);
		expect(() =>
			kinds.validate({ kind: "i_damage", to: 1 } as never, "teste"),
		).toThrow(/kind "i_damage" inválido/);
	});

	it("createEngine recusa conteúdo com kind sem implementação", () => {
		const { content, ruleset, requirements, scopes } = testEngine;
		const comHabilidade = content
			.cards()
			.find((card) => content.abilitiesOf(card.id).length > 0);
		expect(comHabilidade).toBeDefined();
		const falso = {
			...content,
			abilitiesOf: (id: string) =>
				id === comHabilidade?.id
					? [
							{
								def: { id: "falsa", effect: [{ kind: "i_inexistente" }] },
								ref: null,
							},
						]
					: content.abilitiesOf(id),
		};
		expect(() =>
			createEngine({
				ruleset,
				content: falso as never,
				dice: seededDice,
				requirements,
				scopes,
				kinds: createAscensaoKinds(),
				nodesOf: (def: { effect?: readonly KindNode[] }) => def.effect ?? [],
			}),
		).toThrow(/i_inexistente.*sem implementação registrada/);
	});
});
