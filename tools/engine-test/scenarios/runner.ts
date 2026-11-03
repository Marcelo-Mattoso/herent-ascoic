import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import {
	answerPending,
	configureTurns,
	createEngineState,
	createKindRegistryFrom,
	type EngineEventMap,
	engineBuiltinKinds,
	type GameState,
	type KindNode,
	patchUnit,
	remainingScripted,
	runReactive,
	scriptedDice,
	spawnUnit,
	startTurns,
	type UnitCtx,
	unitKinds,
	unitView,
} from "../../../src/engine";
import { criarCatalogo } from "../rpg/conteudo";

type S = GameState<null, EngineEventMap>;

const NodeSchema = z.looseObject({ kind: z.string() });
const CardSchema = z.object({
	id: z.string(),
	def: z.string().optional(),
	owner: z.string().optional(),
});
const ZoneSchema = z.object({
	id: z.string(),
	owner: z.string().optional(),
	visibility: z.enum(["public", "owner", "hidden", "count"]).optional(),
	ordered: z.boolean().optional(),
	cards: z.array(z.string()).optional(),
});
const CounterSchema = z.object({
	scope: z.string(),
	id: z.string(),
	name: z.string(),
	value: z.number(),
});
const UnitGivenSchema = z.object({
	id: z.string(),
	def: z.string(),
	controller: z.string().optional(),
	base: z.record(z.string(), z.number()).optional(),
	pools: z.record(z.string(), z.number()).optional(),
	statuses: z
		.array(
			z.object({
				status: z.string(),
				stacks: z.number().optional(),
				remaining: z.number().nullable().optional(),
			}),
		)
		.optional(),
	presentIn: z.array(z.string()).optional(),
	equippedTo: z.string().optional(),
	cooldowns: z.record(z.string(), z.number()).optional(),
});
const StepSchema = z.union([
	z.object({
		test: z.object({
			subject: z.string(),
			node: NodeSchema,
			expect: z.boolean(),
		}),
	}),
	z.object({ run: z.array(NodeSchema), cause: z.number().optional() }),
	z.object({
		answer: z.object({
			choice: z.string(),
			player: z.string(),
			picks: z.array(z.string()),
		}),
	}),
	z.object({ validate: z.array(NodeSchema) }),
]);

export const ScenarioSchema = z.object({
	name: z.string(),
	kind: z.string(),
	given: z
		.object({
			players: z.array(z.string()).optional(),
			cards: z.array(CardSchema).optional(),
			zones: z.array(ZoneSchema).optional(),
			counters: z.array(CounterSchema).optional(),
			units: z.array(UnitGivenSchema).optional(),
			dice: z.array(z.number()).optional(),
			turn: z
				.object({ order: z.array(z.string()), phases: z.array(z.string()) })
				.optional(),
		})
		.default({}),
	when: z.array(StepSchema).min(1),
	then: z
		.object({
			events: z.array(z.looseObject({ type: z.string() })).optional(),
			zones: z.record(z.string(), z.array(z.string())).optional(),
			counters: z.record(z.string(), z.number()).optional(),
			units: z.record(z.string(), z.looseObject({})).optional(),
			dice_left: z.number().optional(),
			pending: z.union([z.null(), z.looseObject({})]).optional(),
			error: z.string().optional(),
		})
		.default({}),
});

export type Scenario = z.infer<typeof ScenarioSchema>;

export const catalogo = criarCatalogo();

export const registro = createKindRegistryFrom<S, UnitCtx>(
	engineBuiltinKinds<null>(),
	unitKinds<null>(),
);

export function parseScenario(source: string, origin: string): Scenario {
	const parsed = ScenarioSchema.safeParse(parse(source));
	if (!parsed.success) {
		throw new Error(`Cenário ${origin} inválido: ${parsed.error.message}`);
	}
	return parsed.data;
}

export function loadScenarios(
	dir: string,
): { file: string; scenario: Scenario }[] {
	return readdirSync(dir)
		.filter((file) => file.endsWith(".yaml"))
		.sort()
		.map((file) => ({
			file,
			scenario: parseScenario(readFileSync(path.join(dir, file), "utf8"), file),
		}));
}

export function buildState(given: Scenario["given"]): S {
	let engine = createEngineState<EngineEventMap>({
		dice: scriptedDice(given.dice ?? []),
		players: given.players ?? [],
		cards: (given.cards ?? []).map((card) => ({
			id: card.id,
			defId: card.def ?? card.id,
			owner: card.owner,
		})),
		zones: given.zones ?? [],
		counters: given.counters ?? [],
	});
	for (const unit of given.units ?? []) {
		engine = spawnUnit(engine, catalogo, unit);
	}
	for (const unit of given.units ?? []) {
		engine = patchUnit(engine, unit.id, {
			statuses: (unit.statuses ?? []).map((entry) => ({
				status: entry.status,
				stacks: entry.stacks ?? 1,
				remaining: entry.remaining ?? null,
			})),
			presentIn: unit.presentIn ?? [],
			cooldowns: unit.cooldowns ?? {},
			...(unit.equippedTo === undefined ? {} : { equippedTo: unit.equippedTo }),
		});
	}
	if (given.turn) {
		engine = startTurns(configureTurns(engine, given.turn));
	}
	return { engine, game: null };
}

export function matchPartial(
	actual: unknown,
	expected: unknown,
	at = "$",
): string[] {
	if (expected === null || typeof expected !== "object") {
		return Object.is(actual, expected)
			? []
			: [
					`${at}: esperado ${JSON.stringify(expected)}, obtido ${JSON.stringify(actual)}`,
				];
	}
	if (Array.isArray(expected)) {
		if (!Array.isArray(actual) || actual.length !== expected.length) {
			return [
				`${at}: esperado array de ${expected.length}, obtido ${JSON.stringify(actual)}`,
			];
		}
		return expected.flatMap((item, i) =>
			matchPartial(actual[i], item, `${at}[${i}]`),
		);
	}
	if (actual === null || typeof actual !== "object") {
		return [`${at}: esperado objeto, obtido ${JSON.stringify(actual)}`];
	}
	return Object.entries(expected).flatMap(([key, value]) =>
		matchPartial(
			(actual as Record<string, unknown>)[key],
			value,
			`${at}.${key}`,
		),
	);
}

function execute(scenario: Scenario): { state: S; before: number; failure?: string } {
	const initial = buildState(scenario.given);
	const before = initial.engine.events.length;
	let state = initial;
	for (const step of scenario.when) {
		try {
			if ("run" in step) {
				state = runReactive(registro, state, catalogo, step.run as KindNode[], {
					cause: step.cause,
				});
			} else if ("answer" in step) {
				state = answerPending(registro, state, step.answer, {
					units: catalogo,
				});
			} else if ("test" in step) {
				const held = registro.test(step.test.node as KindNode, {
					units: catalogo,
					world: state.engine,
					subject: step.test.subject,
				});
				if (held !== step.test.expect) {
					throw new Error(
						`condição ${step.test.node.kind} deu ${held}, esperado ${step.test.expect}`,
					);
				}
			} else {
				registro.validateAll(step.validate as KindNode[], scenario.name);
			}
		} catch (error) {
			return {
				state,
				before,
				failure: error instanceof Error ? error.message : String(error),
			};
		}
	}
	return { state, before };
}

export function runScenario(scenario: Scenario): void {
	const { state, before, failure } = execute(scenario);
	const { then } = scenario;

	if (then.error !== undefined) {
		if (failure === undefined) {
			throw new Error(
				`${scenario.name}: esperava erro "${then.error}", mas não houve`,
			);
		}
		if (!failure.includes(then.error)) {
			throw new Error(
				`${scenario.name}: erro "${failure}" não contém "${then.error}"`,
			);
		}
		return;
	}
	if (failure !== undefined) {
		throw new Error(`${scenario.name}: erro inesperado: ${failure}`);
	}

	const problems: string[] = [];
	if (then.events) {
		problems.push(
			...matchPartial(state.engine.events.slice(before), then.events, "events"),
		);
	}
	for (const [zone, cards] of Object.entries(then.zones ?? {})) {
		problems.push(
			...matchPartial(state.engine.zones[zone]?.cards, cards, `zones.${zone}`),
		);
	}
	for (const [key, value] of Object.entries(then.counters ?? {})) {
		problems.push(
			...matchPartial(
				state.engine.counters[key] ?? 0,
				value,
				`counters.${key}`,
			),
		);
	}
	for (const [id, expected] of Object.entries(then.units ?? {})) {
		problems.push(
			...matchPartial(unitView(state.engine, catalogo, id), expected, `units.${id}`),
		);
	}
	if (then.dice_left !== undefined) {
		problems.push(
			...matchPartial(
				remainingScripted(state.engine.dice),
				then.dice_left,
				"dice_left",
			),
		);
	}
	if (then.pending !== undefined) {
		problems.push(
			...matchPartial(
				state.engine.pending?.choice ?? null,
				then.pending,
				"pending",
			),
		);
	}
	if (problems.length > 0) {
		throw new Error(`${scenario.name}:\n  ${problems.join("\n  ")}`);
	}
}
