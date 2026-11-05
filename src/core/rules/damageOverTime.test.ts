import { describe, expect, it } from "vitest";
import { testEngine } from "@/core/__tests__/testEngine";
import { settled } from "../__tests__/fixtures";
import { createEmptyCombatState } from "../state/combatState";
import { createInitialGameState, type GameState } from "../state/gameState";
import { enemiesOf, heroesOf } from "../state/access";
import { withGame } from "../../engine/state";
import {
    applyDamageOverTimeStatus, clearDamageOverTime, matchesDamageOverTimeStatus,
    parseDamageOverTimeCondition, resolveDamageOverTimeRound,
    type DamageOverTimeOptions,
} from "./damageOverTime";

function state(): GameState {
    const s = createInitialGameState({ heroCardIds: ["hero_crimson_barbarian"] });
    return settled(withGame(s, (game) => ({
        ...game,
        heroes: [{
            id: "h1", cardId: "hero_crimson_barbarian", maxLife: 30,
            currentLife: 30, damage: 3, hitBonus: 0, dice: 2,
            activeItems: {}, backpack: [], usedPowers: {}, conditions: [],
            status: "active", playerIndex: 0, xp: 0,
        }],
        activeEnemies: [{
            id: "e1", cardId: "creature_dark_cave_goblin",
            maxLife: 30, currentLife: 30, damage: 1, hitBonus: 0, dice: 1,
            tokens: {}, conditions: [], firstDamageTakenThisTurn: false, status: "active",
        }],
        combat: createEmptyCombatState(),
    })));
}
function advance(state: GameState, round: number): GameState {
    return withGame(state, (game) => ({
        ...game, combat: { ...game.combat!, round },
    }));
}
function stack(state: GameState, target = "e1") {
    const conditions = [...heroesOf(state), ...enemiesOf(state)]
        .find((unit) => unit.id === target)?.conditions ?? [];
    return conditions.map(parseDamageOverTimeCondition)
        .filter((condition) => condition !== null);
}
const dot = (changes: Partial<DamageOverTimeOptions> = {}): DamageOverTimeOptions => ({
    status: "poison", sourceId: "h1", effectId: "poison_knife",
    damage: 2, rounds: 2, ...changes,
});
function tick(state: GameState, round: number): GameState {
    return resolveDamageOverTimeRound(testEngine, advance(state, round));
}

describe("dano periódico genérico", () => {
    it("usa duração finita, sem causar dano no mesmo fim de rodada da aplicação", () => {
        let s = applyDamageOverTimeStatus(state(), "e1", dot());
        expect(stack(s)).toHaveLength(1);
        s = tick(s, 0);
        expect(enemiesOf(s)[0]?.currentLife).toBe(30);
        s = tick(s, 1);
        expect(enemiesOf(s)[0]?.currentLife).toBe(28);
        expect(stack(s)[0]?.rounds).toBe(1);
        s = tick(s, 2);
        expect(enemiesOf(s)[0]?.currentLife).toBe(26);
        expect(stack(s)).toHaveLength(0);
    });

    it("aumenta o dano em 1 a cada tick quando increaseOverTime é true", () => {
        let s = applyDamageOverTimeStatus(state(), "e1", dot({
            damage: 1, rounds: 3, increaseOverTime: true,
        }));
        s = tick(s, 1);
        expect(enemiesOf(s)[0]?.currentLife).toBe(29);
        expect(stack(s)[0]?.damage).toBe(2);
        s = tick(s, 2);
        expect(enemiesOf(s)[0]?.currentLife).toBe(27);
        s = tick(s, 3);
        expect(enemiesOf(s)[0]?.currentLife).toBe(24);
        expect(stack(s)).toHaveLength(0);
    });

    it("diminui o dano em 1 a cada tick quando decreaseOverTime é true", () => {
        let s = applyDamageOverTimeStatus(state(), "e1", dot({
            damage: 3, rounds: 5, decreaseOverTime: true,
        }));
        s = tick(s, 1);
        expect(enemiesOf(s)[0]?.currentLife).toBe(27);
        s = tick(s, 2);
        expect(enemiesOf(s)[0]?.currentLife).toBe(25);
        s = tick(s, 3);
        expect(enemiesOf(s)[0]?.currentLife).toBe(24);
        expect(stack(s)).toHaveLength(0); // Quando chega a zero, extingue.
    });

    it("duração zero é indefinida até remoção, sem atravessar o combate", () => {
        let s = applyDamageOverTimeStatus(state(), "h1", dot({
            sourceId: "e1", effectId: "bleed", status: "bleed",
            damage: 1, rounds: 0, increaseOverTime: true,
        }));
        s = tick(s, 1);
        expect(heroesOf(s)[0]?.currentLife).toBe(29);
        expect(stack(s, "h1")[0]?.rounds).toBe(0);
        s = tick(s, 2);
        expect(heroesOf(s)[0]?.currentLife).toBe(27);
        expect(matchesDamageOverTimeStatus(heroesOf(s)[0]!.conditions[0]!, "bleed")).toBe(true);
        s = clearDamageOverTime(s);
        expect(stack(s, "h1")).toHaveLength(0);
    });

    it("fontes distintas acumulam; reaplicação da mesma fonte apenas renova sem adiar tick", () => {
        let s = applyDamageOverTimeStatus(state(), "e1", dot({ damage: 1 }));
        s = applyDamageOverTimeStatus(s, "e1", dot({
            sourceId: "h2", effectId: "poison_cloud", damage: 2, rounds: 3,
        }));
        expect(stack(s)).toHaveLength(2);
        s = tick(s, 1);
        expect(enemiesOf(s)[0]?.currentLife).toBe(27);
        s = applyDamageOverTimeStatus(s, "e1", dot({ damage: 1, rounds: 4 }));
        expect(stack(s)).toHaveLength(2);
        s = tick(s, 1);
        expect(enemiesOf(s)[0]?.currentLife).toBe(27);
        s = tick(s, 2);
        expect(enemiesOf(s)[0]?.currentLife).toBe(24);
        expect(stack(s).find((v) => v.effectId === "poison_knife")?.rounds).toBe(3);
    });

    it("impede configurações inválidas, combinações contraditórias e alvos inexistentes", () => {
        const original = state();
        for (const options of [
            dot({ damage: 0 }), dot({ rounds: -1 }), dot({ damage: 1.5 }),
            dot({ increaseOverTime: true, decreaseOverTime: true }),
        ]) expect(applyDamageOverTimeStatus(original, "e1", options)).toBe(original);
        expect(applyDamageOverTimeStatus(original, "missing", dot())).toBe(original);
        expect(applyDamageOverTimeStatus(withGame(original, (g) =>
            ({ ...g, combat: null })), "e1", dot())).toEqual(
                withGame(original, (g) => ({ ...g, combat: null })),
            );
    });

    it("não deixa estados periódicos persistirem após a limpeza de combate", () => {
        let s = applyDamageOverTimeStatus(state(), "h1", dot({ rounds: 0 }));
        s = applyDamageOverTimeStatus(s, "e1", dot({ status: "burn", rounds: 0 }));
        const next = clearDamageOverTime(s);
        expect(stack(next, "h1")).toHaveLength(0);
        expect(stack(next, "e1")).toHaveLength(0);
    });
});
