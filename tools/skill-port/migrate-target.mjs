// Migração patch-21 Lote C: substitui target: string por 4 campos ortogonais.
import { readFileSync, writeFileSync } from "node:fs";
import { parse, stringify } from "yaml";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SKILLS_YAML = join(ROOT, "src/data/skills.yaml");

// Mapping: target string → { target_type, affect_scope, affect_object }
const TARGET_MAP = {
  // Self
  self:              { target_type: "tgt_self", affect_scope: "scp_single", affect_object: "obj_friend" },
  boss:              { target_type: "tgt_self", affect_scope: "scp_single", affect_object: "obj_not_friend" },
  ally_die:          { target_type: "tgt_self", affect_scope: "scp_single", affect_object: "obj_friend" },
  die_with_value_1:  { target_type: "tgt_self", affect_scope: "scp_single", affect_object: "obj_friend" },
  blue_die_and_self: { target_type: "tgt_self", affect_scope: "scp_single", affect_object: "obj_friend" },

  // Single hero/ally target
  hero:                     { target_type: "tgt_target", affect_scope: "scp_single", affect_object: "obj_friend" },
  hero_or_ally:             { target_type: "tgt_target", affect_scope: "scp_single", affect_object: "obj_friend" },
  hero_or_ally_creature:    { target_type: "tgt_target", affect_scope: "scp_single", affect_object: "obj_friend" },
  target_hero:              { target_type: "tgt_target", affect_scope: "scp_single", affect_object: "obj_friend" },
  lowest_life_hero:         { target_type: "tgt_target", affect_scope: "scp_single", affect_object: "obj_friend" },
  ally_or_next_attack:      { target_type: "tgt_target", affect_scope: "scp_single", affect_object: "obj_friend" },
  another_hero_or_self:     { target_type: "tgt_target", affect_scope: "scp_single", affect_object: "obj_friend" },
  attacking_hero:           { target_type: "tgt_target", affect_scope: "scp_single", affect_object: "obj_not_friend" },
  group_or_chosen_hero:     { target_type: "tgt_target", affect_scope: "scp_single", affect_object: "obj_all" },

  // Party/all heroes
  heroes:                   { target_type: "tgt_target", affect_scope: "scp_party_full", affect_object: "obj_friend" },
  all_heroes:               { target_type: "tgt_target", affect_scope: "scp_party_full", affect_object: "obj_friend" },
  heroes_or_self_next_attack: { target_type: "tgt_target", affect_scope: "scp_party_full", affect_object: "obj_friend" },
  heroes_attacking_self:    { target_type: "tgt_target", affect_scope: "scp_party_full", affect_object: "obj_not_friend" },

  // Room scope (mixed)
  creatures_or_heroes_in_room: { target_type: "tgt_target", affect_scope: "scp_room", affect_object: "obj_all" },
  group:                    { target_type: "tgt_target", affect_scope: "scp_party_full", affect_object: "obj_all" },

  // Single enemy
  enemy:                    { target_type: "tgt_enemy", affect_scope: "scp_single", affect_object: "obj_not_friend" },
  creature_in_room:         { target_type: "tgt_enemy", affect_scope: "scp_single", affect_object: "obj_not_friend" },
  creature_in_play:         { target_type: "tgt_enemy", affect_scope: "scp_single", affect_object: "obj_not_friend" },
  chosen_enemy:             { target_type: "tgt_enemy", affect_scope: "scp_single", affect_object: "obj_not_friend" },
  remaining_creature:       { target_type: "tgt_enemy", affect_scope: "scp_single", affect_object: "obj_not_friend" },
  special_creature:         { target_type: "tgt_enemy", affect_scope: "scp_single", affect_object: "obj_not_friend" },
  creature:                 { target_type: "tgt_enemy", affect_scope: "scp_single", affect_object: "obj_not_friend" },

  // Other enemies
  another_creature_in_room: { target_type: "tgt_others", affect_scope: "scp_single", affect_object: "obj_not_friend" },
  other_creature_in_same_room: { target_type: "tgt_others", affect_scope: "scp_single", affect_object: "obj_not_friend" },

  // All enemies
  all_enemies:              { target_type: "tgt_enemy", affect_scope: "scp_room", affect_object: "obj_not_friend" },

  // Dice (ally vs enemy)
  ally_or_enemy_die:        { target_type: "tgt_target", affect_scope: "scp_single", affect_object: "obj_all" },

  // Items/zones (no entity target)
  dungeon:                  { target_type: "tgt_item", affect_scope: "scp_none", affect_object: "obj_all" },
  item_deck:                { target_type: "tgt_item", affect_scope: "scp_none", affect_object: "obj_all" },
  artifact_deck:            { target_type: "tgt_item", affect_scope: "scp_none", affect_object: "obj_all" },
  item_deck_or_discard:     { target_type: "tgt_item", affect_scope: "scp_none", affect_object: "obj_all" },
  room:                     { target_type: "tgt_item", affect_scope: "scp_none", affect_object: "obj_all" },
};

const catalog = parse(readFileSync(SKILLS_YAML, "utf8"));
let unmapped = [];

for (const skill of catalog.abilities) {
  const t = skill.target;
  const mapping = TARGET_MAP[t];
  if (!mapping) {
    if (t !== undefined) unmapped.push(`${skill.id}: "${t}"`);
    // Default fallback
    skill.target_type = "tgt_none";
    skill.affect_scope = "scp_none";
    skill.affect_object = "obj_all";
  } else {
    skill.target_type  = mapping.target_type;
    skill.affect_scope = mapping.affect_scope;
    skill.affect_object = mapping.affect_object;
  }
  delete skill.target;
}

if (unmapped.length > 0) {
  console.warn("⚠️  Targets sem mapeamento (usando fallback tgt_none):");
  unmapped.forEach(u => console.warn(" ", u));
}

writeFileSync(SKILLS_YAML, stringify(catalog, { indent: 2 }), "utf8");
console.log(`✓ target migrado em ${catalog.abilities.length} skills`);
