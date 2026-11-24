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
import { actionIdentity } from "./exploration";
import { usesLearnedStrategies, type BotProfile } from "./profiles";
import type { Action } from "@/core/actions/types";
import type { GameState } from "@/core/state/gameState";
import type { GameBalance } from "@/core/gameEngine";
import { publishedKnowledge, type StrategyRule } from "./discovery/knowledge";
import { stepSignals } from "./discovery/sequence";
import { publishedSoloPolicy, type SoloPolicy } from "./discovery/soloPolicy";

export { rankMoves, scoreAction, scoreMoves, type ScoredMove };

export interface AiStep {
	readonly step: number;
	readonly before: PlayerView;
	readonly after: PlayerView;
	/** Snapshots para telemetria: nunca entram nas decisões da IA. */
	readonly beforeState: GameState;
	readonly afterState: GameState;
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
	xpCostsOverride?: Partial<GameBalance["xpCosts"]>,
	knowledgeOverride?: readonly StrategyRule[],
	disableLegacyCombos = false,
	enableDiscoveryTrace = false,
  soloPolicyOverride?: SoloPolicy | null,
  adaptiveSoloTraining = false,
): AiGameResult {
  const needsSignals = enableDiscoveryTrace ||
    (usesLearnedStrategies(profile) && (knowledgeOverride ?? publishedKnowledge.rules).length > 0);
  const port = createHeadlessPort(setup, xpCostsOverride, needsSignals);
	const baseline: CardCounts = countCards(port.inspect());
	const rejected = new Set<string>();
	const abilitiesThisTurn = new Set<string>();
  // A experiência do Explorer é local à sessão; a execução bot:explore
  // também conserva um corpus persistente entre rodadas.
  const explorationUsage = new Map<string, number>();
	let recentTraits: string[] = [];
	let recentActorIds: (string | undefined)[] = [];
	let recentRoundKey = "";
	let bossProgress: { life: number; round: number } | null = null;
	let previousCombat: { room: number; round: number; enemyLife: Readonly<Record<string, number>> } | null = null;
	let stagnantRounds = 0;
	let violation: Violation | null = checkState(port.inspect(), baseline);
	while (!violation && !isTerminal(port.inspect())) {
		if (port.history.length >= maxSteps) {
			violation = { invariant: "max_steps_exceeded", message: `não terminou em ${maxSteps} ações` };
			break;
		}
		let advanced = false;
		const obs = port.observe();
		// Se várias rodadas passaram sem tirar PV de nenhum inimigo, reduzir
		// a prioridade de cura/buff; ataques voltam a disputar a ação do herói.
		const presentEnemies = obs.view.enemies.filter((enemy) => enemy.status === "active");
		if (obs.view.combat && presentEnemies.length) {
			const round = obs.view.combat.round;
			const enemyLife = Object.fromEntries(presentEnemies.map((enemy) => [enemy.id, enemy.currentLife]));
			const previous = previousCombat;
			const sameEncounter = previous !== null && previous.room === obs.view.roomsCleared &&
				Object.keys(enemyLife).length === Object.keys(previous.enemyLife).length &&
				Object.keys(enemyLife).every((id) => id in previous.enemyLife);
			if (!previous || !sameEncounter) stagnantRounds = 0;
			else if (Object.entries(enemyLife).some(([id, hp]) => hp < (previous.enemyLife[id] ?? hp)))
				stagnantRounds = 0;
			else if (round > previous.round) stagnantRounds += round - previous.round;
			previousCombat = { room: obs.view.roomsCleared, round, enemyLife };
		} else {
			previousCombat = null;
			stagnantRounds = 0;
		}
    const roundKey = obs.view.roomsCleared + ":" + (obs.view.combat?.round ?? 0);
    if (roundKey !== recentRoundKey) {
      recentTraits = []; recentActorIds = []; recentRoundKey = roundKey;
    }
    const options = scoreMoves(obs, profile, setup.seed, port.history.length,
      { stagnantRounds, recentTraits, recentActorIds,
        ...(profile === "explorer" ? { explorationUsage } : {}) },
      knowledgeOverride, !disableLegacyCombos,
      soloPolicyOverride === undefined ? publishedSoloPolicy : soloPolicyOverride,
      adaptiveSoloTraining);
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
			const beforeState = port.inspect();
			const result = port.act(move.action);
			if (result.kind === "rejected") {
				const message = `${move.action.type}: ${result.error}`;
				rejected.add(message);
				stepRejected.push(message);
			}
      if (result.kind === "applied") {
        advanced = true;
        if (profile === "explorer") {
          const id = actionIdentity(move.action);
          explorationUsage.set(id, (explorationUsage.get(id) ?? 0) + 1);
        }
        // Sem biblioteca ou callback, não criar snapshots extras em milhares
        // de partidas do benchmark. O reducer já foi executado pela porta.
        if (needsSignals || onStep) {
          const step: AiStep = {
            step: port.history.length,
            before: obs.view,
            after: port.observe().view,
            beforeState,
            afterState: port.inspect(),
            chosen: move,
            options,
            rejected: stepRejected,
          };
          if (needsSignals) {
            const signals = stepSignals(step);
            if (signals.length) {
              recentTraits = [...recentTraits, ...signals.map(signal => signal.trait)].slice(-4);
              recentActorIds = [...recentActorIds, ...signals.map(signal => signal.heroId)].slice(-4);
            }
          }
          onStep?.(step);
        }
        break;
      }
		}
		if (!advanced) {
			const stuck = port.observe().view;
			violation = {
				invariant: "no_legal_action",
				message: `status ${gameOf(port.inspect()).status} sem jogada que altere o estado; ` +
					`fase ${stuck.combat?.phase ?? "sem-combate"}, rodada ${stuck.combat?.round ?? "-"}, ` +
					`agiram ${(stuck.combat?.heroesActed ?? []).join(",")}, ` +
					`ações ${options.slice(0, 10).map((entry) => entry.action.type).join(",")}, ` +
					`rejeições ${stepRejected.slice(0, 5).join(" | ") || "nenhuma"}`,
			};
			break;
		}
		violation =
			checkState(port.inspect(), baseline) ?? checkNoProgress(port.history, port.inspect());
		const currentView = port.observe().view;
		const boss = currentView.enemies.find((enemy) => enemy.id === "boss" && enemy.status === "active");
		if (profile === "explorer" && stagnantRounds >= 35 && !violation) {
			violation = { invariant: "combat_no_damage_stalemate",
				message: `Explorer ficou ${stagnantRounds} rodadas sem retirar PV dos inimigos; impasse de estratégia/acerto, não bug de motor comprovado` };
		}
		if (boss && profile !== "explorer") {
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
