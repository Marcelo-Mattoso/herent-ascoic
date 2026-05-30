// Elf store para o estado do jogo.
// Substitui o estado interno do Zustand (Passo 11).
//
// Elf usa BehaviorSubject (RxJS) internamente — completamente síncrono,
// sem side effects assíncronos. Adequado para gameState imutável.
//
// INVARIANTE: este módulo é o único lugar onde @ngneat/elf é usado diretamente.
// O resto da UI lê via useGameStore() em gameStore.ts.

import { createStore, select, setProps, withProps } from "@ngneat/elf";
import type { GameState } from "@/core/state/gameState";
import { createInitialGameState } from "@/core/state/gameState";

export interface UiState {
	// Herói cujo inventário está visível no painel inferior
	readonly focusedHeroId: string | null;
}

interface ElfStoreProps {
	readonly gameState: GameState;
	readonly ui: UiState;
}

const EMPTY_CONFIG = { heroCardNames: [] as string[] };

// Store central do jogo — contém GameState + UI state.
export const gameElfStore = createStore(
	{ name: "ascensao-heroica" },
	withProps<ElfStoreProps>({
		gameState: createInitialGameState(EMPTY_CONFIG),
		ui: { focusedHeroId: null },
	}),
);

// Debug: expõe o store no window pra inspeção via DevTools/preview.
// Não tem efeito em produção (window não existe em SSR).
if (typeof window !== "undefined") {
	(window as unknown as { __elfStore: typeof gameElfStore }).__elfStore =
		gameElfStore;
}

// Seletores reativos (para uso fora do React ou com useObservable no futuro).
export const gameState$ = gameElfStore.pipe(select((s) => s.gameState));
export const uiState$ = gameElfStore.pipe(select((s) => s.ui));

// Helpers de leitura síncrona.
export function getElfGameState(): GameState {
	return gameElfStore.getValue().gameState;
}

export function getElfUiState(): UiState {
	return gameElfStore.getValue().ui;
}

// Helpers de escrita — atualizam o store via setProps (imutável).
export function setElfGameState(gameState: GameState): void {
	gameElfStore.update(setProps({ gameState }));
}

export function setElfUiState(ui: UiState): void {
	gameElfStore.update(setProps({ ui }));
}

export function setElfStoreProps(props: Partial<ElfStoreProps>): void {
	gameElfStore.update(setProps(props));
}

// Reset completo — volta ao estado pré-partida.
export function resetElfStore(): void {
	gameElfStore.update(
		setProps({
			gameState: createInitialGameState(EMPTY_CONFIG),
			ui: { focusedHeroId: null },
		}),
	);
}
