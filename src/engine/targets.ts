import type { PlayerId } from "./events";
import {
	type CardInstance,
	type CardInstanceId,
	controllerOf,
	type EngineEventMap,
	type EngineState,
	recordEvent,
} from "./state";
import { isArea, type UnitId, type UnitTargetSelector, unitOf, unitsOf } from "./units";

export type ControllerFilter = "self" | "opponent" | "any";

export interface TargetSelector {
	readonly id: string;
	readonly zones: readonly string[];
	readonly controller: ControllerFilter;
	readonly defIds?: readonly string[];
	readonly min: number;
	readonly max: number;
}

export type TargetPredicate<TMap extends EngineEventMap = EngineEventMap> = (
	card: CardInstance,
	state: EngineState<TMap>,
) => boolean;

export interface TargetDeclaration {
	readonly selector: TargetSelector;
	readonly caster: PlayerId;
	readonly targets: readonly CardInstanceId[];
}

export type TargetCheck =
	| { readonly ok: true }
	| { readonly ok: false; readonly reason: string };

export function validateSelector<TMap extends EngineEventMap>(
	selector: TargetSelector,
	state?: EngineState<TMap>,
): void {
	const problems: string[] = [];
	if (selector.id === "") problems.push("id vazio");
	if (selector.zones.length === 0) problems.push("sem zonas de escopo");
	if (!Number.isInteger(selector.min) || selector.min < 0) {
		problems.push("min inválido");
	}
	if (!Number.isInteger(selector.max) || selector.max < selector.min) {
		problems.push("max menor que min");
	}
	if (state) {
		for (const zone of selector.zones) {
			if (!state.zones[zone]) problems.push(`zona desconhecida "${zone}"`);
		}
	}
	if (problems.length > 0) {
		throw new Error(
			`Seletor "${selector.id}" inválido: ${problems.join("; ")}`,
		);
	}
}

function controllerAllows<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	selector: TargetSelector,
	caster: PlayerId,
	card: CardInstanceId,
): boolean {
	if (selector.controller === "any") return true;
	const controller = controllerOf(state, card);
	return selector.controller === "self"
		? controller === caster
		: controller !== caster;
}

export function legalTargets<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	selector: TargetSelector,
	caster: PlayerId,
	where?: TargetPredicate<TMap>,
): readonly CardInstanceId[] {
	validateSelector(selector, state);
	return selector.zones.flatMap((zone) =>
		state.zones[zone].cards.filter((card) => {
			const instance = state.cards[card];
			if (selector.defIds && !selector.defIds.includes(instance.defId)) {
				return false;
			}
			if (!controllerAllows(state, selector, caster, card)) return false;
			return where ? where(instance, state) : true;
		}),
	);
}

export function checkTargets<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	selector: TargetSelector,
	caster: PlayerId,
	chosen: readonly CardInstanceId[],
	where?: TargetPredicate<TMap>,
): TargetCheck {
	if (chosen.length < selector.min || chosen.length > selector.max) {
		return {
			ok: false,
			reason: `exige entre ${selector.min} e ${selector.max} alvos`,
		};
	}
	if (new Set(chosen).size !== chosen.length) {
		return { ok: false, reason: "alvo repetido" };
	}
	const legal = new Set(legalTargets(state, selector, caster, where));
	const illegal = chosen.find((card) => !legal.has(card));
	return illegal === undefined
		? { ok: true }
		: { ok: false, reason: `alvo ilegal "${illegal}"` };
}

export function declareTargets<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	selector: TargetSelector,
	caster: PlayerId,
	chosen: readonly CardInstanceId[],
	where?: TargetPredicate<TMap>,
): TargetDeclaration {
	const check = checkTargets(state, selector, caster, chosen, where);
	if (!check.ok) {
		throw new Error(`Seletor "${selector.id}": ${check.reason}`);
	}
	return { selector, caster, targets: chosen };
}

export function resolveTargeted<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	declaration: TargetDeclaration,
	apply: (
		state: EngineState<TMap>,
		targets: readonly CardInstanceId[],
	) => EngineState<TMap>,
	where?: TargetPredicate<TMap>,
): EngineState<TMap> {
	const { selector, caster, targets } = declaration;
	const check = checkTargets(state, selector, caster, targets, where);
	if (!check.ok) {
		return recordEvent(state, "alvo.ilegal", {
			selector: selector.id,
			caster,
			targets,
			reason: check.reason,
		});
	}
	return apply(state, targets);
}

export function legalUnitTargets<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	selector: UnitTargetSelector,
	caster: UnitId,
): readonly UnitId[] {
	const self = unitOf(state, caster);
	if (selector.who === "self") return [caster];
	return unitsOf(state)
		.filter((unit) => {
			if (isArea(unit) || unit.controller === undefined) return false;
			if (selector.who === "ally" && unit.controller !== self.controller) {
				return false;
			}
			if (selector.who === "enemy" && unit.controller === self.controller) {
				return false;
			}
			if (selector.tags?.some((tag) => !unit.tags.includes(tag))) return false;
			const area = selector.inArea;
			return (
				area === undefined ||
				unit.presentIn.some(
					(entry) => entry === area || state.units?.[entry]?.def === area,
				)
			);
		})
		.map((unit) => unit.id);
}

export function checkUnitTargets<TMap extends EngineEventMap>(
	state: EngineState<TMap>,
	selector: UnitTargetSelector,
	caster: UnitId,
	chosen: readonly UnitId[],
): TargetCheck {
	const min = selector.who === "self" ? 1 : (selector.min ?? 1);
	const max = selector.who === "self" ? 1 : (selector.max ?? 1);
	if (chosen.length < min || chosen.length > max) {
		return { ok: false, reason: `exige entre ${min} e ${max} alvos` };
	}
	if (new Set(chosen).size !== chosen.length) {
		return { ok: false, reason: "alvo repetido" };
	}
	const legal = new Set(legalUnitTargets(state, selector, caster));
	const illegal = chosen.find((unit) => !legal.has(unit));
	return illegal === undefined
		? { ok: true }
		: { ok: false, reason: `alvo ilegal "${illegal}"` };
}
