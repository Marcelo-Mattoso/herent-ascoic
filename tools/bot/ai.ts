import type { PlayerView } from "@/core/projection/playerView";
import { gameOf } from "@/engine/state";
import type { GoldenSetup } from "../golden/lib";
import { rankMoves, type ScoredMove, scoreAction, scoreMoves } from "./brain";
import {
	type CardCounts,
	checkNoProgress,
	checkState,
	countCards,
	isTerminal,
	type Violation,
} from "./invariants";
import { createHeadlessPort } from "./port";
import type { BotProfile } from "./profiles";
import type { Action } from "@/core/actions/types";
import type { GameState } from "@/core/state/gameState";

export { rankMoves, scoreAction, scoreMoves, type ScoredMove };

export interface AiStep {
	readonly step: number;
	readonly before: PlayerView;
	readonly after: PlayerView;
	readonly chosen: ScoredMove;
	readonly options: readonly ScoredMove[];
	readonly rejected: readonly string[];
}

export interface AiGameResult {
	readonly setup: GoldenSetup;
	readonly outcome: string;
	readonly steps: number;
	readonly roomsCleared: number;
	readonly violation: Violation | null;
	readonly rejected: readonly string[];
	readonly actions: readonly Action[];
	readonly final: GameState;
}

export function playAiGame(
	setup: GoldenSetup,
	maxSteps: number,
	onStep?: (step: AiStep) => void,
	profile: BotProfile = "power-player",
): AiGameResult {
	const port = createHeadlessPort(setup);
	const baseline: CardCounts = countCards(port.inspect());
	const rejected = new Set<string>();
	const abilitiesThisTurn = new Set<string>();
	let bossProgress: { life: number; round: number } | null = null;
	let violation: Violation | null = checkState(port.inspect(), baseline);
	while (!violation && !isTerminal(port.inspect())) {
		if (port.history.length >= maxSteps) {
			violation = { invariant: "max_steps_exceeded", message: `não terminou em ${maxSteps} ações` };
			break;
		}
		let advanced = false;
		const obs = port.observe();
		const options = scoreMoves(obs, profile, setup.seed, port.history.length);
		const stepRejected: string[] = [];
		const combat = obs.view.combat;
		const turnKey = `${combat?.round}:${combat?.heroesActed.length}:${obs.view.roomsCleared}`;
		for (const move of options) {
			// Preparar e cancelar alterna o estado sem progresso: cada habilidade só uma vez por vez de agir.
			if (move.action.type.startsWith("USE_")) {
				const resourceKey = move.action.type === "USE_SKILL" && move.action.payload.skillId === "skill_return_rite"
					? `:${obs.view.decks.dungeonDeck.discarded.length}` : "";
				const abilityKey = `${turnKey}${resourceKey}|${JSON.stringify(move.action)}`;
				if (abilitiesThisTurn.has(abilityKey)) continue;
				abilitiesThisTurn.add(abilityKey);
			}
			const result = port.act(move.action);
			if (result.kind === "rejected") {
				const message = `${move.action.type}: ${result.error}`;
				rejected.add(message);
				stepRejected.push(message);
			}
			if (result.kind === "applied") {
				advanced = true;
				onStep?.({
					step: port.history.length,
					before: obs.view,
					after: port.observe().view,
					chosen: move,
					options,
					rejected: stepRejected,
				});
				break;
			}
		}
		if (!advanced) {
			violation = {
				invariant: "no_legal_action",
				message: `status ${gameOf(port.inspect()).status} sem jogada que altere o estado`,
			};
			break;
		}
		violation =
			checkState(port.inspect(), baseline) ?? checkNoProgress(port.history, port.inspect());
		const currentView = port.observe().view;
		const boss = currentView.enemies.find((enemy) => enemy.id === "boss" && enemy.status === "active");
		if (boss && profile !== "random") {
			const round = currentView.combat?.round ?? 0;
			if (!bossProgress || bossProgress.life - boss.currentLife >= 2) bossProgress = { life: boss.currentLife, round };
			else if (!violation && round - bossProgress.round >= 50) {
				violation = { invariant: "boss_stalemate",
					message: `chefe perdeu menos de 2 PV em 50 rodadas (${bossProgress.life}→${boss.currentLife}); revisar estratégia/equipamento/acerto` };
			}
		} else bossProgress = null;
	}
	const game = gameOf(port.inspect());
	return {
		setup,
		outcome: game.status,
		steps: port.history.length,
		roomsCleared: game.roomsCleared,
		violation,
		rejected: [...rejected],
		actions: [...port.history],
		final: port.inspect(),
	};
}
