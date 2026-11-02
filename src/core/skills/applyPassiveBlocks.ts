// Executa os p_block declarados por passivos ao entrar em jogo.
// Modificadores passivos continuam sendo instalados por ecs/installPassive;
// separar os dois impede que uma reavaliação duplique modifiers estáticos.

import type { SkillContext } from "../data/skillTypes";
import { drainStack } from "../effects/resolver";
import { buildScriptCtx } from "../scripts/context";
import { evaluate } from "./dsl/evaluate";

import type { GameState } from "../state/gameState";
import { skillsOf } from "../gameEngine";
import { refRequirementMet } from "../gameEngine";
import type { GameEngine } from "../gameEngine";

export interface PassiveBlockSource {
	readonly cardId: string;
	readonly entityId: string;
	readonly sourceHeroId?: string;
	readonly sourceEnemyId?: string;
}

export function applyDeclaredPassiveBlocks(engine: GameEngine, 
	state: GameState,
	source: PassiveBlockSource,
): GameState {
	let next = state;
	for (const { def, ref } of skillsOf(engine, source.cardId)) {
		if (!refRequirementMet(engine, next, ref.requiresAwakening)) {
			continue;
		}
		if (def.operate_type !== "op_passive" || !def.effect) continue;
		const blocks = def.effect
			.filter((node) => node.kind === "p_block")
			.map((node) =>
				node.duration
					? node
					: { ...node, duration: { kind: "while_in_play" as const } },
			);
		if (blocks.length === 0) continue;

		const context: SkillContext = {
			triggeredBy: "passive_enter_play",
			skillId: def.id,
			sourceCardId: source.cardId,
			sourceEntityId: source.entityId,
			...(source.sourceHeroId ? { sourceHeroId: source.sourceHeroId } : {}),
			...(source.sourceEnemyId ? { sourceEnemyId: source.sourceEnemyId } : {}),
		};
		const ctx = buildScriptCtx(engine, next, context, {
			...(def.params ?? {}),
			...(ref.params ?? {}),
		});
		next = drainStack(engine, evaluate(blocks, ctx));
	}
	return next;
}
