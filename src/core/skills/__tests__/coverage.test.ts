// Harness de cobertura — roda TODA skill do catálogo pelo core (Patch-17).
// Mede resolução + ausência de erro/[NÃO IMPLEMENTADA], NÃO correção semântica.
// ctx genérico: 1 herói h1 (ferido, 1 item na mochila), 1 inimigo e1, despertar:1.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SKILLS } from "../../data/skills";
import type { SkillContext, SkillDefinition } from "../../data/skillTypes";
import { drainStack } from "../../effects/resolver";
import type { EnemyState } from "../../state/enemyState";
import type { GameState } from "../../state/gameState";
import { createInitialGameState } from "../../state/gameState";
import { createEmptyCombatState } from "../../state/combatState";
import type { HeroState } from "../../state/heroState";
import { buildScriptCtx } from "../../scripts/context";
import { getScript } from "../../scripts/registry";
import { evaluate } from "../dsl/evaluate";
import { getHandler } from "../registry";
import "../handlers/index"; // popula o registry de handlers legados

const CFG = { heroCardNames: ["Bárbaro Rubro"] };

function makeHero(): HeroState {
	return {
		id: "h1",
		cardId: "hero_crimson_barbarian",
		cardName: "Bárbaro Rubro",
		maxLife: 10,
		currentLife: 7,
		damage: 3,
		hitBonus: 0,
		dice: 2,
		impeto: 0,
		activeItems: {},
		backpack: ["Adaga"],
		usedPowers: {},
		conditions: [],
		status: "active",
		playerIndex: 0,
		xp: 0,
	};
}
function makeEnemy(): EnemyState {
	return {
		id: "e1",
		cardId: "creature_dark_cave_goblin",
		cardName: "Goblin",
		maxLife: 4,
		currentLife: 4,
		damage: 1,
		hitBonus: 0,
		dice: 1,
		tokens: {},
		conditions: [],
		firstDamageTakenThisTurn: false,
		status: "active",
	};
}

// Fixture "rica" para reduzir falsos-positivos no-effect: dado rolado, decks com cartas
// (available + descarte), combate ativo com par h1↔e1, e uma sala ativa.
function baseState(): GameState {
	const s = createInitialGameState(CFG);
	const deck = (available: string[], discarded: string[] = []) => ({
		available,
		discarded,
		removed: [] as string[],
	});
	return {
		...s,
		despertar: 1 as const,
		heroes: [makeHero()],
		activeEnemies: [makeEnemy()],
		currentRoom: {
			cardId: "dungeon_room_test",
			cardName: "Sala de Teste",
			exits: 2,
			currentEnemies: 1,
			reward: 1,
			rewardType: "item",
			effect: "",
			xp: 1,
			status: "active",
		},
		decks: {
			dungeonDeck: deck(["Sala A", "Sala B", "Sala C"], ["Sala Descartada"]),
			enemyDeck: deck(["Goblin", "Orc"]),
			itemDeck: deck(["Espada", "Escudo", "Poção"], ["Adaga Velha"]),
			artifactDeck: deck(["Amuleto", "Anel"]),
		},
		combat: {
			...createEmptyCombatState(),
			round: 1,
			phase: "resolving",
			selectedHeroId: "h1",
			pairs: [{ heroId: "h1", enemyId: "e1" }],
			lastRoll: {
				heroId: "h1",
				enemyId: "e1",
				heroResults: [3, 4],
				heroTotal: 7,
				heroBreakdown: [],
				enemyResults: [2],
				enemyTotal: 2,
				enemyBreakdown: [],
			},
		},
	};
}

type Status = "ok" | "no-effect" | "unimplemented" | "error";
interface Row {
	id: string;
	path: "effect" | "script" | "type" | "none";
	status: Status;
	detail?: string;
}

function logHasUnimpl(s: GameState, id: string): boolean {
	return (s.eventLog ?? []).some(
		(l) => typeof l === "string" && l.includes(`[SKILL NÃO IMPLEMENTADA: ${id}]`),
	);
}
function pathOf(def: SkillDefinition): Row["path"] {
	return def.effect ? "effect" : def.script ? "script" : def.type ? "type" : "none";
}

// Snapshot do estado de jogo IGNORANDO eventLog e effectStack (sempre mudam por log/dreno).
// Se o resto for idêntico antes/depois, a skill não teve efeito observável.
function snapshot(s: GameState): string {
	const { eventLog: _e, effectStack: _f, ...rest } = s as GameState & Record<string, unknown>;
	return JSON.stringify(rest);
}

// Classifica o resultado: rodou + mudou estado = ok; rodou sem mudar = no-effect.
function classify(before: GameState, after: GameState, id: string): { status: Status } {
	if (logHasUnimpl(after, id)) return { status: "unimplemented" };
	return snapshot(after) !== snapshot(before) ? { status: "ok" } : { status: "no-effect" };
}

function runSkill(def: SkillDefinition): { status: Status; detail?: string } {
	const state = baseState();
	const base = def.trigger ?? "on_use";
	const rawValue = def.defaultValue ?? 3;
	// Espelha normalização de dispatch.ts: "X/Y" → X (número)
	const normalizedValue: number | string | null =
		typeof rawValue === "string" && rawValue.includes("/")
			? Number(rawValue.split("/")[0]) || 0
			: rawValue;
	const ctx: SkillContext = {
		triggeredBy: (base.includes("_on_") ? base.split("_on_").pop() : base) as never,
		skillId: def.id,
		sourceHeroId: "h1",
		targetHeroIds: ["h1"],
		targetEnemyIds: ["e1"],
		value: rawValue,
	};
	const params = { ...(def.params ?? {}), value: normalizedValue };
	try {
		if (def.effect) {
			const out = drainStack(evaluate(def.effect, buildScriptCtx(state, ctx, params)));
			return classify(state, out, def.id);
		}
		if (def.script) {
			const fn = getScript(`${def.script}.run`);
			if (!fn) return { status: "unimplemented", detail: "script não registrado" };
			const out = drainStack(fn(buildScriptCtx(state, ctx, params)));
			return classify(state, out, def.id);
		}
		const type = def.type ?? "noop";
		if (type === "noop") return { status: "unimplemented", detail: "type ausente" };
		const handler = getHandler(type);
		if (!handler) return { status: "unimplemented", detail: `handler ${type} ausente` };
		const out = drainStack(handler(state, ctx, ctx.value ?? null));
		return classify(state, out, def.id);
	} catch (e) {
		return { status: "error", detail: (e as Error).message };
	}
}

describe("cobertura de skills — todas rodam no core", () => {
	let warnSpy: ReturnType<typeof vi.spyOn>;
	beforeEach(() => {
		warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
	});
	afterEach(() => {
		warnSpy.mockRestore();
	});

	const rows: Row[] = SKILLS.abilities.map((def) => {
		const r = runSkill(def);
		return { id: def.id, path: pathOf(def), status: r.status, detail: r.detail };
	});

	it("relatório de cobertura (console)", () => {
		const by = (st: Status) => rows.filter((r) => r.status === st);
		const summary = `COBERTURA: ${by("ok").length} ok · ${by("no-effect").length} no-effect · ${by("unimplemented").length} unimplemented · ${by("error").length} error · total ${rows.length}`;
		process.stdout.write(`\n${summary}\n`);
		for (const r of rows.filter((x) => x.status !== "ok")) {
			process.stdout.write(`  [${r.status}] ${r.id} (${r.path}) ${r.detail ?? ""}\n`);
		}
		expect(rows.length).toBe(SKILLS.abilities.length);
	});

	it("nenhuma skill lança exceção", () => {
		const errored = rows.filter((r) => r.status === "error");
		expect(errored, JSON.stringify(errored, null, 2)).toHaveLength(0);
	});

	// Ratchet: baseline das skills sem implementação (type sem handler registrado).
	// A lista só pode ENCOLHER — ao migrar uma skill (patch-16), remova o id daqui.
	// Se uma skill NOVA aparecer como unimplemented, o teste falha.
	it("cobertura não regride (baseline)", () => {
		// Patch-16 Lote A removidos: dungeon_skill_dead_torches,
		// item_skill_drain_life_and_deadly_edge, item_skill_crimson_fury_mighty
		// Patch-16 Lote B removido: item_skill_mystic_draw
		// Patch-16 Lote C removidos: skill_rekindled_forge, skill_opportunity_shot,
		//   dungeon_skill_rekindled_forge, dungeon_skill_summon_guardian
		const KNOWN_UNIMPLEMENTED = new Set<string>();
		const unimpl = rows.filter((r) => r.status === "unimplemented").map((r) => r.id);
		const novos = unimpl.filter((id) => !KNOWN_UNIMPLEMENTED.has(id));
		expect(novos, `Skills quebraram (fora do baseline): ${novos.join(", ")}`).toHaveLength(0);
		const resolvidas = [...KNOWN_UNIMPLEMENTED].filter((id) => !unimpl.includes(id));
		if (resolvidas.length > 0) {
			process.stdout.write(
				`\n✅ Skills migradas — remova do baseline: ${resolvidas.join(", ")}\n`,
			);
		}
	});
});
