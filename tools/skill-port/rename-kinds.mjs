// Codemod patch-21 Lote E: renomeia kinds e stats em skills.yaml
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SKILLS_YAML = join(ROOT, "src/data/skills.yaml");

let content = readFileSync(SKILLS_YAML, "utf8");

// Renomear kinds (usar word boundary para não substituir parcialmente)
const kindRenames = [
	["apply_damage", "i_damage"],
	["apply_heal", "i_heal"],
	["apply_full_heal", "i_full_heal"],
	["prevent_destroy", "i_prevent_destroy"],
	["add_modifier", "p_modifier"],
	["block_action", "p_block"],
	["discard_from", "i_discard"],
	["draw_from", "i_draw"],
	["draw_and_choose", "i_draw_and_choose"],
	["reveal_dungeon", "i_reveal_dungeon"],
	["recover_dungeon", "i_recover_dungeon"],
	["advance_dungeon_level", "i_advance_dungeon"],
	["prevent_dungeon_discard", "i_prevent_dungeon_discard"],
	["prevent_next_damage", "i_prevent_next_damage"],
	["ignore_next_targeting", "i_ignore_next_targeting"],
	["mark_target", "i_mark_target"],
	["set_no_reward", "i_set_no_reward"],
	["grant_pending_reward", "i_grant_reward"],
	["choose_one", "i_choose_one"],
	["for_each", "i_for_each"],
	["noop", "i_noop"],
	// "if" é especial: substituir "kind: if" → "kind: i_if"
];

for (const [oldName, newName] of kindRenames) {
	// Match "kind: oldName" exactly
	const re = new RegExp(`kind: ${oldName}\\b`, "g");
	content = content.replace(re, `kind: ${newName}`);
}

// "kind: if" separado (evita substituir parte de outras palavras)
content = content.replace(/kind: if\b/g, "kind: i_if");

// Renomear stats
const statRenames = [
	["damage_reduction", "s_damage_reduction"],
	["purple_damage_reduction", "s_purple_damage_reduction"],
	["tohit_bonus", "s_hit_bonus"],
	["tohit_penalty", "s_hit_penalty"],
	["damage_bonus", "s_damage_dealt"],
	["damage_penalty", "s_damage_penalty"],
	["heal_blocked", "s_heal_blocked"],
	["flee_blocked", "s_flee_blocked"],
	["dungeon_discard_prevention", "s_dungeon_discard_prevention"],
	["dungeon_discard_locked", "s_dungeon_discard_locked"],
	["first_damage_prevented", "s_first_damage_prevented"],
];

for (const [oldStat, newStat] of statRenames) {
	const re = new RegExp(`stat: ${oldStat}\\b`, "g");
	content = content.replace(re, `stat: ${newStat}`);
}

writeFileSync(SKILLS_YAML, content, "utf8");
console.log("✓ kinds e stats renomeados em skills.yaml");
