import { type Cost, PAYABLE, requirementCost } from "../../engine/cost";
import type { AbilityGrant } from "../data/abilityTypes";
import type { GameEngine } from "../gameEngine";
import { refRequirementMet } from "../gameEngine";
import { heroesOf, withUnitStats } from "../state/access";
import type { GameState } from "../state/gameState";

const INSUFFICIENT_LIFE = "Vida insuficiente para ativar a habilidade.";

export function heroLifeCost(amount: number): Cost<GameState> {
	return {
		id: `vida:${amount}`,
		canPay(state, heroId) {
			const hero = heroesOf(state).find((entry) => entry.id === heroId);
			return hero && hero.currentLife > amount
				? PAYABLE
				: { ok: false, reason: INSUFFICIENT_LIFE };
		},
		pay: (state, heroId) => {
			const hero = heroesOf(state).find((entry) => entry.id === heroId);
			return hero
				? withUnitStats(state, hero.id, {
						currentLife: hero.currentLife - amount,
					})
				: state;
		},
	};
}

export function awakeningCost(
	engine: GameEngine,
	grant: AbilityGrant,
	src: { kind: string; id: string },
): Cost<GameState> {
	return requirementCost(
		"despertar",
		(state) => refRequirementMet(engine, state, grant.requiresAwakening, src),
		"Esta concessão exige Despertar 4.",
	);
}

export function lifeCostOf(
	grant: AbilityGrant,
	heroId: string | undefined,
): Cost<GameState> | null {
	const hp = grant.activation.cost?.hp ?? 0;
	return heroId && hp > 0 ? heroLifeCost(hp) : null;
}
