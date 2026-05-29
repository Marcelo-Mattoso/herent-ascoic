#!/usr/bin/env node
/**
 * Migração Lote 4b: adiciona campo script às habilidades migradas para scripts.
 */
const fs = require("node:fs");
const path = require("node:path");
const SKILLS_PATH = path.join(__dirname, "../../src/data/skills.json");
const data = JSON.parse(fs.readFileSync(SKILLS_PATH, "utf8"));

// skills que ganham campo script (arquivo src/data/scripts/<id>.ts exporta run)
const SCRIPTS = [
  "skill_crimson_fury",
  "skill_piercing_strike",
  "purple_ember_blood",
  "purple_veil_retaliation",
  "skill_rift_second_chance",
  "skill_minor_rune",
  "skill_perfect_rune",
  "skill_hunter_focus",
];

let count = 0;
for (const skill of data.abilities) {
  if (!SCRIPTS.includes(skill.id)) continue;
  delete skill.type;
  skill.script = skill.id; // convenção: script id = skill id
  count++;
}
fs.writeFileSync(SKILLS_PATH, JSON.stringify(data, null, 2), "utf8");
console.log(`✓ ${count} skills marcadas como script (Lote 4b)`);
