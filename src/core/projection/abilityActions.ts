import { getCardName } from "../data/cardLocale";
import { getCardById } from "../data/cards";
import { getSkillName } from "../data/skillLocale";
import { buildScriptCtx } from "../scripts/context";
import { resolveCondition } from "../skills/dsl/resolveCondition";
import { resolveManualGrantTarget } from "../abilities/executor";
import { isAbilityPrepared, preparedAbilityKey } from "../abilities/prepared";
import { manualItemUnavailableReason } from "../rules/itemEffects";
import { resolveManualSkillTarget } from "../skills/targeting";
import { isVoluntaryTrigger } from "../skills/resolveSkillWindow";
import { cardSkills } from "../skills/lookup";
import { isManuallyActivatable } from "../skills/useSkill";
import { ActivationTracker } from "../state/activation";
import type { GameState } from "../state/gameState";
import { guardPassed } from "../triggers/engine";

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

function commonUnavailable(state: GameState, heroId: string): string | null {
	const hero = state.heroes.find((entry) => entry.id === heroId);
	if (!hero || hero.status !== "active") return "Herói incapacitado.";
	if (state.paused || state.pendingSkillTarget || state.pendingSkillChoice || state.pendingTriggerInterrupt)
		return "Conclua a escolha pendente primeiro.";
	if (state.combat && ActivationTracker.isHeroDisabledThisRound(state, heroId))
		return "Este herói já encerrou sua ação nesta rodada.";
	if ((state.status === "HERO_ACTION" || state.status === "BOSS_COMBAT") &&
		!(["selecting_hero", "selecting_target"].includes(state.combat?.phase ?? "")))
		return "Aguarde a próxima janela de ação.";
	return null;
}

export function projectAbilityActionsForHero(
	state: GameState,
	heroId: string,
): readonly AbilityActionView[] {
	const hero = state.heroes.find((entry) => entry.id === heroId);
	if (!hero) return [];
	const commonReason = commonUnavailable(state, heroId);
	const heroActions = cardSkills(hero.cardId)
		.filter(({ def }) => def.category === "hero_skill" || def.category === "hero_power")
		.map(({ def }): AbilityActionView => {
			const voluntary = def.operate_type === "op_triggered" &&
				isVoluntaryTrigger(def, "hero", def.trigger!.event);
			const activation = isManuallyActivatable(def) ? "manual" as const
				: voluntary ? "prepare" as const : "passive" as const;
			const key = preparedAbilityKey("hero", heroId, hero.cardId, def.id);
			const prepared = isAbilityPrepared(state, key);
			const target = activation === "manual"
				? resolveManualSkillTarget(state, def, heroId)
				: null;
			const targets = target?.kind === "needs_selection"
				? target.candidates.map((candidate) => candidate.id)
				: target?.kind === "ready" ? target.targetIds : [];
			const exhausted = !guardPassed(state, def, heroId);
			const conditionsMet = activation !== "passive" || !def.conditions?.length || def.conditions.every((condition) =>
				resolveCondition(condition, buildScriptCtx(state, {
					triggeredBy: def.trigger?.event ?? "manual",
					sourceHeroId: heroId, targetHeroIds: [heroId], skillId: def.id,
				}, def.params ?? {})));
			const preyAlreadyMarked = def.effect?.some((effect) => effect.kind === "i_mark_target") &&
				state.activeEnemies.some((enemy) => enemy.id === state.combat?.preyByHero[heroId] && enemy.status === "active");
			const reason = exhausted ? "Limite de uso atingido."
				: !conditionsMet ? "Condições da habilidade não atendidas."
				: (activation === "passive" ? null : commonReason) ??
					(preyAlreadyMarked ? "Derrote a Presa atual antes de marcar outra."
					: hero.currentLife <= (def.cost?.hp ?? 0) ? "Vida insuficiente para pagar o custo."
						: target?.kind === "unavailable" ? target.reason : null);
			const status = prepared ? "prepared" as const
				: exhausted ? "exhausted" as const
				: reason ? "unavailable" as const
				: activation === "passive" ? "active" as const : "available" as const;
			return {
				abilityId: def.id, sourceCardId: hero.cardId, label: getSkillName(def.id),
				kind: def.category === "hero_power" ? "power" : "skill",
				activation, status, ...(reason ? { reason } : {}),
				targetRequired: target?.kind === "needs_selection",
				validTargetIds: targets,
			};
		});
	const itemActions = Object.values(hero.activeItems).flatMap((itemId): AbilityActionView[] => {
		if (!itemId) return [];
		const card = getCardById(itemId);
		const grant = card?.grants?.find((entry) => entry.activation.kind === "manual" ||
			(entry.activation.kind === "event" && entry.activation.decision === "optional") ||
			entry.activation.kind === "continuous");
		const def = cardSkills(itemId)[0]?.def;
		if (!grant && !def) return [];
		const abilityId = grant?.abilityId ?? def!.id;
		const activation = grant?.activation.kind === "event" || def?.operate_type === "op_triggered"
			? "prepare" as const : grant?.activation.kind === "continuous" || def?.operate_type === "op_passive"
				? "passive" as const : "manual" as const;
		const key = preparedAbilityKey("item", heroId, itemId, abilityId, grant?.id);
		const prepared = isAbilityPrepared(state, key);
		const reason = activation === "passive" ? null : manualItemUnavailableReason(state, heroId, itemId);
		const target = activation === "manual"
			? grant ? resolveManualGrantTarget(state, { kind: "item", cardId: itemId, sourceHeroId: heroId }, grant)
				: resolveManualSkillTarget(state, def!, heroId)
			: null;
		const targets = target?.kind === "needs_selection" ? target.candidates.map((candidate) => candidate.id)
			: target?.kind === "ready" ? target.targetIds : [];
		return [{
			abilityId, sourceCardId: itemId, label: getCardName(itemId), kind: "item",
			activation, status: prepared ? "prepared" : reason ? "unavailable" : activation === "passive" ? "active" : "available",
			...(reason ? { reason } : {}), targetRequired: target?.kind === "needs_selection",
			validTargetIds: targets,
		}];
	});
	return [...heroActions, ...itemActions];
}
