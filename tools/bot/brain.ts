import type { Action } from "@/core/actions/types";
import type { HeroView, PlayerView } from "@/core/projection/playerView";
import type { BotObservation } from "./observe";
import type { BotProfile } from "./profiles";
import { forecastAttack, planCombos } from "./combo";
import { artifactHasPoisonedTarget } from "@/core/rules/artifactActivation";

export interface ScoredMove {
	readonly action: Action;
	readonly score: number;
	readonly plan?: string;
}

const lifeRatio = (unit: { currentLife: number; maxLife: number }) =>
	unit.maxLife > 0 ? unit.currentLife / unit.maxLife : 0;
const activeHeroes = (view: PlayerView) => view.heroes.filter((hero) => hero.status === "active");
const activeEnemies = (view: PlayerView) => view.enemies.filter((enemy) => enemy.status === "active");
const hasAction = (view: PlayerView, heroId: string) => !view.combat?.heroesActed.includes(heroId);

function pressure(view: PlayerView): boolean {
	return view.status === "BOSS_COMBAT" ||
		activeEnemies(view).length > activeHeroes(view).length ||
		activeHeroes(view).some((hero) => lifeRatio(hero) < 0.4);
}

function attackScore(view: PlayerView, heroId: string, enemyId: string, profile: BotProfile): number {
	const hero = view.heroes.find((entry) => entry.id === heroId);
	const enemy = view.enemies.find((entry) => entry.id === enemyId);
	if (!hero || !enemy || !hasAction(view, heroId)) return -1;
	const expectedMargin = hero.hitBonus + hero.dice * 3.5 - enemy.hitBonus - enemy.dice * 3.5;
	const hitChance = Math.max(0.1, Math.min(0.9, 0.5 + expectedMargin * 0.07));
	const killChance = hero.damage >= enemy.currentLife ? hitChance : 0;
	const danger = enemy.damage * (profile === "speedrunner" ? 1 : 3);
	const offense = hero.damage * (profile === "speedrunner" ? 5 : 3);
	return 100 + hitChance * 35 + killChance * 45 + danger + offense - enemy.currentLife * 0.5 +
		(profile === "casual" ? lifeRatio(hero) * 10 : -Math.max(0, 0.35 - lifeRatio(hero)) * 30);
}

function choiceScore(view: PlayerView, choice: string, profile: BotProfile): number {
	if (view.pendingSkillChoice?.skillId === "spend_deep_veil_echo" &&
		(choice === "tohit" || choice === "damage")) {
		const hero = activeHeroes(view).find((entry) => entry.id === view.pendingSkillChoice?.sourceHeroId);
		if (hero) {
			const best = Math.max(0, ...activeEnemies(view).map((enemy) => {
				const result = forecastAttack(hero, enemy, choice === "tohit" ? 2 : 0,
					choice === "damage" ? 2 : 0);
				return result.expectedDamage + result.killChance * (enemy.damage + 3);
			}));
			return 70 + best * 10;
		}
	}
	const wounded = activeHeroes(view).some((hero) => lifeRatio(hero) < (profile === "speedrunner" ? 0.3 : 0.65));
	if (/heal|cura/i.test(choice)) return wounded ? 80 : 10;
	if (choice === "tohit") {
		const hero = activeHeroes(view).find((entry) => entry.id === view.combat?.selectedHeroId);
		return hero && hero.hitBonus < 5 ? 70 : 55;
	}
	if (choice === "damage" || /damage|dano/i.test(choice)) return profile === "speedrunner" ? 85 : 65;
	if (choice === "ally_six" || choice === "enemy_min") {
		const roll = view.combat?.lastRoll;
		return roll ? 60 + (choice === "ally_six"
			? 6 - Math.min(...roll.heroResults)
			: Math.max(...roll.enemyResults) - 1) : 50;
	}
	return 30;
}

/** Pontuação da ação de fluxo; habilidades têm pontuação própria abaixo. */
export function scoreAction(view: PlayerView, action: Action, profile: BotProfile = "power-player"): number {
	const heroes = activeHeroes(view);
	switch (action.type) {
		case "CHOOSE_TARGET":
			return attackScore(view, action.payload.heroId, action.payload.enemyId, profile);
		case "USE_ARTIFACT": {
			const { abilityId, targetEnemyId, targetHeroId } = action.payload;
			if (abilityId === "witch_artifact_corrupted_heart_burst") {
				const enemy = activeEnemies(view).find((entry) => entry.id === targetEnemyId);
				if (!enemy || !artifactHasPoisonedTarget(enemy.conditions)) return -1;
				const stacks = enemy.conditions.filter((condition) =>
					artifactHasPoisonedTarget([condition])).length;
				const damage = 2 * stacks;
				return 105 + 20 * stacks + (damage >= enemy.currentLife ? 65 : 0) +
					(enemy.id === "boss" ? 25 : 0);
			}
			const beneficiary = heroes.find((entry) => entry.id === targetHeroId);
			return beneficiary
				? 95 + Math.max(0, beneficiary.maxLife - beneficiary.currentLife) * 12
				: pressure(view) ? 130 : 75;
		}
		case "SELECT_DIE": {
			const { side, index, value } = action.payload;
			const current = (side === "hero" ? view.combat?.lastRoll?.heroResults : view.combat?.lastRoll?.enemyResults)?.[index];
			return current === undefined ? -1 : 100 + (value === undefined ? 0 : side === "hero" ? value - current : current - value);
		}
		case "SPEND_XP": {
			const { option, heroId } = action.payload;
			if (option === "recover_dungeon") return 120;
			if (option === "level_up") {
				const hero = heroes.find((entry) => entry.id === heroId);
				return (profile === "speedrunner" ? 235 : 155) + (hero ? (1 - lifeRatio(hero)) * 10 : 0);
			}
			if (option === "buy_artifact") return profile === "speedrunner" ? 75 : 100;
			if (option === "buy_item") return profile === "speedrunner" ? 60 : 85;
			return 10;
		}
		case "CHECK_BOSS_CONDITION": return profile === "speedrunner" ? 125 : 20;
		case "CHOOSE_ITEM_DESTINATION": {
			if (action.payload.destination === "discard") return 1;
			const hero = heroes.find((entry) => entry.id === action.payload.heroId);
			const equipped = hero ? Object.values(hero.activeItems).filter(Boolean).length : 0;
			return action.payload.destination === "equip" ? 90 - equipped * 5 : 45 - equipped * 5;
		}
		case "CHOOSE_ARTIFACT_BEARER": {
			const hero = heroes.find((entry) => entry.id === action.payload.heroId);
			return 70 + (hero ? lifeRatio(hero) * 5 : 0);
		}
		case "SKILL_CHOICE": return choiceScore(view, action.payload.choice, profile);
		case "SELECT_SKILL_TARGET": {
			const target = [...heroes, ...activeEnemies(view)].find((entry) => entry.id === action.payload.targetId);
			if (!target) return -1;
			if (view.pendingSkillTarget?.skillId === "skill_prey_mark") {
				const hunter = heroes.find((hero) => hero.id === view.pendingSkillTarget?.sourceId);
				if (hunter && view.enemies.some((enemy) => enemy.id === target.id)) {
					const enemy = view.enemies.find((entry) => entry.id === target.id)!;
					const result = forecastAttack(hunter, enemy, 1);
					return 30 + result.expectedDamage * 10 + result.killChance * (enemy.damage + 3) * 10;
				}
			}
			if (view.pendingSkillTarget?.skillId === "skill_rift_rune" &&
				view.heroes.some((hero) => hero.id === target.id)) {
				const hero = view.heroes.find((entry) => entry.id === target.id)!;
				return 30 + Math.max(0, ...activeEnemies(view).map((enemy) => {
					const base = forecastAttack(hero, enemy);
					const buffed = forecastAttack(hero, enemy, 3);
					return (buffed.expectedDamage - base.expectedDamage) * 15 +
						(buffed.killChance - base.killChance) * (enemy.damage + 3) * 10;
				}));
			}
			if (view.pendingSkillTarget?.skillId === "skill_last_light_healing")
				return 20 + Math.min(3, target.maxLife - target.currentLife) * 10 +
					(target.currentLife <= Math.max(0, ...activeEnemies(view).map((enemy) => enemy.damage)) ? 30 : 0);
			return 25 - lifeRatio(target) * 10;
		}
		case "APPLY_TRIGGER_INTERRUPT": {
			const interrupt = view.pendingTriggerInterrupt;
			if (!interrupt) return 50;
			// Opcional de rerrolagem: conserve a carga quando não há 1 para rerrolar.
			if (interrupt.skillId === "witch_skill_lunar_spark" &&
				!view.combat?.lastRoll?.heroResults.includes(1)) return 20;
			if (interrupt.skillId === "witch_power_green_eclipse")
				return view.status === "BOSS_COMBAT" || pressure(view) ? 210 : profile === "explorer" ? 155 : 90;
			return 165;
		}
		case "SKIP_TRIGGER_INTERRUPT": return 40;
		case "RESTART_DUNGEON": return action.payload.keepEquipment ? 50 : 40;
		case "CHECK_COMBAT_END": return 5;
		case "DEFEAT": return -100;
		default: return 10;
	}
}

function abilityTargets(view: PlayerView, ability: BotObservation["abilities"][string][number], owner: HeroView, profile: BotProfile): string[] {
	if (!ability.targetRequired) return [];
	const candidates = ability.validTargetIds;
	if (profile === "random") return [...candidates];
	if (ability.heals) return candidates.filter((id) => activeHeroes(view).some((hero) => hero.id === id && hero.currentLife < hero.maxLife));
	if (ability.abilityId === "skill_rift_rune") return candidates.filter((id) =>
		hasAction(view, id) && (id !== owner.id || !view.combat?.buffsByHero[id]?.some((buff) =>
			buff.source.startsWith("skill_rift_rune:"))));
	return [...candidates];
}

function abilityScore(view: PlayerView, ability: BotObservation["abilities"][string][number], targetId: string | undefined, profile: BotProfile): number {
	const abilityId = ability.abilityId;
	const isPower = ability.kind === "power";
	const isPrepare = ability.activation === "prepare";
	// Não sacrificar uma ativação limitada para curar um herói saudável.
	if (ability.heals && !activeHeroes(view).some((hero) => hero.currentLife < hero.maxLife)) return -1;
	if (profile === "random") return 0;
	const target = activeHeroes(view).find((hero) => hero.id === targetId);
	const missing = target ? target.maxLife - target.currentLife : 0;
	if (abilityId === "skill_last_light_healing") {
		if (!target || missing <= 0) return -1;
		const strike = Math.max(0, ...activeEnemies(view).map((enemy) => enemy.damage));
		const lifesaving = target.currentLife <= strike &&
			target.currentLife + Math.min(3, missing) > strike;
		return 105 + missing * (profile === "speedrunner" ? 2 : 10) +
			(lifesaving ? 80 : 0);
	}
	if (abilityId === "skill_rift_rune") {
		if (!target) return -1;
		if (target.cardId === "hero_crimson_rune_mage" && activeHeroes(view).length === 1) {
			const enemy = activeEnemies(view)[0];
			if (!enemy || target.currentLife <= enemy.damage) return -1;
			const base = forecastAttack(target, enemy);
			const buffed = forecastAttack(target, enemy, 3);
			const futureAttacks = Math.min(3, Math.ceil(enemy.currentLife / Math.max(1, target.damage)));
			const gain = (buffed.expectedDamage - base.expectedDamage) * futureAttacks -
				base.expectedDamage - enemy.damage * 0.25;
			return 180 + gain * 10;
		}
		return 140 + target.damage * 4 + target.hitBonus;
	}
	if (abilityId === "skill_prey_mark") return profile === "power-player" ? 180 : 125;
	if (abilityId === "skill_crimson_fury") return profile === "power-player" ? 175 : 125;
	if (abilityId === "spend_deep_veil_echo") return profile === "power-player" ? 165 : 125;
	if (abilityId === "skill_return_rite") return profile === "power-player" ? 145 : 85;
	if (abilityId === "skill_bastion_guard") return pressure(view) ? 155 : 50;
	if (abilityId === "power_supreme_rift_rune") return pressure(view) ? 160 : 95;
	if (profile === "explorer") return isPower ? 210 : 185;
	// Habilidades com disparo voluntário devem ser preparadas antes do evento;
	// poderes têm valor real, inclusive para o perfil veloz.
	if (profile === "speedrunner") return isPower ? 185 : isPrepare ? 160 : pressure(view) ? 155 : 105;
	if (profile === "casual") return isPower ? 175 : isPrepare ? 155 : pressure(view) ? 150 : 100;
	return isPower ? 190 : isPrepare ? 165 : pressure(view) ? 175 : 110;
}

function abilityMoves(obs: BotObservation, profile: BotProfile): ScoredMove[] {
	const { view } = obs;
	if (view.status !== "HERO_ACTION" && view.status !== "BOSS_COMBAT") return [];
	const moves: ScoredMove[] = [];
	for (const hero of activeHeroes(view)) {
		for (const ability of obs.abilities[hero.id] ?? []) {
			// Gatilhos voluntários são resolvidos por APPLY_TRIGGER_INTERRUPT na janela
			// correta do motor; USE_SKILL só vale para habilidades manuais.
			if (ability.status !== "available" || ability.kind === "item" || ability.activation !== "manual") continue;
			const targets = abilityTargets(view, ability, hero, profile);
			if (ability.targetRequired && targets.length === 0) continue;
			for (const target of ability.targetRequired ? targets : [undefined]) {
				const score = abilityScore(view, ability, target, profile);
				if (score < 0) continue;
				moves.push({ action: { type: "USE_SKILL", payload: {
					skillId: ability.abilityId, sourceId: hero.id,
					...(target ? { targetIds: [target] } : {}),
				} }, score });
			}
		}
	}
	return moves;
}

function variation(action: Action, view: PlayerView, seed: number, decision: number): number {
	const input = `${seed}:${decision}:${view.roomsCleared}:${view.combat?.round ?? 0}:${view.combat?.heroesActed.length ?? 0}:${JSON.stringify(action)}`;
	let hash = 2166136261;
	for (const char of input) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
	return ((hash >>> 0) % 101) - 50;
}

function seededRandom(seed: number, decision: number): () => number {
	let state = (seed ^ Math.imul(decision + 1, 0x9e3779b9)) >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let mixed = Math.imul(state ^ (state >>> 15), state | 1);
		mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
		return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
	};
}

/** Ordem determinística para permitir comparação de perfis na mesma seed. */
export function scoreMoves(obs: BotObservation, profile: BotProfile = "power-player", seed = 1,
	decision = 0): readonly ScoredMove[] {
	const planned = profile === "power-player" ? planCombos(obs)[0] : undefined;
	const candidates: ScoredMove[] = [
		...(planned ? [{ action: planned.steps[0]!, score: planned.score, plan: planned.description }] : []),
		...abilityMoves(obs, profile),
		...obs.actions.map((action) => ({ action, score: scoreAction(obs.view, action, profile) })),
	];
	const unique = [...new Map(candidates.reverse().map((move) => [JSON.stringify(move.action), move])).values()].reverse();
	const random = seededRandom(seed, decision);
	return (profile === "random" ? unique.sort((a, b) =>
		JSON.stringify(a.action).localeCompare(JSON.stringify(b.action))) : unique)
		.map((move, index) => ({
			...move,
			score: profile === "random" ? random() :
				move.score + (profile === "casual" ? variation(move.action, obs.view, seed, decision) * 0.7 :
				profile === "explorer" ? variation(move.action, obs.view, seed, decision) * 0.15 : 0),
			index,
		}))
		.sort((a, b) => b.score - a.score || a.index - b.index)
		.map(({ action, score, plan }) => ({ action, score, ...(plan ? { plan } : {}) }));
}

export function rankMoves(obs: BotObservation, profile: BotProfile = "power-player", seed = 1,
	decision = 0): readonly Action[] {
	return scoreMoves(obs, profile, seed, decision).map((move) => move.action);
}
