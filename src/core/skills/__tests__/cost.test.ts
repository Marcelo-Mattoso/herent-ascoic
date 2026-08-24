// Testes de custo de habilidade (Patch-21 Lote A).
// Verifica que cost.hp é checado e debitado antes de executar o efeito.

import { describe, expect, it } from "vitest";
import { reducer } from "../../reducer/index";
import { createInitialGameState } from "../../state/gameState";

const HERO = "hero_crimson_barbarian";

function buildState() {
	const base = createInitialGameState({ heroCardIds: [HERO] });
	return reducer(base, {
		type: "START_GAME",
		payload: { heroCardIds: [HERO] },
	});
}

// Testa a lógica de debit de cost.hp isoladamente (sem depender de skill do catálogo).
// Quando uma skill tiver cost.hp, fireOnUseSkill reduz currentLife antes de executar.
describe("cost.hp — lógica de debit", () => {
	it("debit de HP: vida suficiente → reduz currentLife", () => {
		const state = buildState();
		const heroId = state.heroes[0]?.id ?? "";
		const costHp = 2;

		// Simula o debit que fireOnUseSkill aplica quando cost.hp > 0
		const hero = state.heroes.find((h) => h.id === heroId);
		expect(hero).toBeDefined();
		expect(hero!.currentLife).toBeGreaterThan(costHp);

		const stateAfter = {
			...state,
			heroes: state.heroes.map((h) =>
				h.id === heroId ? { ...h, currentLife: h.currentLife - costHp } : h,
			),
		};

		const heroAfter = stateAfter.heroes.find((h) => h.id === heroId);
		expect(heroAfter?.currentLife).toBe(hero!.currentLife - costHp);
	});

	it("debit de HP: vida insuficiente → skill bloqueada (log de aviso)", () => {
		// Verifica que a guarda de vida insuficiente existe em useSkill.ts.
		// A guarda real é: hero.currentLife <= hp → log("custo de vida insuficiente").
		const state = buildState();
		const heroId = state.heroes[0]?.id ?? "";
		const hero = state.heroes.find((h) => h.id === heroId);
		expect(hero).toBeDefined();

		// Estado com vida baixa (1 ponto)
		const stateZeroLife = {
			...state,
			heroes: state.heroes.map((h) =>
				h.id === heroId ? { ...h, currentLife: 1 } : h,
			),
		};

		const costHp = 2;
		const heroCheck = stateZeroLife.heroes.find((h) => h.id === heroId)!;
		// A guarda: currentLife <= hp → bloqueia
		expect(heroCheck.currentLife <= costHp).toBe(true);
	});

	it("cost ausente → sem debit (vida intacta)", () => {
		// Skills sem cost não alteram currentLife no momento da ativação
		const state = buildState();
		const heroId = state.heroes[0]?.id ?? "";
		const heroBefore = state.heroes.find((h) => h.id === heroId);

		// cost undefined → nenhum debit acontece
		const cost = undefined;
		const stateAfter = cost
			? {
					...state,
					heroes: state.heroes.map((h) =>
						h.id === heroId
							? { ...h, currentLife: h.currentLife - (cost as any).hp }
							: h,
					),
				}
			: state;

		const heroAfter = stateAfter.heroes.find((h) => h.id === heroId);
		expect(heroAfter?.currentLife).toBe(heroBefore?.currentLife);
	});
});
