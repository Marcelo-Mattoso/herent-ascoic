import { XP_COSTS, type XpSpendOption } from "@/core/config/defaults";
import { playerView } from "@/core/projection/playerView";
import { isSkillGuardConsumed } from "@/core/skills/dispatch";
import { cardSkills } from "@/core/skills/lookup";
import { isManuallyActivatable } from "@/core/skills/useSkill";
import type { EnemyState } from "@/core/state/enemyState";
import type { GameState } from "@/core/state/gameState";
import type { HeroState } from "@/core/state/heroState";

// Herói que está atualmente em ação (ou o primeiro ativo)
export function selectActiveHero(state: GameState): HeroState | null {
	const view = playerView(state);
	if (!view.combat)
		return view.heroes.find((h) => h.status === "active") ?? null;
	const heroesActed = view.combat.heroesActed;
	const nextHero = view.heroes.find(
		(h) => h.status === "active" && !heroesActed.includes(h.id),
	);
	return nextHero ?? view.heroes.find((h) => h.status === "active") ?? null;
}

export type AvailableAction =
	| "attack"
	| "use_item"
	| "use_power"
	| "grant_rewards"
	| "open_paths"
	| "choose_path"
	| "reveal_room"
	| "reveal_boss"
	| "spend_xp"
	| "start_combat"
	| "roll_dice"
	| "resolve_attack";

// Quais ações o jogador pode tomar no status atual
export function selectAvailableActions(state: GameState): AvailableAction[] {
	const view = playerView(state);
	const { status } = view;
	switch (status) {
		case "HERO_ACTION":
		case "BOSS_COMBAT": {
			const hero = selectActiveHero(state);
			const actions: AvailableAction[] = ["attack"];
			if (hero) {
				const hasConsumable =
					hero.backpack.length > 0 ||
					Object.values(hero.activeItems).some(Boolean);
				if (hasConsumable) actions.push("use_item");
				if (!view.combat?.powersUsedThisRoom[hero.id])
					actions.push("use_power");
			}
			return actions;
		}
		case "COMBAT_START":
			return ["start_combat"];
		case "ROLL_DICE":
			return ["roll_dice"];
		case "RESOLVE_ATTACK":
			return ["resolve_attack"];
		case "REWARD_PHASE":
			return ["grant_rewards"];
		case "XP_SPEND_PHASE":
			return ["open_paths", "spend_xp"];
		case "OPEN_PATHS":
		case "CHOOSE_PATH":
			return ["choose_path"];
		case "REVEAL_ROOM":
			return ["reveal_room"];
		case "BOSS_REVEAL":
			return ["reveal_boss"];
		case "DUNGEON_EXHAUSTED":
			return ["spend_xp"];
		default:
			return [];
	}
}

export interface XpSpendChoice {
	option: XpSpendOption;
	cost: number;
	available: boolean;
	label: string;
	reason?: string; // Motivo quando desabilitado por condição além do XP
}

const XP_LABELS: Record<XpSpendOption, string> = {
	recover_dungeon: "Recuperar masmorra (embaralha descartes)",
	level_up: "Subir nível do herói",
	buy_item: "Comprar item",
	lower_despertar: "Reduzir Despertar",
	buy_artifact: "Comprar artefato",
};

// Quais opções de gasto de XP estão disponíveis e com custo suficiente
export function selectXpSpendOptions(state: GameState): XpSpendChoice[] {
	const view = playerView(state);
	const xp = view.groupXp;
	return (Object.keys(XP_COSTS) as XpSpendOption[]).map((option) => {
		const cost = XP_COSTS[option];
		const canAfford = xp >= cost;
		let available = canAfford;
		let reason: string | undefined;

		// Só oferece recover_dungeon se o deck de dungeon tiver descartes
		if (option === "recover_dungeon") {
			const hasDiscards = view.decks.dungeonDeck.discarded.length > 0;
			if (!hasDiscards) {
				available = false;
				reason = "Descarte da masmorra está vazio";
			} else {
				available = canAfford;
			}
		}
		// Só oferece level_up se ALGUM herói ativo não está no nível máximo (impeto 4)
		if (option === "level_up") {
			const heroToLevel = view.heroes.find(
				(h) => h.status === "active" && h.impeto < 4,
			);
			if (!heroToLevel) {
				available = false;
				reason = "Todos os heróis já estão no nível máximo";
			} else {
				available = canAfford;
			}
		}
		// Só oferece lower_despertar se despertar > 0
		if (option === "lower_despertar") {
			if (view.despertar === 0) {
				available = false;
				reason = "Despertar já está no mínimo";
			} else {
				available = canAfford;
			}
		}
		// Só oferece buy_artifact se há artefatos disponíveis
		if (option === "buy_artifact") {
			if (view.decks.artifactDeck.available.length === 0) {
				available = false;
				reason = "Deck de artefatos vazio";
			} else {
				available = canAfford;
			}
		}
		// Só oferece buy_item se há itens disponíveis
		if (option === "buy_item") {
			if (view.decks.itemDeck.available.length === 0) {
				available = false;
				reason = "Deck de itens vazio";
			} else {
				available = canAfford;
			}
		}

		// Razão genérica por XP insuficiente (sobrepõe razão de condição se XP também falta)
		if (!canAfford && !reason) {
			reason = `XP insuficiente (faltam ${cost - xp})`;
		}

		return { option, cost, available, label: XP_LABELS[option], reason };
	});
}

// Heróis ativos que ainda não agiram na rodada atual
export function selectHeroesAvailableForRound(state: GameState): HeroState[] {
	const view = playerView(state);
	const heroesActed = view.combat?.heroesActed ?? [];
	return view.heroes.filter(
		(h) => h.status === "active" && !heroesActed.includes(h.id),
	);
}

// Inimigos ativos disponíveis como alvo (v2: sem restrição de engajamento)
export function selectEnemiesAvailableAsTargets(
	state: GameState,
): EnemyState[] {
	const view = playerView(state);
	return view.enemies.filter((e) => e.status === "active");
}

// Herói em foco — usa focusedHeroId da UI; fallback para primeiro ativo
export function selectFocusedHero(
	state: GameState,
	focusedHeroId: string | null,
): HeroState | null {
	const view = playerView(state);
	if (focusedHeroId) {
		const hero = view.heroes.find((h) => h.id === focusedHeroId);
		if (hero) return hero;
	}
	return view.heroes.find((h) => h.status === "active") ?? null;
}

export interface HeroCombatActions {
	readonly canAttack: boolean;
	readonly canPass: boolean;
	readonly canCancel: boolean;
	readonly canUsePower: boolean;
	readonly canFlee: boolean;
	readonly skill: {
		readonly skillId: string;
		readonly activatable: boolean;
		readonly alreadyUsed: boolean;
	} | null;
}

// Descritores de ação de combate para um herói específico.
// Centraliza a habilitação de botões, consumindo predicados do core.
export function selectHeroCombatActions(
	state: GameState,
	heroId: string,
): HeroCombatActions {
	const view = playerView(state);
	const hero = view.heroes.find((h) => h.id === heroId) ?? null;
	const combat = view.combat;

	const isSelectingTarget =
		combat?.phase === "selecting_target" &&
		combat.selectedHeroId === heroId;
	const hasActiveEnemies = view.enemies.some((e) => e.status === "active");

	const canAttack = isSelectingTarget && hasActiveEnemies;
	const canPass = isSelectingTarget;
	const canCancel = isSelectingTarget;
	const canUsePower =
		isSelectingTarget && !(combat?.powersUsedThisRoom[heroId] ?? false);
	const canFlee =
		hero !== null &&
		hero.currentLife === 1 &&
		!state.flags["fleeBlocked"];

	// Skill: habilidade manual do herói (category === "habilidade")
	const habilidadeEntry = hero
		? cardSkills(hero.cardId).find(({ def }) => def.category === "habilidade")
		: null;
	const skill = habilidadeEntry
		? {
				skillId: habilidadeEntry.def.id,
				activatable: isManuallyActivatable(habilidadeEntry.def),
				alreadyUsed: isSkillGuardConsumed(state, habilidadeEntry.def, heroId),
			}
		: null;

	return { canAttack, canPass, canCancel, canUsePower, canFlee, skill };
}
