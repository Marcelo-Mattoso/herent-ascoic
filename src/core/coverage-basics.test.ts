import { describe, expect, it } from "vitest";
import * as actions from "./actions/creators";
import { dieReplacementValues, isEligibleDie } from "./rules/diceSelection";
import { defaultItemDestination } from "./strategies/itemDistribution";
import { compareEffectOrder } from "./strategies/effectOrder";
import { tiebreakHero } from "./strategies/tiebreak";
import {
	parseFullOr,
	parseNumber,
	parseSlashPair,
	parseSlashQuad,
} from "./skills/valueParsers";
import { isLogIntact } from "./ports/persistence";
import type { LoggedAction } from "./actions/types";
import type { HeroState } from "./state/heroState";
import { aiView } from "./projection/aiView";
import { renderSkillLabel, renderSkillText } from "./skills/renderLabel";
import { parseTrigger } from "./skills/dispatch";
import { createInitialGameState } from "./state/gameState";
import { reducer } from "./reducer";

describe("action creators", () => {
	it("produzem as actions e payloads públicos", () => {
		const config = { heroCardIds: ["hero_crimson_barbarian"] };
		expect(actions.startGame(config)).toEqual({ type: "START_GAME", payload: config });
		expect(actions.revealRoom()).toEqual({ type: "REVEAL_ROOM" });
		expect(actions.resolveRoomEffect()).toEqual({ type: "RESOLVE_ROOM_EFFECT" });
		expect(actions.spawnEnemies()).toEqual({ type: "SPAWN_ENEMIES" });
		expect(actions.startCombat()).toEqual({ type: "START_COMBAT" });
		expect(actions.chooseHero("h1")).toEqual({ type: "CHOOSE_HERO", payload: { heroId: "h1" } });
		expect(actions.chooseTarget("h1", "e1")).toEqual({ type: "CHOOSE_TARGET", payload: { heroId: "h1", enemyId: "e1" } });
		expect(actions.rollDice()).toEqual({ type: "ROLL_DICE" });
		expect(actions.resolveAttack()).toEqual({ type: "RESOLVE_ATTACK" });
		expect(actions.checkCombatEnd()).toEqual({ type: "CHECK_COMBAT_END" });
		expect(actions.directDamage()).toEqual({ type: "DIRECT_DAMAGE" });
		expect(actions.useItem("i1", "h1", "h2", "e1")).toEqual({ type: "USE_ITEM", payload: { itemId: "i1", heroId: "h1", targetHeroId: "h2", targetEnemyId: "e1" } });
		expect(actions.usePower("h1")).toEqual({ type: "USE_POWER", payload: { heroId: "h1" } });
		expect(actions.selectSkillTarget("e1")).toEqual({ type: "SELECT_SKILL_TARGET", payload: { targetId: "e1" } });
		expect(actions.cancelSkillTarget()).toEqual({ type: "CANCEL_SKILL_TARGET" });
		expect(actions.grantRewards()).toEqual({ type: "GRANT_REWARDS" });
		expect(actions.gainXp(3)).toEqual({ type: "GAIN_XP", payload: { amount: 3 } });
		expect(actions.spendXp("buy_item", "h1")).toEqual({ type: "SPEND_XP", payload: { option: "buy_item", heroId: "h1" } });
		expect(actions.openPaths()).toEqual({ type: "OPEN_PATHS" });
		expect(actions.choosePath("room_1")).toEqual({ type: "CHOOSE_PATH", payload: { cardId: "room_1" } });
		expect(actions.discardPaths()).toEqual({ type: "DISCARD_PATHS" });
		expect(actions.checkBossCondition()).toEqual({ type: "CHECK_BOSS_CONDITION" });
		expect(actions.revealBoss()).toEqual({ type: "REVEAL_BOSS" });
		expect(actions.startBossCombat()).toEqual({ type: "START_BOSS_COMBAT" });
		expect(actions.victory()).toEqual({ type: "VICTORY" });
		expect(actions.defeat("fim")).toEqual({ type: "DEFEAT", payload: { reason: "fim" } });
		expect(actions.skillChoice("s1", "a")).toEqual({ type: "SKILL_CHOICE", payload: { skillId: "s1", choice: "a" } });
		expect(actions.declareFlee("h1")).toEqual({ type: "DECLARE_FLEE", payload: { heroId: "h1" } });
		expect(actions.restartDungeon(true)).toEqual({ type: "RESTART_DUNGEON", payload: { keepEquipment: true } });
		expect(actions.selectDie("hero", 1, 6)).toEqual({ type: "SELECT_DIE", payload: { side: "hero", index: 1, value: 6 } });
	});
});

describe("helpers puros sem fluxo de UI", () => {
	it("valida dados selecionáveis e seus valores substitutos", () => {
		const setTo = { skillId: "s", heroId: "h", side: "hero" as const, action: "set_to" as const, setToValue: 6, filter: { minValue: 3 } };
		expect(isEligibleDie(setTo, "hero", 0, [3, 5])).toBe(true);
		expect(isEligibleDie(setTo, "enemy", 0, [3])).toBe(false);
		expect(isEligibleDie(setTo, "hero", 0.5, [3])).toBe(false);
		expect(isEligibleDie(setTo, "hero", 2, [3])).toBe(false);
		expect(isEligibleDie(setTo, "hero", 0, [2])).toBe(false);
		expect(dieReplacementValues(setTo, 3)).toEqual([6]);
		expect(dieReplacementValues({ ...setTo, action: "reroll", deltaMax: 1 }, 3)).toEqual([2, 3, 4]);
	});

	it("interpreta valores de catálogo válidos e inválidos", () => {
		expect(parseNumber(2)).toBe(2);
		expect(parseNumber("2.5")).toBe(2.5);
		expect(parseNumber("x")).toBeNull();
		expect(parseNumber(null)).toBeNull();
		expect(parseSlashPair("2/4")).toEqual({ a: 2, b: 4 });
		expect(parseSlashPair("2/4/6")).toBeNull();
		expect(parseSlashPair(2)).toBeNull();
		expect(parseSlashQuad("1/2/3/4")).toEqual([1, 2, 3, 4]);
		expect(parseSlashQuad("1/x/3/4")).toBeNull();
		expect(parseFullOr("full/1")).toEqual({ full: true, alt: 1 });
		expect(parseFullOr("partial/1")).toBeNull();
	});

	it("aplica estratégias de ordem, distribuição, desempate e integridade", () => {
		expect(compareEffectOrder("room", "boss")).toBeLessThan(0);
		const hero: HeroState = { id: "h1", maxLife: 10, currentLife: 6, activeItems: {}, cardId: "hero_crimson_barbarian", damage: 4, hitBonus: 5, dice: 1, impeto: 0, backpack: [], usedPowers: {}, conditions: [], status: "active", playerIndex: 0, xp: 0 };
		expect(defaultItemDestination(hero, "equipment")).toBe("equip");
		expect(defaultItemDestination({ ...hero, activeItems: { weapon: "item_rusty_dagger" } }, "equipment")).toBe("backpack");
		expect(defaultItemDestination(hero, "consumable")).toBe("equip");
		expect(tiebreakHero([hero, { ...hero, id: "h2", currentLife: 5, maxLife: 10 }]).id).toBe("h2");
		const start: LoggedAction = { seq: 0, action: { type: "START_GAME", payload: { heroCardIds: [] } } };
		expect(isLogIntact([start, { ...start, seq: 1, action: { type: "REVEAL_ROOM" } }])).toBe(true);
		expect(isLogIntact([])).toBe(false);
		expect(isLogIntact([{ ...start, seq: 1 }])).toBe(false);
		expect(isLogIntact([{ ...start, action: { type: "REVEAL_ROOM" } }])).toBe(false);
	});

	it("projeta informação pública e textos de habilidade", () => {
		const base = createInitialGameState({ heroCardIds: ["hero_crimson_barbarian"] });
		const started = reducer(base, { type: "START_GAME", payload: { heroCardIds: ["hero_crimson_barbarian"] } });
		const state = {
			...started,
			heroes: [{ ...started.heroes[0]!, id: "h1", status: "active" as const }],
			activeEnemies: [{ id: "e1", cardId: "creature_deep_rift_rat", maxLife: 2, currentLife: 2, damage: 1, hitBonus: 0, dice: 1, tokens: { xp: 1, reward_item: 0, reward_artifact: 0 }, conditions: [], firstDamageTakenThisTurn: false, status: "active" as const }],
		};
		expect(aiView(state, { playerIndex: 0 }).visibleEntities.map((entry) => entry.id)).toEqual(["h1", "e1"]);
		expect(renderSkillLabel({ skillId: "skill_last_light_healing", params: { value: 3 } })).toContain("3");
		expect(renderSkillText({ skillId: "skill_last_light_healing", params: { value: 3 } })).toContain("3");
		expect(renderSkillLabel({ skillId: "missing" })).toBe("missing");
		expect(parseTrigger("before_attack")).toEqual({ guard: null, base: "before_attack" });
	});
});
