import type { PlayerView } from "@/core/projection/playerView";
import { getTutorialModule, type TutorialModuleId } from "./registry";

export interface TutorialEvent {
	readonly type:
		| "started"
		| "hero-selected"
		| "game-started"
		| "room-revealed"
		| "step"
		| "step-completed"
		| "completed"
		| "abandoned";
	readonly source: "tutorial-ui" | "game-observation";
	readonly stepId: string;
	readonly detail?: string;
}

export interface TutorialSession {
	readonly id: string;
	readonly moduleId: TutorialModuleId;
	readonly status:
		| "running"
		| "waiting_for_interaction"
		| "completed"
		| "cancelled";
	readonly stepIndex: number;
	readonly highlightIndex: number;
	readonly selectedHeroCardIds: readonly string[];
	readonly events: readonly TutorialEvent[];
}

export function startTutorial(
	moduleId: TutorialModuleId,
	selectedHeroCardIds: readonly string[] = [],
): TutorialSession {
	const module = getTutorialModule(moduleId);
	if (!module.available || module.steps.length === 0)
		throw new Error("Arquivo indisponível");
	return {
		id: globalThis.crypto?.randomUUID?.() ?? `tutorial-${Date.now()}`,
		moduleId,
		status: "running",
		stepIndex: 0,
		highlightIndex: 0,
		selectedHeroCardIds: [...selectedHeroCardIds],
		events: [
			{
				type: "started",
				source: "tutorial-ui",
				stepId: module.steps[0].id,
				detail: moduleId,
			},
			{ type: "step", source: "tutorial-ui", stepId: module.steps[0].id },
		],
	};
}

export function currentTutorialStep(session: TutorialSession) {
	return getTutorialModule(session.moduleId).steps[session.stepIndex];
}

function nextStep(session: TutorialSession): TutorialSession {
	const steps = getTutorialModule(session.moduleId).steps;
	if (session.stepIndex >= steps.length - 1) return session;
	const stepIndex = session.stepIndex + 1;
	return {
		...session,
		stepIndex,
		highlightIndex: 0,
		status:
			steps[stepIndex].kind === "completion"
				? "completed"
				: steps[stepIndex].kind === "interaction"
					? "waiting_for_interaction"
					: "running",
		events: [
			...session.events,
			{
				type: "step-completed",
				source: "tutorial-ui",
				stepId: steps[session.stepIndex].id,
			},
			{ type: "step", source: "tutorial-ui", stepId: steps[stepIndex].id },
			...(steps[stepIndex].kind === "completion"
				? [
						{
							type: "completed" as const,
							source: "tutorial-ui" as const,
							stepId: steps[stepIndex].id,
						},
					]
				: []),
		],
	};
}

export function selectTutorialHeroes(
	session: TutorialSession,
	ids: readonly string[],
): TutorialSession {
	if (ids.join("|") === session.selectedHeroCardIds.join("|")) return session;
	const updated = {
		...session,
		selectedHeroCardIds: [...ids],
		events: [
			...session.events,
			{
				type: "hero-selected" as const,
				source: "tutorial-ui" as const,
				stepId: currentTutorialStep(session).id,
				detail: ids.join(","),
			},
		],
	};
	return currentTutorialStep(session).advance === "hero-selected" &&
		ids.length > 0
		? nextStep(updated)
		: updated;
}

export function reconcileTutorial(
	session: TutorialSession,
	view: PlayerView,
): TutorialSession {
	const advance = currentTutorialStep(session).advance;
	if (
		advance === "game-started" &&
		view.status !== "MAIN_MENU" &&
		view.heroes.length > 0
	) {
		return nextStep({
			...session,
			events: [
				...session.events,
				{ type: "game-started", source: "game-observation", stepId: "start" },
			],
		});
	}
	if (
		advance === "room-revealed" &&
		view.currentRoom &&
		view.status === "COMBAT_START"
	) {
		return nextStep({
			...session,
			events: [
				...session.events,
				{
					type: "room-revealed",
					source: "game-observation",
					stepId: "reveal",
					detail: view.currentRoom.cardId,
				},
			],
		});
	}
	return session;
}

export function continueTutorial(session: TutorialSession): TutorialSession {
	const step = currentTutorialStep(session);
	if (step.advance !== "manual") return session;
	if (step.id === "group" && session.selectedHeroCardIds.length === 0)
		return session;
	if (step.highlights && session.highlightIndex < step.highlights.length - 1) {
		return { ...session, highlightIndex: session.highlightIndex + 1 };
	}
	return nextStep(session);
}

export function skipTutorialObservation(
	session: TutorialSession,
): TutorialSession {
	return currentTutorialStep(session).skippable ? nextStep(session) : session;
}

export function backTutorialObservation(
	session: TutorialSession,
): TutorialSession {
	const step = currentTutorialStep(session);
	if (step.highlights && session.highlightIndex > 0)
		return { ...session, highlightIndex: session.highlightIndex - 1 };
	const previous = getTutorialModule(session.moduleId).steps[
		session.stepIndex - 1
	];
	if (
		previous &&
		previous.advance === "manual" &&
		(step.advance === "manual" || step.kind === "completion")
	) {
		return {
			...session,
			stepIndex: session.stepIndex - 1,
			highlightIndex: 0,
			status: "running",
		};
	}
	return session;
}

export function finishTutorial(session: TutorialSession): TutorialSession {
	return session.status === "completed"
		? session
		: {
				...session,
				status: "cancelled",
				events: [
					...session.events,
					{
						type: "abandoned",
						source: "tutorial-ui",
						stepId: currentTutorialStep(session).id,
					},
				],
			};
}
