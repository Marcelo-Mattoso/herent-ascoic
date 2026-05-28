import type { SkillContext } from "../../data/skillTypes";
import type { GameState } from "../../state/gameState";
import { buildScriptCtx } from "../../scripts/context";
import { getScript } from "../../scripts/registry";

export function handleScript(
	state: GameState,
	ctx: SkillContext,
	value: number | string | null,
): GameState {
	if (typeof value !== "string" || value.length === 0) {
		console.warn("[script] sem ref — esperado value: string em formato 'arquivo.funcao'");
		return state;
	}
	const fn = getScript(value);
	if (!fn) return state; // registry já warna
	return fn(buildScriptCtx(state, ctx));
}
