import type { SkillContext } from "../data/skillTypes";
import type { GameState } from "../state/gameState";

export interface ScriptCtx {
	readonly state: GameState;
	readonly skillCtx: SkillContext;
	// Consultas de estado — puras, sem mutação.
	// Cresce sob demanda (não adicionar especulativamente).
	readonly query: {
		creatureHasSkill(enemyId: string, skillId: string): boolean;
	};
	// Ações — retornam novo GameState sem mutar o atual.
	// Cresce sob demanda. Scripts não chamam applyDamage diretamente.
	readonly action: {
		dealDamage(targetId: string, amount: number): GameState;
	};
	readonly log: (msg: string) => GameState;
}

export type ScriptHandler = (ctx: ScriptCtx) => GameState;
