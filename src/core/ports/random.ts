// Adaptador fino sobre os dados semeados da engine: o RngState do GameState
// continua sendo { seed, counter } e a sequência é idêntica à da engine.

import {
	float,
	id,
	int,
	roll,
	type SeededDice,
} from "../../engine/dice";

export interface RngState {
	readonly seed: number;
	readonly counter: number;
}

export function createRng(seed: number): RngState {
	return { seed, counter: 0 };
}

function toDice(rng: RngState): SeededDice {
	return { kind: "seeded", seed: rng.seed, counter: rng.counter };
}

function toRng(dice: SeededDice): RngState {
	return { seed: dice.seed, counter: dice.counter };
}

export function nextFloat(rng: RngState): { value: number; next: RngState } {
	const drawn = float(toDice(rng));
	return { value: drawn.value, next: toRng(drawn.next) };
}

export function nextInt(
	rng: RngState,
	max: number,
): { value: number; next: RngState } {
	const drawn = int(toDice(rng), max);
	return { value: drawn.value, next: toRng(drawn.next) };
}

export function nextRoll(
	rng: RngState,
	faces: number,
): { value: number; next: RngState } {
	const drawn = roll(toDice(rng), faces);
	return { value: drawn.value, next: toRng(drawn.next) };
}

// Substitui crypto.randomUUID no core. Único dentro da partida, determinístico.
export function nextId(
	rng: RngState,
	prefix: string,
): { value: string; next: RngState } {
	const drawn = id(toDice(rng), prefix);
	return { value: drawn.value, next: toRng(drawn.next) };
}
