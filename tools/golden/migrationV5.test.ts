import { describe, expect, it } from "vitest";
import { PARTY_PLAYER } from "@/core/choices";
import snapshotV4 from "@/core/persistence/__fixtures__/snapshot.v4.json";
import {
	MIGRATIONS,
	migrateState,
	unwrapSnapshot,
} from "@/core/persistence/migrations";
import {
	effectStackOf,
	pausedOf,
	pendingChoicesOf,
	pendingSkillChoiceOf,
	pendingSkillTargetOf,
	pendingSkillWindowOf,
	pendingTriggerInterruptOf,
} from "@/core/state/access";
import type { GameState } from "@/core/state/gameState";
import { gameOf } from "@/engine/state";

const json = (value: unknown) => JSON.parse(JSON.stringify(value));

describe("migração v4→v5 ({engine, game})", () => {
	it("snapshot v4 congelado mantém os dados do jogo e move o resto para o envelope (pendências em engine.pending, pilha em engine.stack)", () => {
		const migrated = unwrapSnapshot(snapshotV4) as GameState;
		const flat = json(snapshotV4.state) as Record<string, unknown>;
		expect(Object.keys(migrated).sort()).toEqual(["engine", "game"]);
		for (const [key, value] of Object.entries(json(gameOf(migrated)))) {
			if (key in flat && key !== "combat" && key !== "oncePer") expect(value, key).toEqual(flat[key]);
		}
		expect(pendingSkillChoiceOf(migrated)).toEqual(flat.pendingSkillChoice);
		expect(pendingSkillWindowOf(migrated)).toEqual(flat.pendingSkillWindow);
		expect(effectStackOf(migrated).pending).toHaveLength(1);
		expect(effectStackOf(migrated).pending[0]?.cause).toBe("evt_test");
		const keys = Object.keys(gameOf(migrated));
		for (const gone of [
			"engine",
			"effectStack",
			"paused",
			"pendingSkillTarget",
			"pendingSkillChoice",
			"pendingTriggerInterrupt",
			"pendingSkillWindow",
			"decks",
			"despertar",
		]) {
			expect(keys).not.toContain(gone);
		}
	});

	it("converte alvo, interrupção e pausa antiga em engine.pending", () => {
		const base = json(unwrapSnapshot(snapshotV4)) as {
			engine: Record<string, unknown>;
			game: Record<string, unknown>;
		};
		const flat = {
			...base.game,
			engine: { ...base.engine, pending: undefined, stack: undefined },
			effectStack: { pending: [], resolving: null },
			paused: {
				reason: "skill_choice",
				options: [{ id: "a", label: "A" }],
				resumeFrom: { id: "effect-0-x", seq: 0, cause: "x", effect: {}, source: "h1" },
			},
			pendingSkillTarget: {
				skillId: "s1",
				sourceId: "h1",
				prompt: "p",
				candidates: [{ id: "e1", label: "E1" }],
			},
			pendingTriggerInterrupt: {
				id: "i1",
				skillId: "s2",
				window: "evt_x",
			},
		};
		const migrated = migrateState(flat, 4) as GameState;
		expect(pausedOf(migrated)?.choice.id).toBe("skill_choice");
		expect(pausedOf(migrated)?.choice.player).toBe(PARTY_PLAYER);
		expect(pendingSkillTargetOf(migrated)?.skillId).toBe("s1");
		expect(pendingTriggerInterruptOf(migrated)?.id).toBe("i1");
		expect(pendingChoicesOf(migrated).map((choice) => choice.id)).toEqual([
			"skill_choice",
			"target:s1",
			"interrupt:i1",
		]);
		expect(migrated.engine.pending?.choice.id).toBe("skill_choice");
	});

	it("falha (→ null) quando o v4 não tem engine", () => {
		expect(migrateState({ gameId: "x" }, 4)).toBeNull();
		expect(typeof MIGRATIONS[4]).toBe("function");
	});
});
