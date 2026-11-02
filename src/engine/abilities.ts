import { abilitiesOf, testCondition } from "./attributes";
import { runWithChoices } from "./choice";
import { nextSeq } from "./events";
import { checkCosts, payCosts, unitResourceCost } from "./cost";
import type { KindRegistry } from "./kinds";
import { settle } from "./reactor";
import {
	addToCounter,
	counterOf,
	type EngineEventMap,
	type EngineState,
	type GameState,
	recordEvent,
} from "./state";
import { canAct } from "./statuses";
import { checkUnitTargets } from "./targets";
import type { UnitCtx } from "./unitKinds";
import {
	type AbilityDef,
	bindNodes,
	limitRef,
	patchUnit,
	type UnitCatalog,
	type UnitId,
	unitOf,
} from "./units";

export type AbilityRejection =
	| "indisponivel"
	| "bloqueada"
	| "cooldown"
	| "limite"
	| "custo"
	| "condicao"
	| "alvo";

export type AbilityCheck =
	| {
			readonly ok: true;
			readonly def: AbilityDef;
			readonly targets: readonly UnitId[];
	  }
	| {
			readonly ok: false;
			readonly reason: AbilityRejection;
			readonly detail?: string;
	  };

export type UseResult<TGame, TMap extends EngineEventMap> =
	| { readonly ok: true; readonly state: GameState<TGame, TMap> }
	| {
			readonly ok: false;
			readonly reason: AbilityRejection;
			readonly state: GameState<TGame, TMap>;
	  };

function costsOf<TMap extends EngineEventMap>(def: AbilityDef) {
	return (def.cost ?? []).map((entry) =>
		unitResourceCost<TMap>(entry.pool, entry.amount),
	);
}

export function canUseAbility<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	catalog: UnitCatalog,
	unit: UnitId,
	ability: string,
	targets: readonly UnitId[] = [],
): AbilityCheck {
	const ref = abilitiesOf(state, catalog, unit).find(
		(entry) => entry.def.id === ability && entry.def.activation === "active",
	);
	if (!ref) return { ok: false, reason: "indisponivel" };
	const def = ref.def;
	if (def.action !== undefined) {
		const gate = canAct(state, catalog, unit, def.action);
		if (!gate.ok) return { ok: false, reason: "bloqueada", detail: gate.by };
	}
	if ((unitOf(state, unit).cooldowns[ability] ?? 0) > 0) {
		return { ok: false, reason: "cooldown" };
	}
	const counter = limitRef(unit, def);
	if (counter && def.limit && counterOf(state, counter) >= def.limit.times) {
		return { ok: false, reason: "limite" };
	}
	const paid = checkCosts(costsOf<TMap>(def), state, unit);
	if (!paid.ok) return { ok: false, reason: "custo", detail: paid.reason };
	if (def.condition && !testCondition(state, catalog, unit, def.condition)) {
		return { ok: false, reason: "condicao" };
	}
	const chosen = def.target
		? def.target.who === "self"
			? [unit]
			: targets
		: [unit];
	if (def.target) {
		const check = checkUnitTargets(state, def.target, unit, chosen);
		if (!check.ok) return { ok: false, reason: "alvo", detail: check.reason };
	}
	return { ok: true, def, targets: chosen };
}

export function useAbility<TGame, TMap extends EngineEventMap>(
	registry: KindRegistry<GameState<TGame, TMap>, UnitCtx, never>,
	state: GameState<TGame, TMap>,
	catalog: UnitCatalog,
	unit: UnitId,
	ability: string,
	targets: readonly UnitId[] = [],
	ctx: { readonly cause?: number } = {},
): UseResult<TGame, TMap> {
	const check = canUseAbility(state.engine, catalog, unit, ability, targets);
	if (!check.ok) {
		if (check.reason !== "bloqueada") {
			return { ok: false, reason: check.reason, state };
		}
		const action = abilitiesOf(state.engine, catalog, unit).find(
			(entry) => entry.def.id === ability,
		)?.def.action;
		return {
			ok: false,
			reason: "bloqueada",
			state: {
				...state,
				engine: recordEvent(
					state.engine,
					"acao.bloqueada",
					{ unit, action: action ?? ability, by: check.detail ?? "" },
					ctx,
				),
			},
		};
	}
	const { def } = check;
	const since = nextSeq(state.engine.events);
	let engine = payCosts(costsOf<TMap>(def), state.engine, unit);
	if (def.cooldown) {
		engine = patchUnit(engine, unit, {
			cooldowns: {
				...unitOf(engine, unit).cooldowns,
				[def.id]: def.cooldown.turns,
			},
		});
	}
	const counter = limitRef(unit, def);
	if (counter) engine = addToCounter(engine, counter, 1, ctx);
	engine = recordEvent(
		engine,
		"habilidade.usada",
		{ unit, ability: def.id, targets: check.targets },
		ctx,
	);
	let current: GameState<TGame, TMap> = { ...state, engine };
	const unitCtx: UnitCtx = { cause: ctx.cause, units: catalog };
	for (const target of check.targets) {
		current = runWithChoices(
			registry,
			current,
			bindNodes(def.effects, { self: unit, target }),
			unitCtx,
		);
		if (current.engine.pending) return { ok: true, state: current };
	}
	return {
		ok: true,
		state: settle(registry, current, catalog, since),
	};
}
