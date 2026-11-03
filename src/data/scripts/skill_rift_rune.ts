import type { ModifierComponent } from "@/core/ecs/types";
import type { ScriptHandler } from "@/core/scripts/types";
import { withScopedFlag } from "@/core/state/access";

export const run: ScriptHandler = (ctx) => {
	if (!ctx.sourceId || !ctx.targetId) return ctx.state;
	const modifier: ModifierComponent = {
		type: "modifier",
		target: "hit_bonus",
		operation: "add",
		value: 3,
		source: `skill_rift_rune:${ctx.sourceId}`,
		duration: { kind: "this_combat" },
	};
	return withScopedFlag(
		ctx.withState(ctx.state).action.addComponent(ctx.targetId, modifier),
		"combat", "riftRuneTarget", `${ctx.sourceId}:${ctx.targetId}`,
	);
};
