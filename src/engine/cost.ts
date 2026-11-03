import type { PlayerId } from "./events";
import { setPool } from "./attributes";
import {
	addToCounter,
	counterOf,
	type CounterRef,
	type EngineEventMap,
	type EngineState,
	recordEvent,
} from "./state";
import { unitOf } from "./units";

export type CostCheck =
	| { readonly ok: true }
	| { readonly ok: false; readonly reason: string };

export interface Cost<S> {
	readonly id: string;
	canPay(state: S, payer: string): CostCheck;
	pay(state: S, payer: string): S;
}

export const PAYABLE: CostCheck = { ok: true };

export function checkCosts<S>(
	costs: readonly Cost<S>[],
	state: S,
	payer: string,
): CostCheck {
	for (const cost of costs) {
		const check = cost.canPay(state, payer);
		if (!check.ok) return check;
	}
	return PAYABLE;
}

export function payCosts<S>(
	costs: readonly Cost<S>[],
	state: S,
	payer: string,
): S {
	const check = checkCosts(costs, state, payer);
	if (!check.ok) throw new Error(`Custo não pago: ${check.reason}`);
	return costs.reduce((current, cost) => cost.pay(current, payer), state);
}

export function requirementCost<S>(
	id: string,
	met: (state: S, payer: string) => boolean,
	reason: string,
): Cost<S> {
	return {
		id,
		canPay: (state, payer) =>
			met(state, payer) ? PAYABLE : { ok: false, reason },
		pay: (state) => state,
	};
}

export const POOL_SCOPE = "player";

export function poolRef(player: PlayerId, name: string): CounterRef {
	return { scope: POOL_SCOPE, id: player, name };
}

export function poolOf<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	player: PlayerId,
	name: string,
): number {
	return counterOf(state, poolRef(player, name));
}

export function gainPool<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	player: PlayerId,
	name: string,
	amount: number,
): EngineState<TMap> {
	return addToCounter(state, poolRef(player, name), amount);
}

export function spendPool<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	player: PlayerId,
	name: string,
	amount: number,
): EngineState<TMap> {
	if (poolOf(state, player, name) < amount) {
		throw new Error(`Recurso "${name}" insuficiente para ${player}`);
	}
	return addToCounter(state, poolRef(player, name), -amount);
}

export function resourceCost<TMap extends EngineEventMap = EngineEventMap>(
	name: string,
	amount: number,
): Cost<EngineState<TMap>> {
	if (!Number.isInteger(amount) || amount < 0) {
		throw new Error(`Custo inválido para "${name}": ${amount}`);
	}
	return {
		id: `recurso:${name}`,
		canPay: (state, payer) =>
			poolOf(state, payer, name) >= amount
				? PAYABLE
				: { ok: false, reason: `Recurso "${name}" insuficiente (${amount})` },
		pay: (state, payer) => spendPool(state, payer, name, amount),
	};
}

export function unitResourceCost<TMap extends EngineEventMap = EngineEventMap>(
	pool: string,
	amount: number,
): Cost<EngineState<TMap>> {
	if (!Number.isInteger(amount) || amount < 0) {
		throw new Error(`Custo inválido para "${pool}": ${amount}`);
	}
	return {
		id: `unidade:${pool}`,
		canPay: (state, payer) =>
			(unitOf(state, payer).pools[pool] ?? 0) >= amount
				? PAYABLE
				: { ok: false, reason: `Recurso "${pool}" insuficiente (${amount})` },
		pay: (state, payer) => {
			const from = unitOf(state, payer).pools[pool] ?? 0;
			return recordEvent(
				setPool(state, payer, pool, from - amount),
				"atributo.alterado",
				{ unit: payer, attr: pool, from, to: from - amount, reason: "custo" },
			);
		},
	};
}
