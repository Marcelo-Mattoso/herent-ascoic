// Testes do Passo 9 — Projeção Completa.
// Verifica: aiView não expõe campos privados (rng, world, etc.);
// replayView cobre o que o replay viewer precisa;
// playerView expõe campos pós-ECS (paused, pendingSkillChoice).

import { describe, expect, it } from "vitest";
import { reducer } from "../reducer/index";
import { createInitialGameState } from "../state/gameState";
import { aiView } from "./aiView";
import { playerView } from "./playerView";
import { replayView } from "./replayView";

const HERO = "Bárbaro Rubro";

function buildStartedState() {
	const base = createInitialGameState({ heroCardNames: [HERO] });
	return reducer(base, {
		type: "START_GAME",
		payload: { heroCardNames: [HERO] },
	});
}

// ── aiView — campos privados ausentes ────────────────────────────────────────

describe("aiView — privacidade", () => {
	it("não expõe state.rng", () => {
		const state = buildStartedState();
		const view = aiView(state, { playerIndex: 0 });
		expect(view).not.toHaveProperty("rng");
	});

	it("não expõe state.world", () => {
		const state = buildStartedState();
		const view = aiView(state, { playerIndex: 0 });
		expect(view).not.toHaveProperty("world");
	});

	it("não expõe state.effectStack", () => {
		const state = buildStartedState();
		const view = aiView(state, { playerIndex: 0 });
		expect(view).not.toHaveProperty("effectStack");
	});

	it("não expõe state.actionLog", () => {
		const state = buildStartedState();
		const view = aiView(state, { playerIndex: 0 });
		expect(view).not.toHaveProperty("actionLog");
	});

	it("não expõe state.decks (deck tops são informação privada)", () => {
		const state = buildStartedState();
		const view = aiView(state, { playerIndex: 0 });
		expect(view).not.toHaveProperty("decks");
	});

	it("não expõe state.rng mesmo após ações aleatórias", () => {
		let state = buildStartedState();
		state = reducer(state, { type: "REVEAL_ROOM" });
		const view = aiView(state, { playerIndex: 0 });
		expect(view).not.toHaveProperty("rng");
	});
});

// ── aiView — campos obrigatórios presentes ───────────────────────────────────

describe("aiView — contrato de campos", () => {
	it("expõe status", () => {
		const state = buildStartedState();
		const view = aiView(state, { playerIndex: 0 });
		expect(view.status).toBe(state.status);
	});

	it("visibleEntities contém heróis ativos", () => {
		const state = buildStartedState();
		const view = aiView(state, { playerIndex: 0 });
		const heroEntities = view.visibleEntities.filter((e) => e.type === "hero");
		const activeHeroes = state.heroes.filter((h) => h.status === "active");
		expect(heroEntities.length).toBe(activeHeroes.length);
	});

	it("visibleEntities contém dados de saúde dos heróis", () => {
		const state = buildStartedState();
		const view = aiView(state, { playerIndex: 0 });
		const heroEntity = view.visibleEntities.find((e) => e.type === "hero");
		expect(heroEntity).toBeDefined();
		expect(typeof heroEntity!.currentHealth).toBe("number");
		expect(typeof heroEntity!.maxHealth).toBe("number");
	});

	it("currentHealth do EntityView corresponde a currentLife do HeroState", () => {
		const state = buildStartedState();
		const view = aiView(state, { playerIndex: 0 });
		const heroEntity = view.visibleEntities.find((e) => e.type === "hero");
		const heroState = state.heroes.find((h) => h.id === heroEntity!.id);
		expect(heroEntity!.currentHealth).toBe(heroState!.currentLife);
		expect(heroEntity!.maxHealth).toBe(heroState!.maxLife);
	});

	it("conditions de EntityView corresponde a conditions do HeroState", () => {
		const state = buildStartedState();
		const view = aiView(state, { playerIndex: 0 });
		const heroEntity = view.visibleEntities.find((e) => e.type === "hero");
		const heroState = state.heroes.find((h) => h.id === heroEntity!.id);
		expect(heroEntity!.conditions).toEqual(heroState!.conditions);
	});

	it("availableActions é um array (skeleton pode estar vazio)", () => {
		const state = buildStartedState();
		const view = aiView(state, { playerIndex: 0 });
		expect(Array.isArray(view.availableActions)).toBe(true);
	});

	it("inimigos ativos aparecem em visibleEntities quando em combate", () => {
		let state = buildStartedState();
		state = reducer(state, { type: "REVEAL_ROOM" });
		const view = aiView(state, { playerIndex: 0 });
		const enemyEntities = view.visibleEntities.filter(
			(e) => e.type === "enemy",
		);
		const activeEnemies = state.activeEnemies.filter(
			(e) => e.status === "active",
		);
		expect(enemyEntities.length).toBe(activeEnemies.length);
	});
});

// ── replayView — contrato ─────────────────────────────────────────────────────

describe("replayView — contrato", () => {
	it("retorna os mesmos campos que playerView (deep equal)", () => {
		const state = buildStartedState();
		expect(replayView(state)).toEqual(playerView(state));
	});

	it("não expõe rng", () => {
		const state = buildStartedState();
		const view = replayView(state);
		expect(view).not.toHaveProperty("rng");
	});

	it("não expõe world", () => {
		const state = buildStartedState();
		const view = replayView(state);
		expect(view).not.toHaveProperty("world");
	});

	it("expõe status", () => {
		const state = buildStartedState();
		expect(replayView(state).status).toBe(state.status);
	});

	it("expõe heroes com referência idêntica a state.heroes", () => {
		const state = buildStartedState();
		expect(replayView(state).heroes).toBe(state.heroes);
	});

	it("expõe enemies com referência idêntica a state.activeEnemies", () => {
		const state = buildStartedState();
		expect(replayView(state).enemies).toBe(state.activeEnemies);
	});

	it("expõe decks para reconstrução de estado durante replay", () => {
		const state = buildStartedState();
		const view = replayView(state);
		expect(view).toHaveProperty("decks");
		expect(view.decks.dungeonDeck).toBeDefined();
	});
});

// ── playerView — campos pós-ECS adicionados no Passo 9 ───────────────────────

describe("playerView — campos pós-ECS (passo 9)", () => {
	it("expõe paused (null por padrão)", () => {
		const state = buildStartedState();
		const view = playerView(state);
		expect(view).toHaveProperty("paused");
		expect(view.paused).toBeNull();
	});

	it("expõe pendingSkillChoice (null por padrão)", () => {
		const state = buildStartedState();
		const view = playerView(state);
		expect(view).toHaveProperty("pendingSkillChoice");
		expect(view.pendingSkillChoice).toBeNull();
	});

	it("paused reflete state.paused quando preenchido", () => {
		const state = buildStartedState();
		// Injetar estado pausado diretamente
		const pausedState = {
			...state,
			paused: {
				reason: "skill_choice" as const,
				options: [{ id: "x", label: "X" }],
				resumeFrom: {
					id: "effect-0-DamageDealt",
					seq: 0,
					cause: "DamageDealt",
					effect: { type: "noop" },
					source: "h1",
				},
			},
		};
		const view = playerView(pausedState);
		expect(view.paused).not.toBeNull();
		expect(view.paused!.reason).toBe("skill_choice");
	});
});
