import { describe, expect, it } from "vitest";
import { createEmptyCombatState } from "../../../state/combatState";
import type { GameState } from "../../../state/gameState";
import { createInitialGameState } from "../../../state/gameState";
import { markLimitUsed, resolveTrigger } from "../resolveTrigger";
import type { EvalCtx, TriggerObject } from "../types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCtx(
	state: GameState,
	opts: {
		dungeonLevel?: number;
		roomEnemyCount?: number;
		sourceId?: string;
	} = {},
): EvalCtx {
	return {
		state,
		skillId: "test_skill",
		params: {},
		sourceId: opts.sourceId ?? "h1",
		targetId: "e1",
		targetIds: ["e1"],
		query: {
			creatureHasSkill: () => false,
			dungeonLevel: () => opts.dungeonLevel ?? 1,
			roomEnemyCount: () => opts.roomEnemyCount ?? 1,
			heroWithLowestLife: () => null,
		},
		action: {
			pushEffect: () => state,
			addComponent: () => state,
			requestChoice: () => state,
			log: () => state,
		},
		withState: (s) => makeCtx(s, opts),
	};
}

function stateWithCombat(base: GameState): GameState {
	return { ...base, combat: createEmptyCombatState() };
}

// ── Testes: when ──────────────────────────────────────────────────────────────

describe("resolveTrigger — when", () => {
	it("sem when: sempre dispara", () => {
		const state = createInitialGameState({ heroCardNames: ["Herói Teste"] });
		const trigger: TriggerObject = { on: "before_attack" };
		expect(resolveTrigger(trigger, makeCtx(state))).toBe(true);
	});

	it("when verdadeiro: dispara", () => {
		const trigger: TriggerObject = {
			on: "combat",
			when: { kind: "compare", op: "gte", left: "$dungeon.level", right: 3 },
		};
		const ctx = makeCtx(
			createInitialGameState({ heroCardNames: ["Herói Teste"] }),
			{ dungeonLevel: 3 },
		);
		expect(resolveTrigger(trigger, ctx)).toBe(true);
	});

	it("when falso: não dispara", () => {
		const trigger: TriggerObject = {
			on: "combat",
			when: { kind: "compare", op: "gte", left: "$dungeon.level", right: 3 },
		};
		const ctx = makeCtx(
			createInitialGameState({ heroCardNames: ["Herói Teste"] }),
			{ dungeonLevel: 1 },
		);
		expect(resolveTrigger(trigger, ctx)).toBe(false);
	});

	it("when com or: dispara se qualquer condição for verdadeira", () => {
		const trigger: TriggerObject = {
			on: "combat",
			when: {
				kind: "or",
				children: [
					{ kind: "compare", op: "eq", left: "$dungeon.level", right: 3 },
					{ kind: "compare", op: "eq", left: "$dungeon.level", right: 4 },
				],
			},
		};
		expect(
			resolveTrigger(
				trigger,
				makeCtx(createInitialGameState({ heroCardNames: ["Herói Teste"] }), {
					dungeonLevel: 4,
				}),
			),
		).toBe(true);
		expect(
			resolveTrigger(
				trigger,
				makeCtx(createInitialGameState({ heroCardNames: ["Herói Teste"] }), {
					dungeonLevel: 2,
				}),
			),
		).toBe(false);
	});

	it("when com not: inverte condição", () => {
		const trigger: TriggerObject = {
			on: "combat",
			when: {
				kind: "not",
				child: {
					kind: "compare",
					op: "eq",
					left: "$room.enemy_count",
					right: 1,
				},
			},
		};
		expect(
			resolveTrigger(
				trigger,
				makeCtx(createInitialGameState({ heroCardNames: ["Herói Teste"] }), {
					roomEnemyCount: 2,
				}),
			),
		).toBe(true);
		expect(
			resolveTrigger(
				trigger,
				makeCtx(createInitialGameState({ heroCardNames: ["Herói Teste"] }), {
					roomEnemyCount: 1,
				}),
			),
		).toBe(false);
	});
});

// ── Testes: limit ─────────────────────────────────────────────────────────────

describe("resolveTrigger — limit", () => {
	it("once_per_game: dispara quando não usado", () => {
		const state = createInitialGameState({ heroCardNames: ["Herói Teste"] });
		const trigger: TriggerObject = { on: "on_use", limit: "once_per_game" };
		expect(resolveTrigger(trigger, makeCtx(state))).toBe(true);
	});

	it("once_per_game: não dispara quando já usado", () => {
		const base = createInitialGameState({ heroCardNames: ["Herói Teste"] });
		const state: GameState = {
			...base,
			oncePer: { game: { "test_skill::h1": true } },
		};
		const trigger: TriggerObject = { on: "on_use", limit: "once_per_game" };
		expect(resolveTrigger(trigger, makeCtx(state))).toBe(false);
	});

	it("once_per_combat: dispara quando não usado", () => {
		const state = stateWithCombat(
			createInitialGameState({ heroCardNames: ["Herói Teste"] }),
		);
		const trigger: TriggerObject = { on: "on_use", limit: "once_per_combat" };
		expect(resolveTrigger(trigger, makeCtx(state))).toBe(true);
	});

	it("once_per_combat: não dispara quando já usado", () => {
		const base = stateWithCombat(
			createInitialGameState({ heroCardNames: ["Herói Teste"] }),
		);
		const state: GameState = {
			...base,
			combat: {
				...base.combat!,
				oncePer: {
					...base.combat!.oncePer,
					combat: { "test_skill::h1": true },
				},
			},
		};
		const trigger: TriggerObject = { on: "on_use", limit: "once_per_combat" };
		expect(resolveTrigger(trigger, makeCtx(state))).toBe(false);
	});

	it("once_per_room: não dispara quando já usado", () => {
		const base = stateWithCombat(
			createInitialGameState({ heroCardNames: ["Herói Teste"] }),
		);
		const state: GameState = {
			...base,
			combat: {
				...base.combat!,
				oncePer: {
					...base.combat!.oncePer,
					room: { "test_skill::h1": true },
				},
			},
		};
		const trigger: TriggerObject = { on: "on_use", limit: "once_per_room" };
		expect(resolveTrigger(trigger, makeCtx(state))).toBe(false);
	});

	it("limit checado antes de when", () => {
		// Se limit já expirou, when nem é avaliado
		const base = createInitialGameState({ heroCardNames: ["Herói Teste"] });
		const state: GameState = {
			...base,
			oncePer: { game: { "test_skill::h1": true } },
		};
		const trigger: TriggerObject = {
			on: "on_use",
			limit: "once_per_game",
			when: { kind: "compare", op: "eq", left: 1, right: 1 }, // sempre true
		};
		expect(resolveTrigger(trigger, makeCtx(state))).toBe(false);
	});
});

// ── Testes: markLimitUsed ─────────────────────────────────────────────────────

describe("markLimitUsed", () => {
	it("marca once_per_game", () => {
		const state = createInitialGameState({ heroCardNames: ["Herói Teste"] });
		const next = markLimitUsed(
			{ on: "on_use", limit: "once_per_game" },
			"test_skill",
			"h1",
			state,
		);
		expect(next.oncePer.game["test_skill::h1"]).toBe(true);
	});

	it("marca once_per_combat", () => {
		const state = stateWithCombat(
			createInitialGameState({ heroCardNames: ["Herói Teste"] }),
		);
		const next = markLimitUsed(
			{ on: "on_use", limit: "once_per_combat" },
			"test_skill",
			"h1",
			state,
		);
		expect(next.combat?.oncePer.combat["test_skill::h1"]).toBe(true);
	});

	it("sem limit: retorna estado inalterado", () => {
		const state = createInitialGameState({ heroCardNames: ["Herói Teste"] });
		const next = markLimitUsed({ on: "on_use" }, "test_skill", "h1", state);
		expect(next).toBe(state);
	});

	it("uma vez marcado, resolveTrigger retorna false", () => {
		const state = createInitialGameState({ heroCardNames: ["Herói Teste"] });
		const trigger: TriggerObject = { on: "on_use", limit: "once_per_game" };
		const after = markLimitUsed(trigger, "test_skill", "h1", state);
		expect(resolveTrigger(trigger, makeCtx(after))).toBe(false);
	});
});
