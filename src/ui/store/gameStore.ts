// Store público do jogo — Passo 11: usa Elf + Redux DevTools.
//
// API pública inalterada: useGameStore(), dispatch(), setFocusedHero(),
// resolveSkillChoice(), reset(). Componentes React não precisam ser alterados.
//
// Internamente:
//   - Elf (gameElfStore) mantém GameState + UiState como BehaviorSubject.
//   - createInProcessAdapter coordena o reducer.
//   - Redux DevTools recebe ações nomeadas via __REDUX_DEVTOOLS_EXTENSION__.
//   - useSyncExternalStore integra o Elf store com React.

import { useSyncExternalStore } from "react";
import type { Action } from "@/core/actions/types";
import { createInProcessAdapter } from "@/core/adapter/inProcessAdapter";
import { type PlayerView, playerView } from "@/core/projection/playerView";
import type { GameState } from "@/core/state/gameState";
import { createInitialGameState } from "@/core/state/gameState";
import {
	gameElfStore,
	getElfGameState,
	getElfUiState,
	resetElfStore,
	setElfStoreProps,
	type UiState,
} from "./elfStore";
import { type HeroCombatActions, selectHeroCombatActions } from "./selectors";

// ── Tipos públicos ──────────────────────────────────────────────────────────

interface GameStore {
	readonly view: PlayerView;
	readonly state: GameState;
	readonly ui: UiState;
	readonly dispatch: (action: Action) => void;
	readonly setFocusedHero: (heroId: string | null) => void;
	readonly heroActionsFor: (heroId: string) => HeroCombatActions;
	readonly resolveSkillChoice: (choice: string) => void;
	readonly reset: () => void;
}

// ── Redux DevTools ──────────────────────────────────────────────────────────

type ReduxDevToolsExtension = {
	connect(options: { name: string }): {
		init(state: unknown): void;
		send(action: { type: string; payload?: unknown }, state: unknown): void;
		subscribe(
			listener: (message: {
				type: string;
				payload?: { type?: string };
				state?: string;
			}) => void,
		): () => void;
	};
};

function connectDevTools(initialState: GameState) {
	if (typeof window === "undefined") return null;
	const ext = (
		window as { __REDUX_DEVTOOLS_EXTENSION__?: ReduxDevToolsExtension }
	).__REDUX_DEVTOOLS_EXTENSION__;
	if (!ext) return null;

	const instance = ext.connect({ name: "AscensaoHeroica" });
	instance.init(initialState);

	// Time-travel: DevTools pede para pular para estado anterior.
	instance.subscribe((message) => {
		if (
			message.type === "DISPATCH" &&
			(message.payload?.type === "JUMP_TO_STATE" ||
				message.payload?.type === "JUMP_TO_ACTION") &&
			message.state
		) {
			try {
				const jumped = JSON.parse(message.state) as GameState;
				setElfStoreProps({ gameState: jumped });
			} catch {
				// ignorar estado inválido
			}
		}
	});

	return instance;
}

// ── Adapter e DevTools (module-level, recriados no reset) ───────────────────

const EMPTY_CONFIG = { heroCardIds: [] as string[] };

function makeAdapter() {
	return createInProcessAdapter(createInitialGameState(EMPTY_CONFIG));
}

let adapter = makeAdapter();
let devTools = connectDevTools(getElfGameState());

// Debug: expõe dispatch no window pra inspeção via DevTools/preview.
if (typeof window !== "undefined") {
	(window as unknown as { __dispatch: (action: Action) => void }).__dispatch = (
		action: Action,
	) => dispatch(action);
}

// ── Ações estáveis (referências module-level, nunca recriadas) ───────────────

function dispatch(action: Action): void {
	adapter.dispatch(action); // síncrono
	const nextState = adapter.getState();

	const currentFocus = getElfUiState().focusedHeroId;
	const activeHeroes = nextState.heroes.filter((h) => h.status === "active");
	const focusStillValid = currentFocus
		? activeHeroes.some((h) => h.id === currentFocus)
		: false;
	const focusedHeroId = focusStillValid
		? currentFocus
		: (activeHeroes[0]?.id ?? null);

	setElfStoreProps({ gameState: nextState, ui: { focusedHeroId } });

	// Notificar DevTools com action nomeada.
	devTools?.send(
		{ type: action.type, payload: (action as { payload?: unknown }).payload },
		nextState,
	);
}

function setFocusedHero(heroId: string | null): void {
	setElfStoreProps({ ui: { focusedHeroId: heroId } });
}

function heroActionsFor(heroId: string): HeroCombatActions {
	return selectHeroCombatActions(getElfGameState(), heroId);
}

function resolveSkillChoice(choice: string): void {
	const pending = getElfGameState().pendingSkillChoice;
	if (!pending) return;
	dispatch({
		type: "SKILL_CHOICE",
		payload: { skillId: pending.skillId, choice },
	});
}

function reset(): void {
	// Nova instância do adapter = nova partida, novo log.
	adapter = makeAdapter();
	resetElfStore();
	devTools = connectDevTools(getElfGameState());
}

// ── useSyncExternalStore ─────────────────────────────────────────────────────

// Snapshot estável — só recria quando gameState ou ui mudam.
let cachedElfProps = gameElfStore.getValue();
let cachedSnapshot: GameStore = {
	view: playerView(cachedElfProps.gameState),
	state: cachedElfProps.gameState,
	ui: cachedElfProps.ui,
	dispatch,
	setFocusedHero,
	heroActionsFor,
	resolveSkillChoice,
	reset,
};

function getSnapshot(): GameStore {
	const props = gameElfStore.getValue();
	if (props === cachedElfProps) return cachedSnapshot;
	cachedElfProps = props;
	cachedSnapshot = {
		view: playerView(props.gameState),
		state: props.gameState,
		ui: props.ui,
		dispatch,
		setFocusedHero,
		heroActionsFor,
		resolveSkillChoice,
		reset,
	};
	return cachedSnapshot;
}

function subscribeToStore(onStoreChange: () => void): () => void {
	const sub = gameElfStore.subscribe(() => onStoreChange());
	return () => sub.unsubscribe();
}

// ── Hook público ─────────────────────────────────────────────────────────────

export function useGameStore(): GameStore;
export function useGameStore<T>(selector: (store: GameStore) => T): T;
export function useGameStore<T>(
	selector?: (store: GameStore) => T,
): GameStore | T {
	const snapshot = useSyncExternalStore(subscribeToStore, getSnapshot);
	if (selector) return selector(snapshot);
	return snapshot;
}

// Hook para Replay.tsx — único consumidor permitido de GameState cru fora do store/.
export function useRawGameState(): GameState {
	return useSyncExternalStore(
		subscribeToStore,
		() => gameElfStore.getValue().gameState,
	);
}
