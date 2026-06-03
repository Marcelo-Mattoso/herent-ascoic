// Popula nature[] em todas as skills (patch-21 Lote D).
// Decisão automática por padrão no id/category; refinada por regras explícitas.
import { readFileSync, writeFileSync } from "node:fs";
import { parse, stringify } from "yaml";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SKILLS_YAML = join(ROOT, "src/data/skills.yaml");

// Mapeamento explícito por id (tem precedência)
const EXPLICIT = {
  skill_last_light_healing:          ["nat_magical", "nat_holy"],
  skill_last_light_shield:           ["nat_magical", "nat_holy"],
  skill_last_light_miracle:          ["nat_magical", "nat_holy"],
  skill_last_light_ward:             ["nat_magical", "nat_holy"],
  skill_preserved_path:              ["nat_magical"],
  power_greater_last_light_miracle:  ["nat_magical", "nat_holy"],
  power_last_light_oath:             ["nat_magical", "nat_holy"],
  power_unbreakable_bastion_guard:   ["nat_magical", "nat_holy"],
  power_restored_path:               ["nat_magical"],

  skill_crimson_fury:                ["nat_physical", "nat_fire"],
  skill_bastion_guard:               ["nat_physical"],
  skill_charred_plate:               ["nat_physical", "nat_fire"],
  skill_sealed_door:                 ["nat_physical"],
  skill_ruined_floor:                ["nat_physical"],
  skill_forge_smoke:                 ["nat_fire"],
  skill_forge_awakening:             ["nat_fire"],
  skill_forge_spoils:                ["nat_physical"],
  skill_dark_tribute:                ["nat_dark"],
  skill_crimson_chains:              ["nat_physical", "nat_fire"],
  skill_choking_ashes:               ["nat_physical", "nat_fire"],
  skill_final_dawn_light:            ["nat_physical", "nat_fire"],
  skill_scorching_heat:              ["nat_fire"],
  power_mighty_crimson_fury:         ["nat_physical", "nat_fire"],
  power_deep_veil_echo:              ["nat_magical"],
  power_supreme_rift_rune:           ["nat_magical"],
  power_hunter_execution:            ["nat_physical"],

  skill_rift_rune:                   ["nat_magical"],
  skill_rift_second_chance:          ["nat_magical"],
  skill_perfect_rune:                ["nat_magical"],
  skill_rift_evasion:                ["nat_magical"],
  skill_rift_light_step:             ["nat_magical"],
  skill_minor_rune:                  ["nat_magical"],

  skill_living_ember:                ["nat_physical", "nat_fire"],
  skill_living_ember_oil:            ["nat_physical", "nat_fire"],
  skill_rekindled_forge:             ["nat_fire"],

  skill_prey_mark:                   ["nat_physical"],
  skill_piercing_strike:             ["nat_physical"],
  skill_hunter_focus:                ["nat_physical"],
  skill_opportunity_shot:            ["nat_physical"],
  skill_focus_deflection:            ["nat_physical"],
  skill_return_rite:                 ["nat_magical", "nat_dark"],

  skill_gelatinous_body:             ["nat_physical"],
  skill_hidden_flame_presence:       ["nat_fire"],
  skill_pack_courage:                ["nat_physical"],
  skill_lone_beast:                  ["nat_physical"],
  skill_treacherous_attack:          ["nat_physical"],
  skill_cowardly_flee:               ["nat_physical"],
  skill_life_drain:                  ["nat_magical", "nat_dark"],
  skill_chains_prison:               ["nat_physical"],
  skill_path_corruption:             ["nat_dark"],
  skill_path_safeguard:              ["nat_magical"],
  skill_illuminate_path:             ["nat_magical"],

  purple_raging_flames:              ["nat_fire", "nat_dark"],
  purple_forge_chains:               ["nat_dark", "nat_fire"],
  purple_ruin_ashes:                 ["nat_dark", "nat_fire"],
  purple_crimson_plate:              ["nat_dark", "nat_fire"],
  purple_ash_protection:             ["nat_dark", "nat_fire"],
  purple_dark_awakening:             ["nat_dark"],
  purple_deadly_awakening:           ["nat_dark"],
  purple_ember_blood:                ["nat_dark", "nat_fire"],
  purple_depths_seal:                ["nat_dark"],
  purple_dark_tribute:               ["nat_dark"],
  purple_blood_tribute:              ["nat_dark"],
  purple_veil_retaliation:           ["nat_dark", "nat_magical"],
  purple_healing_rupture:            ["nat_dark", "nat_magical"],
  purple_ancient_veil_prison:        ["nat_dark", "nat_magical"],
  purple_deep_veil_seal:             ["nat_dark", "nat_magical"],
  purple_crimson_shackles:           ["nat_dark", "nat_physical"],

  item_skill_deadly_edge:            ["nat_physical"],
  item_skill_block:                  ["nat_physical"],
  item_skill_mystic_draw:            ["nat_magical"],
  item_skill_last_light_blade:       ["nat_magical", "nat_holy"],
  item_skill_drain_life_and_deadly_edge: ["nat_physical", "nat_dark"],
  item_skill_block_and_last_light_ward:  ["nat_magical", "nat_holy"],
  item_skill_crimson_fury_mighty:    ["nat_physical", "nat_fire"],

  dungeon_skill_confinement:         ["nat_dark"],
  dungeon_skill_dead_torches:        ["nat_dark"],
  dungeon_skill_column_fall:         ["nat_physical"],
  dungeon_skill_uneven_floor:        ["nat_physical"],
  dungeon_skill_forge_spoils:        ["nat_physical"],
  dungeon_skill_rekindled_forge:     ["nat_fire"],
  dungeon_skill_summon_guardian:     ["nat_dark"],
  dungeon_skill_subboss_room:        [],
  dungeon_skill_empty_room:          [],

  boss_skill_living_ash_throne:      ["nat_fire", "nat_dark"],
  boss_skill_dark_forge_pressure:    ["nat_dark", "nat_fire"],
  boss_skill_azhakar_ascension:      ["nat_dark", "nat_fire"],

  skill_path_corruption:             ["nat_dark"],
};

const catalog = parse(readFileSync(SKILLS_YAML, "utf8"));

for (const skill of catalog.abilities) {
  const nature = EXPLICIT[skill.id];
  if (nature !== undefined) {
    skill.nature = nature;
  } else {
    // Fallback por categoria
    if (skill.category === "efeito_roxo_monstro") skill.nature = ["nat_dark"];
    else if (skill.category === "habilidade_dungeon") skill.nature = ["nat_dark"];
    else if (skill.category === "habilidade_chefe") skill.nature = ["nat_dark", "nat_fire"];
    else skill.nature = [];
  }
}

writeFileSync(SKILLS_YAML, stringify(catalog, { indent: 2 }), "utf8");
console.log(`✓ nature[] populado em ${catalog.abilities.length} skills`);
