#!/usr/bin/env node
// Gera tools/card-port/card-skill-map.md — mapa card→skill para Fase 0 do Patch-13.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const cards = JSON.parse(
	readFileSync(resolve(root, "src/data/cards.json"), "utf8"),
);
const skills = JSON.parse(
	readFileSync(resolve(root, "src/data/skills.json"), "utf8"),
);

const skillById = Object.fromEntries(skills.abilities.map((a) => [a.id, a]));
const nameToId = Object.fromEntries(
	skills.abilities.map((a) => [a.name, a.id]),
);

const SLOTS = ["skill", "power", "effect", "purpleEffect"];

function resolveSkillId(ab) {
	if (ab.skillId) return ab.skillId;
	if (ab.name && nameToId[ab.name]) return nameToId[ab.name];
	return null;
}

const lines = ["# Card→Skill Map (Patch-13 Fase 0)\n"];
lines.push(
	`Decisão **usedBy**: opção **(a)** — derivar em runtime, remover de skills.json.\n`,
);
lines.push(`Chave de params: \`value\` (compat com DSL \`$value\`).\n`);
lines.push("---\n");

const divergences = [];

for (const card of cards) {
	const refs = [];
	for (const slot of SLOTS) {
		const ab = card[slot];
		if (!ab) continue;
		const skillId = resolveSkillId(ab);
		if (!skillId) {
			refs.push(
				`  - **[ERRO]** slot \`${slot}\` sem skillId resolvível: ${JSON.stringify(ab)}`,
			);
			continue;
		}
		const def = skillById[skillId];
		const params =
			ab.value != null ? `{ value: ${JSON.stringify(ab.value)} }` : "—";
		const isPurple = slot === "purpleEffect" ? " ⚠ requiresAwakening:true" : "";
		refs.push(`  - \`${slot}\` → \`${skillId}\`  params: ${params}${isPurple}`);
		// Divergences
		if (def && ab.trigger && ab.trigger !== def.trigger) {
			divergences.push(
				`${card.id}::${slot} trigger card=${ab.trigger} skill=${def.trigger}`,
			);
		}
		if (def && ab.target && ab.target !== def.target) {
			divergences.push(
				`${card.id}::${slot} target card=${ab.target} skill=${def.target}`,
			);
		}
		if (def && ab.type && def.type && ab.type !== def.type) {
			divergences.push(
				`${card.id}::${slot} type card=${ab.type} skill=${def.type}`,
			);
		}
	}
	if (refs.length) {
		lines.push(`### \`${card.id}\` (${card.type})`);
		lines.push(refs.join("\n"));
		lines.push("");
	}
}

lines.push("---\n");
lines.push("## Divergências type/trigger/target (card vs skill)\n");
if (divergences.length === 0) {
	lines.push(
		"Nenhuma divergência detectada — card é mais antigo mas skill vence, nenhum dado se perde.",
	);
} else {
	for (const d of divergences) lines.push(`- ${d}`);
}
lines.push("");

const out = lines.join("\n");
writeFileSync(resolve(root, "tools/card-port/card-skill-map.md"), out, "utf8");
console.log(
	`Gerado: tools/card-port/card-skill-map.md (${cards.length} cartas)`,
);
