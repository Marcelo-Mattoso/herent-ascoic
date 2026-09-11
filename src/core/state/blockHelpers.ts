// Helpers para gerenciar BlockEntry[] em GameState.blocks.
// Análogos a tickModifierDurations/removeModifiersForSource do world.ts.

import type { BlockEntry, GameState } from "./gameState";
import type { HeroState } from "./heroState";

type BlockScope = "end_of_round" | "end_of_combat";

function entryExpiresAt(entry: BlockEntry, scope: BlockScope): boolean {
	const kind = entry.duration.kind;
	if (scope === "end_of_round") return kind === "until_end_of_round";
	if (scope === "end_of_combat") return kind === "until_end_of_combat";
	return false;
}

// Remove entradas que expiram no scope e limpa os booleans correspondentes.
export function tickBlockEntries(
	state: GameState,
	scope: BlockScope,
): GameState {
	let next = state;
	for (const [key, entries] of Object.entries(state.blocks)) {
		const remaining = entries.filter((e) => !entryExpiresAt(e, scope));
		if (remaining.length === entries.length) continue;
		next = { ...next, blocks: { ...next.blocks, [key]: remaining } };
		if (remaining.length === 0) {
			next = clearBlockFlag(next, key);
		}
	}
	return next;
}

// Remove entradas cuja fonte (sourceEntityId) foi removida do world.
export function removeBlocksForSource(
	state: GameState,
	sourceEntityId: string,
): GameState {
	let next = state;
	for (const [key, entries] of Object.entries(state.blocks)) {
		const remaining = entries.filter(
			(e) =>
				!(
					e.duration.kind === "while_in_play" &&
					e.sourceEntityId === sourceEntityId
				),
		);
		if (remaining.length === entries.length) continue;
		next = { ...next, blocks: { ...next.blocks, [key]: remaining } };
		if (remaining.length === 0) {
			next = clearBlockFlag(next, key);
		}
	}
	return next;
}

/** Remove todos os bloqueios produzidos por uma fonte que foi desativada. */
export function removeBlocksAppliedBySource(
	state: GameState,
	sourceEntityId: string,
): GameState {
	let next = state;
	for (const [key, entries] of Object.entries(state.blocks)) {
		const remaining = entries.filter((entry) => entry.sourceEntityId !== sourceEntityId);
		if (remaining.length === entries.length) continue;
		next = { ...next, blocks: { ...next.blocks, [key]: remaining } };
		if (remaining.length === 0) next = clearBlockFlag(next, key);
	}
	return next;
}

// Consome a primeira entrada `once` do bloco indicado.
// Chamado em healSystem quando a cura é bloqueada por um bloco `once`.
export function consumeOnceBlock(state: GameState, key: string): GameState {
	const entries = state.blocks[key] ?? [];
	const onceIdx = entries.findIndex((e) => e.duration.kind === "once");
	if (onceIdx === -1) return state;
	const remaining = entries.filter((_, i) => i !== onceIdx);
	let next: GameState = {
		...state,
		blocks: { ...state.blocks, [key]: remaining },
	};
	if (remaining.length === 0) {
		next = clearBlockFlag(next, key);
	}
	return next;
}

// Limpa o boolean de controle correspondente quando o array de blocos esvazia.
function clearBlockFlag(state: GameState, key: string): GameState {
	if (key === "fleeBlocked") {
		return { ...state, flags: { ...state.flags, fleeBlocked: false } };
	}
	if (key === "discardDungeonLocked") {
		return { ...state, flags: { ...state.flags, discardDungeonLocked: false } };
	}
	if (key.endsWith("::healBlocked")) {
		const heroId = key.slice(0, -"::healBlocked".length);
		return {
			...state,
			heroes: state.heroes.map(
				(h): HeroState =>
					h.id === heroId ? { ...h, healBlocked: undefined } : h,
			),
		};
	}
	return state;
}
