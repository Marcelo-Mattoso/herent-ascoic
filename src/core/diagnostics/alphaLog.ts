import type { Action } from "../actions/types";
import { ALPHA_LOG_ENABLED } from "../config/defaults";
import { getCardName } from "../data/cardLocale";
import { getSkillName } from "../data/skillLocale";
import type { CombatRollResult } from "../state/combatState";
import type { GameState } from "../state/gameState";

export function appendAlphaLog(state: GameState, message: string): GameState {
	if (!ALPHA_LOG_ENABLED) return state;
	return { ...state, alphaLog: [...(state.alphaLog ?? []), message] };
}

function name(state: GameState, id: string | null | undefined): string {
	if (!id) return "desconhecido";
	const entity = [...state.heroes, ...state.defeatedHeroes, ...state.fledHeroes, ...state.activeEnemies, ...state.enemyGraveyard]
		.find((entry) => entry.id === id);
	return entity ? `${getCardName(entity.cardId)} (${id})` : getCardName(id);
}

function actionDescription(action: Action, state: GameState): string {
	switch (action.type) {
		case "CHOOSE_TARGET":
			return `${name(state, action.payload.heroId)} iniciou ataque contra ${name(state, action.payload.enemyId)} usando ${action.payload.inputMethod === "drag" ? "arrastar" : action.payload.inputMethod === "button" ? "o botão" : "a seleção de alvo"}.`;
		case "CHOOSE_HERO":
		case "CHOOSE_HERO_FOR_ROUND":
			return `Herói selecionado: ${name(state, action.payload?.heroId)}.`;
		case "USE_SKILL":
			return `${name(state, action.payload.sourceId)} acionou a habilidade ${getSkillName(action.payload.skillId)}.`;
		case "USE_ITEM":
		case "USE_REWARD_ITEM":
			return `${name(state, action.payload.heroId)} usou ${getCardName(action.payload.itemId)}.`;
		case "USE_POWER":
			return `${name(state, action.payload.heroId)} acionou seu poder.`;
		case "APPLY_TRIGGER_INTERRUPT":
			return `Reação confirmada: ${getSkillName(state.pendingTriggerInterrupt?.skillId ?? "")}.`;
		case "SKIP_TRIGGER_INTERRUPT":
			return `Reação ignorada: ${getSkillName(state.pendingTriggerInterrupt?.skillId ?? "")}.`;
		case "CONFIRM_DICE_ROLL":
			return `Rolagem ${action.payload.source === "physics" ? "física" : "alternativa"}: ${name(state, action.payload.heroId)} [${action.payload.heroResults.join(", ")}] × ${name(state, action.payload.enemyId)} [${action.payload.enemyResults.join(", ")}].`;
		case "RESOLVE_ATTACK":
			return "Ataque resolvido.";
		case "SKILL_CHOICE":
			return `Escolha em ${getSkillName(action.payload.skillId)}: ${action.payload.choice}.`;
		default:
			return `Ação ${action.type}.`;
	}
}

function rollLines(roll: CombatRollResult, state: GameState): string[] {
	const parts = (items: CombatRollResult["heroBreakdown"]) =>
		items.map((item) => `${item.source} ${item.value >= 0 ? "+" : ""}${item.value}`).join(", ") || "sem bônus";
	return [
		`Rolagem de ${name(state, roll.heroId)}: dados [${roll.heroResults.join(", ")}], ${parts(roll.heroBreakdown)} = ${roll.heroTotal}.`,
		`Rolagem de ${name(state, roll.enemyId)}: dados [${roll.enemyResults.join(", ")}], ${parts(roll.enemyBreakdown)} = ${roll.enemyTotal}. Margem ${roll.heroTotal - roll.enemyTotal >= 0 ? "+" : ""}${roll.heroTotal - roll.enemyTotal}.`,
	];
}

function stateChanges(before: GameState, after: GameState): string[] {
	const lines: string[] = [];
	if (before.status !== after.status) lines.push(`Fase: ${before.status} → ${after.status}.`);
	if (before.combat?.phase !== after.combat?.phase) lines.push(`Etapa de combate: ${before.combat?.phase ?? "—"} → ${after.combat?.phase ?? "—"}.`);
	if (before.combat?.round !== after.combat?.round) lines.push(`Rodada: ${before.combat?.round ?? "—"} → ${after.combat?.round ?? "—"}.`);
	if (before.currentRoom?.cardId !== after.currentRoom?.cardId) lines.push(`Sala: ${before.currentRoom ? getCardName(before.currentRoom.cardId) : "nenhuma"} → ${after.currentRoom ? getCardName(after.currentRoom.cardId) : "nenhuma"}.`);
	if (before.combat?.selectedHeroId !== after.combat?.selectedHeroId) lines.push(`Herói em foco no combate: ${name(before, before.combat?.selectedHeroId)} → ${name(after, after.combat?.selectedHeroId)}.`);
	if (before.combat?.pendingPhysicalRoll?.id !== after.combat?.pendingPhysicalRoll?.id && after.combat?.pendingPhysicalRoll) {
		const roll = after.combat.pendingPhysicalRoll;
		lines.push(`Rolagem preparada para ${name(after, roll.heroId)} × ${name(after, roll.enemyId)}: ${roll.heroDiceCount} dado(s) de herói e ${roll.enemyDiceCount} de inimigo; bônus do herói ${JSON.stringify(roll.heroBonuses)}, bônus do inimigo ${JSON.stringify(roll.enemyBonuses)}.`);
	}
	if (before.groupXp !== after.groupXp) lines.push(`XP do grupo: ${before.groupXp} → ${after.groupXp} (${after.groupXp - before.groupXp >= 0 ? "+" : ""}${after.groupXp - before.groupXp}).`);
	if (before.despertar !== after.despertar) lines.push(`Despertar: ${before.despertar} → ${after.despertar}.`);
	for (const entity of [...after.heroes, ...after.defeatedHeroes, ...after.fledHeroes, ...after.activeEnemies, ...after.enemyGraveyard]) {
		const old = [...before.heroes, ...before.defeatedHeroes, ...before.fledHeroes, ...before.activeEnemies, ...before.enemyGraveyard].find((entry) => entry.id === entity.id);
		if (!old) { lines.push(`${name(after, entity.id)} entrou em jogo.`); continue; }
		if (old.currentLife !== entity.currentLife) {
			const delta = entity.currentLife - old.currentLife;
			lines.push(`${name(after, entity.id)} ${delta < 0 ? `recebeu ${-delta} de dano` : `recuperou ${delta} de vida`} (${old.currentLife} → ${entity.currentLife}).`);
		}
		if (old.status !== entity.status) lines.push(`${name(after, entity.id)}: estado ${old.status} → ${entity.status}.`);
		if ("conditions" in entity && "conditions" in old && JSON.stringify(old.conditions) !== JSON.stringify(entity.conditions)) lines.push(`${name(after, entity.id)}: condições ${JSON.stringify(old.conditions)} → ${JSON.stringify(entity.conditions)}.`);
		if ("tokens" in entity && "tokens" in old && JSON.stringify(old.tokens) !== JSON.stringify(entity.tokens)) lines.push(`${name(after, entity.id)}: tokens ${JSON.stringify(old.tokens)} → ${JSON.stringify(entity.tokens)}.`);
		if ("activeItems" in entity && "activeItems" in old && JSON.stringify(old.activeItems) !== JSON.stringify(entity.activeItems)) lines.push(`${name(after, entity.id)}: equipamentos ${JSON.stringify(old.activeItems)} → ${JSON.stringify(entity.activeItems)}.`);
		if ("backpack" in entity && "backpack" in old && JSON.stringify(old.backpack) !== JSON.stringify(entity.backpack)) lines.push(`${name(after, entity.id)}: mochila ${JSON.stringify(old.backpack)} → ${JSON.stringify(entity.backpack)}.`);
	}
	if (before.pendingRewards !== after.pendingRewards && JSON.stringify(before.pendingRewards) !== JSON.stringify(after.pendingRewards)) lines.push(`Recompensas na mesa: ${JSON.stringify(before.pendingRewards)} → ${JSON.stringify(after.pendingRewards)}.`);
	if (JSON.stringify(before.groupArtifacts) !== JSON.stringify(after.groupArtifacts)) lines.push(`Artefatos do grupo: ${JSON.stringify(before.groupArtifacts)} → ${JSON.stringify(after.groupArtifacts)}.`);
	for (const deck of ["dungeonDeck", "enemyDeck", "itemDeck", "artifactDeck"] as const) {
		for (const pile of ["available", "discarded", "removed"] as const) {
			const old = before.decks[deck][pile];
			const current = after.decks[deck][pile];
			if (old !== current && JSON.stringify(old) !== JSON.stringify(current)) {
				const added = [...current];
				const removed = [...old];
				for (const card of old) { const index = added.indexOf(card); if (index >= 0) added.splice(index, 1); }
				for (const card of current) { const index = removed.indexOf(card); if (index >= 0) removed.splice(index, 1); }
				lines.push(`${deck}.${pile}: ${old.length} → ${current.length}; adicionadas ${JSON.stringify(added)}, retiradas ${JSON.stringify(removed)}${!added.length && !removed.length ? "; ordem alterada" : ""}.`);
			}
		}
	}
	for (const id of new Set([...Object.keys(before.world.entities), ...Object.keys(after.world.entities)])) {
		const old = before.world.entities[id]?.components.filter((component) => ["modifier", "condition", "token", "trigger"].includes(component.type)) ?? [];
		const current = after.world.entities[id]?.components.filter((component) => ["modifier", "condition", "token", "trigger"].includes(component.type)) ?? [];
		if (JSON.stringify(old) !== JSON.stringify(current)) lines.push(`Efeitos em ${name(after, id)}: ${JSON.stringify(old)} → ${JSON.stringify(current)}.`);
	}
	if (JSON.stringify(before.preparedAbilities) !== JSON.stringify(after.preparedAbilities)) lines.push(`Habilidades preparadas: ${JSON.stringify(before.preparedAbilities ?? {})} → ${JSON.stringify(after.preparedAbilities ?? {})}.`);
	if (JSON.stringify(before.blocks) !== JSON.stringify(after.blocks)) lines.push(`Bloqueios: ${JSON.stringify(before.blocks)} → ${JSON.stringify(after.blocks)}.`);
	if (JSON.stringify(before.tokens) !== JSON.stringify(after.tokens)) lines.push(`Tokens globais: ${JSON.stringify(before.tokens)} → ${JSON.stringify(after.tokens)}.`);
	if (!before.pendingSkillChoice && after.pendingSkillChoice) lines.push(`Escolha aberta: ${getSkillName(after.pendingSkillChoice.skillId)} — ${after.pendingSkillChoice.prompt}.`);
	if (!before.pendingTriggerInterrupt && after.pendingTriggerInterrupt) lines.push(`Reação disponível: ${getSkillName(after.pendingTriggerInterrupt.skillId)} (${after.pendingTriggerInterrupt.event}).`);
	// Campos internos que não têm frase própria continuam rastreáveis no alpha.
	const narrated = new Set(["alphaLog", "actionLog", "eventLog", "world", "heroes", "defeatedHeroes", "fledHeroes", "activeEnemies", "enemyGraveyard", "decks", "pendingRewards", "groupArtifacts", "preparedAbilities", "blocks", "tokens", "status", "currentRoom", "groupXp", "despertar"]);
	const oldState = before as unknown as Record<string, unknown>;
	const newState = after as unknown as Record<string, unknown>;
	for (const key of Object.keys(newState)) {
		if (narrated.has(key) || key === "combat") continue;
		if (oldState[key] !== newState[key] && JSON.stringify(oldState[key]) !== JSON.stringify(newState[key]))
			lines.push(`Detalhe técnico ${key}: ${JSON.stringify(oldState[key])} → ${JSON.stringify(newState[key])}.`);
	}
	const oldCombat = before.combat as unknown as Record<string, unknown> | null;
	const newCombat = after.combat as unknown as Record<string, unknown> | null;
	if (oldCombat && newCombat) {
		for (const key of Object.keys(newCombat)) {
			if (["round", "phase", "selectedHeroId", "lastRoll", "pendingPhysicalRoll"].includes(key)) continue;
			if (oldCombat[key] !== newCombat[key] && JSON.stringify(oldCombat[key]) !== JSON.stringify(newCombat[key]))
				lines.push(`Detalhe técnico combate.${key}: ${JSON.stringify(oldCombat[key])} → ${JSON.stringify(newCombat[key])}.`);
		}
	}
	return lines;
}

export function recordAlphaAction(before: GameState, after: GameState, action: Action): GameState {
	if (!ALPHA_LOG_ENABLED) return after;
	if (after === before) return after;
	const previous = action.type === "START_GAME" ? [] : before.alphaLog ?? [];
	const inner = action.type === "START_GAME" ? [] : after.alphaLog?.slice(previous.length) ?? [];
	const sequence = action.type === "START_GAME" ? 1 : before.actionLog.length + 1;
	const lines = [`#${sequence} ${actionDescription(action, before)} Dados: ${JSON.stringify(action)}`];
	const roll = after.combat?.lastRoll;
	if (roll && roll !== before.combat?.lastRoll) lines.push(...rollLines(roll, after));
	lines.push(...inner, ...stateChanges(before, after));
	const oldMessages = action.type === "START_GAME" || after.eventLog.length < before.eventLog.length ? 0 : before.eventLog.length;
	for (const message of after.eventLog.slice(oldMessages)) lines.push(`Log atual: ${message}`);
	return { ...after, alphaLog: [...previous, ...lines] };
}
