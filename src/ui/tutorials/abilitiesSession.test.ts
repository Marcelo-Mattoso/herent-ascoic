import { describe, expect, it } from "vitest";
import type { Action } from "@/core/actions/types";
import { createGameJournal } from "@/core/journal/gameJournal";
import { playerView } from "@/core/projection/playerView";
import { reducer } from "@/core/reducer";
import type { GameState } from "@/core/state/gameState";
import { ABILITY_BARBARIAN, ABILITY_HUNTER, BASTION_POWER, CRIMSON_FURY, PREY_MARK, prepareAbilityEncounter, preparePowerAndPassiveEncounter } from "./abilitiesScenario";
import { continueTutorial, currentTutorialStep, markAbilityCheckpointReady, observeAbilityUi, reconcileTutorial, startTutorial } from "./session";
import { testEngine } from "@/core/__tests__/testEngine";
import { pendingSkillTargetOf } from "../../core/state/access";
import { gameOf } from "../../engine/state";

describe("Arquivo IV: progressão confirmada pelo Diário", () => {
	it("conclui as dez etapas apenas após as ações reais", () => {
		let session = markAbilityCheckpointReady(startTutorial("archive-four"), "hunter");
		let state: GameState = prepareAbilityEncounter(testEngine, ABILITY_HUNTER);
		let recorder = createGameJournal(testEngine, state);
		const apply = (action: Action) => {
			const before = state;
			state = reducer(testEngine, state, action);
			recorder.record(action, before, state);
			session = reconcileTutorial(session, playerView(testEngine, state), recorder.get());
		};
		session = continueTutorial(session);
		expect(currentTutorialStep(session).id).toBe("abilities-inspect");
		expect(observeAbilityUi(session, "card")).toBe(session);
		session = observeAbilityUi(session, "panel");
		session = observeAbilityUi(session, "card");
		expect(currentTutorialStep(session).id).toBe("prey-mark");
		const hunterId = gameOf(state).heroes[0].id;
		apply({ type: "USE_SKILL", payload: { skillId: PREY_MARK, sourceId: hunterId } });
		expect(currentTutorialStep(session).id).toBe("prey-mark");
		const enemyId = pendingSkillTargetOf(state)!.candidates[0].id;
		apply({ type: "SELECT_SKILL_TARGET", payload: { targetId: enemyId } });
		expect(currentTutorialStep(session).id).toBe("hunter-attack");
		apply({ type: "CHOOSE_TARGET", payload: { heroId: hunterId, enemyId } });
		apply({ type: "ROLL_DICE" });
		apply({ type: "RESOLVE_ATTACK" });
		expect(currentTutorialStep(session).id).toBe("fury-prepare");

		state = prepareAbilityEncounter(testEngine, ABILITY_BARBARIAN);
		recorder = createGameJournal(testEngine, state);
		session = markAbilityCheckpointReady(session, "barbarian");
		const barbarianId = gameOf(state).heroes[0].id;
		apply({ type: "USE_SKILL", payload: { skillId: CRIMSON_FURY, sourceId: barbarianId } });
		expect(currentTutorialStep(session).id).toBe("fury-trigger");
		apply({ type: "CHOOSE_TARGET", payload: { heroId: barbarianId, enemyId: gameOf(state).activeEnemies[0].id } });
		apply({ type: "ROLL_DICE" });
		expect(currentTutorialStep(session).id).toBe("fury-trigger");
		apply({ type: "RESOLVE_ATTACK" });
		expect(currentTutorialStep(session).id).toBe("hero-power");

		state = preparePowerAndPassiveEncounter(testEngine);
		recorder = createGameJournal(testEngine, state);
		session = markAbilityCheckpointReady(session, "warrior");
		apply({ type: "USE_POWER", payload: { heroId: gameOf(state).heroes[0].id } });
		expect(currentTutorialStep(session).id).toBe("passive-effect");
		expect(playerView(testEngine, state).abilityActionsByHero[gameOf(state).heroes[0].id].find((entry) => entry.abilityId === BASTION_POWER)?.status).toBe("exhausted");
		session = continueTutorial(session);
		expect(currentTutorialStep(session).id).toBe("ability-limits");
		session = continueTutorial(session);
		expect(currentTutorialStep(session).id).toBe("abilities-completion");
		expect(session.status).toBe("completed");
	});
});
