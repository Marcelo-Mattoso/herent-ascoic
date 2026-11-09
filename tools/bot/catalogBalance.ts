import { cardAbilityGrants, lookupAbilityById } from "@/core/data/abilities";
import { getAllCards } from "@/core/data/cards";
import { getEnabledExpansions, getExpansionCardMetadata } from "@/core/data/expansions";
import type { AnyCard, CreatureCard, HeroCard, ItemCard, RoomCard } from "@/core/data/cardTypes";
import { SKILLS } from "@/core/data/skills";

export type ThreatBand = "easy" | "medium" | "hard";

export interface SkillAudit {
	readonly id: string;
	readonly name: string;
	readonly activation: string;
	readonly trigger: string | null;
	readonly effectKinds: readonly string[];
	readonly impact: number;
}

interface CatalogEntry {
	readonly id: string;
	readonly name: string;
	readonly skills: readonly SkillAudit[];
}

export interface HeroAudit extends CatalogEntry {
	readonly life: number;
	readonly damage: number;
	readonly hitBonus: number;
	readonly dice: number;
}

export interface CreatureAudit extends CatalogEntry {
	readonly life: number;
	readonly damage: number;
	readonly hitBonus: number;
	readonly dice: number;
	readonly xp: number;
	readonly score: number;
	readonly band: ThreatBand;
}

export interface RoomAudit extends CatalogEntry {
	readonly enemiesByPlayers: readonly number[];
	readonly exits: number;
	readonly specialCreatureId: string | null;
	readonly scoreByPlayers: readonly number[];
	readonly bandByPlayers: readonly ThreatBand[];
}

export interface ItemAudit extends CatalogEntry {
	readonly itemClass: ItemCard["itemClass"];
	readonly equipmentSlot: ItemCard["equipmentSlot"] | null;
	readonly impact: number;
}

export interface ExpansionAudit {
	readonly id: string;
	readonly name: string;
	readonly bossId: string | null;
	readonly heroes: readonly HeroAudit[];
	readonly creatures: readonly CreatureAudit[];
	readonly rooms: readonly RoomAudit[];
	readonly items: readonly ItemAudit[];
	readonly artifactCount: number;
	readonly subbossCount: number;
	readonly creatureBands: Readonly<Record<ThreatBand, number>>;
	readonly roomBandsByPlayers: readonly Readonly<Record<ThreatBand, number>>[];
	readonly roomsBelowFourEnemies: number;
	readonly avgCreatureScore: number;
	readonly avgRoomScoreByPlayers: readonly number[];
}

export interface CatalogBalance {
	readonly method: string;
	readonly referenceExpansionId: string;
	readonly creatureThresholds: readonly [number, number];
	readonly roomThresholdsByPlayers: readonly (readonly [number, number])[];
	readonly expansions: readonly ExpansionAudit[];
}

const bands: readonly ThreatBand[] = ["easy", "medium", "hard"];
const skillById = new Map(SKILLS.abilities.map((skill) => [skill.id, skill]));

function safeNumber(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function effectKinds(value: unknown): string[] {
	if (Array.isArray(value)) return value.flatMap(effectKinds);
	if (!value || typeof value !== "object") return [];
	const node = value as Record<string, unknown>;
	const here = typeof node.kind === "string" ? [node.kind] : [];
	// Scan only nested effect bodies, not arbitrary condition or target objects.
	return [...here, ...["do", "then", "else", "effect", "options"].flatMap((key) => effectKinds(node[key]))];
}

const effectImpact: Readonly<Record<string, number>> = {
	i_damage: 2.5,
	i_apply_poison: 2.6,
	i_apply_damage_over_time: 2.6,
	i_heal: 1.4,
	i_full_heal: 2,
	i_prevent_destroy: 2,
	i_discard: 1.8,
	i_draw: 1,
	i_draw_and_choose: 1.5,
	i_advance_dungeon: 1.5,
	i_recover_dungeon: 1.5,
	i_choose_one: 0.6,
	p_modifier: 1.3,
	p_block: 1.4,
	add_trigger: 1.3,
	i_reroll: 1,
	i_set_die: 1.4,
	i_poison_ward: 1.6,
};

function describeSkills(card: AnyCard): SkillAudit[] {
	return cardAbilityGrants(card.id)
		.filter((grant) => grant.requiresAwakening !== true)
		.map((grant) => {
			const ability = lookupAbilityById(grant.abilityId);
			const legacy = skillById.get(grant.abilityId);
			const kinds = effectKinds(ability?.effect ?? legacy?.effect);
			const impact = 0.7 + kinds.reduce((total, kind) => total + (effectImpact[kind] ?? 0.4), 0) +
				(ability?.script || legacy?.script ? 1.5 : 0);
			return {
				id: grant.abilityId,
				name: legacy?.id ?? grant.abilityId,
				activation: grant.activation.kind,
				trigger: grant.activation.event ?? legacy?.trigger?.event ?? null,
				effectKinds: kinds,
				impact: Math.round(impact * 10) / 10,
			};
		});
}

function nameOf(card: AnyCard): string {
	return getExpansionCardMetadata(card.id)?.name ?? card.id;
}

function entryOf(card: AnyCard): CatalogEntry {
	return { id: card.id, name: nameOf(card), skills: describeSkills(card) };
}

function mean(values: readonly number[]): number {
	return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function threatScore(card: CreatureCard, skills: readonly SkillAudit[]): number {
	// All combat stats are WHITE (index 0); purple-only skills are excluded.
	return Math.round(10 * (card.life[0] * 1.2 + card.damage * 2 +
		card.hitBonus[0] * 0.7 + card.diceByColor[0] * 1.5 +
		skills.reduce((sum, skill) => sum + skill.impact, 0))) / 10;
}

function thresholds(scores: readonly number[]): [number, number] {
	if (!scores.length) return [0, 0];
	const sorted = [...scores].sort((a, b) => a - b);
	return [sorted[Math.min(sorted.length - 1, Math.floor(sorted.length / 3))]!,
		sorted[Math.min(sorted.length - 1, Math.floor(2 * sorted.length / 3))]!];
}

export function classifyThreat(score: number, cuts: readonly [number, number]): ThreatBand {
	return score <= cuts[0] ? "easy" : score <= cuts[1] ? "medium" : "hard";
}

function countBands(values: readonly ThreatBand[]): Record<ThreatBand, number> {
	return { easy: values.filter((v) => v === "easy").length,
		medium: values.filter((v) => v === "medium").length,
		hard: values.filter((v) => v === "hard").length };
}

function rawRoomScore(room: RoomCard, playerIndex: number, creatureMean: number, skills: readonly SkillAudit[]): number {
	// Room impact includes the actual number of enemies for 1–4 players.
	// SpecialCreatureId is recorded separately: it may replace a normal spawn.
	const enemyCount = room.enemiesByPlayers[playerIndex] ?? 0;
	return Math.round(10 * (enemyCount * creatureMean +
		skills.reduce((sum, skill) => sum + skill.impact, 0) * 1.5)) / 10;
}

export function buildCatalogBalance(selectedExpansions?: readonly string[]): CatalogBalance {
	const enabled = getEnabledExpansions();
	const all = getAllCards();
	const allByExpansion = (id: string) => all.filter((card) => getExpansionCardMetadata(card.id)?.expansionId === id);
	const reference = enabled.find((pack) => pack.id === "fornalha-sombria") ?? enabled[0];
	if (!reference) throw new Error("Nenhuma expansão habilitada para auditoria.");
	const referenceCards = allByExpansion(reference.id);
	const baselineCreatures = referenceCards.filter((c): c is CreatureCard => c.type === "creature");
	const baselineScores = baselineCreatures.map((c) => threatScore(c, describeSkills(c)));
	const creatureCuts = thresholds(baselineScores);
	const baselineMean = mean(baselineScores);
	const baselineRooms = referenceCards.filter((c): c is RoomCard => c.type === "room");
	const roomCuts = [0, 1, 2, 3].map((p) => thresholds(
		baselineRooms.map((room) => rawRoomScore(room, p, baselineMean, describeSkills(room))),
	));
	const chosen = selectedExpansions
		? enabled.filter((pack) => selectedExpansions.includes(pack.id))
		: enabled;
	const expansions: ExpansionAudit[] = chosen.map((pack) => {
		const cards = allByExpansion(pack.id);
		const heroes = cards.filter((c): c is HeroCard => c.type === "hero").map((card) => ({
			...entryOf(card), life: card.life[0], damage: card.damage,
			hitBonus: card.hitBonus[0], dice: card.diceByColor[0],
		}));
		const rawCreatures = cards.filter((c): c is CreatureCard => c.type === "creature");
		const creatures: CreatureAudit[] = rawCreatures.map((card) => {
			const common = entryOf(card);
			const score = threatScore(card, common.skills);
			return { ...common, life: card.life[0], damage: card.damage,
				hitBonus: card.hitBonus[0], dice: card.diceByColor[0], xp: card.xp,
				score, band: classifyThreat(score, creatureCuts) };
		});
		const creatureMean = mean(creatures.map((c) => c.score));
		const rooms: RoomAudit[] = cards
			.filter((c): c is RoomCard => c.type === "room")
			.map((card) => {
				const common = entryOf(card);
				const scores = [0, 1, 2, 3].map((p) => rawRoomScore(card, p, creatureMean, common.skills));
				return { ...common, enemiesByPlayers: [...card.enemiesByPlayers],
					exits: card.exits, specialCreatureId: card.specialCreatureId ?? null,
					scoreByPlayers: scores, bandByPlayers: scores.map((score, p) => classifyThreat(score, roomCuts[p]!)) };
			});
		const items: ItemAudit[] = cards.filter((c): c is ItemCard => c.type === "item").map((card) => {
			const common = entryOf(card);
			return { ...common, itemClass: card.itemClass, equipmentSlot: card.equipmentSlot ?? null,
				impact: Math.round(common.skills.reduce((sum, skill) => sum + skill.impact, 0) * 10) / 10 };
		});
		return {
			id: pack.id, name: pack.name,
			bossId: cards.find((card) => card.type === "boss")?.id ?? null,
			heroes, creatures, rooms, items,
			artifactCount: cards.filter((card) => card.type === "artifact").length,
			subbossCount: cards.filter((card) => card.type === "subboss").length,
			creatureBands: countBands(creatures.map((creature) => creature.band)),
			roomBandsByPlayers: [0, 1, 2, 3].map((p) => countBands(rooms.map((room) => room.bandByPlayers[p]!))),
			roomsBelowFourEnemies: rooms.filter((room) => (room.enemiesByPlayers[3] ?? 0) < 4).length,
			avgCreatureScore: Math.round(creatureMean * 10) / 10,
			avgRoomScoreByPlayers: [0, 1, 2, 3].map((p) =>
				Math.round(mean(rooms.map((room) => room.scoreByPlayers[p]!)) * 10) / 10),
		};
	});
	return {
		method: "Índice exploratório: vida, dano, acerto e dados brancos; impacto declarado de skills não roxas; salas por 1–4 heróis. Faixas ancoradas nos tercis da Fornalha Sombria. Não substitui playtest.",
		referenceExpansionId: reference.id,
		creatureThresholds: creatureCuts,
		roomThresholdsByPlayers: roomCuts,
		expansions,
	};
}

function esc(text: unknown): string {
	return String(text ?? "").replace(/[&<>"']/g, (ch) =>
		({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch);
}

function pctDelta(value: number, base: number): string {
	return base ? ((100 * (value - base)) / base).toFixed(1) + "%" : "n/d";
}

function skillNames(skills: readonly SkillAudit[]): string {
	return skills.map((s) => s.id + (s.trigger ? " [" + s.trigger + "]" : "")).join(", ") || "—";
}

function markdownTable(header: readonly string[], rows: readonly (readonly unknown[])[]): string[] {
	return ["| " + header.join(" | ") + " |", "| " + header.map(() => "---").join(" | ") + " |",
		...rows.map((row) => "| " + row.map(String).join(" | ") + " |")];
}

export function renderCatalogMarkdown(data: CatalogBalance): string {
	const base = data.expansions.find((item) => item.id === data.referenceExpansionId);
	const lines: string[] = ["# Auditoria de leveling — cartas por expansão", "",
		data.method, "", "## Comparação com a Fornalha Sombria", ""];
	lines.push(...markdownTable(["Expansão", "Heróis", "Criaturas", "Itens", "Salas",
		"Criaturas (F/M/D)", "Salas 4 heróis (F/M/D)", "Salas com menos de 4 inimigos",
		"Índice criaturas vs base", "Índice sala 4p vs base"],
		data.expansions.map((p) => [p.name, p.heroes.length, p.creatures.length, p.items.length,
			p.rooms.length, bands.map((t) => p.creatureBands[t]).join("/"),
			bands.map((t) => p.roomBandsByPlayers[3]?.[t] ?? 0).join("/"),
			p.roomsBelowFourEnemies, pctDelta(p.avgCreatureScore, base?.avgCreatureScore ?? 0),
			pctDelta(p.avgRoomScoreByPlayers[3] ?? 0, base?.avgRoomScoreByPlayers[3] ?? 0)])));
	for (const p of data.expansions) {
		lines.push("", "## " + p.name, "", "### Heróis — atributos brancos", "");
		lines.push(...markdownTable(["Herói", "Vida", "Dano", "Acerto", "Dados", "Habilidades"],
			p.heroes.map((h) => [h.name, h.life, h.damage, h.hitBonus, h.dice, skillNames(h.skills)])));
		lines.push("", "### Criaturas — atributos brancos e habilidades não roxas", "");
		lines.push(...markdownTable(["Criatura", "Vida", "Dano", "Acerto", "Dados", "Índice", "Faixa", "Habilidades"],
			p.creatures.map((c) => [c.name, c.life, c.damage, c.hitBonus, c.dice,
				c.score, c.band, skillNames(c.skills)])));
		lines.push("", "### Salas — inimigos para 1/2/3/4 jogadores", "");
		lines.push(...markdownTable(["Sala", "Inimigos 1/2/3/4", "Índice 4p", "Faixa 4p", "Saídas", "Criatura especial", "Habilidades"],
			p.rooms.map((r) => [r.name, r.enemiesByPlayers.join("/"), r.scoreByPlayers[3],
				r.bandByPlayers[3], r.exits, r.specialCreatureId ?? "—", skillNames(r.skills)])));
		lines.push("", "### Itens — equipamento, consumíveis e habilidades", "");
		lines.push(...markdownTable(["Item", "Classe", "Slot", "Índice de efeitos", "Habilidades"],
			p.items.map((item) => [item.name, item.itemClass, item.equipmentSlot ?? "—", item.impact, skillNames(item.skills)])));
		for (let pCount = 1; pCount <= 4; pCount++) {
			const counts = p.roomBandsByPlayers[pCount - 1]!;
			lines.push("", "Salas para " + pCount + " heróis: " +
				bands.map((band) => band + " " + counts[band]).join(" · "));
		}
	}
	lines.push("", "Observação: classificação heurística, sem análise de campanha, progressão de cores, efeitos roxos ou estratégias ideais.", "");
	return lines.join("\n");
}

export function renderCatalogCsv(data: CatalogBalance): string {
	const columns = ["expansion", "type", "id", "name", "tier", "score", "life_white", "damage_white",
		"hit_white", "dice_white", "enemies_1_2_3_4", "room_tiers_1_2_3_4",
		"item_class", "slot", "skills"];
	const lines: string[][] = [columns];
	const skills = (entry: CatalogEntry) => entry.skills.map((s) => s.id).join(";");
	for (const expansion of data.expansions) {
		for (const h of expansion.heroes) lines.push([expansion.id, "hero", h.id, h.name, "", "",
			String(h.life), String(h.damage), String(h.hitBonus), String(h.dice), "", "", "", "", skills(h)]);
		for (const c of expansion.creatures) lines.push([expansion.id, "creature", c.id, c.name,
			c.band, String(c.score), String(c.life), String(c.damage), String(c.hitBonus), String(c.dice),
			"", "", "", "", skills(c)]);
		for (const r of expansion.rooms) lines.push([expansion.id, "room", r.id, r.name,
			r.bandByPlayers[3]!, String(r.scoreByPlayers[3]), "", "", "", "",
			r.enemiesByPlayers.join("/"), r.bandByPlayers.join("/"), "", "", skills(r)]);
		for (const item of expansion.items) lines.push([expansion.id, "item", item.id, item.name,
			"", String(item.impact), "", "", "", "", "", "", item.itemClass,
			item.equipmentSlot ?? "", skills(item)]);
	}
	return lines.map((row) => row.map((value) => '"' + value.replaceAll('"', '""') + '"').join(",")).join("\n") + "\n";
}

export function renderCatalogHtml(data: CatalogBalance): string {
	const base = data.expansions.find((p) => p.id === data.referenceExpansionId);
	const table = (headers: readonly string[], rows: readonly (readonly unknown[])[]) =>
		'<div class="scroll"><table><thead><tr>' + headers.map((h) => "<th>" + esc(h) + "</th>").join("") +
		"</tr></thead><tbody>" + rows.map((r) => "<tr>" + r.map((c) => "<td>" + esc(c) + "</td>").join("") +
		"</tr>").join("") + "</tbody></table></div>";
	const summary = table(["Expansão", "Heróis", "Criaturas F/M/D", "Salas 4p F/M/D", "Itens",
		"Salas 4p sem 4 inimigos", "Criaturas vs base", "Salas 4p vs base"],
		data.expansions.map((p) => [p.name, p.heroes.length,
			bands.map((tier) => p.creatureBands[tier]).join("/"),
			bands.map((tier) => p.roomBandsByPlayers[3]?.[tier] ?? 0).join("/"),
			p.items.length, p.roomsBelowFourEnemies,
			pctDelta(p.avgCreatureScore, base?.avgCreatureScore ?? 0),
			pctDelta(p.avgRoomScoreByPlayers[3] ?? 0, base?.avgRoomScoreByPlayers[3] ?? 0)]));
	const sections = data.expansions.map((p) => {
		const heroes = table(["Herói", "Vida", "Dano", "Acerto", "Dados", "Habilidades"],
			p.heroes.map((h) => [h.name, h.life, h.damage, h.hitBonus, h.dice, skillNames(h.skills)]));
		const creatures = table(["Criatura", "Vida", "Dano", "Acerto", "Dados", "Índice", "Faixa", "Habilidades"],
			p.creatures.map((c) => [c.name, c.life, c.damage, c.hitBonus, c.dice,
				c.score, c.band, skillNames(c.skills)]));
		const rooms = table(["Sala", "Inimigos (1/2/3/4)", "Faixas (1/2/3/4)", "Índice 4p", "Saídas", "Habilidades"],
			p.rooms.map((r) => [r.name, r.enemiesByPlayers.join("/"), r.bandByPlayers.join("/"),
				r.scoreByPlayers[3], r.exits, skillNames(r.skills) +
				(r.specialCreatureId ? " · especial: " + r.specialCreatureId : "")]));
		const items = table(["Item", "Classe", "Slot", "Índice", "Habilidades"],
			p.items.map((it) => [it.name, it.itemClass, it.equipmentSlot ?? "—",
				it.impact, skillNames(it.skills)]));
		return "<section><h2>" + esc(p.name) + "</h2><p>Salas com menos de quatro inimigos para quatro heróis: <strong>" +
			p.roomsBelowFourEnemies + "/" + p.rooms.length + "</strong>.</p><h3>Heróis</h3>" + heroes +
			"<h3>Criaturas</h3>" + creatures + "<h3>Salas</h3>" + rooms + "<h3>Itens e equipamentos</h3>" + items + "</section>";
	}).join("");
	return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>' +
		'<meta name="robots" content="noindex,nofollow"/><title>Auditoria de cartas | Ascensão Heróica</title>' +
		'<style>:root{color-scheme:dark;font:15px system-ui;color:#e4eef7;background:#090f1a}' +
		'body{max-width:1400px;padding:36px;margin:auto}h1,h2{color:#fff}h2{margin-top:52px}' +
		'h3{margin-top:28px;color:#9ee0c8}.lead{color:#aebdce;max-width:950px;line-height:1.6}' +
		'.scroll{overflow-x:auto;border:1px solid #314156;border-radius:12px;margin:12px 0 26px}' +
		'table{border-collapse:collapse;width:100%;font-size:13px}td,th{padding:10px;text-align:left;border-bottom:1px solid #28374a;vertical-align:top}' +
		'th{background:#19293b;color:#c4d7e9;white-space:nowrap}tr:nth-child(even){background:#121f2e}' +
		'a{color:#8ce5cd}</style></head><body><a href="index.html">← Ensaio de partidas</a>' +
		'<h1>Leveling · cartas e dificuldade por expansão</h1><p class="lead">' +
		esc(data.method) + ' Os índices e as faixas são comparáveis à Fornalha Sombria (referência fixa); não são resultados empíricos de vitórias.</p>' +
		'<h2>Comparativo</h2>' + summary + sections + '</body></html>';
}
