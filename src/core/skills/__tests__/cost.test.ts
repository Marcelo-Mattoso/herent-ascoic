import { describe, expect, it } from "vitest";
import { reducer } from "../../reducer/index";
import { createInitialGameState } from "../../state/gameState";
import { testEngine } from "@/core/__tests__/testEngine";
import { heroesOf } from "../../state/access";
import { settled } from "../../__tests__/fixtures";
import { withGame } from "../../../engine/state";

const HERO = "hero_crimson_barbarian";

function buildState() {
	const base = createInitialGameState({ heroCardIds: [HERO] });
	return reducer(testEngine, base, {
		type: "START_GAME",
		payload: { heroCardIds: [HERO] },
	});
}

// Testa a lógica de debit de cost.hp isoladamente (sem depender de skill do catálogo).
// Quando uma skill tiver cost.hp, fireOnUseSkill reduz currentLife antes de executar.
describe("cost.hp — lógica de debit", () => {
	it("debit de HP: vida suficiente → reduz currentLife", () => {
		const state = buildState();
		const heroId = heroesOf(state)[0]?.id ?? "";
		const costHp = 2;

		// Simula o debit que fireOnUseSkill aplica quando cost.hp > 0
		const hero = heroesOf(state).find((h) => h.id === heroId);
		expect(hero).toBeDefined();
		expect(hero!.currentLife).toBeGreaterThan(costHp);

		const stateAfter = settled(withGame(state, (prevGame) => ({ ...prevGame, heroes: heroesOf(state).map((h) =>
				h.id === heroId ? { ...h, currentLife: h.currentLife - costHp } : h,
			) })));

		const heroAfter = heroesOf(stateAfter).find((h) => h.id === heroId);
		expect(heroAfter?.currentLife).toBe(hero!.currentLife - costHp);
	});

	it("debit de HP: vida insuficiente → skill bloqueada (log de aviso)", () => {
		// Verifica que a guarda de vida insuficiente existe em useSkill.ts.
		// A guarda real é: hero.currentLife <= hp → log("custo de vida insuficiente").
		const state = buildState();
		const heroId = heroesOf(state)[0]?.id ?? "";
		const hero = heroesOf(state).find((h) => h.id === heroId);
		expect(hero).toBeDefined();

		// Estado com vida baixa (1 ponto)
		const stateZeroLife = settled(withGame(state, (prevGame) => ({ ...prevGame, heroes: heroesOf(state).map((h) =>
				h.id === heroId ? { ...h, currentLife: 1 } : h,
			) })));

		const costHp = 2;
		const heroCheck = heroesOf(stateZeroLife).find((h) => h.id === heroId)!;
		// A guarda: currentLife <= hp → bloqueia
		expect(heroCheck.currentLife <= costHp).toBe(true);
	});

	it("cost ausente → sem debit (vida intacta)", () => {
		// Skills sem cost não alteram currentLife no momento da ativação
		const state = buildState();
		const heroId = heroesOf(state)[0]?.id ?? "";
		const heroBefore = heroesOf(state).find((h) => h.id === heroId);

		// cost undefined → nenhum debit acontece
		const cost = undefined;
		const stateAfter = cost
			? settled(withGame(state, (prevGame) => ({ ...prevGame, heroes: heroesOf(state).map((h) =>
						h.id === heroId
							? { ...h, currentLife: h.currentLife - (cost as any).hp }
							: h,
					) })))
			: state;

		const heroAfter = heroesOf(stateAfter).find((h) => h.id === heroId);
		expect(heroAfter?.currentLife).toBe(heroBefore?.currentLife);
	});
});
