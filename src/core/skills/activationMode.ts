import type { SkillDefinition } from "../data/skillTypes";
import type { TriggerSourceKind } from "../triggers/engine";
import type { EffectNode, EventName } from "./dsl/types";

function effectNeedsPlayerDecision(effect: EffectNode, event: EventName): boolean {
	if (
		effect.kind === "i_prevent_dungeon_discard" ||
		effect.kind === "i_ignore_next_targeting" ||
		effect.kind === "i_modify_die" ||
		effect.kind === "i_reroll" ||
		effect.kind === "i_set_die" ||
		effect.kind === "i_mark_target" ||
		effect.kind === "i_draw_and_choose" ||
		effect.kind === "i_choose_one"
	) return true;
	if (effect.kind === "i_damage" && effect.to === "$source") return true;
	if (event === "evt_damage_taken" && effect.kind === "p_modifier" &&
		(effect.stat === "s_damage_reduction" || effect.stat === "s_purple_damage_reduction"))
		return true;
	if (effect.kind === "i_if") return effect.then.some((child) => effectNeedsPlayerDecision(child, event)) ||
		Boolean(effect.else?.some((child) => effectNeedsPlayerDecision(child, event)));
	if (effect.kind === "i_for_each") return effect.do.some((child) => effectNeedsPlayerDecision(child, event));
	return false;
}

export function isVoluntaryTrigger(
	definition: SkillDefinition,
	sourceKind: TriggerSourceKind,
	event: EventName,
): boolean {
	if (definition.interrupt?.mode === "auto" || definition.operate_type === "op_passive") return false;
	if (definition.interrupt?.mode === "prompt") return true;
	if (sourceKind === "hero") {
		if (definition.category === "hero_power" || definition.script) return true;
		return Boolean(definition.effect?.some((effect) => effectNeedsPlayerDecision(effect, event)));
	}
	if (sourceKind === "item" || sourceKind === "artifact")
		return Boolean(definition.effect?.some((effect) => effectNeedsPlayerDecision(effect, event)));
	return false;
}
