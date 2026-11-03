import { describe, expect, it } from "vitest";
import snapshotV5 from "@/core/persistence/__fixtures__/snapshot.v5.json";
import { unwrapSnapshot } from "@/core/persistence/migrations";
import { scopedCountOf, scopedFlagOf } from "@/core/state/access";
import type { GameState } from "@/core/state/gameState";
import { gameOf } from "@/engine/state";

describe("migração v5→v6 (flags de escopo → contadores)", () => {
	const migrated = unwrapSnapshot(snapshotV5) as GameState;

	it("move as flags de escopo para engine.counters e limpa os campos", () => {
		expect(scopedFlagOf(migrated, "combat", "oncePer", "skill_x::h1")).toBe(true);
		expect(scopedFlagOf(migrated, "round", "oncePer", "skill_y::h1")).toBe(true);
		expect(scopedFlagOf(migrated, "room", "oncePer", "skill_r::h1")).toBe(true);
		expect(scopedCountOf(migrated, "combat", "eco", "hero_a")).toBe(2);
		expect(scopedFlagOf(migrated, "combat", "fleeAttempt", "hero_a")).toBe(true);
		expect(scopedFlagOf(migrated, "combat", "fleeAttempt", "hero_b")).toBe(false);
		expect(scopedFlagOf(migrated, "combat", "itemControl", "enemy_a")).toBe(true);
		expect(scopedFlagOf(migrated, "combat", "targetProtection", "hero_a")).toBe(true);
		expect(scopedFlagOf(migrated, "round", "bossFirstDamageReduced", "boss")).toBe(true);
		expect(gameOf(migrated).oncePer).toEqual({ game: { "g::h1": true } });
		const combat = gameOf(migrated).combat as unknown as Record<string, unknown>;
		for (const field of [
			"oncePer",
			"ecoTokens",
			"fleeAttemptByHero",
			"itemControlByEnemy",
			"targetProtectionByHero",
			"bossFirstDamageReduced",
		]) {
			expect(field in combat).toBe(false);
		}
	});

	it("falha (→ null) quando o v5 não tem game", () => {
		const broken = { ...snapshotV5, state: { engine: {} } };
		expect(unwrapSnapshot(broken)).toBeNull();
	});
});
