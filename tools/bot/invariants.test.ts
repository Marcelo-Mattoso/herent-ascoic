import { pausedFromLegacy } from "@/core/choices";
import { describe, expect, it } from "vitest";
import type { GameState } from "@/core/state/gameState";
import { createInitialGameState } from "@/core/state/gameState";
import {
	checkCardDuplication,
	checkEffectStack,
	checkLife,
	checkNoProgress,
	checkSerializable,
	countCards,
	findNonSerializable,
	NO_PROGRESS_WINDOW,
} from "./invariants";
import { settled } from "@/core/__tests__/fixtures";
import { initialState } from "../golden/lib";
import { withPaused, withEffectStack, withPendingSkillChoice } from "@/core/state/access";
import { withGame } from "@/engine/state";

const setup = {
	heroCardIds: ["hero_crimson_barbarian"],
	difficulty: "normal",
	bossCardId: "boss_azhakar",
	seed: 1,
} as const;

function base(): GameState {
	return initialState(setup);
}

function withHero(patch: Record<string, unknown>): GameState {
	const state = createInitialGameState({
		heroCardIds: [...setup.heroCardIds],
		difficulty: "normal",
	});
	const hero = {
		id: "h1",
		cardId: "hero_crimson_barbarian",
		maxLife: 10,
		currentLife: 10,
		damage: 1,
		hitBonus: 0,
		dice: 1,
		activeItems: {},
		backpack: [],
		usedPowers: {},
		conditions: [],
		status: "active",
		playerIndex: 0,
		xp: 0,
		...patch,
	};
	return settled(withGame(state, (prevGame) => ({ ...prevGame, heroes: [hero as never] })));
}

describe("serialização", () => {
	it("aceita estado inicial", () => {
		expect(checkSerializable(base())).toBeNull();
	});

	it("rejeita Map, NaN, função e undefined em array", () => {
		expect(findNonSerializable({ a: new Map() })).toContain("$.a");
		expect(findNonSerializable({ a: [1, Number.NaN] })).toContain("$.a[1]");
		expect(findNonSerializable({ f: () => 1 })).toContain("$.f");
		expect(findNonSerializable([undefined])).toContain("$[0]");
	});

	it("reporta violação quando o estado não faz round-trip", () => {
		const bad = withGame(base(), (prevGame) => ({ ...prevGame, gameId: Number.POSITIVE_INFINITY as unknown as string })) as never;
		expect(checkSerializable(bad)?.invariant).toBe("not_serializable");
	});
});

describe("vida", () => {
	it("aceita vida dentro dos limites", () => {
		expect(checkLife(withHero({ currentLife: 0 }))).toBeNull();
		expect(checkLife(withHero({ currentLife: 10 }))).toBeNull();
	});

	it("rejeita vida negativa, acima do máximo e NaN", () => {
		expect(checkLife(withHero({ currentLife: -1 }))?.invariant).toBe(
			"life_out_of_range",
		);
		expect(checkLife(withHero({ currentLife: 11 }))?.invariant).toBe(
			"life_out_of_range",
		);
		expect(checkLife(withHero({ currentLife: Number.NaN }))?.invariant).toBe(
			"life_out_of_range",
		);
	});
});

describe("pilha de efeitos", () => {
	const pending = {
		id: "e",
		seq: 0,
		cause: "c",
		effect: {} as never,
		source: "s" as never,
	};

	it("aceita pilha vazia", () => {
		expect(checkEffectStack(base())).toBeNull();
	});

	it("rejeita pendentes sem pausa e aceita com pausa", () => {
		const dirty = withEffectStack(base(), { pending: [pending], resolving: null });
		expect(checkEffectStack(dirty)?.invariant).toBe("effect_stack_not_drained");
		const paused = withPaused(dirty, pausedFromLegacy("skill_choice", [], pending)) as GameState;
		expect(checkEffectStack(paused)).toBeNull();
	});
});

describe("duplicação de cartas", () => {
	it("aceita o próprio estado como baseline", () => {
		const s = withHero({ backpack: ["item_x"] });
		expect(checkCardDuplication(s, countCards(s))).toBeNull();
	});

	it("rejeita carta além do baseline", () => {
		const s = withHero({ backpack: ["item_x", "item_x"] });
		expect(checkCardDuplication(s, { item_x: 1 })?.invariant).toBe(
			"card_duplication",
		);
	});

	it("contabiliza itens revelados aguardando escolha, mesmo que já tenham saído do deck", () => {
		const baseline = withPendingSkillChoice(base(), {
			skillId: "witch_room_old_vials",
			prompt: "Escolha um item",
			kind: "draw_and_choose",
			discardDeck: "itemDeck",
			options: [
				{ id: "item_forest_charm", label: "Talismã da Mata Antiga" },
				{ id: "item_other", label: "Outro item" },
			],
		});
		const counts = countCards(baseline);
		expect(counts.item_forest_charm).toBeGreaterThanOrEqual(1);
		const selected = withHero({ backpack: ["item_forest_charm"] });
		expect(checkCardDuplication(selected, counts)).toBeNull();
	});

	it("aceita salas de subchefe injetadas", () => {
		const s = withHero({ backpack: ["subboss_room_x"] });
		const injected = withGame(s, (prevGame) => ({ ...prevGame, subbosses: { available: ["subboss_room_x"], defeated: [] } }));
		expect(checkCardDuplication(injected, {})).toBeNull();
		expect(checkCardDuplication(s, {})?.invariant).toBe("card_duplication");
	});
});

describe("sem progresso", () => {
	const same = Array.from({ length: NO_PROGRESS_WINDOW }, () => ({
		type: "GRANT_REWARDS",
	}));

	it("detecta janela de actions idênticas", () => {
		expect(checkNoProgress(same, base())?.invariant).toBe("no_progress");
	});

	it("ignora sequência curta ou variada", () => {
		expect(checkNoProgress(same.slice(1), base())).toBeNull();
		const mixed = [...same.slice(1), { type: "ROLL_DICE" }];
		expect(checkNoProgress(mixed, base())).toBeNull();
	});
});
