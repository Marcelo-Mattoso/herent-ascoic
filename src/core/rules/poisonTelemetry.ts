import type { GameState } from "../state/gameState";
import { gameOf, withGame } from "../../engine/state";

/** Agregados compactos, mantidos no estado para que o bot possa registrá-los. */
export interface PoisonSourceDamage {
	readonly toHeroes: number;
	readonly toEnemies: number;
	readonly ticks: number;
}
export interface PoisonTelemetry {
	readonly toHeroes: number;
	readonly toEnemies: number;
	readonly preventedByHeart: number;
	/** Carta de origem / habilidade -> PV efetivamente descontados e ticks. */
	readonly damageBySource?: Readonly<Record<string, PoisonSourceDamage>>;
	/** Carta de origem / habilidade -> aplicações efetivas (não ticks). */
	readonly applicationsBySource?: Readonly<Record<string, number>>;
	/** Motivo / agente removedor / origem do veneno -> stacks removidos. */
	readonly removalsBySource?: Readonly<Record<string, number>>;
	/** Carta / habilidade de origem -> aplicações bloqueadas por proteção. */
	readonly blockedBySource?: Readonly<Record<string, number>>;
	/** Contagem de ticks de veneno com o boss ativo; separa oportunidade da prevenção. */
	readonly witchBossPoisonTicks?: number;
	readonly heartHeldAtWitchBossTicks?: number;
}

export interface PoisonRemovalCause {
	readonly reason: "expired" | "combat_end" | "cleanse" | "antidote" | "dispel" | "target_defeated" | "other_effect";
	readonly by?: string;
}

export function poisonOriginLabel(state: GameState, sourceId: string, effectId: string): string {
	const game = gameOf(state);
	const owner = [...game.heroes, ...game.defeatedHeroes, ...game.activeEnemies, ...game.enemyGraveyard]
		.find((unit) => unit.id === sourceId);
	return (owner?.cardId ?? sourceId) + "/" + effectId;
}

function bump(map: Readonly<Record<string, number>> | undefined, key: string, increment: number) {
	return { ...map, [key]: (map?.[key] ?? 0) + increment };
}

export function recordPoisonApplication(state: GameState, origin: string, blocked = false): GameState {
	return withGame(state, (game) => ({
		...game,
		poisonTelemetry: {
			toHeroes: game.poisonTelemetry?.toHeroes ?? 0,
			toEnemies: game.poisonTelemetry?.toEnemies ?? 0,
			preventedByHeart: game.poisonTelemetry?.preventedByHeart ?? 0,
			...game.poisonTelemetry,
			...(blocked
				? { blockedBySource: bump(game.poisonTelemetry?.blockedBySource, origin, 1) }
				: { applicationsBySource: bump(game.poisonTelemetry?.applicationsBySource, origin, 1) }),
		},
	}));
}

export function recordPoisonDamage(state: GameState, origin: string, targetHero: boolean, applied: number): GameState {
	if (applied <= 0) return state;
	return withGame(state, (game) => {
		const prior = game.poisonTelemetry;
		const entry = prior?.damageBySource?.[origin] ?? { toHeroes: 0, toEnemies: 0, ticks: 0 };
		return {
			...game,
			poisonTelemetry: {
				toHeroes: (prior?.toHeroes ?? 0) + (targetHero ? applied : 0),
				toEnemies: (prior?.toEnemies ?? 0) + (targetHero ? 0 : applied),
				preventedByHeart: prior?.preventedByHeart ?? 0,
				...prior,
				// A ordem do spread preserva demais contadores sem sobrescrever os totais.
				toHeroes: (prior?.toHeroes ?? 0) + (targetHero ? applied : 0),
				toEnemies: (prior?.toEnemies ?? 0) + (targetHero ? 0 : applied),
				damageBySource: {
					...prior?.damageBySource,
					[origin]: {
						toHeroes: entry.toHeroes + (targetHero ? applied : 0),
						toEnemies: entry.toEnemies + (targetHero ? 0 : applied),
						ticks: entry.ticks + 1,
					},
				},
			},
		};
	});
}

export function recordPoisonPrevention(
	state: GameState, prevented: number, witchBossActive: boolean, heartHeld: boolean,
): GameState {
	if (!witchBossActive && prevented <= 0) return state;
	return withGame(state, (game) => ({
		...game,
		poisonTelemetry: {
			toHeroes: game.poisonTelemetry?.toHeroes ?? 0,
			toEnemies: game.poisonTelemetry?.toEnemies ?? 0,
			preventedByHeart: (game.poisonTelemetry?.preventedByHeart ?? 0) + prevented,
			...game.poisonTelemetry,
			preventedByHeart: (game.poisonTelemetry?.preventedByHeart ?? 0) + prevented,
			witchBossPoisonTicks: (game.poisonTelemetry?.witchBossPoisonTicks ?? 0) + (witchBossActive ? 1 : 0),
			heartHeldAtWitchBossTicks: (game.poisonTelemetry?.heartHeldAtWitchBossTicks ?? 0) +
				(witchBossActive && heartHeld ? 1 : 0),
		},
	}));
}

/** Apenas venenos; ignora wards e mudanças da string de um mesmo stack renovado. */
function poisonIdentity(raw: string): { key: string; sourceId: string; effectId: string } | null {
	if (raw.startsWith("poison:")) {
		const values = raw.slice("poison:".length).split(":");
		let sourceId = "legacy_unknown", effectId = "legacy_poison";
		try {
			if (values.length >= 5) {
				sourceId = decodeURIComponent(values[3]!) || sourceId;
				effectId = decodeURIComponent(values[4]!) || effectId;
			}
		} catch { /* condicionais antigas continuam identificáveis */ }
		return { key: "legacy-poison", sourceId, effectId };
	}
	if (!raw.startsWith("dot:v1:")) return null;
	try {
		const data = JSON.parse(decodeURIComponent(raw.slice("dot:v1:".length))) as Record<string, unknown>;
		if (data.status !== "poison" || typeof data.sourceId !== "string" ||
			typeof data.effectId !== "string") return null;
		return {
			key: "dot:" + data.sourceId + ":" + data.effectId,
			sourceId: data.sourceId, effectId: data.effectId,
		};
	} catch { return null; }
}

export function recordPoisonRemovals(
	state: GameState,
	oldConditions: readonly string[],
	newConditions: readonly string[],
	cause: PoisonRemovalCause = { reason: "other_effect" },
): GameState {
	const retained = newConditions.map(poisonIdentity).filter((value) => value !== null)
		.map((value) => value.key);
	const removed: Record<string, number> = {};
	for (const raw of oldConditions) {
		const previous = poisonIdentity(raw);
		if (!previous) continue;
		const match = retained.indexOf(previous.key);
		if (match >= 0) {
			retained.splice(match, 1); // Renovação, não limpeza.
			continue;
		}
		const origin = poisonOriginLabel(state, previous.sourceId, previous.effectId);
		const key = cause.reason + " | " + (cause.by ?? "system") + " | " + origin;
		removed[key] = (removed[key] ?? 0) + 1;
	}
	if (!Object.keys(removed).length) return state;
	return withGame(state, (game) => {
		let total = { ...game.poisonTelemetry?.removalsBySource };
		for (const [key, n] of Object.entries(removed)) total = bump(total, key, n);
		return {
			...game,
			poisonTelemetry: {
				toHeroes: game.poisonTelemetry?.toHeroes ?? 0,
				toEnemies: game.poisonTelemetry?.toEnemies ?? 0,
				preventedByHeart: game.poisonTelemetry?.preventedByHeart ?? 0,
				...game.poisonTelemetry,
				removalsBySource: total,
			},
		};
	});
}
