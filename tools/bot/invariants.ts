import type { GameState } from "@/core/state/gameState";
import { allHeroesOf, decksOf, enemiesOf, pausedOf, effectStackOf, pendingSkillChoiceOf } from "@/core/state/access";
import { zoneViolation } from "@/core/state/zones";
import { TERMINAL } from "../golden/lib";
import { gameOf } from "@/engine/state";

export type InvariantName =
	| "dispatch_exception"
	| "not_serializable"
	| "card_duplication"
	| "zone_instances"
	| "life_out_of_range"
	| "ecs_consistency"
	| "effect_stack_not_drained"
	| "no_legal_action"
	| "max_steps_exceeded"
	| "boss_stalemate"
	| "no_progress";

export interface Violation {
	readonly invariant: InvariantName;
	readonly message: string;
}

export function findNonSerializable(value: unknown, path = "$"): string | null {
	if (value === null) return null;
	switch (typeof value) {
		case "string":
		case "boolean":
			return null;
		case "number":
			return Number.isFinite(value) ? null : `${path} = ${value}`;
		case "undefined":
			return null;
		case "object":
			break;
		default:
			return `${path} (${typeof value})`;
	}
	if (Array.isArray(value)) {
		for (let i = 0; i < value.length; i++) {
			if (value[i] === undefined) return `${path}[${i}] = undefined`;
			const found = findNonSerializable(value[i], `${path}[${i}]`);
			if (found) return found;
		}
		return null;
	}
	const proto = Object.getPrototypeOf(value);
	if (proto !== Object.prototype && proto !== null) {
		return `${path} (${proto?.constructor?.name ?? "instância de classe"})`;
	}
	for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
		const found = findNonSerializable(v, `${path}.${k}`);
		if (found) return found;
	}
	return null;
}

export function checkSerializable(state: GameState): Violation | null {
	const bad = findNonSerializable(state);
	if (bad) {
		return { invariant: "not_serializable", message: `valor não serializável em ${bad}` };
	}
	const text = JSON.stringify(state);
	if (JSON.stringify(JSON.parse(text)) !== text) {
		return {
			invariant: "not_serializable",
			message: "JSON round-trip diferente do estado original",
		};
	}
	return null;
}

const STAT_KEYS = [
	"currentLife",
	"maxLife",
	"damage",
	"hitBonus",
	"dice",
	"conditions",
	"tokens",
	"healBlocked",
];

export function checkEcs(state: GameState): Violation | null {
	const lists = {
		heroes: gameOf(state).heroes,
		defeatedHeroes: gameOf(state).defeatedHeroes,
		fledHeroes: gameOf(state).fledHeroes,
		activeEnemies: gameOf(state).activeEnemies,
		enemyGraveyard: gameOf(state).enemyGraveyard,
	};
	const owners = new Map<string, string>();
	for (const [list, records] of Object.entries(lists)) {
		for (const record of records) {
			const stray = STAT_KEYS.find((key) => key in record);
			if (stray) {
				return {
					invariant: "ecs_consistency",
					message: `${list}[${record.id}] guarda "${stray}" fora do ECS`,
				};
			}
			const previous = owners.get(record.id);
			const sharesList =
				previous !== undefined && previous !== list && list !== "enemyGraveyard";
			if (sharesList || previous === list) {
				return {
					invariant: "ecs_consistency",
					message: `${record.id} aparece em ${previous} e ${list}`,
				};
			}
			owners.set(record.id, list);
			const entity = gameOf(state).world.entities[record.id];
			const expected = list.endsWith("Heroes") || list === "heroes" ? ["hero"] : ["enemy", "subboss"];
			if (!entity || !expected.includes(entity.type)) {
				return {
					invariant: "ecs_consistency",
					message: `${list}[${record.id}] sem entidade ${expected.join("/")} no world`,
				};
			}
			for (const type of ["health", "damage_stat", "dice"]) {
				if (!entity.components.some((c) => c.type === type)) {
					return {
						invariant: "ecs_consistency",
						message: `${record.id} sem componente ${type}`,
					};
				}
			}
		}
	}
	for (const entity of Object.values(gameOf(state).world.entities)) {
		const combatant = entity.components.some((c) => c.type === "health");
		if (combatant && !owners.has(entity.id)) {
			return {
				invariant: "ecs_consistency",
				message: `entidade ${entity.id} com health sem registro em GameState`,
			};
		}
	}
	return null;
}

export function checkLife(state: GameState): Violation | null {
	const units = [
		...allHeroesOf(state).map((u) => ["herói", u] as const),
		...enemiesOf(state).map((u) => ["inimigo", u] as const),
	];
	for (const [kind, u] of units) {
		if (
			!Number.isFinite(u.currentLife) ||
			u.currentLife < 0 ||
			u.currentLife > u.maxLife
		) {
			return {
				invariant: "life_out_of_range",
				message: `${kind} ${u.id} (${u.cardId}) com vida ${u.currentLife} fora de [0, ${u.maxLife}]`,
			};
		}
	}
	return null;
}

export function checkEffectStack(state: GameState): Violation | null {
	if (pausedOf(state)) return null;
	const { pending, resolving } = effectStackOf(state);
	if (pending.length > 0 || resolving) {
		return {
			invariant: "effect_stack_not_drained",
			message: `pilha com ${pending.length} pendente(s)${resolving ? " e um efeito em resolução" : ""} sem pausa`,
		};
	}
	return null;
}

export function checkZones(state: GameState): Violation | null {
	const message = zoneViolation(state.engine);
	return message ? { invariant: "zone_instances", message } : null;
}

export type CardCounts = Readonly<Record<string, number>>;

function bump(counts: Record<string, number>, id: string | undefined): void {
	if (id) counts[id] = (counts[id] ?? 0) + 1;
}

// Não há conservação estrita: itens iniciais, recompensas e remoções saem de fora dos baralhos.
// Salas de subchefe são injetadas no deck ao atingir Despertar 3 e contam como 1 cópia.
// Checamos que nenhuma carta passa a existir em mais cópias do que no início da partida.
export function countCards(state: GameState): CardCounts {
	const counts: Record<string, number> = {};
	for (const deck of Object.values(decksOf(state))) {
		for (const id of [...deck.available, ...deck.discarded, ...deck.removed]) {
			bump(counts, id);
		}
	}
	for (const hero of [
		...gameOf(state).heroes,
		...gameOf(state).defeatedHeroes,
		...gameOf(state).fledHeroes,
	]) {
		for (const id of Object.values(hero.activeItems)) bump(counts, id);
		for (const id of hero.backpack) bump(counts, id);
	}
	// i_draw_and_choose retira as cartas do baralho antes de o jogador decidir.
	// Enquanto a escolha está aberta elas continuam existindo, mesmo fora das pilhas.
	const pendingChoice = pendingSkillChoiceOf(state);
	if (pendingChoice?.kind === "draw_and_choose") {
		for (const option of pendingChoice.options) bump(counts, option.id);
	}
	for (const r of gameOf(state).pendingRewards) bump(counts, r.cardId);
	for (const a of gameOf(state).groupArtifacts) bump(counts, a.cardId);
	for (const id of gameOf(state).paths) bump(counts, id);
	bump(counts, gameOf(state).currentRoom?.cardId);
	return counts;
}

export function checkCardDuplication(
	state: GameState,
	baseline: CardCounts,
): Violation | null {
	const now = countCards(state);
	const injected = new Set([
		...gameOf(state).subbosses.available,
		...gameOf(state).subbosses.defeated,
	]);
	for (const [id, n] of Object.entries(now)) {
		const max = baseline[id] ?? (injected.has(id) ? 1 : 0);
		if (n > max) {
			return {
				invariant: "card_duplication",
				message: `carta ${id} existe em ${n} cópia(s); no início havia ${max}`,
			};
		}
	}
	return null;
}

export function checkState(
	state: GameState,
	baseline: CardCounts,
): Violation | null {
	return (
		checkSerializable(state) ??
		checkEcs(state) ??
		checkLife(state) ??
		checkEffectStack(state) ??
		checkZones(state) ??
		checkCardDuplication(state, baseline)
	);
}

export function isTerminal(state: GameState): boolean {
	return TERMINAL.has(gameOf(state).status);
}

export const NO_PROGRESS_WINDOW = 60;

export function checkNoProgress(
	actions: readonly unknown[],
	state: GameState,
): Violation | null {
	if (actions.length < NO_PROGRESS_WINDOW) return null;
	const tail = actions.slice(-NO_PROGRESS_WINDOW).map((a) => JSON.stringify(a));
	if (tail.every((a) => a === tail[0])) {
		return {
			invariant: "no_progress",
			message: `${NO_PROGRESS_WINDOW} actions idênticas seguidas (${tail[0]}) no status ${gameOf(state).status}, salas limpas ${gameOf(state).roomsCleared}`,
		};
	}
	return null;
}
