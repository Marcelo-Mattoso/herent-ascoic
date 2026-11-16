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
import { skillById, skillOwners, type GameEngine } from "@/core/gameEngine";

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

type EffectKind = "healing" | "damage" | "condition" | "modifier" | "dice" | "dungeonDeck" | "resourceDeck" | "resource";
type ObservedChanges = {
	readonly byKind: Readonly<Partial<Record<EffectKind, readonly string[]>>>;
	readonly modifiers: readonly { source: string; targetId?: string }[];
};

/** Mudanças de estado são sinais, não evidência de que TODA habilidade armada as causou. */
function differences(before: PlayerView, after: PlayerView): ObservedChanges {
	const byKind = {} as Partial<Record<EffectKind, string[]>>;
	const add = (kind: EffectKind, id?: string) => {
		const targetIds = byKind[kind] ?? [];
		if (id && !targetIds.includes(id)) targetIds.push(id);
		byKind[kind] = targetIds;
	};
	const checkLife = (old: readonly { id: string; currentLife: number; conditions?: readonly string[] }[],
		next: readonly { id: string; currentLife: number; conditions?: readonly string[] }[]) => {
		for (const previous of old) {
			const current = next.find((entry) => entry.id === previous.id);
			if (!current) continue;
			if (current.currentLife > previous.currentLife) add("healing", previous.id);
			if (current.currentLife < previous.currentLife) add("damage", previous.id);
			if (JSON.stringify(current.conditions) !== JSON.stringify(previous.conditions))
				add("condition", previous.id);
		}
	};
	checkLife(before.heroes, after.heroes);
	checkLife(before.enemies, after.enemies);
	const previousInfluences = new Set(before.activeInfluences.map((entry) => entry.id));
	const modifiers: { source: string; targetId?: string }[] = [];
	for (const influence of after.activeInfluences) {
		if (previousInfluences.has(influence.id)) continue;
		const targetId = "id" in influence.to ? influence.to.id : undefined;
		// InfluenceView.source é um rótulo traduzido; o ID conserva a chave técnica
		// do modificador e permite atribuição precisa sem depender do idioma.
		modifiers.push({ source: influence.id, targetId });
		add("modifier", targetId);
	}
	const oldRoll = before.combat?.lastRoll;
	const newRoll = after.combat?.lastRoll;
	if (oldRoll && newRoll &&
		(JSON.stringify(oldRoll.heroResults) !== JSON.stringify(newRoll.heroResults) ||
		JSON.stringify(oldRoll.enemyResults) !== JSON.stringify(newRoll.enemyResults))) add("dice");
	if (before.decks.dungeonDeck.available !== after.decks.dungeonDeck.available ||
		before.decks.dungeonDeck.discarded.length !== after.decks.dungeonDeck.discarded.length)
		add("dungeonDeck");
	if (before.decks.itemDeck.available.length !== after.decks.itemDeck.available.length ||
		before.decks.itemDeck.discarded !== after.decks.itemDeck.discarded ||
		before.decks.artifactDeck.available.length !== after.decks.artifactDeck.available.length)
		add("resourceDeck");
	for (const hero of before.heroes) {
		const updated = after.heroes.find((entry) => entry.id === hero.id);
		if (updated && updated.eco !== hero.eco) add("resource", hero.id);
	}
	return { byKind, modifiers };
}

/** Tipos explicitamente previstos pela DSL (inclusive ramos de escolhas). */
function declaredEffectKinds(engine: GameEngine, abilityId: string): ReadonlySet<EffectKind> {
	const kinds = new Set<EffectKind>();
	const definition = skillById(engine, abilityId);
	const visit = (node: unknown): void => {
		if (Array.isArray(node)) { for (const child of node) visit(child); return; }
		if (!node || typeof node !== "object") return;
		const value = node as Record<string, unknown>;
		switch (value.kind) {
			case "i_heal": case "i_full_heal": kinds.add("healing"); break;
			case "i_damage": kinds.add("damage"); break;
			case "p_modifier": kinds.add("modifier"); break;
			case "i_apply_poison": case "i_remove_poison": kinds.add("condition"); break;
			case "i_recover_dungeon": case "i_discard": kinds.add("dungeonDeck"); break;
			case "i_draw": case "i_draw_item": case "i_draw_artifact": kinds.add("resourceDeck"); break;
			case "i_set_die": case "i_reroll": kinds.add("dice"); break;
		}
		for (const [key, child] of Object.entries(value)) {
			if (key !== "kind") visit(child);
		}
	};
	visit(definition?.effect);
	// Implementações em script sem efeito declarativo equivalente.
	if (abilityId === "skill_rift_rune") kinds.add("modifier");
	if (abilityId === "power_supreme_rift_rune" || abilityId === "witch_power_green_eclipse" ||
		abilityId === "witch_skill_lunar_spark") kinds.add("dice");
	return kinds;
}

export function observeAbilityStep(step: AiStep, engine: GameEngine): readonly AbilityStepEvidence[] {
	const action = step.chosen.action;
	const beforeGame = gameOf(step.beforeState);
	const afterGame = gameOf(step.afterState);
	const beforePrepared = beforeGame.preparedAbilities ?? {};
	const afterPrepared = afterGame.preparedAbilities ?? {};
	const newlyPrepared = Object.values(afterPrepared).filter((entry) => !beforePrepared[entry.key]);
	// Remover uma preparação NÃO comprova execução: pode ser limpeza de fase,
	// expiração, cancelamento ou descarte de equipamento.
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
		const preparedSource = [...Object.values(beforePrepared), ...newlyPrepared].find((entry) =>
			entry.abilityId === skillId && entry.sourceHeroId === sourceId);
		const projected = step.before.abilityActionsByHero[sourceId]?.find((entry) =>
			entry.abilityId === skillId && (entry.sourceCardId === preparedSource?.sourceCardId || !preparedSource));
		const cancelling = action.payload.params?.cancelPreparation === true;
		add({ ...base(skillId, sourceId, preparedSource?.sourceCardId ?? projected?.sourceCardId), targetIds: [...(targetIds ?? [])],
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
	// Cooldowns de jogo comprovam um commit mesmo quando o motor ativou o
	// poder automaticamente sem abrir modal. Não adivinhar a origem quando
	// herói e artefato compartilham o mesmo abilityId.
	for (const [flag, used] of Object.entries(afterGame.oncePer.game)) {
		if (!used || beforeGame.oncePer.game[flag]) continue;
		const [abilityId, sourceHeroId] = flag.split("::");
		if (!abilityId || candidates.some((candidate) => candidate.abilityId === abilityId &&
			candidate.sourceHeroId === sourceHeroId)) continue;
		const owners = skillOwners(engine, abilityId);
		add({ abilityId, sourceCardId: owners.length === 1 ? owners[0]! : "unresolved-source",
			sourceHeroId, targetIds: [], attempted: false, prepared: false, confirmed: true });
	}

	const changes = differences(step.before, step.after);
	const consumedKeys = new Set<string>();
	return candidates.map((entry) => {
		const key = entry.sourceHeroId ? `${entry.abilityId}::${entry.sourceHeroId}` : entry.abilityId;
		const consumedInGame = !beforeGame.oncePer.game[key] && Boolean(afterGame.oncePer.game[key]);
		const beforeAction = entry.sourceHeroId
			? step.before.abilityActionsByHero[entry.sourceHeroId]?.find((item) =>
				item.abilityId === entry.abilityId && item.sourceCardId === entry.sourceCardId)
			: undefined;
		const afterAction = entry.sourceHeroId
			? step.after.abilityActionsByHero[entry.sourceHeroId]?.find((item) =>
				item.abilityId === entry.abilityId && item.sourceCardId === entry.sourceCardId)
			: undefined;
		const exhausted = beforeAction && beforeAction.status !== "exhausted" && afterAction?.status === "exhausted";
		const chargeConsumed = !consumedKeys.has(key) && Boolean(consumedInGame || exhausted);
		if (chargeConsumed) consumedKeys.add(key);
		const confirmed = entry.confirmed || chargeConsumed;
		const expected = declaredEffectKinds(engine, entry.abilityId);
		const direct = action.type === "USE_SKILL" || action.type === "USE_POWER" ||
			action.type === "SKILL_CHOICE" || action.type === "SELECT_SKILL_TARGET" ||
			action.type === "APPLY_TRIGGER_INTERRUPT" || action.type === "SELECT_DIE";
		const effectKinds: EffectKind[] = [];
		const affected = new Set<string>();
		if (confirmed && !entry.prepared && direct) for (const kind of expected) {
			const changesForKind = changes.byKind[kind];
			if (!changesForKind) continue;
			if (kind === "dice" &&
				(action.type !== "SELECT_DIE" || dicePending?.skillId !== entry.abilityId)) continue;
			if (kind === "modifier") {
				const ownModifiers = changes.modifiers.filter((modifier) =>
					modifier.source.startsWith(entry.abilityId + ":"));
				if (!ownModifiers.length) continue;
				for (const modifier of ownModifiers) if (modifier.targetId) affected.add(modifier.targetId);
			} else if (kind === "damage") {
				// Dano recebido por custo (Fúria) ou por ataque/veneno paralelo não
				// é evidência de dano causado pela habilidade. Apenas um dano direto
				// a inimigo alvo durante ativação manual pode ser atribuído.
				if (action.type !== "USE_SKILL" && action.type !== "USE_POWER" &&
					action.type !== "SKILL_CHOICE") continue;
				const directTargets = changesForKind.filter((id) =>
					id !== entry.sourceHeroId && step.before.enemies.some((enemy) => enemy.id === id) &&
					(entry.targetIds.length === 0 || entry.targetIds.includes(id)));
				if (!directTargets.length) continue;
				for (const id of directTargets) affected.add(id);
			} else {
				if (kind === "healing" || kind === "condition" || kind === "resource") {
					const matching = changesForKind.filter((id) => entry.targetIds.length === 0 ||
						entry.targetIds.includes(id));
					if (!matching.length) continue;
					for (const id of matching) affected.add(id);
				} else for (const id of changesForKind) affected.add(id);
			}
			effectKinds.push(kind);
		}
		return {
			...entry, confirmed, chargeConsumed, effectKinds,
			affectedIds: [...affected], targetIds: [...new Set([...entry.targetIds, ...affected])],
		};
	});
}
