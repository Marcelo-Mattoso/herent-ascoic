import type { Tentativa } from "./jogo";

export interface PassoRoteiro {
	readonly rodada: number;
	readonly jogador: "a" | "e";
	readonly tentativas: readonly Tentativa[];
}

const a = (rodada: number, ...tentativas: Tentativa[]): PassoRoteiro => ({
	rodada,
	jogador: "a",
	tentativas,
});
const e = (rodada: number, ...tentativas: Tentativa[]): PassoRoteiro => ({
	rodada,
	jogador: "e",
	tentativas,
});

const investida: Tentativa = { habilidade: "investida" };

const ate4: readonly PassoRoteiro[] = [
	a(1, { habilidade: "lampejo" }),
	e(1, { habilidade: "enlace" }),
	a(
		2,
		{ habilidade: "mover_lago", rejeitada: "bloqueada" },
		{ habilidade: "lampejo", rejeitada: "cooldown" },
		{ habilidade: "golpe_lamina" },
	),
	e(2, investida),
	a(3, { habilidade: "lampejo" }),
	e(3, investida),
	a(4, { habilidade: "mover_lago" }),
	e(4, investida),
];

export const roteiroVitoria: readonly PassoRoteiro[] = [
	...ate4,
	a(
		5,
		{ habilidade: "lampejo", rejeitada: "custo" },
		{ habilidade: "pocao_comum" },
	),
	e(5, investida),
	a(6, { habilidade: "antidoto" }),
	e(6, investida),
	a(7, { habilidade: "golpe_lamina" }),
];

export const roteiroDerrota: readonly PassoRoteiro[] = [
	...ate4,
	...[5, 6, 7, 8].flatMap((rodada) => [
		a(rodada, { passar: true }),
		e(rodada, investida),
	]),
];
