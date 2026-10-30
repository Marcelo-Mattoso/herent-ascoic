// Estado do combate em andamento dentro de uma sala.
// Criado em COMBAT_START e descartado ao sair da sala.
// Patch 2: phase controla o micro-estado do turno; selectedHeroId é o herói aguardando alvo.
// Patch 5: engajamento 1-para-1 removido (v2 §8.8); múltiplos heróis podem atacar o mesmo inimigo.

import type { ActivationLocks } from "./activation";

export interface BonusEntry {
	readonly source: string;
	readonly value: number;
}

export interface CombatRollResult {
	readonly heroId: string;
	readonly enemyId: string;
	readonly heroResults: readonly number[];
	readonly heroTotal: number;
	readonly heroBreakdown: readonly BonusEntry[];
	readonly enemyResults: readonly number[];
	readonly enemyTotal: number;
	readonly enemyBreakdown: readonly BonusEntry[];
}

export interface CombatPair {
	readonly heroId: string;
	readonly enemyId: string;
}

export type CombatPhase =
	| "selecting_hero" // aguardando o jogador escolher qual herói age
	| "selecting_target" // herói selecionado, aguardando escolha de monstro
	| "resolving" // par herói↔monstro formado, aguardando rolar/resolver
	| "between_heroes" // resolução concluída, transição para próximo herói
	| "direct_damage" // inimigos excedentes fazem rolagens extras de combate
	| "round_end"; // fim de rodada, limpeza antes da próxima

// Bônus de skill individual para o próximo ataque (label = nome da skill, value = valor)
export interface SkillBonusEntry {
	readonly label: string;
	readonly value: number;
}

export interface CombatState {
	round: number;
	phase: CombatPhase;
	selectedHeroId: string | null;
	readonly heroesActed: readonly string[];
	readonly pairs: readonly CombatPair[];
	lastRoll: CombatRollResult | null;
	// Bônus de próximo ataque e redução de dano migrados para ECS world (patch-18 Lote G)
	// bonusNextAttack → ModifierComponent target="damage_dealt" / target="hit_bonus"
	// damageReduction → ModifierComponent target="damage_taken"
	// Presa do Caçador: id do inimigo marcado como alvo preferencial
	prey: string | null;
	// Presa por herói. A marca só beneficia quem a designou.
	readonly preyByHero: Readonly<Record<string, string>>;
	// Seleção interativa de dado pendente (reroll, diceFix)
	pendingDiceSelection?: {
		readonly skillId: string;
		readonly heroId: string;
		readonly side: "hero" | "enemy" | "any";
		readonly filter?: { readonly value?: number; readonly minValue?: number };
		readonly action: "reroll" | "set_to";
		readonly setToValue?: number;
		readonly deltaMax?: number;
	};
	// tohitPenaltyByHero migrado para ECS (patch-18 Lote G)
	// → ModifierComponent target="hit_bonus" com valor negativo
	readonly disabled: ActivationLocks;
}


export function createEmptyCombatState(): CombatState {
	return {
		round: 0,
		phase: "selecting_hero",
		selectedHeroId: null,
		heroesActed: [],
		pairs: [],
		lastRoll: null,
		disabled: {},
		prey: null,
		preyByHero: {},
	};
}
