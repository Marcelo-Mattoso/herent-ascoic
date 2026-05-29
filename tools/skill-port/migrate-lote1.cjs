#!/usr/bin/env node
/**
 * Migração Lote 1 (Patch-12 Fase 3): adiciona `effect` às habilidades DSL puras.
 * Remove `type` das entradas migradas.
 * Mantém `trigger` como string (migração para objeto: Fase 7).
 */
const fs = require("node:fs");
const path = require("node:path");

const SKILLS_PATH = path.join(__dirname, "../../src/data/skills.json");
const data = JSON.parse(fs.readFileSync(SKILLS_PATH, "utf8"));

// ── Effect definitions por skill_id ──────────────────────────────────────────

const EFFECTS = {
	// advance_dungeon_level
	skill_forge_awakening: [{ kind: "advance_dungeon_level", amount: "$value" }],
	purple_dark_awakening: [{ kind: "advance_dungeon_level", amount: 1 }],
	purple_deadly_awakening: [{ kind: "advance_dungeon_level", amount: 1 }],

	// discard_from dungeon
	skill_ruined_floor: [{ kind: "discard_from", pile: "dungeon", count: 1 }],
	dungeon_skill_uneven_floor: [
		{ kind: "discard_from", pile: "dungeon", count: 1 },
	],
	purple_ruin_ashes: [{ kind: "discard_from", pile: "dungeon", count: 1 }],
	// boss_skill_dark_forge_pressure: discard only when despertar >= 4 (roxo)
	// trigger "after_each_combat_round_if_purple" already scopes it, but we make it explicit
	boss_skill_dark_forge_pressure: [
		{
			kind: "if",
			when: { kind: "compare", op: "gte", left: "$dungeon.level", right: 4 },
			then: [{ kind: "discard_from", pile: "dungeon", count: 1 }],
		},
	],

	// noop
	dungeon_skill_subboss_room: [{ kind: "noop" }],
	dungeon_skill_empty_room: [{ kind: "noop" }],

	// set_no_reward
	skill_cowardly_flee: [{ kind: "set_no_reward", to: "$source" }],

	// block_action flee
	skill_crimson_chains: [{ kind: "block_action", what: "flee" }],
	skill_sealed_door: [{ kind: "block_action", what: "flee" }],
	purple_forge_chains: [{ kind: "block_action", what: "flee" }],
	dungeon_skill_confinement: [{ kind: "block_action", what: "flee" }],

	// block_action dungeon_discard
	skill_path_corruption: [{ kind: "block_action", what: "dungeon_discard" }],

	// block_action heal (all heroes)
	skill_forge_smoke: [{ kind: "block_action", what: "heal" }],
	purple_healing_rupture: [{ kind: "block_action", what: "heal" }],

	// apply_damage
	skill_treacherous_attack: [
		{ kind: "apply_damage", to: "$lowest_life_hero", amount: "$value" },
	],
	skill_choking_ashes: [
		{ kind: "apply_damage", to: "$lowest_life_hero", amount: "$value" },
	],
	dungeon_skill_column_fall: [
		{ kind: "apply_damage", to: "$target", amount: 1 },
	],
	purple_raging_flames: [
		{
			kind: "for_each",
			over: "all_heroes",
			as: "$loopTarget",
			do: [{ kind: "apply_damage", to: "$target", amount: 1 }],
		},
	],

	// apply_heal
	skill_last_light_healing: [
		{ kind: "apply_heal", to: "$target", amount: "$value" },
	],

	// apply_damage to enemy target
	skill_living_ember: [
		{ kind: "apply_damage", to: "$target", amount: "$value" },
	],
};

// ── Apply migrations ──────────────────────────────────────────────────────────

let migratedCount = 0;
for (const skill of data.abilities) {
	const effect = EFFECTS[skill.id];
	if (!effect) continue;

	// Remove `type`, adiciona `effect`
	delete skill.type;
	skill.effect = effect;
	migratedCount++;
}

fs.writeFileSync(SKILLS_PATH, JSON.stringify(data, null, 2), "utf8");
console.log(`✓ ${migratedCount} habilidades migradas para DSL em skills.json`);
