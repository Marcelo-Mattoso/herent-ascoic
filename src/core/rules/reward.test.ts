import { describe, expect, it } from "vitest";
import type { EnemyState } from "../state/enemyState";
import type { RoomState } from "../state/roomState";
import { calculateRewards } from "./reward";

function makeRoom(overrides: Partial<RoomState> = {}): RoomState {
	return {
		cardName: "Sala da Masmorra",
		exits: 3,
		currentEnemies: 1,
		reward: 1,
		rewardType: "item",
		effect: "",
		xp: 1,
		status: "active",
		...overrides,
	};
}

function makeEnemy(
	status: EnemyState["status"],
	tokens: EnemyState["tokens"] = {},
): EnemyState {
	return {
		id: crypto.randomUUID(),
		cardName: "Rato das Fendas Profundas",
		maxLife: 2,
		currentLife: 0,
		damage: 1,
		hitBonus: 2,
		dice: 1,
		tokens,
		conditions: [],
		firstDamageTakenThisTurn: false,
		status,
	};
}

describe("calculateRewards", () => {
	it("sala item + 1 criatura derrotada com tokens", () => {
		const room = makeRoom({ xp: 1, reward: 1, rewardType: "item" });
		const enemy = makeEnemy("defeated", { xp: 1, reward_item: 1 });
		const result = calculateRewards(room, [enemy]);
		expect(result.xp).toBe(2);
		expect(result.items).toBe(2);
		expect(result.artifacts).toBe(0);
	});

	it("criatura fugida não concede recompensa", () => {
		const room = makeRoom({ xp: 1, reward: 1, rewardType: "item" });
		const fled = makeEnemy("fled", { xp: 1, reward_item: 1 });
		const result = calculateRewards(room, [fled]);
		expect(result.xp).toBe(1); // só a sala
		expect(result.items).toBe(1); // só a sala
	});

	it("criatura removida não concede recompensa", () => {
		const room = makeRoom({ xp: 2, reward: 0, rewardType: "item" });
		const removed = makeEnemy("removed", { xp: 3, reward_item: 2 });
		const result = calculateRewards(room, [removed]);
		expect(result.xp).toBe(2);
		expect(result.items).toBe(0);
	});

	it("sala de artefato soma artefatos corretamente", () => {
		const room = makeRoom({ xp: 3, reward: 1, rewardType: "artifact" });
		const result = calculateRewards(room, []);
		expect(result.artifacts).toBe(1);
		expect(result.items).toBe(0);
	});

	it("múltiplas criaturas derrotadas somam todas", () => {
		const room = makeRoom({ xp: 1, reward: 0, rewardType: "item" });
		const e1 = makeEnemy("defeated", { xp: 1, reward_item: 1 });
		const e2 = makeEnemy("defeated", { xp: 2, reward_item: 1 });
		const result = calculateRewards(room, [e1, e2]);
		expect(result.xp).toBe(4);
		expect(result.items).toBe(2);
	});
});
