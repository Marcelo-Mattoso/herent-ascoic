import type { Action } from "@/core/actions/types";
import type { HeroView, PlayerView } from "@/core/projection/playerView";
import type { BotObservation } from "./observe";

const lifeRatio = (unit: { currentLife: number; maxLife: number }) =>
	unit.maxLife > 0 ? unit.currentLife / unit.maxLife : 0;

function activeHeroes(view: PlayerView): readonly HeroView[] {
	return view.heroes.filter((hero) => hero.status === "active");
}

function equippedCount(hero: HeroView): number {
	return Object.values(hero.activeItems).filter(Boolean).length;
}

function scoreAttack(view: PlayerView, heroId: string, enemyId: string): number {
	// Foco: derrubar quem morre agora e, depois, quem mais machuca.
	const hero = view.heroes.find((entry) => entry.id === heroId);
	const enemy = view.enemies.find((entry) => entry.id === enemyId);
	if (!hero || !enemy || view.combat?.heroesActed.includes(heroId)) return -1;
	const kills = hero.damage >= enemy.currentLife ? 50 : 0;
	return (
		100 +
		kills +
		enemy.damage * 3 -
		enemy.currentLife +
		hero.damage * 2 +
		hero.hitBonus +
		lifeRatio(hero) * 10
	);
}

/** Heurística de jogador experiente: maior nota primeiro; 0 ou menos só como último recurso. */
export function scoreAction(view: PlayerView, action: Action): number {
	const heroes = activeHeroes(view);
	switch (action.type) {
		case "CHOOSE_TARGET":
			return scoreAttack(view, action.payload.heroId, action.payload.enemyId);
		case "SPEND_XP": {
			const { option, heroId } = action.payload;
			if (option === "buy_artifact") return 90;
			if (option === "level_up") {
				const hero = heroes.find((entry) => entry.id === heroId);
				return 80 - (hero ? lifeRatio(hero) * 5 : 0);
			}
			if (option === "buy_item") return 60;
			if (option === "recover_dungeon") return 100;
			return 10;
		}
		case "CHECK_BOSS_CONDITION":
			return 20;
		case "CHOOSE_ITEM_DESTINATION": {
			if (action.payload.destination === "discard") return 1;
			const hero = heroes.find((entry) => entry.id === action.payload.heroId);
			const fewest = hero ? -equippedCount(hero) : 0;
			return action.payload.destination === "equip" ? 70 + fewest : 40 + fewest;
		}
		case "CHOOSE_ARTIFACT_BEARER": {
			const hero = heroes.find((entry) => entry.id === action.payload.heroId);
			return 70 + (hero ? lifeRatio(hero) * 5 : 0);
		}
		case "GRANT_REWARDS":
			return 30;
		case "APPLY_TRIGGER_INTERRUPT":
			return 50;
		case "SKIP_TRIGGER_INTERRUPT":
			return 40;
		case "RESTART_DUNGEON":
			return action.payload.keepEquipment ? 50 : 40;
		case "DEFEAT":
			return -100;
		case "CHECK_COMBAT_END":
			return 5;
		case "SKILL_CHOICE": {
			const healing = /heal|cura/i.test(action.payload.choice);
			return healing === heroes.some((hero) => lifeRatio(hero) < WOUNDED) ? 20 : 10;
		}
		case "SELECT_SKILL_TARGET": {
			const unit = [...heroes, ...view.enemies].find((entry) => entry.id === action.payload.targetId);
			return unit ? 20 - lifeRatio(unit) * 10 : 10;
		}
		default:
			return 10;
	}
}

const WOUNDED = 0.6;
const CRITICAL = 0.4;

/** Vale gastar recurso limitado: chefe, grupo em perigo ou mais inimigos do que heróis. */
function underPressure(view: PlayerView): boolean {
	const heroes = activeHeroes(view);
	const enemies = view.enemies.filter((enemy) => enemy.status === "active");
	return (
		view.status === "BOSS_COMBAT" ||
		enemies.length > heroes.length ||
		heroes.some((hero) => lifeRatio(hero) < CRITICAL)
	);
}

function abilityMoves(obs: BotObservation): ScoredMove[] {
	const { view } = obs;
	if (view.status !== "HERO_ACTION" && view.status !== "BOSS_COMBAT") return [];
	const heroes = activeHeroes(view);
	const wounded = heroes.filter((hero) => lifeRatio(hero) < WOUNDED);
	const moves: ScoredMove[] = [];
	for (const hero of heroes) {
		for (const ability of obs.abilities[hero.id] ?? []) {
			if (ability.status !== "available") continue;
			const target = ability.heals
				? (wounded.find((entry) => ability.validTargetIds.includes(entry.id))?.id ?? ability.validTargetIds[0])
				: ability.validTargetIds[0];
			if (ability.targetRequired && !target) continue;
			const useful = ability.heals ? wounded.length > 0 : underPressure(view);
			if (!useful) continue;
			if (ability.kind === "power") {
				moves.push({ action: { type: "USE_POWER", payload: { heroId: hero.id } }, score: 200 });
			} else if (ability.kind === "skill") {
				moves.push({
					action: {
						type: "USE_SKILL",
						payload: {
							skillId: ability.abilityId,
							sourceId: hero.id,
							...(target ? { targetIds: [target] } : {}),
						},
					},
					score: 190,
				});
			} else {
				moves.push({
					action: {
						type: "USE_ITEM",
						payload: {
							itemId: ability.sourceCardId,
							heroId: hero.id,
							...(target ? { targetHeroId: target } : {}),
						},
					},
					score: 210,
				});
			}
		}
	}
	return moves;
}

export interface ScoredMove {
	readonly action: Action;
	readonly score: number;
}

/** Determinística: empates resolvem pela ordem oferecida, então a seed reproduz a partida. */
export function scoreMoves(obs: BotObservation): readonly ScoredMove[] {
	return [
		...abilityMoves(obs),
		...obs.actions.map((action) => ({ action, score: scoreAction(obs.view, action) })),
	]
		.map((move, index) => ({ ...move, index }))
		.sort((a, b) => b.score - a.score || a.index - b.index)
		.map(({ action, score }) => ({ action, score }));
}

export function rankMoves(obs: BotObservation): readonly Action[] {
	return scoreMoves(obs).map((move) => move.action);
}

