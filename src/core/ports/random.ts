// PRNG determinístico inteiramente em dados — sem closures, sem classes.
// Algoritmo: splitmix32 com hash sobre (seed, counter).
// seed é imutável após START_GAME; counter avança monotonicamente.

export interface RngState {
	readonly seed: number;
	readonly counter: number;
}

export function createRng(seed: number): RngState {
	return { seed, counter: 0 };
}

// Função de hash puro: (seed, counter) → float em [0, 1)
function rngHash(seed: number, counter: number): number {
	let h = (seed ^ counter) | 0;
	h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
	h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
	return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function nextFloat(rng: RngState): { value: number; next: RngState } {
	const value = rngHash(rng.seed, rng.counter);
	return { value, next: { seed: rng.seed, counter: rng.counter + 1 } };
}

export function nextInt(rng: RngState, max: number): { value: number; next: RngState } {
	const { value: f, next } = nextFloat(rng);
	return { value: Math.floor(f * max), next };
}

// Substitui crypto.randomUUID no core. Único dentro da partida, determinístico.
export function nextId(rng: RngState, prefix: string): { value: string; next: RngState } {
	const { value: n1, next: rng1 } = nextInt(rng, 0xffffffff);
	const { value: n2, next: rng2 } = nextInt(rng1, 0xffffffff);
	const value = `${prefix}-${n1.toString(36)}-${n2.toString(36)}`;
	return { value, next: rng2 };
}
