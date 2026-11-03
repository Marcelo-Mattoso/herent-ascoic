import type { AcaoTcg } from "./fluxo";

export const BARALHO_A = [
	"lobo",
	"centelha",
	"centelha",
	"raio",
	"visao",
	"centelha",
	"lobo",
	"centelha",
];

export const BARALHO_B = [
	"lobo",
	"centelha",
	"bencao",
	"sorte",
	"raio",
	"centelha",
	"centelha",
	"lobo",
];

export const VIDA_ROTEIRO = 6;
export const DADOS_ROTEIRO = [5];

const a = "a";
const b = "b";

export const ROTEIRO: readonly AcaoTcg[] = [
	{ type: "COMECAR" },
	{ type: "JOGAR_CRIATURA", jogador: a, carta: "lobo-a-1" },
	{ type: "ENCERRAR_TURNO", jogador: a },
	{ type: "ENCERRAR_TURNO", jogador: b },
	{ type: "ATACAR", jogador: a, criatura: "lobo-a-1" },
	{ type: "JOGAR_FEITICO", jogador: a, carta: "centelha-a-1" },
	{ type: "RESPONDER", jogador: b, carta: "sorte-b-1" },
	{ type: "PASSAR", jogador: b },
	{ type: "PASSAR", jogador: a },
	{ type: "JOGAR_FEITICO", jogador: a, carta: "centelha-a-2" },
	{ type: "RESPONDER", jogador: b, carta: "bencao-b-1" },
	{ type: "PASSAR", jogador: b },
	{ type: "PASSAR", jogador: a },
	{ type: "ENCERRAR_TURNO", jogador: a },
	{ type: "JOGAR_CRIATURA", jogador: b, carta: "lobo-b-1" },
	{ type: "JOGAR_FEITICO", jogador: b, carta: "raio-b-1", alvos: ["lobo-a-1"] },
	{ type: "PASSAR", jogador: a },
	{ type: "JOGAR_FEITICO", jogador: b, carta: "centelha-b-1" },
	{ type: "PASSAR", jogador: a },
	{ type: "ENCERRAR_TURNO", jogador: b },
	{ type: "JOGAR_FEITICO", jogador: a, carta: "visao-a-1" },
	{ type: "PASSAR", jogador: b },
	{ type: "ESCOLHER", jogador: a, escolha: "choose_one", opcoes: ["comprar"] },
	{ type: "JOGAR_FEITICO", jogador: a, carta: "centelha-a-3" },
	{ type: "PASSAR", jogador: b },
	{ type: "ENCERRAR_TURNO", jogador: a },
	{ type: "JOGAR_FEITICO", jogador: b, carta: "centelha-b-2" },
	{ type: "PASSAR", jogador: a },
	{ type: "ENCERRAR_TURNO", jogador: b },
	{ type: "JOGAR_CRIATURA", jogador: a, carta: "lobo-a-2" },
	{ type: "ENCERRAR_TURNO", jogador: a },
	{ type: "JOGAR_FEITICO", jogador: b, carta: "centelha-b-3" },
	{ type: "PASSAR", jogador: a },
];
