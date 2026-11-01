import { EXPANSIONS } from "@/config/expansions";
import type { AnyCard } from "./cardTypes";
import type { CardLocale } from "./cardLocale";

const files = import.meta.glob("../../data/expansions/*/cards.json", {
	eager: true,
	query: "?raw",
	import: "default",
}) as Record<string, string>;

const localeFields = [
	"name", "characterName", "style", "tags", "condition", "victory",
	"dice", "artifactBonus", "dungeonScaling",
] as const;
const cardTypes = new Set([
	"hero", "creature", "subboss", "room", "subboss_room", "item", "artifact", "boss",
]);

export const EXPANSION_CARDS: AnyCard[] = [];
export const EXPANSION_CARD_LOCALE: Record<string, CardLocale> = {};

const configuredIds = new Set<string>();
for (const expansion of EXPANSIONS) {
	if (!expansion.id || configuredIds.has(expansion.id)) {
		throw new Error(`ID de expansão inválido ou duplicado: ${expansion.id}`);
	}
	configuredIds.add(expansion.id);
	if (!expansion.enabled || ("legacy" in expansion && expansion.legacy)) continue;

	const file = `../../data/expansions/${expansion.id}/cards.json`;
	if (!files[file]) throw new Error(`Expansão habilitada sem ${file}`);
	const catalog: unknown = JSON.parse(files[file]);
	if (!catalog || typeof catalog !== "object" || !Array.isArray((catalog as { cards?: unknown }).cards)) {
		throw new Error(`Catálogo inválido em ${file}: esperado { "cards": [...] }`);
	}
	if (Object.keys(catalog).some((key) => key !== "cards")) {
		throw new Error(`Catálogo ${file} aceita apenas cards; habilidades são globais`);
	}
	for (const entry of (catalog as { cards: unknown[] }).cards) {
		if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
			throw new Error(`Carta inválida em ${file}`);
		}
		const raw = entry as Record<string, unknown>;
		if (typeof raw.id !== "string" || !raw.id || !cardTypes.has(String(raw.type))) {
			throw new Error(`Carta sem id ou type válido em ${file}`);
		}
		if (typeof raw.name !== "string" || !raw.name.trim()) {
			throw new Error(`Carta ${raw.id} sem name em ${file}`);
		}
		if (!Array.isArray(raw.skills)) {
			throw new Error(`Carta ${raw.id} precisa de skills (use [] quando não houver)`);
		}
		if (raw.skills.some((skill) =>
			!skill || typeof skill !== "object" || Array.isArray(skill) ||
			typeof (skill as { skillId?: unknown }).skillId !== "string" ||
			Object.keys(skill).some((key) => !["skillId", "params", "requiresAwakening"].includes(key))
		)) {
			throw new Error(`Carta ${raw.id} contém habilidade embutida; use apenas skillId global`);
		}
		if ("abilities" in raw || "effects" in raw || "effect" in raw) {
			throw new Error(`Carta ${raw.id} contém definição de habilidade; use o catálogo global`);
		}
		if (EXPANSION_CARD_LOCALE[raw.id]) {
			throw new Error(`ID de carta duplicado nas expansões: ${raw.id}`);
		}
		const mechanics = { ...raw };
		const locale: Record<string, unknown> = {};
		for (const field of localeFields) {
			if (field in mechanics) {
				locale[field] = mechanics[field];
				delete mechanics[field];
			}
		}
		EXPANSION_CARDS.push(mechanics as unknown as AnyCard);
		EXPANSION_CARD_LOCALE[raw.id] = locale as unknown as CardLocale;
	}
}
