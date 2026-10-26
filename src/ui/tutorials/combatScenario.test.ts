import { describe, expect, it } from "vitest";
import type { Action } from "@/core/actions/types";
import { createGameJournal } from "@/core/journal/gameJournal";
import { playerView } from "@/core/projection/playerView";
import { reducer } from "@/core/reducer";
import { createInitialGameState } from "@/core/state/gameState";
import {
	COMBAT_DEFAULT_HERO,
	prepareCombatCheckpoint,
	prepareCombatEntry,
} from "./combatScenario";
import {
	continueTutorial,
	currentTutorialStep,
	markCombatCheckpointReady,
	reconcileTutorial,
	recordCombatAttackInput,
	startTutorial,
} from "./session";

const HERO = COMBAT_DEFAULT_HERO;
const HEROES = [
	"hero_eternal_rest_cleric",
	"hero_broken_bastion_warrior",
	"hero_rift_rogue",
	"hero_crimson_rune_mage",
	"hero_crimson_barbarian",
	"hero_last_light_paladin",
	"hero_deep_veil_necromancer",
	"hero_broken_veil_hunter",
] as const;

function encounter(actions: readonly Action[], heroCardId = HERO) {
	let state = createInitialGameState({ heroCardIds: [heroCardId] });
	const journal = createGameJournal(state);
	const dispatch = (action: Action) => {
		const before = state;
		state = reducer(state, action);
		journal.record(action, before, state);
	};
	for (const action of actions) dispatch(action);
	return {
		get state() {
			return state;
		},
		journal,
		dispatch,
	};
}

describe("Arquivo II — encontro e progressão pelo motor", () => {
	it("as seeds mantêm a entrada e o golpe final válidos para os oito heróis", () => {
		for (const heroCardId of HEROES) {
			const initialView = playerView(
				createInitialGameState({ heroCardIds: [heroCardId] }),
			);
			const opening = encounter(
				prepareCombatEntry({
					view: initialView,
					selectedHeroCardIds: [heroCardId],
				}),
				heroCardId,
			);
			expect(opening.state.status, heroCardId).toBe("HERO_ACTION");
			expect(opening.state.activeEnemies, heroCardId).toHaveLength(1);
			expect(
				playerView(opening.state).pendingSkillChoice,
				heroCardId,
			).toBeNull();
			const finish = encounter(prepareCombatCheckpoint(heroCardId), heroCardId);
			const heroId = finish.state.heroes[0].id;
			const enemyId = finish.state.activeEnemies[0].id;
			finish.dispatch({ type: "CHOOSE_TARGET", payload: { heroId, enemyId } });
			finish.dispatch({ type: "ROLL_DICE" });
			finish.dispatch({ type: "RESOLVE_ATTACK" });
			expect(
				finish.state.activeEnemies.find((enemy) => enemy.id === enemyId)
					?.currentLife,
				heroCardId,
			).toBe(0);
			finish.dispatch({ type: "CHECK_COMBAT_END" });
			expect(finish.state.status, heroCardId).toBe("REWARD_PHASE");
		}
	});
	it("prepara duas situações reais sem decisões pendentes e resolve vitória com o core", () => {
		const initialView = playerView(
			createInitialGameState({ heroCardIds: [HERO] }),
		);
		const opening = encounter(
			prepareCombatEntry({ view: initialView, selectedHeroCardIds: [HERO] }),
		);
		expect(opening.state.status).toBe("HERO_ACTION");
		expect(opening.state.activeEnemies).toHaveLength(1);
		expect(opening.state.currentRoom).toBeTruthy();
		expect(playerView(opening.state).pendingSkillChoice).toBeNull();
		const finish = encounter(prepareCombatCheckpoint(HERO));
		const heroId = finish.state.heroes[0].id;
		const enemyId = finish.state.activeEnemies[0].id;
		finish.dispatch({ type: "CHOOSE_TARGET", payload: { heroId, enemyId } });
		finish.dispatch({ type: "ROLL_DICE" });
		const roll = finish.state.combat?.lastRoll;
		expect(roll).toBeTruthy();
		finish.dispatch({ type: "RESOLVE_ATTACK" });
		const entry = finish.journal.get().entries.at(-1);
		expect(entry?.roll).toEqual(roll);
		expect(entry?.after.heroesActed).toContain(heroId);
		expect(
			entry?.after.enemies.find((enemy) => enemy.id === enemyId)?.life,
		).toBe(0);
		finish.dispatch({ type: "CHECK_COMBAT_END" });
		expect(finish.state.status).toBe("REWARD_PHASE");
	});

	it("avança apenas após ações correlacionadas ao segundo checkpoint", () => {
		const initialView = playerView(
			createInitialGameState({ heroCardIds: [HERO] }),
		);
		const game = encounter(
			prepareCombatEntry({ view: initialView, selectedHeroCardIds: [HERO] }),
		);
		let session = startTutorial("archive-two", [HERO], "drag");
		session = continueTutorial(session);
		for (let i = 0; i < 4; i++) session = continueTutorial(session);
		expect(currentTutorialStep(session).id).toBe("combat-select-hero");
		const heroId = game.state.heroes[0].id;
		const enemyId = game.state.activeEnemies[0].id;
		game.dispatch({ type: "CHOOSE_HERO_FOR_ROUND", payload: { heroId } });
		session = reconcileTutorial(
			session,
			playerView(game.state),
			game.journal.get(),
		);
		expect(currentTutorialStep(session).id).toBe("combat-select-target");
		game.dispatch({ type: "CHOOSE_TARGET", payload: { heroId, enemyId } });
		game.dispatch({ type: "ROLL_DICE" });
		expect(
			reconcileTutorial(session, playerView(game.state), game.journal.get()),
		).toBe(session);
		game.dispatch({ type: "RESOLVE_ATTACK" });
		session = reconcileTutorial(
			session,
			playerView(game.state),
			game.journal.get(),
		);
		expect(currentTutorialStep(session).id).toBe("combat-drag");
		expect(session.firstAttack?.actionId).toBeTruthy();
		const checkpoint = encounter(prepareCombatCheckpoint(HERO));
		session = markCombatCheckpointReady(session);
		const sequence = checkpoint.journal.get().entries.at(-1)?.sequence ?? 0;
		session = recordCombatAttackInput(session, "drag", sequence);
		const nextHero = checkpoint.state.heroes[0].id;
		const nextEnemy = checkpoint.state.activeEnemies[0].id;
		checkpoint.dispatch({
			type: "CHOOSE_TARGET",
			payload: { heroId: nextHero, enemyId: nextEnemy },
		});
		session = reconcileTutorial(
			session,
			playerView(checkpoint.state),
			checkpoint.journal.get(),
		);
		expect(currentTutorialStep(session).id).toBe("combat-dice");
		checkpoint.dispatch({ type: "ROLL_DICE" });
		checkpoint.dispatch({ type: "RESOLVE_ATTACK" });
		session = reconcileTutorial(
			session,
			playerView(checkpoint.state),
			checkpoint.journal.get(),
		);
		expect(currentTutorialStep(session).id).toBe("combat-result");
		expect(session.finalAttack?.enemyLifeAfter).toBe(0);
	});
});
