import type { SkillContext } from "../data/skillTypes";
import type { GameState } from "../state/gameState";

// Contexto rico passado ao script. Cresce conforme demanda.
// Mantém referência ao SkillContext original para compat com handlers existentes.
//
// Namespaces planejados para Fase 4 (sob demanda):
//   readonly self: { id: string; controller: string; cardName: string }
//   readonly event: SkillContext["triggeredBy"]
//   readonly query: { countHeroDeathsThisRoom(controller: string): number; ... }
//   readonly action: { dealDamage(targetId: string, amount: number): GameState; heal(...): GameState; ... }
//   readonly random: { int(min: number, max: number): number }  // usar RNG seedado
export interface ScriptCtx {
	readonly state: GameState;
	readonly skillCtx: SkillContext;
	readonly log: (msg: string) => GameState;
}

export type ScriptHandler = (ctx: ScriptCtx) => GameState;
