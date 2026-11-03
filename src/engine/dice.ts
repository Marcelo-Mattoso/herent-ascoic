export interface SeededDice {
	readonly kind: "seeded";
	readonly seed: number;
	readonly counter: number;
}

export interface ScriptedDice {
	readonly kind: "scripted";
	readonly values: readonly number[];
	readonly index: number;
}

export type Dice = SeededDice | ScriptedDice;

export interface DiceDraw<TDice extends Dice = Dice, TValue = number> {
	readonly value: TValue;
	readonly next: TDice;
}

export function seededDice(seed: number): SeededDice {
	return { kind: "seeded", seed, counter: 0 };
}

export function scriptedDice(values: readonly number[]): ScriptedDice {
	return { kind: "scripted", values: [...values], index: 0 };
}

function hashToFloat(seed: number, counter: number): number {
	let h = (seed ^ counter) | 0;
	h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
	h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
	return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function float(dice: SeededDice): DiceDraw<SeededDice> {
	return {
		value: hashToFloat(dice.seed, dice.counter),
		next: { ...dice, counter: dice.counter + 1 },
	};
}

function scripted(dice: ScriptedDice, faces: number): DiceDraw<ScriptedDice> {
	if (dice.index >= dice.values.length) {
		throw new Error(
			`Dados roteirizados esgotados: rolagem ${dice.index + 1} de d${faces}, mas só havia ${dice.values.length} valores`,
		);
	}
	const value = dice.values[dice.index];
	if (!Number.isInteger(value) || value < 1 || value > faces) {
		throw new Error(
			`Dado roteirizado fora da faixa: rolagem ${dice.index + 1} valeu ${value}, esperado 1..${faces}`,
		);
	}
	return { value, next: { ...dice, index: dice.index + 1 } };
}

export function int<TDice extends Dice>(
	dice: TDice,
	max: number,
): DiceDraw<TDice> {
	if (dice.kind === "scripted") {
		const drawn = scripted(dice, max);
		return { value: drawn.value - 1, next: drawn.next as TDice };
	}
	const drawn = float(dice);
	return {
		value: Math.floor(drawn.value * max),
		next: drawn.next as TDice,
	};
}

export function roll<TDice extends Dice>(
	dice: TDice,
	faces: number,
): DiceDraw<TDice> {
	if (!Number.isInteger(faces) || faces < 1) {
		throw new Error(
			`Dado inválido: faces deve ser inteiro >= 1, recebido ${faces}`,
		);
	}
	const drawn = int(dice, faces);
	return { value: drawn.value + 1, next: drawn.next };
}

export function id<TDice extends Dice>(
	dice: TDice,
	prefix: string,
): DiceDraw<TDice, string> {
	const first = int(dice, 0xffffffff);
	const second = int(first.next, 0xffffffff);
	return {
		value: `${prefix}-${first.value.toString(36)}-${second.value.toString(36)}`,
		next: second.next,
	};
}

export function remainingScripted(dice: Dice): number {
	return dice.kind === "scripted" ? dice.values.length - dice.index : 0;
}

export function shuffleWith<T>(
	dice: Dice,
	items: readonly T[],
): { items: T[]; next: Dice } {
	const result = [...items];
	let current = dice;
	for (let i = result.length - 1; i > 0; i--) {
		const drawn = roll(current, i + 1);
		current = drawn.next;
		const j = drawn.value - 1;
		[result[i], result[j]] = [result[j], result[i]];
	}
	return { items: result, next: current };
}
