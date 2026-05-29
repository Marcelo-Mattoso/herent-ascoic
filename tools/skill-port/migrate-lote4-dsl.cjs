#!/usr/bin/env node
/**
 * Migração Lote 4a: DSL restantes (armor fix, tohit_penalty, block_action misc).
 * Corrige bugs: handleArmor aplicava a heróis em vez da criatura-fonte.
 */
const fs = require("node:fs");
const path = require("node:path");
const SKILLS_PATH = path.join(__dirname, "../../src/data/skills.json");
const data = JSON.parse(fs.readFileSync(SKILLS_PATH, "utf8"));

const EFFECTS = {
  // ── Armor fix: aplica ao $source, não a todos os heróis ──────────────────
  skill_bastion_guard: [
    { kind: "add_modifier", to: "$source", stat: "damage_reduction",
      operation: "add", value: "$value", duration: { kind: "once" } }
  ],
  item_skill_block: [
    { kind: "add_modifier", to: "$source", stat: "damage_reduction",
      operation: "add", value: "$value", duration: { kind: "while_in_play" } }
  ],
  skill_charred_plate: [
    { kind: "add_modifier", to: "$source", stat: "damage_reduction",
      operation: "add", value: "$value", duration: { kind: "while_in_play" } }
  ],
  purple_ash_protection: [
    { kind: "add_modifier", to: "$source", stat: "damage_reduction",
      operation: "add", value: "$value", duration: { kind: "while_in_play" } }
  ],

  // ── tohit_penalty ─────────────────────────────────────────────────────────
  // skill_scorching_heat: penalidade na PRIMEIRA rolagem da sala para TODOS os heróis
  skill_scorching_heat: [
    {
      kind: "for_each", over: "all_heroes", as: "$h",
      do: [{ kind: "add_modifier", to: "$target", stat: "tohit_penalty",
              operation: "add", value: "$value", duration: { kind: "once" } }]
    }
  ],
  // skill_chains_prison: penalidade ao primeiro herói escolhido como alvo
  skill_chains_prison: [
    { kind: "add_modifier", to: "$target", stat: "tohit_penalty",
      operation: "add", value: 2, duration: { kind: "once" } }
  ],
  // skill_gelatinous_body: penalidade passiva em heróis que atacam esta criatura
  // $source = criatura com a skill; penalidade vai para o atacante ($target no ctx de combat)
  skill_gelatinous_body: [
    { kind: "add_modifier", to: "$source", stat: "tohit_penalty",
      operation: "add", value: "$value", duration: { kind: "while_in_play" } }
  ],
  // purple_ancient_veil_prison: penalidade ao primeiro herói alvo
  purple_ancient_veil_prison: [
    { kind: "add_modifier", to: "$target", stat: "tohit_penalty",
      operation: "add", value: 2, duration: { kind: "once" } }
  ],
  // purple_crimson_shackles: -3 tohit E -3 damage penalty ao herói alvo
  purple_crimson_shackles: [
    { kind: "add_modifier", to: "$target", stat: "tohit_penalty",
      operation: "add", value: 3, duration: { kind: "once" } },
    { kind: "add_modifier", to: "$target", stat: "damage_penalty",
      operation: "add", value: 3, duration: { kind: "once" } }
  ],

  // ── block_action misc ─────────────────────────────────────────────────────
  purple_depths_seal: [
    { kind: "block_action", what: "power_use" }
  ],
  purple_deep_veil_seal: [
    { kind: "block_action", what: "dungeon_level_reduction" }
  ],
};

let count = 0;
for (const skill of data.abilities) {
  const effect = EFFECTS[skill.id];
  if (!effect) continue;
  delete skill.type;
  skill.effect = effect;
  count++;
}
fs.writeFileSync(SKILLS_PATH, JSON.stringify(data, null, 2), "utf8");
console.log(`✓ ${count} skills migradas (Lote 4a DSL)`);
