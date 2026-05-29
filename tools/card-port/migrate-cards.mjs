#!/usr/bin/env node
// Migra src/data/cards.json: slots tipados → skills: SkillRef[]
// Também remove `usedBy` de src/data/skills.json (decisão (a) do Patch-13 Fase 0).

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const cardsPath = resolve(root, "src/data/cards.json");
const skillsPath = resolve(root, "src/data/skills.json");

const cards = JSON.parse(readFileSync(cardsPath, "utf8"));
const skillsData = JSON.parse(readFileSync(skillsPath, "utf8"));

const nameToId = Object.fromEntries(
	skillsData.abilities.map((a) => [a.name, a.id]),
);
const skillById = Object.fromEntries(
	skillsData.abilities.map((a) => [a.id, a]),
);

function resolveSkillId(ab) {
	if (ab.skillId) return ab.skillId;
	if (ab.name && nameToId[ab.name]) return nameToId[ab.name];
	throw new Error(
		`Não foi possível resolver skillId para: ${JSON.stringify(ab)}`,
	);
}

function makeRef(ab, requiresAwakening) {
	const skillId = resolveSkillId(ab);
	const ref = { skillId };
	if (ab.value != null) ref.params = { value: ab.value };
	if (requiresAwakening) ref.requiresAwakening = true;
	return ref;
}

const KEEP_FIELDS = new Set([
	"id",
	"type",
	"name",
	"diceByColor",
	"life",
	"hitBonus",
	"damage",
	"xp",
	"reward",
	"rewardType",
	"exits",
	"enemiesByPlayers",
	"specialCreature",
	"linkedSubbossName",
	"itemClass",
	"tags",
	"countsAs",
	"dice",
	"lifeBase",
	"hitBonusBase",
	"condition",
	"artifactBonus",
	"dungeonScaling",
	"victory",
	"accessCondition",
	"style",
]);

let migratedCount = 0;
let skillRefCount = 0;

const migrated = cards.map((card) => {
	const out = {};

	// Copia campos que não são slots de habilidade
	for (const [k, v] of Object.entries(card)) {
		if (KEEP_FIELDS.has(k)) out[k] = v;
	}

	// Coleta skills[] a partir dos slots
	const skills = [];

	if (card.type === "hero") {
		if (card.skill) skills.push(makeRef(card.skill, false));
		if (card.power) skills.push(makeRef(card.power, false));
	} else if (card.type === "creature" || card.type === "subboss") {
		if (card.effect) skills.push(makeRef(card.effect, false));
		if (card.purpleEffect) skills.push(makeRef(card.purpleEffect, true));
	} else if (
		card.type === "room" ||
		card.type === "subboss_room" ||
		card.type === "item" ||
		card.type === "artifact"
	) {
		if (card.effect) skills.push(makeRef(card.effect, false));
	} else if (card.type === "boss") {
		// Boss: abilities[] mantém name, mas effect → skills[]
		out.abilities = card.abilities.map((ab) => ({
			name: ab.name,
			skills: [makeRef(ab.effect, false)],
		}));
	}

	if (skills.length > 0) out.skills = skills;
	skillRefCount += skills.length;
	migratedCount++;
	return out;
});

writeFileSync(cardsPath, JSON.stringify(migrated, null, 2), "utf8");

// Remove usedBy de skills.json (decisão (a))
const migratedSkills = {
	...skillsData,
	abilities: skillsData.abilities.map(({ usedBy: _usedBy, ...rest }) => rest),
};
writeFileSync(skillsPath, JSON.stringify(migratedSkills, null, 2), "utf8");

console.log(`Migradas: ${migratedCount} cartas, ${skillRefCount} skill refs`);
console.log("usedBy removido de skills.json");

// Validação básica
let errs = 0;
for (const card of migrated) {
	if (card.type === "boss") {
		for (const ab of card.abilities ?? []) {
			for (const ref of ab.skills ?? []) {
				if (!skillById[ref.skillId]) {
					console.error(
						`ERRO: ${card.id} boss ability "${ab.name}" skillId "${ref.skillId}" não existe`,
					);
					errs++;
				}
			}
		}
	}
	for (const ref of card.skills ?? []) {
		if (!skillById[ref.skillId]) {
			console.error(`ERRO: ${card.id} skillId "${ref.skillId}" não existe`);
			errs++;
		}
	}
}
if (errs === 0)
	console.log("Validação OK: todos os skillIds existem em skills.json");
else console.error(`${errs} erros de integridade referencial`);
