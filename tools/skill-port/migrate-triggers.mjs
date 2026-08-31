// Migração patch-21 Lote B: converte trigger strings em (operate_type + trigger.event + cooldown + conditions).
// Execução: node tools/skill-port/migrate-triggers.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, stringify } from "yaml";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SKILLS_YAML = join(ROOT, "src/data/skills.yaml");

/** Mapeamento canônico: trigger string → campos v2 */
const TRIGGER_MAP = {
	// ── Passivos ─────────────────────────────────────────────────────────────────
	while_equipped: { operate_type: "op_passive" },
	while_in_play: { operate_type: "op_passive" },
	while_active: { operate_type: "op_passive" },
	while_room_active: { operate_type: "op_passive" },
	while_room_active_first_combat: { operate_type: "op_passive" },
	room_passive: { operate_type: "op_passive" },

	// ── Ativos manuais ────────────────────────────────────────────────────────────
	on_use: { operate_type: "op_active" },
	once_per_room: {
		operate_type: "op_active",
		cooldown: { scope: "room", charges: 1 },
	},
	once_per_combat: {
		operate_type: "op_active",
		cooldown: { scope: "combat", charges: 1 },
	},
	once_per_game: {
		operate_type: "op_active",
		cooldown: { scope: "game", charges: 1 },
	},
	once_per_game_until_end_of_round: {
		operate_type: "op_active_buff",
		cooldown: { scope: "game", charges: 1 },
	},
	until_end_of_round: { operate_type: "op_active_buff" },
	once_per_combat_instead_of_attack: {
		operate_type: "op_active",
		cooldown: { scope: "combat", charges: 1 },
	},

	// ── Disparados sem cooldown ───────────────────────────────────────────────────
	before_attack: {
		operate_type: "op_triggered",
		trigger: { event: "evt_attack_declared" },
	},
	combat: {
		operate_type: "op_triggered",
		trigger: { event: "evt_attack_declared" },
	},
	combat_and_on_damage_dealt: {
		operate_type: "op_triggered",
		trigger: { event: "evt_attack_declared" },
	},
	after_roll: { operate_type: "op_triggered", trigger: { event: "evt_roll" } },
	on_damage_taken: {
		operate_type: "op_triggered",
		trigger: { event: "evt_damage_taken" },
	},
	on_take_damage: {
		operate_type: "op_triggered",
		trigger: { event: "evt_damage_taken" },
	},
	on_take_attack_damage: {
		operate_type: "op_triggered",
		trigger: { event: "evt_damage_taken" },
	},
	on_purple_effect_damage_taken: {
		operate_type: "op_triggered",
		trigger: { event: "evt_damage_taken" },
	},
	on_hit_received: {
		operate_type: "op_triggered",
		trigger: { event: "evt_hit" },
	},
	on_deal_damage: {
		operate_type: "op_triggered",
		trigger: { event: "evt_damage_dealt" },
	},
	on_destroy_creature_with_attack: {
		operate_type: "op_triggered",
		trigger: { event: "evt_kill" },
	},
	start_of_combat: {
		operate_type: "op_triggered",
		trigger: { event: "evt_combat_start" },
	},
	on_enter_combat: {
		operate_type: "op_triggered",
		trigger: { event: "evt_combat_start" },
	},
	before_combat: {
		operate_type: "op_triggered",
		trigger: { event: "evt_combat_start" },
	},
	on_room_reveal: {
		operate_type: "op_triggered",
		trigger: { event: "evt_room_reveal" },
	},
	on_reveal_paths: {
		operate_type: "op_triggered",
		trigger: { event: "evt_room_reveal" },
	},
	on_enter_room: {
		operate_type: "op_triggered",
		trigger: { event: "evt_room_enter" },
	},
	on_win_room: {
		operate_type: "op_triggered",
		trigger: { event: "evt_room_leave" },
	},
	on_flee_or_leave_play: {
		operate_type: "op_triggered",
		trigger: { event: "evt_leave_play" },
	},
	on_dungeon_discard: {
		operate_type: "op_triggered",
		trigger: { event: "evt_dungeon_discard" },
	},
	on_enter_play: {
		operate_type: "op_triggered",
		trigger: { event: "evt_enter_play" },
	},
	on_destroyed: {
		operate_type: "op_triggered",
		trigger: { event: "evt_destroy" },
	},
	on_hero_lose_combat_in_room: {
		operate_type: "op_triggered",
		trigger: { event: "evt_combat_end" },
	},

	// ── Disparados com cooldown ───────────────────────────────────────────────────
	once_per_round_on_damage_taken: {
		operate_type: "op_triggered",
		trigger: { event: "evt_damage_taken" },
		cooldown: { scope: "round", charges: 1 },
	},
	once_per_room_on_dungeon_discard: {
		operate_type: "op_triggered",
		trigger: { event: "evt_dungeon_discard" },
		cooldown: { scope: "room", charges: 1 },
	},
	once_per_room_after_roll: {
		operate_type: "op_triggered",
		trigger: { event: "evt_roll" },
		cooldown: { scope: "room", charges: 1 },
	},
	once_per_room_on_targeted_by_effect: {
		operate_type: "op_triggered",
		trigger: { event: "evt_targeted" },
		cooldown: { scope: "room", charges: 1 },
	},
	once_per_room_on_targeted: {
		operate_type: "op_triggered",
		trigger: { event: "evt_targeted" },
		cooldown: { scope: "room", charges: 1 },
	},
	once_per_room_on_extra_dungeon_discard: {
		operate_type: "op_triggered",
		trigger: { event: "evt_dungeon_discard" },
		cooldown: { scope: "room", charges: 1 },
	},
	once_per_game_after_any_roll: {
		operate_type: "op_triggered",
		trigger: { event: "evt_roll" },
		cooldown: { scope: "game", charges: 1 },
	},
	once_per_game_on_defeat_creature: {
		operate_type: "op_triggered",
		trigger: { event: "evt_kill" },
		cooldown: { scope: "game", charges: 1 },
	},
	once_per_game_after_roll_vs_prey: {
		operate_type: "op_triggered",
		trigger: { event: "evt_roll" },
		cooldown: { scope: "game", charges: 1 },
	},
	once_per_game_on_use_furia_rubra: {
		operate_type: "op_triggered",
		trigger: { event: "evt_damage_dealt" },
		cooldown: { scope: "game", charges: 1 },
	},
	first_roll_in_room: {
		operate_type: "op_triggered",
		trigger: { event: "evt_roll" },
		cooldown: { scope: "room", charges: 1 },
	},
	before_first_combat_in_room: {
		operate_type: "op_triggered",
		trigger: { event: "evt_combat_start" },
		cooldown: { scope: "room", charges: 1 },
	},
	first_hero_lose_combat_in_room: {
		operate_type: "op_triggered",
		trigger: { event: "evt_combat_end" },
		cooldown: { scope: "room", charges: 1 },
	},
	first_item_effect_received: {
		operate_type: "op_triggered",
		trigger: { event: "evt_targeted" },
		cooldown: { scope: "room", charges: 1 },
	},
	on_first_creature_destroyed_in_room: {
		operate_type: "op_triggered",
		trigger: { event: "evt_kill" },
		cooldown: { scope: "room", charges: 1 },
	},
	on_first_targeted: {
		operate_type: "op_triggered",
		trigger: { event: "evt_targeted" },
		cooldown: { scope: "room", charges: 1 },
	},
	on_first_target_chosen_in_room: {
		operate_type: "op_triggered",
		trigger: { event: "evt_targeted" },
		cooldown: { scope: "room", charges: 1 },
	},
	on_first_target_chosen_by_creature: {
		operate_type: "op_triggered",
		trigger: { event: "evt_targeted" },
		cooldown: { scope: "room", charges: 1 },
	},
	first_damage_each_round: {
		operate_type: "op_triggered",
		trigger: { event: "evt_damage_taken" },
		cooldown: { scope: "round", charges: 1 },
	},
	before_attack_once_per_game: {
		operate_type: "op_triggered",
		trigger: { event: "evt_attack_declared" },
		cooldown: { scope: "game", charges: 1 },
	},

	// ── Disparados com condições ──────────────────────────────────────────────────
	first_round_in_room: {
		operate_type: "op_triggered",
		trigger: { event: "evt_round_start" },
		conditions: [{ kind: "compare", op: "eq", left: "$round", right: 1 }],
	},
	combat_if_dungeon_red_or_purple: {
		operate_type: "op_triggered",
		trigger: { event: "evt_combat_start" },
		conditions: [
			{ kind: "compare", op: "gte", left: "$dungeon.level", right: 3 },
		],
	},
	combat_if_alone_in_room: {
		operate_type: "op_triggered",
		trigger: { event: "evt_combat_start" },
		conditions: [
			{ kind: "compare", op: "eq", left: "$room.enemy_count", right: 1 },
		],
	},
	combat_if_another_creature_in_room: {
		operate_type: "op_triggered",
		trigger: { event: "evt_combat_start" },
		conditions: [
			{ kind: "compare", op: "gt", left: "$room.enemy_count", right: 1 },
		],
	},
	when_half_life_or_less: {
		operate_type: "op_triggered",
		trigger: { event: "evt_damage_taken" },
		conditions: [
			{
				kind: "has_condition",
				of: "$self",
				conditionType: "half_life_or_less",
			},
		],
	},
	after_each_combat_round_if_purple: {
		operate_type: "op_triggered",
		trigger: { event: "evt_round_end" },
		conditions: [
			{ kind: "compare", op: "gte", left: "$dungeon.level", right: 3 },
		],
	},
	combat_vs_boss_or_subboss: {
		operate_type: "op_triggered",
		trigger: { event: "evt_combat_start" },
		conditions: [
			{ kind: "has_condition", of: "$enemy", conditionType: "boss_or_subboss" },
		],
	},
};

const raw = readFileSync(SKILLS_YAML, "utf8");
const catalog = parse(raw);
const unmapped = [];

for (const skill of catalog.abilities) {
	const oldTrigger = skill.trigger;
	const mapping = TRIGGER_MAP[oldTrigger];
	if (!mapping) {
		unmapped.push(`${skill.id}: "${oldTrigger}"`);
		continue;
	}
	// Remover campo trigger legado
	delete skill.trigger;
	// Aplicar campos novos (em ordem: operate_type, trigger, cooldown, conditions)
	skill.operate_type = mapping.operate_type;
	if (mapping.trigger) skill.trigger = mapping.trigger;
	if (mapping.cooldown) skill.cooldown = mapping.cooldown;
	if (mapping.conditions) skill.conditions = mapping.conditions;
}

if (unmapped.length > 0) {
	console.error("⚠️  Triggers sem mapeamento:");
	unmapped.forEach((u) => console.error(" ", u));
	process.exit(1);
}

writeFileSync(SKILLS_YAML, stringify(catalog, { indent: 2 }), "utf8");
console.log(`✓ ${catalog.abilities.length} skills migradas`);
