import {
	activePlayer,
	type AbilityRejection,
	closeUnitTurn,
	configureTurns,
	createEngineState,
	createScopeRegistry,
	type EngineEventMap,
	enterArea,
	equip,
	eventsOfType,
	openUnitTurn,
	runReactive,
	scriptedDice,
	spawnUnit,
	startUnitTurns,
	type UnitCatalog,
	useAbility,
} from "../../../src/engine";
import {
	ARIA,
	COTA,
	criarCatalogo,
	criarRegistro,
	ESPREITADOR,
	JOGADOR_A,
	JOGADOR_E,
	type KindsRpg,
	LAGO,
	type Rpg,
} from "./conteudo";

export const escopos = createScopeRegistry();

export interface Mesa {
	readonly catalogo: UnitCatalog;
	readonly registro: KindsRpg;
}

export function criarMesa(): Mesa {
	return { catalogo: criarCatalogo(), registro: criarRegistro() };
}

export type Tentativa =
	| {
			readonly habilidade: string;
			readonly alvos?: readonly string[];
			readonly rejeitada?: AbilityRejection;
	  }
	| { readonly passar: true };

export function preparar(mesa: Mesa): Rpg {
	const { catalogo, registro } = mesa;
	let engine = createEngineState<EngineEventMap>({
		dice: scriptedDice([]),
		players: [JOGADOR_A, JOGADOR_E],
	});
	engine = configureTurns(engine, {
		order: [JOGADOR_A, JOGADOR_E],
		phases: ["acao"],
	});
	engine = spawnUnit(engine, catalogo, {
		id: ARIA,
		def: "aria",
		controller: JOGADOR_A,
	});
	engine = spawnUnit(engine, catalogo, { id: COTA, def: "cota_de_escamas" });
	engine = equip(engine, catalogo, COTA, ARIA);
	engine = spawnUnit(engine, catalogo, { id: LAGO, def: "lago_turvo" });
	engine = spawnUnit(engine, catalogo, {
		id: ESPREITADOR,
		def: "espreitador_do_junco",
		controller: JOGADOR_E,
	});
	let estado: Rpg = { engine, game: {} };
	estado = runReactive(registro, estado, catalogo, [
		{ kind: "modify_attribute", target: ARIA, attr: "vida", delta: 10, mode: "atual" },
		{ kind: "move_to_area", target: ESPREITADOR, area: LAGO },
	]);
	return estado;
}

export function iniciar(mesa: Mesa, estado: Rpg): Rpg {
	return startUnitTurns(mesa.registro, estado, mesa.catalogo);
}

export function unidadeAtiva(estado: Rpg): string {
	return activePlayer(estado.engine) === JOGADOR_A ? ARIA : ESPREITADOR;
}

export function resultadoDe(estado: Rpg): "vitoria" | "derrota" | undefined {
	const caidas = eventsOfType(estado.engine.events, "unidade.derrotada").map(
		(evento) => evento.payload.unit,
	);
	if (caidas.includes(ESPREITADOR)) return "vitoria";
	if (caidas.includes(ARIA)) return "derrota";
	return undefined;
}

export interface Jogada {
	readonly estado: Rpg;
	readonly rejeicoes: readonly AbilityRejection[];
	readonly resultado?: "vitoria" | "derrota";
}

export function jogarTurno(
	mesa: Mesa,
	estado: Rpg,
	tentativas: readonly Tentativa[],
): Jogada {
	let atual = estado;
	const rejeicoes: AbilityRejection[] = [];
	for (const tentativa of tentativas) {
		if ("passar" in tentativa) break;
		const alvos =
			tentativa.alvos ?? (unidadeAtiva(atual) === ARIA ? [ESPREITADOR] : [ARIA]);
		const resposta = useAbility(
			mesa.registro,
			atual,
			mesa.catalogo,
			unidadeAtiva(atual),
			tentativa.habilidade,
			alvos,
		);
		atual = resposta.state;
		if (!resposta.ok) {
			rejeicoes.push(resposta.reason);
			continue;
		}
		break;
	}
	return { estado: atual, rejeicoes, resultado: resultadoDe(atual) };
}

export function fecharTurno(mesa: Mesa, estado: Rpg) {
	return closeUnitTurn(estado, mesa.catalogo, escopos);
}

export function abrirTurno(mesa: Mesa, fechado: ReturnType<typeof fecharTurno>): Rpg {
	return openUnitTurn(mesa.registro, fechado, mesa.catalogo);
}
