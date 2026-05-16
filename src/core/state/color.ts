// Progressão de 5 cores do jogo: Branco → Amarelo → Laranja → Vermelho → Roxo.
// Usada tanto para o Ímpeto do herói quanto para o Despertar da Masmorra.

export type Color = "white" | "yellow" | "orange" | "red" | "purple";

export const COLORS: readonly Color[] = [
	"white",
	"yellow",
	"orange",
	"red",
	"purple",
] as const;

export type ColorIndex = 0 | 1 | 2 | 3 | 4;
