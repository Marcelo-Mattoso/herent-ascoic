// Executa os p_block declarados por passivos ao entrar em jogo.
// Modificadores passivos continuam sendo instalados por ecs/installPassive;
// separar os dois impede que uma reavaliação duplique modifiers estáticos.

import type { SkillContext } from "../data/skillTypes";
import { drainStack } from "../effects/resolver";
import { awakeningRequirementMet } from "../rules/awakening";
import { buildScriptCtx } from "../scripts/context";
import { evaluate } from "./dsl/evaluate";
import { cardSkills } from "./lookup";
import type { GameState } from "../state/gameState";

export interface PassiveBlockSource {
	readonly cardId: string;
	readonly entityId: string;
	readonly sourceHeroId?: string;
	readonly sourceEnemyId?: string;
}

export function applyDeclaredPassiveBlocks(
	state: GameState,
	source: PassiveBlockSource,
): GameState {
	let next = state;
	for (const { def, ref } of cardSkills(source.cardId)) {
		if (!awakeningRequirementMet(next.despertar, ref.requiresAwakening)) {
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
		const ctx = buildScriptCtx(next, context, {
			...(def.params ?? {}),
			...(ref.params ?? {}),
		});
		next = drainStack(evaluate(blocks, ctx));
	}
	return next;
}
