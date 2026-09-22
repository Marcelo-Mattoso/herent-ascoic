// Lógica de progressão: subir nível (Ímpeto), mudar Despertar da Masmorra.
// Usada pelos handlers de SPEND_XP.

import { getCardName } from "../data/cardLocale";
import { getCardById, getSubbossRooms } from "../data/cards";
import { installPassive } from "../ecs/installPassive";
import { removeComponent } from "../ecs/world";
import { nextColor, previousColor, valueAtColor } from "../rules/colorScale";
import { PURPLE_AWAKENING } from "../rules/awakening";
import { cardSkills } from "../skills/lookup";
import { applyDeclaredPassiveBlocks } from "../skills/applyPassiveBlocks";
import type { ColorIndex } from "../state/color";
import type { GameState } from "../state/gameState";
import { removeBlocksForSource } from "../state/blockHelpers";
import { applyLifeGain } from "../systems/healSystem";
import { log, mapHero, shuffleRng } from "./utils";

// Sobe o Ímpeto de um herói e atualiza seus stats. Também avança o Despertar.
export function levelUpHero(state: GameState, heroId: string): GameState {
	const hero = state.heroes.find((h) => h.id === heroId);
	if (!hero) return state;

	const newImpeto = nextColor(hero.impeto);
	if (newImpeto === hero.impeto) {
		return log(state, `${getCardName(hero.cardId)} já está no nível máximo.`);
	}

	const card = getCardById(hero.cardId);
	if (!card || card.type !== "hero") return state;

	const ci = newImpeto as ColorIndex;
	const newMaxLife = valueAtColor(card.life, ci);
	const lifeGain = newMaxLife - card.life[hero.impeto];

	let next = mapHero(state, heroId, (h) => ({
		...h,
		impeto: newImpeto,
		maxLife: newMaxLife,
		hitBonus: valueAtColor(card.hitBonus, ci),
		dice: card.diceByColor[ci],
	}));
	next = applyLifeGain(next, heroId, lifeGain);

	// Subir nível também avança o Despertar
	next = { ...next, despertar: nextColor(next.despertar) };
	if (next.despertar === PURPLE_AWAKENING) {
		next = refreshPurpleComponents(next, true);
	}

	// Ao atingir Vermelho (3), injetar salas de subchefe no deck de dungeon
	if (next.despertar === 3 && next.subbosses.available.length === 0) {
		next = injectSubbossRooms(next);
	}

	return log(
		next,
		`${getCardName(hero.cardId)} subiu para nível ${newImpeto + 1}. Despertar avança.`,
	);
}

// Embaralha as 2 salas de subchefe no deck de dungeon remanescente.
function injectSubbossRooms(state: GameState): GameState {
	const subbossRoomIds = getSubbossRooms().map((r) => r.id);
	if (subbossRoomIds.length === 0) return state;

	const { available, discarded, removed } = state.decks.dungeonDeck;
	const { value: combined, next: rng } = shuffleRng(
		[...available, ...subbossRoomIds],
		state.rng,
	);
	const subbossRoomNames = getSubbossRooms().map((r) => getCardName(r.id));
	return log(
		{
			...state,
			rng,
			subbosses: {
				available: subbossRoomIds,
				defeated: state.subbosses.defeated,
			},
			decks: {
				...state.decks,
				dungeonDeck: { available: combined, discarded, removed },
			},
		},
		`Despertar Vermelho! Salas de subchefe injetadas no deck (${subbossRoomNames.join(", ")}).`,
	);
}

export function lowerDespertar(state: GameState): GameState {
	if (state.flags.dungeonLevelReductionBlocked) {
		return log(state, "A redução do Despertar está bloqueada.");
	}
	const newDespertar = previousColor(state.despertar);
	const next =
		state.despertar === PURPLE_AWAKENING && newDespertar !== PURPLE_AWAKENING
			? refreshPurpleComponents({ ...state, despertar: newDespertar }, false)
			: { ...state, despertar: newDespertar };
	return log(
		next,
		`Despertar reduzido para nível ${newDespertar}.`,
	);
}

/** Instala/remove somente componentes originados por referências Roxas. */
function refreshPurpleComponents(state: GameState, enabled: boolean): GameState {
	let world = state.world;
	let next = state;
	const sources = [
		...state.heroes.map((hero) => ({ entityId: hero.id, cardId: hero.cardId })),
		...state.activeEnemies.map((enemy) => ({
			entityId: enemy.id,
			cardId: enemy.cardId,
		})),
	];
	for (const source of sources) {
		const purpleSkills = cardSkills(source.cardId).filter(
			({ ref }) => ref.requiresAwakening,
		);
		if (purpleSkills.length === 0) continue;
		if (enabled) {
			for (const { def, ref } of purpleSkills) {
				if (def.operate_type === "op_passive") {
					world = installPassive(world, source.entityId, def, ref);
				}
			}
			next = { ...next, world };
			next = applyDeclaredPassiveBlocks(next, {
				cardId: source.cardId,
				entityId: source.entityId,
				...(state.heroes.some((hero) => hero.id === source.entityId)
					? { sourceHeroId: source.entityId }
					: { sourceEnemyId: source.entityId }),
			});
			world = next.world;
			continue;
		}
		const ids = new Set(purpleSkills.map(({ def }) => def.id));
		world = removeComponent(
			world,
			source.entityId,
			(component) =>
				(component.type === "trigger" || component.type === "modifier") &&
				"source" in component &&
				ids.has(component.source),
		);
		next = removeBlocksForSource({ ...next, world }, source.entityId);
		world = next.world;
	}
	return { ...next, world };
}
