import { describe, expect, it } from "vitest";
import { tickBlockEntries, removeBlocksForSource, consumeOnceBlock } from "../blockHelpers";
import { createInitialGameState } from "../gameState";
import type { GameState } from "../gameState";

function base(): GameState {
	return createInitialGameState({ heroCardIds: [] });
}

function withHero(state: GameState, heroId: string): GameState {
	return {
		...state,
		heroes: [
			...state.heroes,
			{
				id: heroId,
				cardId: "test",
							maxLife: 10,
				currentLife: 10,
				damage: 1,
				hitBonus: 0,
				dice: 1,
				impeto: 0,
				activeItems: {},
				backpack: [],
				usedPowers: {},
				conditions: [],
				status: "active",
				playerIndex: 0,
				xp: 0,
			},
		],
	};
}

// ── tickBlockEntries ──────────────────────────────────────────────────────────

describe("tickBlockEntries — until_end_of_round", () => {
	it("remove entradas until_end_of_round no scope end_of_round e limpa flag", () => {
		let state = base();
		state = {
			...state,
			flags: { ...state.flags, fleeBlocked: true },
			blocks: {
				fleeBlocked: [{ source: "skill_crimson_chains", duration: { kind: "until_end_of_round" } }],
			},
		};

		const after = tickBlockEntries(state, "end_of_round");

		expect(after.blocks.fleeBlocked ?? []).toHaveLength(0);
		expect(after.flags.fleeBlocked).toBeFalsy();
	});

	it("mantém entradas permanent no scope end_of_round", () => {
		let state = base();
		state = {
			...state,
			flags: { ...state.flags, fleeBlocked: true },
			blocks: {
				fleeBlocked: [{ source: "skill_sealed_door", duration: { kind: "permanent" } }],
			},
		};

		const after = tickBlockEntries(state, "end_of_round");

		expect(after.blocks.fleeBlocked).toHaveLength(1);
		expect(after.flags.fleeBlocked).toBeTruthy();
	});

	it("remove apenas a entrada que expira — mantém outras", () => {
		let state = base();
		state = {
			...state,
			flags: { ...state.flags, fleeBlocked: true },
			blocks: {
				fleeBlocked: [
					{ source: "skill_crimson_chains", duration: { kind: "until_end_of_round" } },
					{ source: "skill_sealed_door", duration: { kind: "permanent" } },
				],
			},
		};

		const after = tickBlockEntries(state, "end_of_round");

		expect(after.blocks.fleeBlocked).toHaveLength(1);
		expect(after.flags.fleeBlocked).toBeTruthy(); // ainda tem o permanente
	});

	it("limpa hero.healBlocked quando bloco until_end_of_round expira", () => {
		let state = withHero(base(), "hero_1");
		state = {
			...state,
			heroes: state.heroes.map((h) => (h.id === "hero_1" ? { ...h, healBlocked: true } : h)),
			blocks: {
				"hero_1::healBlocked": [{ source: "skill_forge_smoke", duration: { kind: "until_end_of_round" } }],
			},
		};

		const after = tickBlockEntries(state, "end_of_round");

		expect(after.blocks["hero_1::healBlocked"] ?? []).toHaveLength(0);
		expect(after.heroes.find((h) => h.id === "hero_1")?.healBlocked).toBeFalsy();
	});
});

describe("tickBlockEntries — until_end_of_combat", () => {
	it("remove entradas until_end_of_combat no scope end_of_combat", () => {
		let state = base();
		state = {
			...state,
			flags: { ...state.flags, fleeBlocked: true },
			blocks: {
				fleeBlocked: [{ source: "some_skill", duration: { kind: "until_end_of_combat" } }],
			},
		};

		const after = tickBlockEntries(state, "end_of_combat");

		expect(after.blocks.fleeBlocked ?? []).toHaveLength(0);
		expect(after.flags.fleeBlocked).toBeFalsy();
	});
});

// ── removeBlocksForSource ─────────────────────────────────────────────────────

describe("removeBlocksForSource — while_in_play", () => {
	it("remove blocos while_in_play ao remover fonte e limpa flag", () => {
		let state = base();
		state = {
			...state,
			flags: { ...state.flags, fleeBlocked: true },
			blocks: {
				fleeBlocked: [
					{ source: "purple_forge_chains", duration: { kind: "while_in_play" }, sourceEntityId: "enemy_1" },
				],
			},
		};

		const after = removeBlocksForSource(state, "enemy_1");

		expect(after.blocks.fleeBlocked ?? []).toHaveLength(0);
		expect(after.flags.fleeBlocked).toBeFalsy();
	});

	it("não remove blocos de outras fontes", () => {
		let state = base();
		state = {
			...state,
			flags: { ...state.flags, fleeBlocked: true },
			blocks: {
				fleeBlocked: [
					{ source: "purple_forge_chains", duration: { kind: "while_in_play" }, sourceEntityId: "enemy_2" },
				],
			},
		};

		const after = removeBlocksForSource(state, "enemy_1");

		expect(after.blocks.fleeBlocked).toHaveLength(1);
		expect(after.flags.fleeBlocked).toBeTruthy();
	});
});

// ── consumeOnceBlock ──────────────────────────────────────────────────────────

describe("consumeOnceBlock", () => {
	it("remove primeira entrada once e limpa heroBlocked quando array esvazia", () => {
		let state = withHero(base(), "hero_1");
		state = {
			...state,
			heroes: state.heroes.map((h) => (h.id === "hero_1" ? { ...h, healBlocked: true } : h)),
			blocks: {
				"hero_1::healBlocked": [{ source: "purple_healing_rupture", duration: { kind: "once" } }],
			},
		};

		const after = consumeOnceBlock(state, "hero_1::healBlocked");

		expect(after.blocks["hero_1::healBlocked"] ?? []).toHaveLength(0);
		expect(after.heroes.find((h) => h.id === "hero_1")?.healBlocked).toBeFalsy();
	});

	it("mantém outras entradas ao consumir o once", () => {
		let state = withHero(base(), "hero_1");
		state = {
			...state,
			heroes: state.heroes.map((h) => (h.id === "hero_1" ? { ...h, healBlocked: true } : h)),
			blocks: {
				"hero_1::healBlocked": [
					{ source: "purple_healing_rupture", duration: { kind: "once" } },
					{ source: "skill_forge_smoke", duration: { kind: "until_end_of_round" } },
				],
			},
		};

		const after = consumeOnceBlock(state, "hero_1::healBlocked");

		expect(after.blocks["hero_1::healBlocked"]).toHaveLength(1);
		expect(after.heroes.find((h) => h.id === "hero_1")?.healBlocked).toBeTruthy();
	});

	it("não faz nada se não há entrada once", () => {
		const state = base();
		const after = consumeOnceBlock(state, "hero_1::healBlocked");
		expect(after).toBe(state); // referência idêntica
	});
});
