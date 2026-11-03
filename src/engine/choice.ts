import type { PlayerId } from "./events";
import type { Choice, KindNode, KindRegistry, RunOutcome } from "./kinds";
import {
	type EngineEventMap,
	type EngineState,
	type GameState,
	recordEvent,
} from "./state";
import { activePlayer } from "./turns";

export interface PendingChoice {
	readonly id: string;
	readonly player: PlayerId;
	readonly options: readonly string[];
	readonly min: number;
	readonly max: number;
	readonly data?: unknown;
}

export interface PendingResolution {
	readonly choice: PendingChoice;
	readonly stack: readonly KindNode[];
}

export interface ChoiceAnswer {
	readonly choice: string;
	readonly player: PlayerId;
	readonly picks: readonly string[];
}

export function normalizeChoice<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	choice: Choice,
): PendingChoice {
	const player =
		choice.player ??
		(state.turn.order.length > 0 ? activePlayer(state) : state.players[0]);
	if (player === undefined) {
		throw new Error(`Escolha "${choice.id}" sem jogador`);
	}
	if (!state.players.includes(player)) {
		throw new Error(
			`Escolha "${choice.id}" para jogador desconhecido "${player}"`,
		);
	}
	const min = choice.min ?? 1;
	const max = choice.max ?? 1;
	if (min < 0 || max < min || max > choice.options.length) {
		throw new Error(
			`Escolha "${choice.id}" com limites inválidos (${min}..${max} de ${choice.options.length})`,
		);
	}
	if (new Set(choice.options).size !== choice.options.length) {
		throw new Error(`Escolha "${choice.id}" com opções repetidas`);
	}
	return {
		id: choice.id,
		player,
		options: choice.options,
		min,
		max,
		data: choice.data,
	};
}

export function checkAnswer(
	choice: PendingChoice,
	answer: ChoiceAnswer,
): string | null {
	if (answer.choice !== choice.id) {
		return `Resposta para "${answer.choice}", pendente é "${choice.id}"`;
	}
	if (answer.player !== choice.player) {
		return `Jogador "${answer.player}" não decide a escolha "${choice.id}"`;
	}
	if (answer.picks.length < choice.min || answer.picks.length > choice.max) {
		return `Escolha "${choice.id}" exige entre ${choice.min} e ${choice.max} opções`;
	}
	if (new Set(answer.picks).size !== answer.picks.length) {
		return `Escolha "${choice.id}" com opção repetida`;
	}
	for (const pick of answer.picks) {
		if (!choice.options.includes(pick)) {
			return `Opção "${pick}" inexistente na escolha "${choice.id}"`;
		}
	}
	return null;
}

export function validateAnswer(
	choice: PendingChoice,
	answer: ChoiceAnswer,
): void {
	const error = checkAnswer(choice, answer);
	if (error !== null) throw new Error(error);
}

export function openChoice<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	choice: Choice,
	stack: readonly KindNode[],
): EngineState<TMap> {
	if (state.pending) {
		throw new Error(`Já existe escolha pendente: "${state.pending.choice.id}"`);
	}
	const normalized = normalizeChoice(state, choice);
	return recordEvent(
		{ ...state, pending: { choice: normalized, stack } },
		"escolha.aberta",
		{ choice: normalized.id, player: normalized.player },
	);
}

export function pendingChoiceOf<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
): PendingChoice | undefined {
	return state.pending?.choice;
}

export interface ChoiceData {
	readonly branches?: Readonly<Record<string, readonly KindNode[]>>;
}

function settle<TGame, TMap extends EngineEventMap>(
	outcome: RunOutcome<GameState<TGame, TMap>>,
): GameState<TGame, TMap> {
	if (!outcome.pending) return outcome.state;
	return {
		...outcome.state,
		engine: openChoice(outcome.state.engine, outcome.pending, outcome.stack),
	};
}

export function runWithChoices<TGame, TMap extends EngineEventMap, TCtx>(
	registry: KindRegistry<GameState<TGame, TMap>, TCtx, never>,
	state: GameState<TGame, TMap>,
	nodes: readonly KindNode[],
	ctx: TCtx,
): GameState<TGame, TMap> {
	return settle(registry.runAll(state, nodes, ctx));
}

export type PendingResume<TGame, TMap extends EngineEventMap> = (
	state: GameState<TGame, TMap>,
	pending: PendingResolution,
	answer: ChoiceAnswer,
) => GameState<TGame, TMap>;

export interface AnswerOptions {
	readonly choices?: readonly PendingChoice[];
	readonly check?: (choice: PendingChoice, answer: ChoiceAnswer) => string | null;
}

export function answerPendingBy<TGame, TMap extends EngineEventMap>(
	state: GameState<TGame, TMap>,
	answer: ChoiceAnswer,
	resume: PendingResume<TGame, TMap>,
	options: AnswerOptions = {},
): GameState<TGame, TMap> {
	const pending = state.engine.pending;
	if (!pending) throw new Error("Nenhuma escolha pendente");
	const choices = options.choices ?? [pending.choice];
	const choice = choices.find((candidate) => candidate.id === answer.choice);
	if (!choice) {
		throw new Error(
			`Resposta para "${answer.choice}", pendente é "${pending.choice.id}"`,
		);
	}
	const error = (options.check ?? checkAnswer)(choice, answer);
	if (error !== null) throw new Error(error);
	const answered: GameState<TGame, TMap> = {
		...state,
		engine: recordEvent(state.engine, "escolha.respondida", {
			choice: answer.choice,
			player: answer.player,
			picks: answer.picks,
		}),
	};
	return resume(answered, pending, answer);
}

export function answerPending<TGame, TMap extends EngineEventMap, TCtx>(
	registry: KindRegistry<GameState<TGame, TMap>, TCtx, never>,
	state: GameState<TGame, TMap>,
	answer: ChoiceAnswer,
	ctx: TCtx,
): GameState<TGame, TMap> {
	return answerPendingBy(state, answer, (answered, pending) => {
		const branches = (pending.choice.data as ChoiceData | undefined)?.branches;
		const chosen = answer.picks.flatMap((pick) => branches?.[pick] ?? []);
		return settle(
			registry.runAll(
				{ ...answered, engine: { ...answered.engine, pending: undefined } },
				[...chosen, ...pending.stack],
				ctx,
			),
		);
	});
}
