// Veneno: efeito periódico por entidade, sem acumular dano.
// A aplicação renova a duração; o primeiro tick ocorre no fim da rodada seguinte.
import type { GameEngine } from "../gameEngine";
import type { GameState } from "../state/gameState";
import { enemiesOf, heroesOf, withUnitStats, worldOf } from "../state/access";
import { gameOf } from "../../engine/state";
import { getModifierTotal } from "../ecs/world";
import { applyDamage } from "../systems/damageSystem";
import { log } from "../reducer/utils";
import { poisonOriginLabel, recordPoisonApplication } from "./poisonTelemetry";
import { corruptedHeartPoisonReduction, recordCorruptedHeartPrevention } from "./poisonProtection";

const PREFIX = "poison:";
function parsePoison(status: string): {
	damage: number; rounds: number; applied: number; sourceId: string; effectId: string;
} | null {
	if (!status.startsWith(PREFIX)) return null;
	const parts = status.slice(PREFIX.length).split(":").map(Number);
	const damage = parts[0] ?? NaN;
	const rounds = parts[1] ?? NaN;
	const applied = parts[2] ?? NaN;
	let sourceId = "legacy_unknown", effectId = "legacy_poison";
	try {
		if (parts.length >= 5) {
			sourceId = decodeURIComponent(status.slice(PREFIX.length).split(":")[3]!) || sourceId;
			effectId = decodeURIComponent(status.slice(PREFIX.length).split(":")[4]!) || effectId;
		}
	} catch { /* condições de saves antigos não invalidam o veneno */ }
	return Number.isFinite(damage) && Number.isFinite(rounds) && Number.isFinite(applied)
		? { damage, rounds, applied, sourceId, effectId } : null;
}

export function applyPoisonStatus(
	state: GameState, targetId: string, damage: number, rounds: number,
	origin: { readonly sourceId?: string; readonly effectId?: string } = {},
): GameState {
	const unit = [...heroesOf(state), ...enemiesOf(state)].find((u) => u.id === targetId && u.status === "active");
	if (!unit || !Number.isFinite(damage) || !Number.isFinite(rounds) || damage <= 0 || rounds <= 0) return state;
	const old = unit.conditions.map(parsePoison).find((value) => value !== null);
	const currentRound = gameOf(state).combat?.round ?? 0;
	const sourceId = origin.sourceId ?? old?.sourceId ?? "legacy_unknown";
	const effectId = origin.effectId ?? old?.effectId ?? "legacy_poison";
	const condition = `${PREFIX}${Math.max(old?.damage ?? 0, Math.floor(damage))}:${Math.floor(rounds)}:${old?.applied ?? currentRound}:${encodeURIComponent(sourceId)}:${encodeURIComponent(effectId)}`;
	const updated = withUnitStats(state, targetId, {
		conditions: [...unit.conditions.filter((value) => !value.startsWith(PREFIX)), condition],
	});
	return log(recordPoisonApplication(updated, poisonOriginLabel(updated, sourceId, effectId)),
		`${targetId} envenenado por ${Math.floor(rounds)} rodadas.`);
}

/** Resolve o dano periódico após evt_round_end e antes de avançar a rodada. */
export function resolvePoisonRound(engine: GameEngine, state: GameState): GameState {
	const round = gameOf(state).combat?.round ?? 0;
	let next = state;
	for (const original of [...heroesOf(state), ...enemiesOf(state)]) {
		if (original.status !== "active") continue;
		const current = [...heroesOf(next), ...enemiesOf(next)].find((u) => u.id === original.id);
		if (!current || current.status !== "active") continue;
		const status = current.conditions.find((c) => c.startsWith(PREFIX));
		const poison = status ? parsePoison(status) : null;
		if (!poison || round <= poison.applied) continue;
		const reduction = Math.max(0, -getModifierTotal(worldOf(next), current.id, "poison_damage_taken"));
		const beforeHeart = Math.max(0, poison.damage - reduction);
		const amount = Math.max(0, beforeHeart - corruptedHeartPoisonReduction(next, current.id));
		next = recordCorruptedHeartPrevention(next, beforeHeart - amount, current.id);
		if (amount > 0) {
			next = applyDamage(engine, next, current.id, amount, {
				sourceId: "poison", damageType: "condition",
				poisonOrigin: poisonOriginLabel(next, poison.sourceId, poison.effectId),
			});
			next = log(next, `Veneno (${poisonOriginLabel(next, poison.sourceId, poison.effectId)}): ${current.id} sofre ${amount} de dano na rodada ${round}.`);
		}
		const after = [...heroesOf(next), ...enemiesOf(next)].find((u) => u.id === current.id);
		if (!after) continue;
		const refreshed = after.conditions.filter((c) => c !== status);
		if (poison.rounds > 1 && after.status === "active") {
			refreshed.push(`${PREFIX}${poison.damage}:${poison.rounds - 1}:${round}:${encodeURIComponent(poison.sourceId)}:${encodeURIComponent(poison.effectId)}`);
		}
		next = withUnitStats(next, current.id, { conditions: refreshed },
			{ reason: after.status === "active" ? "expired" : "target_defeated" });
	}
	return next;
}
