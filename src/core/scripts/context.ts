import type { SkillContext } from "../data/skillTypes";
import type { GameState } from "../state/gameState";
import { log as appendLog } from "../reducer/utils";
import type { ScriptCtx } from "./types";

export function buildScriptCtx(state: GameState, skillCtx: SkillContext): ScriptCtx {
	return {
		state,
		skillCtx,
		log: (msg) => appendLog(state, msg),
	};
}
