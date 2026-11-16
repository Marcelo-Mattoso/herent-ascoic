/**
 * Evidências observáveis do ciclo de habilidades no bot. Esta coleta nunca
 * consulta o estado para DECIDIR jogadas: só observa snapshots antes/depois.
 *
 * Uma mudança de estado não é prova de causalidade exclusiva em eventos que
 * resolvem múltiplas habilidades. "effectsObserved" é propositalmente distinto
 * de "confirmed" e "chargesConsumed".
 */
import type { AiStep } from "./ai";
import { gameOf } from "@/engine/state";
import type { PlayerView } from "@/core/projection/playerView";

export interface AbilityStepEvidence {
	readonly abilityId: string;
	readonly sourceCardId: string;
	readonly sourceHeroId?: string;
	readonly targetIds: readonly string[];
	/** Apenas entidades cujo estado foi alterado de forma observável. */
	readonly affectedIds: readonly string[];
	readonly attempted: boolean;
	readonly prepared: boolean;
	readonly confirmed: boolean;
	readonly chargeConsumed: boolean;
	readonly effectKinds: readonly string[];
}

function differences(before: PlayerView, after: PlayerView): {
	kinds: string[]; targets: string[];
} {
	const kinds = new Set<string>();
	const targets = new Set<string>();
	const checkLife = (old: readonly { id: string; currentLife: number; conditions?: readonly string[] }[],
		next: readonly { id: string; currentLife: number; conditions?: readonly string[] }[]) => {
		for (const previous of old) {
			const current = next.find((entry) => entry.id === previous.id);
			if (!current) continue;
			if (current.currentLife > previous.currentLife) { kinds.add("healing"); targets.add(previous.id); }
			if (current.currentLife < previous.currentLife) { kinds.add("damage"); targets.add(previous.id); }
			if (JSON.stringify(current.conditions) !== JSON.stringify(previous.conditions)) {
				kinds.add("condition"); targets.add(previous.id);
			}
		}
	};
	checkLife(before.heroes, after.heroes);
	checkLife(before.enemies, after.enemies);
	const oldInfluences = new Set(before.activeInfluences.map((entry) => entry.id));
	for (const influence of after.activeInfluences) {
		if (!oldInfluences.has(influence.id)) {
			kinds.add("modifier");
			if ("id" in influence.to) targets.add(influence.to.id);
		}
	}
	const oldRoll = before.combat?.lastRoll;
	const newRoll = after.combat?.lastRoll;
	if (oldRoll && newRoll &&
		(JSON.stringify(oldRoll.heroResults) !== JSON.stringify(newRoll.heroResults) ||
		 JSON.stringify(oldRoll.enemyResults) !== JSON.stringify(newRoll.enemyResults)))
		kinds.add("dice");
	const oldDeck = before.decks;
	const newDeck = after.decks;
	if (oldDeck.dungeonDeck.available !== newDeck.dungeonDeck.available ||
		oldDeck.dungeonDeck.discarded.length !== newDeck.dungeonDeck.discarded.length)
		kinds.add("dungeonDeck");
	if (oldDeck.itemDeck.available.length !== newDeck.itemDeck.available.length ||
		oldDeck.itemDeck.discarded !== newDeck.itemDeck.discarded ||
		oldDeck.artifactDeck.available.length !== newDeck.artifactDeck.available.length)
		kinds.add("resourceDeck");
	for (const hero of before.heroes) {
		const updated = after.heroes.find((entry) => entry.id === hero.id);
		if (updated && updated.eco !== hero.eco) { kinds.add("resource"); targets.add(hero.id); }
	}
	return { kinds: [...kinds], targets: [...targets] };
}

export function observeAbilityStep(step: AiStep): readonly AbilityStepEvidence[] {
	const action = step.chosen.action;
	const beforeGame = gameOf(step.beforeState);
	const afterGame = gameOf(step.afterState);
	const beforePrepared = beforeGame.preparedAbilities ?? {};
	const afterPrepared = afterGame.preparedAbilities ?? {};
	const newlyPrepared = Object.values(afterPrepared).filter((entry) => !beforePrepared[entry.key]);
	const removedPrepared = Object.values(beforePrepared).filter((entry) => !afterPrepared[entry.key]);
	const pendingChoice = step.before.pendingSkillChoice;
	const pendingTarget = step.before.pendingSkillTarget;
	const pendingTrigger = step.before.pendingTriggerInterrupt;
	const dicePending = beforeGame.combat?.pendingDiceSelection;
	const diceCommit = beforeGame.combat?.pendingDiceCommit;
	const candidates: Array<{ abilityId: string; sourceCardId: string; sourceHeroId?: string;
		targetIds: string[]; attempted: boolean; prepared: boolean; confirmed: boolean }> = [];
	const add = (item: (typeof candidates)[number]) => {
		if (candidates.some((candidate) =>
			candidate.abilityId === item.abilityId && candidate.sourceCardId === item.sourceCardId &&
			candidate.sourceHeroId === item.sourceHeroId)) return;
		candidates.push(item);
	};
	const ownerCard = (heroId?: string) => step.before.heroes.find((hero) => hero.id === heroId)?.cardId ?? "";
	const base = (abilityId: string, sourceHeroId?: string, sourceCardId?: string) => ({
		abilityId, sourceCardId: sourceCardId ?? ownerCard(sourceHeroId), sourceHeroId,
	});

	if (action.type === "USE_SKILL") {
		const { skillId, sourceId, targetIds } = action.payload;
		const item = step.before.abilityActionsByHero[sourceId]?.find((entry) => entry.abilityId === skillId);
		const cancelling = action.payload.params?.cancelPreparation === true;
		add({ ...base(skillId, sourceId, item?.sourceCardId), targetIds: [...(targetIds ?? [])],
			attempted: !cancelling, prepared: !cancelling && newlyPrepared.some((entry) => entry.abilityId === skillId),
			confirmed: !cancelling && !newlyPrepared.some((entry) => entry.abilityId === skillId) &&
				!step.after.pendingSkillChoice && !step.after.pendingSkillTarget });
	}
	if (action.type === "USE_POWER") {
		const { heroId } = action.payload;
		const power = step.before.abilityActionsByHero[heroId]?.find((entry) =>
			entry.kind === "power" && entry.status === "available");
		if (power) add({ ...base(power.abilityId, heroId, power.sourceCardId),
			targetIds: [], attempted: true,
			prepared: newlyPrepared.some((entry) => entry.abilityId === power.abilityId),
			confirmed: !newlyPrepared.some((entry) => entry.abilityId === power.abilityId) &&
				!step.after.pendingSkillChoice && !step.after.pendingSkillTarget });
	}
	if (action.type === "SKILL_CHOICE" && pendingChoice && action.payload.choice !== "__skip__") {
		add({ ...base(pendingChoice.skillId, pendingChoice.sourceHeroId, pendingChoice.sourceCardId),
			targetIds: [...(pendingChoice.targetHeroIds ?? []), ...(pendingChoice.targetEnemyIds ?? [])],
			attempted: false, prepared: false, confirmed: !step.after.pendingSkillChoice });
	}
	if (action.type === "SELECT_SKILL_TARGET" && pendingTarget) {
		add({ ...base(pendingTarget.skillId, pendingTarget.sourceId),
			targetIds: [action.payload.targetId], attempted: false, prepared: false,
			confirmed: !step.after.pendingSkillTarget });
	}
	if (action.type === "APPLY_TRIGGER_INTERRUPT" && pendingTrigger) {
		add({ ...base(pendingTrigger.skillId, pendingTrigger.sourceHeroId, pendingTrigger.sourceCardId),
			targetIds: [], attempted: false, prepared: false,
			confirmed: !step.after.pendingSkillChoice && !afterGame.combat?.pendingDiceSelection });
	}
	if (action.type === "SELECT_DIE" && dicePending) {
		add({ ...base(dicePending.skillId, dicePending.heroId, diceCommit?.sourceCardId),
			targetIds: [dicePending.heroId], attempted: false, prepared: false,
			confirmed: !afterGame.combat?.pendingDiceSelection });
	}
	for (const entry of newlyPrepared) {
		add({ ...base(entry.abilityId, entry.sourceHeroId, entry.sourceCardId),
			targetIds: [...(entry.targetIds ?? [])], attempted: false, prepared: true, confirmed: false });
	}
	// Reações armadas e consumidas durante a rolagem também precisam de
	// origem mesmo quando o clique escolhido foi ROLL_DICE/RESOLVE_ATTACK.
	for (const entry of removedPrepared) {
		if (action.type === "USE_SKILL" || action.type === "USE_POWER") continue;
		add({ ...base(entry.abilityId, entry.sourceHeroId, entry.sourceCardId),
			targetIds: [...(entry.targetIds ?? [])], attempted: false, prepared: false, confirmed: true });
	}
	const changes = differences(step.before, step.after);
	return candidates.map((entry) => {
		const key = entry.sourceHeroId ? `${entry.abilityId}::${entry.sourceHeroId}` : entry.abilityId;
		const consumedInGame = !beforeGame.oncePer.game[key] && Boolean(afterGame.oncePer.game[key]);
		const beforeAction = entry.sourceHeroId
			? step.before.abilityActionsByHero[entry.sourceHeroId]?.find((item) => item.abilityId === entry.abilityId)
			: undefined;
		const afterAction = entry.sourceHeroId
			? step.after.abilityActionsByHero[entry.sourceHeroId]?.find((item) => item.abilityId === entry.abilityId)
			: undefined;
		const chargeConsumed = consumedInGame || (beforeAction?.status !== "exhausted" && afterAction?.status === "exhausted");
		const confirmed = entry.confirmed || consumedInGame;
		// Custos próprios de ativação (ex. Fúria paga PV) NÃO são efeito.
		const activationOnly = entry.prepared || !confirmed;
		const newDamageFeedback = step.after.damageFeedback.slice(step.before.damageFeedback.length);
		const enemyLifeLost = step.before.enemies.some((old) => {
			const current = step.after.enemies.find((enemy) => enemy.id === old.id);
			return current && current.currentLife < old.currentLife;
		});
		const chargeOnlyHeroDamage = (action.type === "USE_SKILL" || action.type === "USE_POWER") &&
			!enemyLifeLost && newDamageFeedback.length === 0;
		const effectKinds = activationOnly ? [] : changes.kinds.filter((kind) =>
			kind !== "damage" || !chargeOnlyHeroDamage);
		const affectedIds = activationOnly || effectKinds.length === 0 ? [] : changes.targets.filter((id) => {
			if (!chargeOnlyHeroDamage || id !== entry.sourceHeroId) return true;
			return effectKinds.some((kind) => kind !== "damage");
		});
		return {
			...entry, confirmed, chargeConsumed, effectKinds, affectedIds,
			targetIds: [...new Set([...entry.targetIds, ...affectedIds])],
		};
	});
}
