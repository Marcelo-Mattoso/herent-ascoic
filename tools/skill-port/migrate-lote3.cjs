#!/usr/bin/env node
/**
 * Migração Lote 3 (Patch-12 Fase 5): habilidades com choose_one.
 * Corrige purple_blood_tribute (não registrado) e dark_tribute.
 */
const fs = require("node:fs");
const path = require("node:path");

const SKILLS_PATH = path.join(__dirname, "../../src/data/skills.json");
const data = JSON.parse(fs.readFileSync(SKILLS_PATH, "utf8"));

const EFFECTS = {
	// skill_last_light_miracle: cure 2 de aliado OU +2 dano no próximo ataque
	skill_last_light_miracle: [
		{
			kind: "choose_one",
			options: [
				{
					label: "Curar 2",
					effect: [{ kind: "apply_heal", to: "$target", amount: 2 }],
				},
				{
					label: "+2 dano",
					effect: [
						{
							kind: "add_modifier",
							to: "$source",
							stat: "damage_bonus",
							operation: "add",
							value: 2,
							duration: { kind: "once" },
						},
					],
				},
			],
		},
	],

	// power_greater_last_light_miracle: curar totalmente OU sobreviver com 1 vida
	power_greater_last_light_miracle: [
		{
			kind: "choose_one",
			options: [
				{
					label: "Curar totalmente",
					effect: [{ kind: "apply_full_heal", to: "$target" }],
				},
				{
					label: "Sobreviver com 1 vida",
					effect: [{ kind: "prevent_destroy", to: "$target" }],
				},
			],
		},
	],

	// power_last_light_oath: curar 5 todos OU +5 dano sagrado no próximo ataque
	power_last_light_oath: [
		{
			kind: "choose_one",
			options: [
				{
					label: "Curar todos (5)",
					effect: [
						{
							kind: "for_each",
							over: "all_heroes",
							as: "$h",
							do: [{ kind: "apply_heal", to: "$target", amount: 5 }],
						},
					],
				},
				{
					label: "+5 dano sagrado",
					effect: [
						{
							kind: "add_modifier",
							to: "$source",
							stat: "damage_bonus",
							operation: "add",
							value: 5,
							duration: { kind: "once" },
						},
					],
				},
			],
		},
	],

	// skill_dark_tribute: descartar 1 item OU 1 carta de dungeon
	skill_dark_tribute: [
		{
			kind: "choose_one",
			options: [
				{
					label: "Descartar 1 item",
					effect: [{ kind: "discard_from", pile: "item", count: 1 }],
				},
				{
					label: "Descartar 1 carta de dungeon",
					effect: [{ kind: "discard_from", pile: "dungeon", count: 1 }],
				},
			],
		},
	],

	// purple_dark_tribute: mesma mecânica, efeito roxo
	purple_dark_tribute: [
		{
			kind: "choose_one",
			options: [
				{
					label: "Descartar 1 item",
					effect: [{ kind: "discard_from", pile: "item", count: 1 }],
				},
				{
					label: "Descartar 1 carta de dungeon",
					effect: [{ kind: "discard_from", pile: "dungeon", count: 1 }],
				},
			],
		},
	],

	// purple_blood_tribute: descartar 1 item OU sofrer 3 dano
	// CORRIGE: tipo "item_or_damage" nunca foi registrado → skill nunca funcionava
	purple_blood_tribute: [
		{
			kind: "choose_one",
			options: [
				{
					label: "Descartar 1 item",
					effect: [{ kind: "discard_from", pile: "item", count: 1 }],
				},
				{
					label: "Sofrer 3 dano",
					effect: [{ kind: "apply_damage", to: "$target", amount: 3 }],
				},
			],
		},
	],
};

let migratedCount = 0;
for (const skill of data.abilities) {
	const effect = EFFECTS[skill.id];
	if (!effect) continue;

	delete skill.type;
	skill.effect = effect;
	migratedCount++;
}

fs.writeFileSync(SKILLS_PATH, JSON.stringify(data, null, 2), "utf8");
console.log(`✓ ${migratedCount} habilidades migradas (Lote 3)`);
