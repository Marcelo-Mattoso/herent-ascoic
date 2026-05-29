import type { SkillContext } from "../data/skillTypes";
import { log as appendLog } from "../reducer/utils";
import { resolveSkillForById } from "../skills/lookup";
import type { GameState } from "../state/gameState";
import { applyDamage } from "../systems/damageSystem";
import type { ScriptCtx } from "./types";

export function buildScriptCtx(
	state: GameState,
	skillCtx: SkillContext,
): ScriptCtx {
	return {
		state,
		skillCtx,
		query: {
			creatureHasSkill(enemyId, skillId) {
				const enemy = state.activeEnemies.find((e) => e.id === enemyId);
				if (!enemy) return false;
				const effect = resolveSkillForById(enemy.cardId, "effect");
				const purple = resolveSkillForById(enemy.cardId, "purpleEffect");
				return effect?.id === skillId || purple?.id === skillId;
			},
		},
		action: {
			dealDamage(targetId, amount) {
				const enemy = state.activeEnemies.find((e) => e.id === targetId);
				if (enemy?.status === "active") {
					const next = applyDamage(state, targetId, amount);
					return appendLog(
						next,
						`Dano direto: ${enemy.cardName} sofreu ${amount}.`,
					);
				}
				const hero = state.heroes.find((h) => h.id === targetId);
				if (hero?.status === "active") {
					const next = applyDamage(state, targetId, amount);
					return appendLog(
						next,
						`Dano direto: ${hero.cardName} sofreu ${amount}.`,
					);
				}
				return state;
			},
		},
		log: (msg) => appendLog(state, msg),
	};
}
