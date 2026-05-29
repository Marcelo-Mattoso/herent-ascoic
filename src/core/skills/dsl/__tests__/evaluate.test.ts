import { describe, expect, it, vi } from "vitest";
import { evaluate } from "../evaluate";
import type { EffectNode, EvalCtx } from "../types";
import type { GameState } from "../../../state/gameState";
import { createInitialGameState } from "../../../state/gameState";
import { createEmptyCombatState } from "../../../state/combatState";
import type { HeroState } from "../../../state/heroState";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeHero(overrides: Partial<HeroState> = {}): HeroState {
	return {
		id: "h1",
		cardName: "Herói Teste",
		maxLife: 10,
		currentLife: 10,
		damage: 3,
		hitBonus: 0,
		dice: 2,
		impeto: 0,
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

type Pushed = { kind: string; [k: string]: unknown };

function makeMockCtx(
	state: GameState,
	params: Record<string, unknown> = {},
	opts: {
		sourceId?: string;
		targetId?: string;
		targetIds?: string[];
		skillId?: string;
		pushed?: Pushed[];
		dungeonLevel?: number;
		roomEnemyCount?: number;
	} = {},
): EvalCtx & { pushed: Pushed[] } {
	const pushed: Pushed[] = opts.pushed ?? [];

	const ctx: EvalCtx & { pushed: Pushed[] } = {
		state,
		skillId: opts.skillId ?? "test_skill",
		params,
		sourceId: opts.sourceId ?? "h1",
		targetId: opts.targetId ?? "e1",
		targetIds: opts.targetIds ?? ["e1"],
		pushed,
		query: {
			creatureHasSkill: () => false,
			dungeonLevel: () => opts.dungeonLevel ?? 1,
			roomEnemyCount: () => opts.roomEnemyCount ?? 1,
		},
		action: {
			pushEffect(node) {
				pushed.push(node as Pushed);
				return state;
			},
			addComponent(_id, _comp) {
				return state;
			},
			requestChoice(_opts) {
				return state;
			},
			log(_msg) {
				return state;
			},
		},
		withState(s) {
			return makeMockCtx(s, params, { ...opts, pushed });
		},
	};
	return ctx;
}

const BASE_CONFIG = { heroCardNames: ["Herói Teste"] };

function makeState(heroOverrides: Partial<HeroState> = {}): GameState {
	const base = createInitialGameState(BASE_CONFIG);
	return { ...base, heroes: [makeHero(heroOverrides)] };
}

// ── Testes ────────────────────────────────────────────────────────────────────

describe("evaluate — noop", () => {
	it("retorna estado inalterado", () => {
		const state = makeState();
		const ctx = makeMockCtx(state);
		const result = evaluate([{ kind: "noop" }], ctx);
		expect(result).toBe(state);
		expect(ctx.pushed).toHaveLength(0);
	});

	it("array vazio retorna estado inalterado", () => {
		const state = makeState();
		const ctx = makeMockCtx(state);
		const result = evaluate([], ctx);
		expect(result).toBe(state);
	});
});

describe("evaluate — apply_damage", () => {
	it("empurra effect com amount numérico literal", () => {
		const ctx = makeMockCtx(makeState());
		evaluate([{ kind: "apply_damage", to: "$target", amount: 3 }], ctx);
		expect(ctx.pushed).toHaveLength(1);
		expect(ctx.pushed[0]).toMatchObject({ kind: "apply_damage", amount: 3 });
	});

	it("resolve amount via $param", () => {
		const ctx = makeMockCtx(makeState(), { cost: 2 });
		evaluate([{ kind: "apply_damage", to: "$target", amount: "$cost" }], ctx);
		expect(ctx.pushed[0]).toMatchObject({ kind: "apply_damage", amount: 2 });
	});

	it("respeita minimum quando amount < minimum", () => {
		const ctx = makeMockCtx(makeState());
		evaluate([{ kind: "apply_damage", to: "$target", amount: 0, minimum: 1 }], ctx);
		expect(ctx.pushed[0]).toMatchObject({ kind: "apply_damage", amount: 1 });
	});

	it("resolve amount via expressão aritmética ($cost * 3)", () => {
		const ctx = makeMockCtx(makeState(), { cost: 2 });
		const amount: EffectNode = {
			kind: "apply_damage",
			to: "$target",
			amount: { op: "mul", args: ["$cost", 3] },
		};
		evaluate([amount], ctx);
		expect(ctx.pushed[0]).toMatchObject({ kind: "apply_damage", amount: 6 });
	});
});

describe("evaluate — apply_heal", () => {
	it("empurra effect com amount correto", () => {
		const ctx = makeMockCtx(makeState());
		evaluate([{ kind: "apply_heal", to: "$source", amount: 4 }], ctx);
		expect(ctx.pushed).toHaveLength(1);
		expect(ctx.pushed[0]).toMatchObject({ kind: "apply_heal", amount: 4 });
	});
});

describe("evaluate — add_modifier", () => {
	it("empurra add_modifier para a stack com stat e value corretos", () => {
		// add_modifier usa pushEffect → drainStack aplica dual-write (ECS + legacy)
		const state = makeState();
		const ctx = makeMockCtx(state, { value: 3 });
		evaluate(
			[{
				kind: "add_modifier",
				to: "$source",
				stat: "damage_reduction",
				operation: "add",
				value: "$value",
				duration: { kind: "until_end_of_combat" },
			}],
			ctx,
		);
		expect(ctx.pushed).toHaveLength(1);
		expect(ctx.pushed[0]).toMatchObject({
			kind: "add_modifier",
			to: "h1",       // $source resolvido
			stat: "damage_reduction",
			operation: "add",
			value: 3,
		});
	});
});

describe("evaluate — if/then/else", () => {
	it("then executado quando condição verdadeira", () => {
		const ctx = makeMockCtx(makeState(), {}, { dungeonLevel: 3 });
		const effect: EffectNode = {
			kind: "if",
			when: { kind: "compare", op: "gte", left: "$dungeon.level", right: 3 },
			then: [{ kind: "apply_damage", to: "$target", amount: 5 }],
			else: [{ kind: "apply_damage", to: "$target", amount: 1 }],
		};
		evaluate([effect], ctx);
		expect(ctx.pushed[0]).toMatchObject({ kind: "apply_damage", amount: 5 });
	});

	it("else executado quando condição falsa", () => {
		const ctx = makeMockCtx(makeState(), {}, { dungeonLevel: 1 });
		const effect: EffectNode = {
			kind: "if",
			when: { kind: "compare", op: "gte", left: "$dungeon.level", right: 3 },
			then: [{ kind: "apply_damage", to: "$target", amount: 5 }],
			else: [{ kind: "apply_damage", to: "$target", amount: 1 }],
		};
		evaluate([effect], ctx);
		expect(ctx.pushed[0]).toMatchObject({ kind: "apply_damage", amount: 1 });
	});

	it("sem else e condição falsa: nenhum efeito", () => {
		const ctx = makeMockCtx(makeState(), {}, { dungeonLevel: 1 });
		evaluate(
			[{
				kind: "if",
				when: { kind: "compare", op: "gte", left: "$dungeon.level", right: 3 },
				then: [{ kind: "apply_damage", to: "$target", amount: 5 }],
			}],
			ctx,
		);
		expect(ctx.pushed).toHaveLength(0);
	});
});

describe("evaluate — for_each all_heroes", () => {
	it("aplica dano a cada herói ativo", () => {
		const base = createInitialGameState(BASE_CONFIG);
		const state: GameState = {
			...base,
			heroes: [
				makeHero({ id: "h1" }),
				makeHero({ id: "h2" }),
			],
		};
		const pushed: Pushed[] = [];
		const ctx = makeMockCtx(state, {}, { pushed });
		evaluate(
			[{
				kind: "for_each",
				over: "all_heroes",
				as: "$target",
				do: [{ kind: "apply_damage", to: "$target", amount: 1 }],
			}],
			ctx,
		);
		expect(pushed).toHaveLength(2);
	});
});

describe("evaluate — choose_one", () => {
	it("chama requestChoice com as opções corretas", () => {
		const state = makeState();
		const choices: unknown[] = [];
		const ctx = makeMockCtx(state);
		ctx.action.requestChoice = (opts) => {
			choices.push(...opts);
			return state;
		};
		evaluate(
			[{
				kind: "choose_one",
				options: [
					{ label: "Curar 2", effect: [{ kind: "apply_heal", to: "$target", amount: 2 }] },
					{ label: "+2 dano", effect: [{ kind: "apply_damage", to: "$target", amount: 2 }] },
				],
			}],
			ctx,
		);
		expect(choices).toHaveLength(2);
	});
});

describe("evaluate — sequência encadeada", () => {
	it("executa dois efeitos em sequência", () => {
		const ctx = makeMockCtx(makeState(), { cost: 2 });
		evaluate(
			[
				{ kind: "apply_damage", to: "$source", amount: "$cost" },
				{ kind: "apply_damage", to: "$target", amount: { op: "mul", args: ["$cost", 3] } },
			],
			ctx,
		);
		expect(ctx.pushed).toHaveLength(2);
		expect(ctx.pushed[0]).toMatchObject({ kind: "apply_damage", amount: 2 });
		expect(ctx.pushed[1]).toMatchObject({ kind: "apply_damage", amount: 6 });
	});
});
