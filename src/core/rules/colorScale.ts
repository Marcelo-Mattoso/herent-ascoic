// Utilitários para navegar na escala de 5 cores do jogo.
// Operações sem side effects — recebem índice, retornam índice ou valor.

import type { ColorIndex } from "../state/color";

export function nextColor(index: ColorIndex): ColorIndex {
	return Math.min(index + 1, 4) as ColorIndex;
}

export function previousColor(index: ColorIndex): ColorIndex {
	return Math.max(index - 1, 0) as ColorIndex;
}

// Lê um valor de array de 5 elementos pelo índice de cor
export function valueAtColor(
	values: readonly [number, number, number, number, number],
	index: ColorIndex,
): number {
	return values[index];
}
