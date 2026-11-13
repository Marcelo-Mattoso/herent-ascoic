// Efeito periódico genérico, definido pelos dados de cada habilidade.
// Armazena instâncias por origem nos componentes de condição já existentes no ECS.
// rounds === 0 significa duração ilimitada DENTRO do combate.
import type { GameEngine } from "../gameEngine";
import type { GameState } from "../state/gameState";
import { allHeroesOf, enemiesOf, heroesOf, withUnitStats, worldOf } from "../state/access";
import { gameOf } from "../../engine/state";
import { getModifierTotal } from "../ecs/world";
import { applyDamage } from "../systems/damageSystem";
import { log } from "../reducer/utils";
import { corruptedHeartPoisonReduction, recordCorruptedHeartPrevention } from "./poisonProtection";

const PREFIX = "dot:v1:";

export interface DamageOverTimeOptions {
    readonly status: string;
    readonly sourceId: string;
    readonly effectId: string;
    readonly damage: number;
    readonly rounds: number;
    readonly increaseOverTime?: boolean;
    readonly decreaseOverTime?: boolean;
}

export interface DamageOverTimeCondition extends DamageOverTimeOptions {
    readonly damage: number;
    readonly rounds: number;
    readonly increaseOverTime: boolean;
    readonly decreaseOverTime: boolean;
    /** Última rodada processada, para nunca causar dano duas vezes na mesma rodada. */
    readonly lastTickRound: number;
}

function validInt(value: unknown, minimum = 0): value is number {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum;
}

export function parseDamageOverTimeCondition(raw: string): DamageOverTimeCondition | null {
    if (!raw.startsWith(PREFIX)) return null;
    try {
        const data: unknown = JSON.parse(decodeURIComponent(raw.slice(PREFIX.length)));
        if (!data || typeof data !== "object") return null;
        const v = data as Record<string, unknown>;
        if (
            typeof v.status !== "string" || !v.status ||
            typeof v.sourceId !== "string" || !v.sourceId ||
            typeof v.effectId !== "string" || !v.effectId ||
            !validInt(v.damage, 1) || !validInt(v.rounds) ||
            !validInt(v.lastTickRound) ||
            typeof v.increaseOverTime !== "boolean" ||
            typeof v.decreaseOverTime !== "boolean" ||
            (v.increaseOverTime && v.decreaseOverTime)
        ) return null;
        return v as unknown as DamageOverTimeCondition;
    } catch {
        return null;
    }
}

export function matchesDamageOverTimeStatus(raw: string, status: string): boolean {
    return parseDamageOverTimeCondition(raw)?.status === status;
}

function serialize(condition: DamageOverTimeCondition): string {
    return PREFIX + encodeURIComponent(JSON.stringify(condition));
}

function sameSource(a: DamageOverTimeCondition, b: DamageOverTimeOptions): boolean {
    return a.status === b.status && a.sourceId === b.sourceId && a.effectId === b.effectId;
}

export function applyDamageOverTimeStatus(
    state: GameState,
    targetId: string,
    options: DamageOverTimeOptions,
): GameState {
    // Nunca criar um efeito que sobreviva a seu combate.
    if (!gameOf(state).combat) return state;
    const unit = [...heroesOf(state), ...enemiesOf(state)]
        .find((value) => value.id === targetId && value.status === "active");
    if (
        !unit ||
        !options.status || !options.sourceId || !options.effectId ||
        !validInt(options.damage, 1) || !validInt(options.rounds) ||
        (options.increaseOverTime === true && options.decreaseOverTime === true)
    ) return state;

    // Single-use wards are consumed when a new poison is applied.
    if (options.status === "poison") {
        const ward = unit.conditions.find(c => c.startsWith("poison_ward:block_next:"));
        if (ward) {
            const amount = Number(ward.slice("poison_ward:block_next:".length));
            if (amount > 0) {
                const next = unit.conditions.filter(c => c !== ward);
                if (amount > 1) next.push("poison_ward:block_next:" + (amount - 1));
                return log(withUnitStats(state, targetId, { conditions: next }), "Veneno bloqueado por proteção.");
            }
        }
    }
    const currentRound = gameOf(state).combat?.round ?? 0;
    const existing = unit.conditions.map(parseDamageOverTimeCondition)
        .find((condition) => condition !== null && sameSource(condition, options));
    const indefinite = options.rounds === 0 || existing?.rounds === 0;
    const replacement: DamageOverTimeCondition = {
        status: options.status,
        sourceId: options.sourceId,
        effectId: options.effectId,
        damage: Math.max(options.damage, existing?.damage ?? 0),
        rounds: indefinite ? 0 : Math.max(
            1,
            Math.max(options.rounds, existing?.rounds ?? 0)
              + (options.status === "poison"
                  ? Math.max(0, getModifierTotal(worldOf(state), options.sourceId, "poison_duration_increase"))
                    - Math.max(0, getModifierTotal(worldOf(state), targetId, "poison_duration_decrease"))
                  : 0),
        ),
        increaseOverTime: options.increaseOverTime === true,
        decreaseOverTime: options.decreaseOverTime === true,
        // Reaplicar renova duração, mas não adia o próximo tick.
        lastTickRound: existing?.lastTickRound ?? currentRound,
    };
    const conditions = unit.conditions.filter((raw) => {
        const parsed = parseDamageOverTimeCondition(raw);
        return !parsed || !sameSource(parsed, options);
    });
    return log(
        withUnitStats(state, targetId, { conditions: [...conditions, serialize(replacement)] }),
        options.status + ": aplicado a " + targetId + " (" + options.damage + " por rodada, duração " + options.rounds + ").",
    );
}

/** Dano no fim da rodada seguinte à aplicação; cada fonte faz seu próprio tick. */
export function resolveDamageOverTimeRound(engine: GameEngine, state: GameState): GameState {
    const combat = gameOf(state).combat;
    if (!combat) return state;
    const round = combat.round;
    let next = state;
    for (const unit of [...heroesOf(state), ...enemiesOf(state)]) {
        if (unit.status !== "active") continue;
        const pending = unit.conditions.map(parseDamageOverTimeCondition)
            .filter((condition): condition is DamageOverTimeCondition => condition !== null);
        for (const candidate of pending) {
            const current = [...heroesOf(next), ...enemiesOf(next)]
                .find((value) => value.id === unit.id);
            if (!current || current.status !== "active") break;
            const raw = current.conditions.find((entry) => {
                const parsed = parseDamageOverTimeCondition(entry);
                return parsed !== null && sameSource(parsed, candidate);
            });
            if (!raw) continue; // Um efeito anterior pode ter removido este stack.
            const status = parseDamageOverTimeCondition(raw);
            if (!status || round <= status.lastTickRound) continue;
            const reduction = Math.max(0, -getModifierTotal(
                worldOf(next), current.id, status.status + "_damage_taken",
            ));
            const ward = status.status === "poison"
                ? current.conditions.find(c => c.startsWith("poison_ward:reduce_next:"))
                : undefined;
            const wardAmount = ward ? Math.max(0, Number(ward.slice("poison_ward:reduce_next:".length))) : 0;
            const beforeHeart = Math.max(0, status.damage - reduction - wardAmount);
            const amount = Math.max(0, beforeHeart -
                (status.status === "poison" ? corruptedHeartPoisonReduction(next, current.id) : 0));
            next = recordCorruptedHeartPrevention(next, beforeHeart - amount);
            if (amount > 0) {
                // A origem virtual evita disparar evt_hit / bônus de armas em ticks.
                next = applyDamage(engine, next, current.id, amount, {
                    sourceId: status.status,
                    damageType: "condition",
                });
                next = log(next, status.status + ": " + current.id +
                    " sofre " + amount + " de dano na rodada " + round + ".");
            }
            const after = [...heroesOf(next), ...enemiesOf(next)]
                .find((value) => value.id === current.id);
            if (!after || !after.conditions.includes(raw)) continue;
            const remaining = status.rounds === 0 ? 0 : status.rounds - 1;
            const nextDamage = status.damage +
                (status.increaseOverTime ? 1 : status.decreaseOverTime ? -1 : 0);
            const conditions = after.conditions.filter((entry) => entry !== raw && entry !== ward);
            if (after.status === "active" && (status.rounds === 0 || remaining > 0) && nextDamage > 0) {
                conditions.push(serialize({
                    ...status,
                    damage: nextDamage,
                    rounds: remaining,
                    lastTickRound: round,
                }));
            }
            next = withUnitStats(next, current.id, { conditions });
        }
    }
    return next;
}

/** Faz a limpeza em vitória, derrota, fuga e fim da sala. */
export function clearDamageOverTime(state: GameState): GameState {
    let next = state;
    for (const unit of [...allHeroesOf(state), ...enemiesOf(state)]) {
        if (unit.conditions.some((condition) => condition.startsWith(PREFIX) || condition.startsWith("poison:"))) {
            next = withUnitStats(next, unit.id, {
                conditions: unit.conditions.filter((condition) =>
                    !condition.startsWith(PREFIX) && !condition.startsWith("poison:")),
            });
        }
    }
    return next;
}
