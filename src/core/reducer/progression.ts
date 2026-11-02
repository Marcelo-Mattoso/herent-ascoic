import { installPassive } from "../ecs/installPassive";
import { removeComponent } from "../ecs/world";
import { nextColor, previousColor, valueAtColor } from "../rules/colorScale";

import { applyDeclaredPassiveBlocks } from "../skills/applyPassiveBlocks";
import type { ColorIndex } from "../state/color";
import type { GameState } from "../state/gameState";
import { removeBlocksForSource } from "../state/blockHelpers";
import { applyLifeGain } from "../systems/healSystem";
import { recordEvent } from "../events/record";
import { handleCheckBossCondition, handleDungeonExhaustedSpend } from "./exploration";
import { log, shuffleRng } from "./utils";
import type { GameHandler, XpSpendOption } from "../gameEngine";
import type { Action } from "../actions/types";
import { partyHeroIds } from "./legal";
import { balanceOf, cardById, cardName, cardsOfType, refRequirementMet, skillsOf } from "../gameEngine";
import type { GameEngine } from "../gameEngine";

import { awakeningOf, deckOf, decksOf, heroesOf, impetoOf, shuffleDeck, withDecks, withAwakening, withDeck, withImpeto, withUnitStats, withWorld, worldOf } from "../state/access";
import { gameOf, withGame } from "../../engine/state";
// Sobe o Ímpeto de um herói e atualiza seus stats. Também avança o Despertar.
export function levelUpHero(engine: GameEngine, state: GameState, heroId: string): GameState {
	const hero = gameOf(state).heroes.find((h) => h.id === heroId);
	if (!hero) return state;

	const newImpeto = nextColor(impetoOf(state, heroId));
	if (newImpeto === impetoOf(state, heroId)) {
		return log(state, `${cardName(engine, hero.cardId)} já está no nível máximo.`);
	}

	const card = cardById(engine, hero.cardId);
	if (!card || card.type !== "hero") return state;

	const ci = newImpeto as ColorIndex;
	const newMaxLife = valueAtColor(card.life, ci);
	const lifeGain = newMaxLife - card.life[impetoOf(state, heroId)];

	let next = withUnitStats(state, heroId, {
		maxLife: newMaxLife,
		hitBonus: valueAtColor(card.hitBonus, ci),
		dice: card.diceByColor[ci],
	});
	next = withImpeto(next, heroId, newImpeto);
	next = applyLifeGain(engine, next, heroId, lifeGain);

	// Subir nível também avança o Despertar
	const despertarBefore = awakeningOf(next);
	next = withAwakening(next, nextColor(awakeningOf(next)));
	next = recordEvent(next, "DespertarChanged", {
		from: despertarBefore,
		to: awakeningOf(next),
		cause: "level_up",
	});
	if (refRequirementMet(engine, next, true)) {
		next = refreshRequirementComponents(engine, next, true);
	}

	// Ao atingir Vermelho (3), injetar salas de subchefe no deck de dungeon
	if (awakeningOf(next) === 3 && gameOf(next).subbosses.available.length === 0) {
		next = injectSubbossRooms(engine, next);
	}

	return log(
		next,
		`${cardName(engine, hero.cardId)} subiu para nível ${newImpeto + 1}. Despertar avança.`,
	);
}

// Embaralha as 2 salas de subchefe no deck de dungeon remanescente.
function injectSubbossRooms(engine: GameEngine, state: GameState): GameState {
	const subbossRoomIds = cardsOfType(engine, "subboss_room").map((r) => r.id);
	if (subbossRoomIds.length === 0) return state;

	const { available, discarded, removed } = deckOf(state, "dungeonDeck");
	const subbossRoomNames = cardsOfType(engine, "subboss_room").map((r) => cardName(engine, r.id));
	return log(
		shuffleDeck(
			withDeck(
				withGame(state, (prevGame) => ({ ...prevGame, subbosses: {
						available: subbossRoomIds,
						defeated: gameOf(state).subbosses.defeated,
					} })),
				"dungeonDeck",
				{ available: [...available, ...subbossRoomIds], discarded, removed },
			),
			"dungeonDeck",
		),
		`Despertar Vermelho! Salas de subchefe injetadas no deck (${subbossRoomNames.join(", ")}).`,
	);
}

export function lowerDespertar(engine: GameEngine, state: GameState): GameState {
	if (gameOf(state).flags.dungeonLevelReductionBlocked) {
		return log(state, "A redução do Despertar está bloqueada.");
	}
	const newDespertar = previousColor(awakeningOf(state));
	const lowered = withAwakening(state, newDespertar);
	const next =
		refRequirementMet(engine, state, true) &&
		!refRequirementMet(engine, lowered, true)
			? refreshRequirementComponents(engine, lowered, false)
			: lowered;
	return log(
		recordEvent(next, "DespertarChanged", {
			from: awakeningOf(state),
			to: newDespertar,
			cause: "lowered",
		}),
		`Despertar reduzido para nível ${newDespertar}.`,
	);
}

/** Instala/remove somente componentes originados por referências que exigem o requisito. */
function refreshRequirementComponents(engine: GameEngine, state: GameState, enabled: boolean): GameState {
	let world = worldOf(state);
	let next = state;
	const sources = [
		...gameOf(state).heroes.map((hero) => ({ entityId: hero.id, cardId: hero.cardId })),
		...gameOf(state).activeEnemies.map((enemy) => ({
			entityId: enemy.id,
			cardId: enemy.cardId,
		})),
	];
	for (const source of sources) {
		const gatedSkills = skillsOf(engine, source.cardId).filter(
			({ ref }) => ref.requiresAwakening,
		);
		if (gatedSkills.length === 0) continue;
		if (enabled) {
			for (const { def, ref } of gatedSkills) {
				if (def.operate_type === "op_passive") {
					world = installPassive(world, source.entityId, def, ref);
				}
			}
			next = withWorld(next, world);
			next = applyDeclaredPassiveBlocks(engine, next, {
				cardId: source.cardId,
				entityId: source.entityId,
				...(gameOf(state).heroes.some((hero) => hero.id === source.entityId)
					? { sourceHeroId: source.entityId }
					: { sourceEnemyId: source.entityId }),
			});
			world = worldOf(next);
			continue;
		}
		const ids = new Set(gatedSkills.map(({ def }) => def.id));
		world = removeComponent(
			world,
			source.entityId,
			(component) =>
				(component.type === "trigger" || component.type === "modifier") &&
				"source" in component &&
				ids.has(component.source),
		);
		next = removeBlocksForSource(withWorld(next, world), source.entityId);
		world = worldOf(next);
	}
	return withWorld(next, world);
}

// ─── GAIN_XP ─────────────────────────────────────────────────────────────────

export function handleGainXp(state: GameState, amount: number): GameState {
	return log(
		withGame(state, (prevGame) => ({ ...prevGame, groupXp: gameOf(state).groupXp + amount })),
		`+${amount} XP. Total: ${gameOf(state).groupXp + amount}.`,
	);
}

// ─── SPEND_XP ────────────────────────────────────────────────────────────────

export function handleSpendXp(engine: GameEngine,
	state: GameState,
	option: XpSpendOption,
	heroId?: string,
): GameState {
	// Caso especial: gastar XP para recuperar dungeon quando esgotada
	if (option === "recover_dungeon" && gameOf(state).status === "DUNGEON_EXHAUSTED") {
		return handleDungeonExhaustedSpend(engine, state);
	}

	const cost = balanceOf(engine).xpCosts[option];
	if (gameOf(state).groupXp < cost) {
		return log(
			state,
			`XP insuficiente. Custo: ${cost}, disponível: ${gameOf(state).groupXp}.`,
		);
	}

	// Subir de nível é uma decisão do grupo. Não assumir o primeiro herói
	// ativo evita gastar XP no alvo errado quando há mais de um herói elegível.
	if (option === "level_up") {
		if (!heroId) {
			return log(state, "Escolha qual herói receberá o nível de Ímpeto.");
		}
		const hero = heroesOf(state).find((candidate) => candidate.id === heroId);
		if (!hero || hero.status !== "active") {
			return log(
				state,
				"O herói escolhido não está disponível para subir de nível.",
			);
		}
		if (impetoOf(state, hero.id) >= 4) {
			return log(state, `${cardName(engine, hero.cardId)} já está no nível máximo.`);
		}
	}

	let next: GameState = withGame(state, (prevGame) => ({ ...prevGame, groupXp: gameOf(state).groupXp - cost }));

	switch (option) {
		case "recover_dungeon": {
			const { discarded, removed } = deckOf(next, "dungeonDeck");
			const { value: reshuffled, next: rng } = shuffleRng(discarded, gameOf(next).rng);
			next = withDecks(withGame(next, (prevGame) => ({ ...prevGame, rng })), {
					...decksOf(next),
					dungeonDeck: {
						available: reshuffled,
						discarded: [],
						removed,
					},
				});
			return log(next, "5 XP: deck de dungeon reembaralhado.");
		}
		case "level_up": {
			return levelUpHero(engine, next, heroId!);
		}
		case "buy_item": {
			const { available, discarded, removed } = deckOf(next, "itemDeck");
			if (available.length === 0) return log(next, "Nenhum item disponível.");
			const [itemName, ...rest] = available;
			next = withDecks(withGame(next, (prevGame) => ({ ...prevGame, pendingRewards: [
					...gameOf(next).pendingRewards,
					{ type: "item" as const, cardId: itemName as string, requiresBearer: false },
				] })), {
					...decksOf(next),
					itemDeck: { available: rest, discarded, removed },
				});
			return withGame(next, (prevGame) => ({ ...prevGame, status: "REWARD_PHASE" }));
		}
		case "lower_despertar":
			return lowerDespertar(engine, next);
		case "buy_artifact": {
			const { available, discarded, removed } = deckOf(next, "artifactDeck");
			if (available.length === 0)
				return log(next, "Nenhum artefato disponível.");
			const [artName, ...rest] = available;
			return log(
				withDecks(withGame(next, (prevGame) => ({ ...prevGame, groupArtifacts: [
						...gameOf(next).groupArtifacts,
						{
							cardId: artName as string,
							carriedBy: null,
						},
					] })), {
						...decksOf(next),
						artifactDeck: { available: rest, discarded, removed },
					}),
				`Artefato comprado: ${cardName(engine, artName as string)}.`,
			);
		}
	}
}

// ─── Transição de XP_SPEND_PHASE → OPEN_PATHS ────────────────────────────────

export function handleOpenPathsFromXpPhase(engine: GameEngine, state: GameState): GameState {
	return handleCheckBossCondition(engine, state);
}


export const progressionHandler: GameHandler = {
	id: "progression",
	phases: ["XP_SPEND_PHASE"],
	actions: ["GAIN_XP", "SPEND_XP", "OPEN_PATHS"],
	accepts: (state, action) =>
		action.type !== "OPEN_PATHS" || gameOf(state).status === "XP_SPEND_PHASE",
	legalActions(state, _player, engine) {
		const heroIds = partyHeroIds(state);
		const costs = balanceOf(engine).xpCosts;
		const xp = gameOf(state).groupXp;
		const out: Action[] = [];
		if (xp >= costs.buy_artifact) {
			return [{ type: "SPEND_XP", payload: { option: "buy_artifact" } }];
		}
		if (xp >= costs.level_up) {
			for (const heroId of heroIds) {
				out.push({ type: "SPEND_XP", payload: { option: "level_up", heroId } });
			}
		}
		if (xp >= costs.buy_item) {
			out.push({ type: "SPEND_XP", payload: { option: "buy_item" } });
		}
		out.push({ type: "CHECK_BOSS_CONDITION" });
		return out;
	},
	apply(state, action, engine) {
		switch (action.type) {
			case "GAIN_XP":
				return handleGainXp(state, action.payload.amount);
			case "SPEND_XP":
				return handleSpendXp(
					engine,
					state,
					action.payload.option,
					action.payload.heroId,
				);
			case "OPEN_PATHS":
				return handleOpenPathsFromXpPhase(engine, state);
			default:
				return state;
		}
	},
};
