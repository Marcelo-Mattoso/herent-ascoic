import { HERO_ABILITY_IDS } from "../data/heroAbilityIds";
import { buildScriptCtx } from "../scripts/context";
import { resolveCondition } from "../skills/dsl/resolveCondition";
import { resolveManualGrantTarget } from "../abilities/executor";
import { isAbilityPrepared, preparedAbilityKey } from "../abilities/prepared";
import { manualItemUnavailableReason } from "../rules/itemEffects";
import { resolveManualSkillTarget } from "../skills/targeting";
import { isVoluntaryTrigger } from "../skills/resolveSkillWindow";

import { isManuallyActivatable } from "../skills/useSkill";
import { ActivationTracker } from "../state/activation";
import type { GameState } from "../state/gameState";
import { guardPassed } from "../triggers/engine";
import { cardById, cardName, skillName, skillsOf } from "../gameEngine";
import type { GameEngine } from "../gameEngine";
import { deckOf, scopedCountOf, enemiesOf, heroesOf, pausedOf, pendingSkillTargetOf, pendingSkillChoiceOf, pendingTriggerInterruptOf } from "../state/access";
import { gameOf } from "../../engine/state";

export interface AbilityActionView {
	readonly abilityId: string;
	readonly sourceCardId: string;
	readonly label: string;
	readonly kind: "skill" | "power" | "item";
	readonly activation: "manual" | "prepare" | "passive";
	readonly status: "available" | "prepared" | "active" | "exhausted" | "unavailable";
	readonly reason?: string;
	readonly targetRequired: boolean;
	readonly validTargetIds: readonly string[];
}

function commonUnavailable(state: GameState, heroId: string, allowAfterActed = false): string | null {
	const hero = heroesOf(state).find((entry) => entry.id === heroId);
	if (!hero || hero.status !== "active") return "Herói incapacitado.";
	if (pausedOf(state) || pendingSkillTargetOf(state) || pendingSkillChoiceOf(state) || pendingTriggerInterruptOf(state))
		return "Conclua a escolha pendente primeiro.";
	if (gameOf(state).combat && ActivationTracker.isHeroDisabledThisRound(state, heroId) && !allowAfterActed)
		return "Este herói já encerrou sua ação nesta rodada.";
	if ((gameOf(state).status === "HERO_ACTION" || gameOf(state).status === "BOSS_COMBAT") &&
		!(["selecting_hero", "selecting_target"].includes(gameOf(state).combat?.phase ?? "")))
		return "Aguarde a próxima janela de ação.";
	return null;
}

export function projectAbilityActionsForHero(engine: GameEngine, 
	state: GameState,
	heroId: string,
): readonly AbilityActionView[] {
	const hero = heroesOf(state).find((entry) => entry.id === heroId);
	if (!hero) return [];
	const commonReason = commonUnavailable(state, heroId);
	const heroActions = skillsOf(engine, hero.cardId)
		.filter(({ def }) => def.category === "hero_skill" || def.category === "hero_power")
		.map(({ def }): AbilityActionView => {
			const voluntary = def.operate_type === "op_triggered" &&
				isVoluntaryTrigger(def, "hero", def.trigger!.event);
			const activation = isManuallyActivatable(def) ? "manual" as const
				: voluntary ? "prepare" as const : "passive" as const;
			const key = preparedAbilityKey("hero", heroId, hero.cardId, def.id);
			const prepared = isAbilityPrepared(state, key);
			const target = activation === "manual"
				? resolveManualSkillTarget(engine, state, def, heroId)
				: null;
			const targets = target?.kind === "needs_selection"
				? target.candidates.map((candidate) => candidate.id)
				: target?.kind === "ready" ? target.targetIds : [];
			const exhausted = !guardPassed(state, def, heroId);
			const conditionsMet = activation !== "passive" || !def.conditions?.length || def.conditions.every((condition) =>
				resolveCondition(condition, buildScriptCtx(engine, state, {
					triggeredBy: def.trigger?.event ?? "manual",
					sourceHeroId: heroId, targetHeroIds: [heroId], skillId: def.id,
				}, def.params ?? {})));
			const preyAlreadyMarked = def.effect?.some((effect) => effect.kind === "i_mark_target") &&
				enemiesOf(state).some((enemy) => enemy.id === gameOf(state).combat?.preyByHero[heroId] && enemy.status === "active");
			const reason = exhausted ? "Limite de uso atingido."
				: !conditionsMet ? "Condições da habilidade não atendidas."
				: def.id === HERO_ABILITY_IDS.skill_return_rite && deckOf(state, "dungeonDeck").discarded.length === 0 ? "Não há cartas descartadas para recuperar."
				: def.id === HERO_ABILITY_IDS.spend_deep_veil_echo && (!["HERO_ACTION", "BOSS_COMBAT"].includes(gameOf(state).status) || scopedCountOf(state, "game", "eco", heroId) <= 0) ? "Não há Eco disponível neste combate."
				: def.id === HERO_ABILITY_IDS.skill_rift_rune && !["HERO_ACTION", "BOSS_COMBAT"].includes(gameOf(state).status) ? "Disponível apenas durante o combate."
				: (activation === "passive" ? null :
					[HERO_ABILITY_IDS.skill_return_rite, HERO_ABILITY_IDS.skill_prey_mark, HERO_ABILITY_IDS.skill_preserved_path, HERO_ABILITY_IDS.spend_deep_veil_echo, HERO_ABILITY_IDS.power_supreme_rift_rune].includes(def.id)
						? commonUnavailable(state, heroId, true) : commonReason) ??
					(preyAlreadyMarked ? "Derrote a Presa atual antes de marcar outra."
					: hero.currentLife <= (def.cost?.hp ?? 0) ? "Vida insuficiente para pagar o custo."
						: target?.kind === "unavailable" ? target.reason : null);
			const status = prepared ? "prepared" as const
				: exhausted ? "exhausted" as const
				: reason ? "unavailable" as const
				: activation === "passive" ? "active" as const : "available" as const;
			return {
				abilityId: def.id, sourceCardId: hero.cardId, label: skillName(engine, def.id),
				kind: def.category === "hero_power" ? "power" : "skill",
				activation, status, ...(reason ? { reason } : {}),
				targetRequired: target?.kind === "needs_selection",
				validTargetIds: targets,
			};
		});
	const itemActions = Object.values(hero.activeItems).flatMap((itemId): AbilityActionView[] => {
		if (!itemId) return [];
		const card = cardById(engine, itemId);
		const grant = card?.grants?.find((entry) => entry.activation.kind === "manual" ||
			(entry.activation.kind === "event" && entry.activation.decision === "optional") ||
			entry.activation.kind === "continuous");
		const def = skillsOf(engine, itemId)[0]?.def;
		if (!grant && !def) return [];
		const abilityId = grant?.abilityId ?? def!.id;
		const activation = grant?.activation.kind === "event" || def?.operate_type === "op_triggered"
			? "prepare" as const : grant?.activation.kind === "continuous" || def?.operate_type === "op_passive"
				? "passive" as const : "manual" as const;
		const key = preparedAbilityKey("item", heroId, itemId, abilityId, grant?.id);
		const prepared = isAbilityPrepared(state, key);
		const reason = activation === "passive" ? null : manualItemUnavailableReason(engine, state, heroId, itemId);
		const target = activation === "manual"
			? grant ? resolveManualGrantTarget(engine, state, { kind: "item", cardId: itemId, sourceHeroId: heroId }, grant)
				: resolveManualSkillTarget(engine, state, def!, heroId)
			: null;
		const targets = target?.kind === "needs_selection" ? target.candidates.map((candidate) => candidate.id)
			: target?.kind === "ready" ? target.targetIds : [];
		return [{
			abilityId, sourceCardId: itemId, label: cardName(engine, itemId), kind: "item",
			activation, status: prepared ? "prepared" : reason ? "unavailable" : activation === "passive" ? "active" : "available",
			...(reason ? { reason } : {}), targetRequired: target?.kind === "needs_selection",
			validTargetIds: targets,
		}];
	});
	return [...heroActions, ...itemActions];
}
