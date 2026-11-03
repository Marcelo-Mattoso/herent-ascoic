import type { BlockEntry, GameState } from "./gameState";
import { heroOf, withUnitStats } from "./access";
import { gameOf, withGame } from "../../engine/state";

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
	for (const [key, entries] of Object.entries(gameOf(state).blocks)) {
		const remaining = entries.filter((e) => !entryExpiresAt(e, scope));
		if (remaining.length === entries.length) continue;
		next = withGame(next, (prevGame) => ({ ...prevGame, blocks: { ...gameOf(next).blocks, [key]: remaining } }));
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
	for (const [key, entries] of Object.entries(gameOf(state).blocks)) {
		const remaining = entries.filter(
			(e) =>
				!(
					e.duration.kind === "while_in_play" &&
					e.sourceEntityId === sourceEntityId
				),
		);
		if (remaining.length === entries.length) continue;
		next = withGame(next, (prevGame) => ({ ...prevGame, blocks: { ...gameOf(next).blocks, [key]: remaining } }));
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
	for (const [key, entries] of Object.entries(gameOf(state).blocks)) {
		const remaining = entries.filter((entry) => entry.sourceEntityId !== sourceEntityId);
		if (remaining.length === entries.length) continue;
		next = withGame(next, (prevGame) => ({ ...prevGame, blocks: { ...gameOf(next).blocks, [key]: remaining } }));
		if (remaining.length === 0) next = clearBlockFlag(next, key);
	}
	return next;
}

// Consome a primeira entrada `once` do bloco indicado.
// Chamado em healSystem quando a cura é bloqueada por um bloco `once`.
export function consumeOnceBlock(state: GameState, key: string): GameState {
	const entries = gameOf(state).blocks[key] ?? [];
	const onceIdx = entries.findIndex((e) => e.duration.kind === "once");
	if (onceIdx === -1) return state;
	const remaining = entries.filter((_, i) => i !== onceIdx);
	let next: GameState = withGame(state, (prevGame) => ({ ...prevGame, blocks: { ...gameOf(state).blocks, [key]: remaining } }));
	if (remaining.length === 0) {
		next = clearBlockFlag(next, key);
	}
	return next;
}

// Limpa o boolean de controle correspondente quando o array de blocos esvazia.
function clearBlockFlag(state: GameState, key: string): GameState {
	if (key === "fleeBlocked") {
		return withGame(state, (prevGame) => ({ ...prevGame, flags: { ...gameOf(state).flags, fleeBlocked: false } }));
	}
	if (key === "discardDungeonLocked") {
		return withGame(state, (prevGame) => ({ ...prevGame, flags: { ...gameOf(state).flags, discardDungeonLocked: false } }));
	}
	if (key === "powerUseBlocked") {
		return withGame(state, (prevGame) => ({ ...prevGame, flags: { ...gameOf(state).flags, powerUseBlocked: false } }));
	}
	if (key === "dungeonLevelReductionBlocked") {
		return withGame(state, (prevGame) => ({ ...prevGame, flags: { ...gameOf(state).flags, dungeonLevelReductionBlocked: false } }));
	}
	if (key.endsWith("::healBlocked")) {
		const heroId = key.slice(0, -"::healBlocked".length);
		return heroOf(state, heroId)
			? withUnitStats(state, heroId, { healBlocked: false })
			: state;
	}
	return state;
}
