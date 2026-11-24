import type { Action } from "@/core/actions/types";
import type { HeroView, PlayerView } from "@/core/projection/playerView";
import type { BotObservation } from "./observe";
import type { BotProfile } from "./profiles";
import { forecastAttack, planCombos } from "./combo";
import { healingMoveScore, itemHealingAmount } from "./healing";
import { adversarialScoredMoves } from "./exploration";
import { scoreStrategicPower } from "./powerTactics";
import { knowledgeBonus, publishedKnowledge, type StrategyRule } from "./discovery/knowledge";
import { usesLearnedStrategies } from "./profiles";
import { publishedSoloPolicy, soloPolicyAdjustment, hasSoloWeightsForHero,
  type SoloPolicy, type SoloLearningProfile } from "./discovery/soloPolicy";

/** Contexto de combate observado pela IA, sem leitura de estado interno. */
export interface CombatProgress {
	readonly stagnantRounds: number;
	readonly recentTraits?: readonly string[];
	readonly recentActorIds?: readonly (string | undefined)[];
  /** Contadores locais ou corpus de cobertura fornecidos pelo Explorer. */
  readonly explorationUsage?: ReadonlyMap<string, number>;
}

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

/** Evita sacrificar vida quando o ganho ofensivo não compensa o risco. */
function furyScore(view: PlayerView, sourceId?: string, amount = 2): number {
	const hero = activeHeroes(view).find((candidate) => candidate.id === sourceId) ??
		activeHeroes(view).find((candidate) => candidate.cardId === "hero_crimson_barbarian");
	if (!hero || activeEnemies(view).length === 0) return 10;
	const cost = Math.max(1, amount);
	if (hero.currentLife <= cost) return 0;
	const enemy = activeEnemies(view).find((entry) => entry.currentLife > hero.damage &&
		entry.currentLife <= hero.damage + cost * 3) ?? activeEnemies(view)[0]!;
	const gain = Math.min(cost * 3, Math.max(0, enemy.currentLife - hero.damage));
	const alreadyKills = hero.damage >= enemy.currentLife;
	if (alreadyKills || gain === 0) return 15;
	const enemyHit = Math.max(0, enemy.damage);
	const risk = hero.currentLife - cost <= Math.max(2, enemyHit);
	if (risk || lifeRatio(hero) < 0.5) return 12;
	// Só usa quando o bônus economiza pelo menos um golpe e deixa vida segura.
	const savesAttack = hero.damage + cost * 3 >= enemy.currentLife;
	return savesAttack ? 200 + Math.min(30, gain * 3) : 20;
}

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
	// O estrategista mescla sobrevivência e economia de golpes.
	const danger = enemy.damage * (profile === "power-player" ? 2.5 : 3);
	const offense = hero.damage * (profile === "power-player" ? 4 : 3);
	return 100 + hitChance * 35 + killChance * 45 + danger + offense - enemy.currentLife * 0.5 +
		(profile === "casual" ? lifeRatio(hero) * 10 : -Math.max(0, 0.35 - lifeRatio(hero)) * 30);
}

function bestAttackScore(view: PlayerView, heroId: string, profile: BotProfile): number {
	return Math.max(-1, ...activeEnemies(view).map((enemy) => attackScore(view, heroId, enemy.id, profile)));
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
	const wounded = activeHeroes(view).some((hero) => lifeRatio(hero) < (profile === "power-player" ? 0.5 : 0.65));
	if (/heal|cura/i.test(choice)) return wounded ? 80 : 10;
	if (choice === "tohit") {
		const hero = activeHeroes(view).find((entry) => entry.id === view.combat?.selectedHeroId);
		return hero && hero.hitBonus < 5 ? 70 : 55;
	}
	if (choice === "damage" || /damage|dano/i.test(choice)) return profile === "power-player" ? 80 : 65;
	if (choice === "ally_six" || choice === "enemy_min" || choice === "witch_eclipse_hero_six" || choice === "witch_eclipse_enemy_one") {
		const roll = view.combat?.lastRoll;
		return roll ? 60 + (choice === "ally_six" || choice === "witch_eclipse_hero_six"
			? 6 - Math.min(...roll.heroResults)
			: Math.max(...roll.enemyResults) - 1) : 50;
	}
	return 30;
}

/**
 * Equipar uma recompensa automaticamente exige um espaço realmente livre.
 * Substituições explícitas permanecem possíveis via INV_MOVE para jogadores.
 *
 * Sem este gate, o bot trocava amuletos repetidamente: o item deslocado
 * retornava à mesa e virava a próxima recompensa, gerando no_progress.
 * Considera o slot legado de aliado e seu novo slot compartilhado.
 */
function canAutoEquipReward(
	hero: HeroView | undefined,
	reward: PlayerView["pendingRewards"][number] | undefined,
): boolean {
	if (!hero || !reward || reward.type !== "item") return false;
	const equipped = hero.activeItems;
	if (Object.values(equipped).includes(reward.cardId)) return false;
	const slot = reward.cardType === "ally" ? "ally" : reward.equipmentSlot;
	switch (slot) {
		case "ally":
		case "amulet":
			return !equipped.amulet && !equipped.ally;
		case "clothing":
			return !equipped.clothing1 || !equipped.clothing2;
		case "one_hand":
			return !equipped.hand1 || !equipped.hand2;
		case "two_hands":
			return !equipped.hand1 && !equipped.hand2;
		default:
			return false;
	}
}

/** Pontuação da ação de fluxo; habilidades têm pontuação própria abaixo. */
export function scoreAction(view: PlayerView, action: Action, profile: BotProfile = "power-player"): number {
	const heroes = activeHeroes(view);
	switch (action.type) {
		case "CHOOSE_TARGET":
			return attackScore(view, action.payload.heroId, action.payload.enemyId, profile);
		case "USE_ITEM":
		case "USE_REWARD_ITEM": {
			const hero = heroes.find((entry) => entry.id === action.payload.heroId);
			if (!hero) return -1;
			const heal = itemHealingAmount(action.payload.itemId);
			if (heal !== null) {
				const targetHeroId = action.type === "USE_ITEM" ? action.payload.targetHeroId : undefined;
				return healingMoveScore(view, targetHeroId ?? hero.id, heal);
			}
			return pressure(view) ? 160 : 70;
		}
		case "USE_POWER": {
			const power = view.abilityActionsByHero?.[action.payload.heroId]?.find(entry =>
				entry.kind === "power" && entry.status === "available");
			if (!power) return -1;
      if (profile === "power-player") {
        const owner = heroes.find(hero => hero.id === action.payload.heroId);
        if (!owner) return -1;
        return scoreStrategicPower(view, { ...power, heals: false,
          modifiesDice: false }, owner, bestAttackScore(view, owner.id, profile));
      }
			return view.status === "BOSS_COMBAT" ? 235 : pressure(view) ? 210 : 130;
		}
		case "USE_ARTIFACT": {
			const { targetHeroId } = action.payload;

			const beneficiary = heroes.find((entry) => entry.id === targetHeroId);
			return beneficiary
				? 95 + Math.max(0, beneficiary.maxLife - beneficiary.currentLife) * 12
				: pressure(view) ? 130 : 75;
		}
		case "SELECT_DIE": {
			const { side, index, value } = action.payload;
			const current = (side === "hero" ? view.combat?.lastRoll?.heroResults : view.combat?.lastRoll?.enemyResults)?.[index];
			const target = value ?? view.combat?.pendingDiceSelection?.setToValue;
			return current === undefined ? -1 : 100 + (target === undefined ? 0 : side === "hero" ? target - current : current - target);
		}
		case "SPEND_XP": {
			const { option, heroId } = action.payload;
			// Recuperar cartas da masmorra mantém a campanha possível; nunca gastar
			// o último XP em itens/artefatos quando um herói ainda pode evoluir.
			if (option === "recover_dungeon") return 325;
			const needsLevel = heroes.some((hero) => hero.impeto < 4);
			if (option === "level_up") {
				const hero = heroes.find((entry) => entry.id === heroId);
				if (!hero || hero.impeto >= 4) return -1;
				return 360 + (1 - lifeRatio(hero)) * 10;
			}
			// Reservar XP para nível: não comprar itens nem artefatos enquanto
			// existir herói elegível, mesmo que o gasto esteja legal no momento.
			if (needsLevel) return -10;
			if (option === "buy_artifact") {
				// O acesso ao chefe normalmente vem dos artefatos encontrados.
				// Só complementar o terceiro em fase avançada e com saldo folgado.
				return view.groupArtifacts.length < 3 && view.roomsCleared >= 6 && view.groupXp >= 45 ? 65 : -10;
			}
			if (option === "buy_item") {
				const inventory = heroes.reduce((total, hero) =>
					total + Object.values(hero.activeItems).filter(Boolean).length + hero.backpack.length, 0);
				return inventory < 2 && view.groupXp >= 25 ? 45 : -10;
			}
			return 10;
		}
		case "CHECK_BOSS_CONDITION": return profile === "power-player" ? 125 : 20;
		case "CHOOSE_ITEM_DESTINATION": {
			if (action.payload.destination === "discard") return 1;
			const hero = heroes.find((entry) => entry.id === action.payload.heroId);
			const reward = view.pendingRewards[0];
			if (!hero || !reward || reward.type !== "item") return -10;
			if (action.payload.destination === "equip" && !canAutoEquipReward(hero, reward))
				return -10;
			if (reward.cardType === "ally")
				return action.payload.destination === "equip" ? 130 : -10;
			const equipped = Object.values(hero.activeItems).filter(Boolean).length;
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
			if (interrupt.skillId === "skill_crimson_fury") {
				const amount = typeof interrupt.value === "number" ? interrupt.value : 2;
				return furyScore(view, interrupt.sourceHeroId, amount);
			}
			if (interrupt.skillId === "witch_skill_lunar_spark" &&
				!view.combat?.lastRoll?.heroResults.includes(1)) return 20;
			if (interrupt.skillId === "witch_power_green_eclipse")
				return view.status === "BOSS_COMBAT" || pressure(view) ? 210 : profile === "explorer" ? 155 : 90;
			if (interrupt.skillId === "witch_skill_white_ash_balm") {
				const wounds = activeHeroes(view).map((hero) => hero.maxLife - hero.currentLife);
				return Math.max(0, ...wounds) >= 3 ? 185 : 30;
			}
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
	if (!ability.targetRequired && ability.activation !== "manual_prepare") return [];
	const candidates = ability.validTargetIds;
	// O Casual mistura variação aleatória na ordenação final.
	if (ability.heals) return candidates.filter((id) => activeHeroes(view).some((hero) => hero.id === id && hero.currentLife < hero.maxLife));
	if (ability.abilityId === "skill_rift_rune") return candidates.filter((id) =>
		hasAction(view, id) && (id !== owner.id || !view.combat?.buffsByHero[id]?.some((buff) =>
			buff.source.startsWith("skill_rift_rune:"))));
	return [...candidates];
}

function abilityScore(view: PlayerView, ability: BotObservation["abilities"][string][number],
	targetId: string | undefined, owner: HeroView, profile: BotProfile, progress: CombatProgress): number {
	const abilityId = ability.abilityId;
	const isPower = ability.kind === "power";
	const isPrepare = ability.activation === "prepare";
	// Um poder gasto agora não estará disponível no chefe. Comparar ganho real,
  // ação sacrificada e a janela do combate antes do filtro genérico de cura.
  if (isPower && profile === "power-player")
    return scoreStrategicPower(view, ability, owner,
      bestAttackScore(view, owner.id, profile), progress.stagnantRounds);
	if (ability.heals && !activeHeroes(view).some(hero => hero.currentLife < hero.maxLife)) return -1;
	// Todos usam apenas ações apresentadas pela projeção.
	const target = activeHeroes(view).find((hero) => hero.id === targetId);
	const missing = target ? target.maxLife - target.currentLife : 0;
	if (abilityId === "skill_last_light_healing" || abilityId === "witch_skill_white_ash_balm") {
		if (!target || missing <= 0) return -1;
		const healed = Math.min(abilityId === "skill_last_light_healing" ? 3 : 2, missing);
		const strike = Math.max(0, ...activeEnemies(view).map((enemy) => enemy.damage));
		const inCombat = activeEnemies(view).length > 0;
		const lifesaving = inCombat && target.currentLife <= strike && target.currentLife + healed > strike;
		const ownerAttack = bestAttackScore(view, owner.id, profile);
		// Curar sempre que há ferimento gera loop solo: o inimigo continua ileso.
		// Fora de combate, ou para salvar alguém de um ataque letal, o valor sobe.
		if (!inCombat) return 140 + healed * 16;
		if (progress.stagnantRounds >= 3 && ownerAttack >= 0) return 35 + healed;
		if (lifesaving) return 260 + healed * 9;
		const ally = target.id !== owner.id;
		return (ally ? 110 : 75) + healed * 8 + (target.currentLife / target.maxLife < 0.3 ? 20 : 0);
	}
	if (abilityId === "skill_rift_rune") {
		if (!target) return -1;
		const enemies = activeEnemies(view);
		if (!enemies.length) return 70;
		const enemy = enemies.find((candidate) => candidate.status === "active")!;
		const base = forecastAttack(target, enemy);
		const buffed = forecastAttack(target, enemy, 3);
		const futureAttacks = Math.min(4, Math.ceil(enemy.currentLife / Math.max(1, target.damage)));
		const extraDamage = (buffed.expectedDamage - base.expectedDamage) * futureAttacks;
		const solo = activeHeroes(view).length === 1;
		// Sozinho, o Mago deixa de atacar para lançar a runa: o bônus precisa
		// compensar o ataque perdido e o dano sofrido durante a preparação.
		const opportunityCost = solo ? base.expectedDamage + enemy.damage * 0.5 : 0;
		const netGain = extraDamage - opportunityCost;
		if (solo && (target.currentLife <= enemy.damage || netGain <= 0 || progress.stagnantRounds >= 3)) return -1;
		if (target.id !== owner.id && !hasAction(view, target.id)) return 75;
		return 95 + netGain * 15 + (solo ? 0 : target.damage * 3);
	}
	if (abilityId === "skill_prey_mark") return profile === "power-player" ? 180 : 125;
	if (abilityId === "skill_crimson_fury") return furyScore(view);
	if (abilityId === "spend_deep_veil_echo") return profile === "power-player" ? 165 : 125;
	if (abilityId === "skill_return_rite") {
		const owner = activeHeroes(view).find((hero) => hero.cardId === "hero_deep_veil_necromancer");
		// Recuperar cartas por 3 PV é troca ruim com o deck cheio ou perto da morte.
		if (!owner || owner.currentLife <= 5) return -1;
		// PlayerView expõe a quantidade de cartas disponíveis, não um array.
		const remaining = view.decks.dungeonDeck.available;
		const discarded = view.decks.dungeonDeck.discarded.length;
		return remaining <= 2 && discarded > 0 && lifeRatio(owner) >= 0.6 ? 180 : -1;
	}
	if (abilityId === "skill_bastion_guard") return pressure(view) ? 155 : 50;
	if (ability.heals && progress.stagnantRounds >= 3 && bestAttackScore(view, owner.id, profile) >= 0) return 35;
	if (abilityId === "power_supreme_rift_rune") return view.status === "BOSS_COMBAT" ? 240 : pressure(view) ? 205 : 110;
	if (profile === "explorer") return isPower ? 185 : 165;
	// Habilidades com disparo voluntário devem ser preparadas antes do evento;
	// poderes têm valor real, inclusive para o perfil veloz.
	if (profile === "power-player") return isPower
		? view.status === "BOSS_COMBAT" ? 240 : pressure(view) ? 225 : view.roomsCleared >= 5 ? 195 : 130
		: isPrepare ? 165 : pressure(view) ? 175 : 115;
	if (profile === "casual") return isPower ? 175 : isPrepare ? 155 : pressure(view) ? 150 : 100;
	return isPower ? 190 : isPrepare ? 165 : pressure(view) ? 175 : 110;
}

/** Estratégia solo genérica: somente filtros de legalidade, valor e risco. */
function soloAbilityScore(view: PlayerView,
  ability: BotObservation["abilities"][string][number],
  owner: HeroView, targetId: string | undefined,
): number {
  const target = view.heroes.find(h => h.id === targetId) ?? owner;
  if (ability.kind === "power")
    return scoreStrategicPower(view, ability, owner, bestAttackScore(view, owner.id, "power-player"));
  if (ability.heals) {
    const missing = target.maxLife - target.currentLife;
    if (missing <= 0) return -1;
    return healingMoveScore(view, target.id, missing);
  }
  const inCombat = view.enemies.some(e => e.status === "active");
  return inCombat ? 112 : 84;
}

function abilityMoves(obs: BotObservation, profile: BotProfile,
  progress: CombatProgress, adaptiveSolo = false): ScoredMove[] {
	const { view } = obs;
	if (view.status !== "HERO_ACTION" && view.status !== "BOSS_COMBAT") return [];
	const moves: ScoredMove[] = [];
	for (const hero of activeHeroes(view)) {
		for (const ability of obs.abilities[hero.id] ?? []) {
			// Post-roll dice reactions are prompted by the engine when a die is eligible.
			// Do not waste bot decisions toggling their old preparation control.
			if (ability.modifiesDice && ability.activation === "prepare") continue;
			// Habilidades manuais de suporte agora seguem duas ações: preparar e confirmar
			// o alvo. O motor do jogo decide quando cobrar a ação do herói.
			const manualPreparation = ability.activation === "manual_prepare";
			const committingPreparation = manualPreparation && ability.status === "prepared";
			if ((ability.status !== "available" && !committingPreparation) ||
				(ability.activation !== "manual" && ability.activation !== "prepare" && !manualPreparation)) continue;
			const targets = abilityTargets(view, ability, hero, profile);
			if (ability.kind !== "power" && ability.targetRequired && targets.length === 0) continue;
			const candidates = ability.kind !== "power" && (ability.targetRequired || (manualPreparation && targets.length > 0))
				? targets : [undefined];
			for (const target of candidates) {
        const score = adaptiveSolo
          ? soloAbilityScore(view, ability, hero, target)
          : abilityScore(view, ability, target, hero, profile, progress);
        if (score < 0) continue;
				// Fúria Rubra custa vida ao disparar. Uma prioridade fixa de preparo
				// ignorava furyScore e forçava auto-sacrifícios mesmo sem benefício.
				if (!adaptiveSolo && ability.abilityId === "skill_crimson_fury" && score < 180) continue;
				if (ability.kind === "item") {
					const targetHero = target && activeHeroes(view).some((entry) => entry.id === target);
					const itemAction: Action = { type: "USE_ITEM", payload: {
						itemId: ability.sourceCardId, heroId: hero.id,
						...(target ? targetHero ? { targetHeroId: target } : { targetEnemyId: target } : {}),
					} };
					const heal = itemHealingAmount(ability.sourceCardId);
          moves.push({ action: itemAction, score: adaptiveSolo
            ? score : heal !== null
              ? progress.stagnantRounds >= 3 && bestAttackScore(view, hero.id, profile) >= 0
                ? 35 : healingMoveScore(view, target ?? hero.id, heal)
              : Math.min(score, pressure(view) ? 155 : 95) });
				} else if (ability.kind === "power") {
					// Poder de herói usa USE_POWER; USE_SKILL não reproduz corretamente
					// o ciclo de ativação e consumo. Modal/alvo são resolvidos pelo motor.
					moves.push({ action: { type: "USE_POWER", payload: { heroId: hero.id } }, score });
				} else {
					// A primeira ação apenas arma a habilidade; o alvo é enviado na
					// segunda, quando a projeção já informa status "prepared".
					const committedTarget = manualPreparation && !committingPreparation ? undefined : target;
					moves.push({ action: { type: "USE_SKILL", payload: {
						skillId: ability.abilityId, sourceId: hero.id,
						...(committedTarget ? { targetIds: [committedTarget] } : {}),
					} }, score: adaptiveSolo ? score :
            ability.abilityId === "skill_crimson_fury" ? score :
						// Preparar e confirmar têm o MESMO valor estratégico da ação final.
						// Sem piso artificial: cura/buff competem com um ataque real.
						manualPreparation ? score :
						ability.activation === "prepare" ? Math.max(score, 155) : score });
				}
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
	decision = 0, progress: CombatProgress = { stagnantRounds: 0 },
	knowledge: readonly StrategyRule[] = publishedKnowledge.rules,
	legacyCombos = true,
  soloPolicy: SoloPolicy | null | undefined = publishedSoloPolicy,
  adaptiveSoloTraining = false): readonly ScoredMove[] {
  const learnable = usesLearnedStrategies(profile);
  const heroCardId = obs.view.heroes[0]?.cardId;
  const adaptiveSolo = learnable && obs.view.heroes.length === 1 &&
    (adaptiveSoloTraining ||
      Boolean(heroCardId && hasSoloWeightsForHero(soloPolicy, profile as SoloLearningProfile, heroCardId)));
	const planned = legacyCombos && !adaptiveSolo && profile === "power-player" ? planCombos(obs)[0] : undefined;
	const candidates: ScoredMove[] = [
		...(planned ? [{ action: planned.steps[0]!, score: planned.score, plan: planned.description }] : []),
		...abilityMoves(obs, profile, progress, adaptiveSolo),
		...obs.actions
			.filter((action) => action.type !== "SPEND_XP" ||
				action.payload.option !== "level_up" ||
				obs.view.heroes.some((hero) => hero.id === action.payload.heroId &&
					hero.status === "active" && hero.impeto < 4))
			.map((action) => {
				const score = scoreAction(obs.view, action, profile);
				const healingItem = (action.type === "USE_ITEM" || action.type === "USE_REWARD_ITEM") &&
					itemHealingAmount(action.payload.itemId) !== null;
				const ownerCanAttack = healingItem &&
					bestAttackScore(obs.view, action.payload.heroId, profile) >= 0;
				return { action, score: progress.stagnantRounds >= 3 && ownerCanAttack ? Math.min(score, 35) : score };
			}),
	];
	// A projeção já calcula a prioridade estratégica da habilidade. Se a ação
	// também vier de legalActions, a pontuação genérica não deve sobrescrevê-la.
	const seenActions = new Set<string>();
	const unique = candidates.filter(move => {
		const key = JSON.stringify(move.action);
		if (seenActions.has(key)) return false;
		seenActions.add(key);
		return true;
	});
	const random = seededRandom(seed, decision);
	// Casual funde heurísticas simples com uma decisão aleatória ocasional,
	// reproduzível por seed (não é um perfil Random separado).
	const casualCandidates = unique.filter(move => move.score >= 0 && move.action.type !== "DEFEAT");
	const casualRandom = profile === "casual" && casualCandidates.length > 1 && random() < 0.15;
	const ranked = unique.map((move, index) => ({
			...move,
			score: casualRandom && move.score >= 0 && move.action.type !== "DEFEAT" ? random() :
        move.score + (learnable
          ? soloPolicyAdjustment(obs.view, move.action, soloPolicy, profile as SoloLearningProfile) : 0) +
          (learnable ? knowledgeBonus(move.action, obs.view, progress.recentTraits ?? [],
            knowledge, progress.recentActorIds ?? []) : 0) +
				(profile === "casual" ? variation(move.action, obs.view, seed, decision) * 0.7 :
				profile === "explorer" ? variation(move.action, obs.view, seed, decision) * 0.15 : 0),
			index,
		}))
		.sort((a, b) => b.score - a.score || a.index - b.index)
		.map(({ action, score, plan }) => ({ action, score, ...(plan ? { plan } : {}) }));
  if (profile !== "explorer") return ranked;
  const exploratory = adversarialScoredMoves(ranked, progress.explorationUsage ?? new Map(), random);
  // Após rodadas sem dano, o Explorer deve atacar para progredir e explorar
  // estados novos, não repetir cura/preparação indefinidamente.
  return progress.stagnantRounds >= 3 && obs.view.enemies.some(e => e.status === "active")
    ? [...exploratory].sort((a, b) =>
        Number(b.action.type === "CHOOSE_TARGET") - Number(a.action.type === "CHOOSE_TARGET"))
    : exploratory;
}

export function rankMoves(obs: BotObservation, profile: BotProfile = "power-player", seed = 1,
	decision = 0): readonly Action[] {
	return scoreMoves(obs, profile, seed, decision).map((move) => move.action);
}
