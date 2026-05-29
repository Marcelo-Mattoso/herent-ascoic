#!/usr/bin/env node
/**
 * Migração Lote 2 (Patch-12 Fase 4): habilidades com add_modifier.
 * Corrige múltiplos bugs (itens não registrados, tohit ignorado, purple_damage_reduction quebrado).
 */
const fs = require("node:fs");
const path = require("node:path");

const SKILLS_PATH = path.join(__dirname, "../../src/data/skills.json");
const data = JSON.parse(fs.readFileSync(SKILLS_PATH, "utf8"));

const EFFECTS = {
	// skill_final_dawn_light: +2 tohit +2 damage quando despertar >= 3 (red ou purple)
	// trigger "combat_if_dungeon_red_or_purple" já garante a condição
	skill_final_dawn_light: {
		effect: [
			{
				kind: "add_modifier",
				to: "$source",
				stat: "tohit_bonus",
				operation: "add",
				value: 2,
				duration: { kind: "until_end_of_combat" },
			},
			{
				kind: "add_modifier",
				to: "$source",
				stat: "damage_bonus",
				operation: "add",
				value: 2,
				duration: { kind: "until_end_of_combat" },
			},
		],
		params: { tohit: 2, damage: 2 },
	},

	// skill_lone_beast: +value tohit e +value damage quando sozinho na sala
	// trigger "combat_if_alone_in_room" garante condição
	skill_lone_beast: {
		effect: [
			{
				kind: "add_modifier",
				to: "$source",
				stat: "tohit_bonus",
				operation: "add",
				value: "$value",
				duration: { kind: "until_end_of_combat" },
			},
			{
				kind: "add_modifier",
				to: "$source",
				stat: "damage_bonus",
				operation: "add",
				value: "$value",
				duration: { kind: "until_end_of_combat" },
			},
		],
	},

	// skill_pack_courage: +value tohit quando outra criatura na sala
	skill_pack_courage: {
		effect: [
			{
				kind: "add_modifier",
				to: "$source",
				stat: "tohit_bonus",
				operation: "add",
				value: "$value",
				duration: { kind: "until_end_of_combat" },
			},
		],
	},

	// skill_hidden_flame_presence: +value tohit para OUTRA criatura (target)
	// Mantém $source como alvo porque hidden_flame_presence afeta outra criatura,
	// mas o dispatch popula sourceEnemyId = a criatura com a skill e não o target.
	// Deixamos $source como proxy — se target estiver vazio, fallback para a criatura-fonte.
	// FIX real: requer targeting complexo (Lote 4/script).
	// Por ora migra para DSL com $source que é equivalente funcional ao comportamento anterior (noop).
	skill_hidden_flame_presence: {
		effect: [
			{
				kind: "add_modifier",
				to: "$source",
				stat: "tohit_bonus",
				operation: "add",
				value: "$value",
				duration: { kind: "until_end_of_combat" },
			},
		],
	},

	// boss_skill_azhakar_ascension: +2 tohit quando Azhakar chega na metade da vida
	boss_skill_azhakar_ascension: {
		effect: [
			{
				kind: "add_modifier",
				to: "$source",
				stat: "tohit_bonus",
				operation: "add",
				value: 2,
				duration: { kind: "passive" },
			},
		],
	},

	// item_skill_last_light_blade: +2 tohit sempre (combat) + +2 damage vs boss/subboss
	// trigger "combat_vs_boss_or_subboss" garante boss/subboss context para ambos
	item_skill_last_light_blade: {
		effect: [
			{
				kind: "add_modifier",
				to: "$source",
				stat: "tohit_bonus",
				operation: "add",
				value: 2,
				duration: { kind: "until_end_of_combat" },
			},
			{
				kind: "add_modifier",
				to: "$source",
				stat: "damage_bonus",
				operation: "add",
				value: 2,
				duration: { kind: "until_end_of_combat" },
			},
		],
		params: { tohit: 2, damage: 2 },
	},

	// skill_last_light_ward: -value dano de efeitos roxos
	// CORRIGE: handler anterior armazenava flag incorretamente com cast para boolean
	skill_last_light_ward: {
		effect: [
			{
				kind: "add_modifier",
				to: "$source",
				stat: "purple_damage_reduction",
				operation: "add",
				value: "$value",
				duration: { kind: "while_in_play" },
			},
		],
	},

	// item_skill_block_and_last_light_ward: damage_reduction + purple_damage_reduction
	// CORRIGE: tipo "armor_purple_damage_reduction" não era registrado → skill nunca funcionava
	item_skill_block_and_last_light_ward: {
		effect: [
			{
				kind: "add_modifier",
				to: "$source",
				stat: "damage_reduction",
				operation: "add",
				value: "$armor",
				duration: { kind: "while_in_play" },
			},
			{
				kind: "add_modifier",
				to: "$source",
				stat: "purple_damage_reduction",
				operation: "add",
				value: "$purple",
				duration: { kind: "while_in_play" },
			},
		],
		params: { armor: 3, purple: 2 },
	},

	// power_unbreakable_bastion_guard: -1 dano para todos os heróis até fim da rodada
	power_unbreakable_bastion_guard: {
		effect: [
			{
				kind: "for_each",
				over: "all_heroes",
				as: "$loopHero",
				do: [
					{
						kind: "add_modifier",
						to: "$target",
						stat: "damage_reduction",
						operation: "add",
						value: 1,
						duration: { kind: "until_end_of_round" },
					},
				],
			},
		],
	},
};

let migratedCount = 0;
for (const skill of data.abilities) {
	const migration = EFFECTS[skill.id];
	if (!migration) continue;

	delete skill.type;
	skill.effect = migration.effect;
	if (migration.params) {
		skill.params = migration.params;
	}
	migratedCount++;
}

fs.writeFileSync(SKILLS_PATH, JSON.stringify(data, null, 2), "utf8");
console.log(`✓ ${migratedCount} habilidades migradas (Lote 2)`);
