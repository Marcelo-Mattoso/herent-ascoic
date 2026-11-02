import type { Action } from "../actions/types";
import type { ModifierComponent } from "../ecs/types";

import { EQUIPMENT_SLOTS } from "../rules/equipment";
import type { CombatRollResult } from "../state/combatState";
import type { AscensaoGame, GameState } from "../state/gameState";
import type { EnemyState } from "../state/enemyState";
import type { HeroState, ItemSlotType } from "../state/heroState";
import {
	type JournalEnemySource,
	type JournalHeroSource,
	type JournalSnapshot,
	journalSnapshotOf,
} from "./journalSnapshot";
import { abilityGrants, backpackCapacity, cardById, cardName, cardScaling, gameVersion, skillById, skillName, skillText } from "../gameEngine";
import type { GameEngine } from "../gameEngine";

import type { DeckName } from "../state/access";
export { type JournalSnapshot, journalSnapshotOf };

export const JOURNAL_SCHEMA_VERSION = 1;
export const DEFAULT_JOURNAL_LIMIT = 160;

export interface JournalSkill {
	readonly id: string;
	readonly name: string;
	readonly text: string;
	readonly activation: string;
	readonly requirements: string;
	readonly used: boolean;
}

export interface JournalCard {
	readonly id: string;
	readonly name: string;
	readonly type: string;
	readonly state?: "ready" | "exhausted";
	readonly skills: readonly JournalSkill[];
	readonly restriction?: string;
}

export interface JournalModifier {
	readonly target: ModifierComponent["target"];
	readonly operation: ModifierComponent["operation"];
	readonly value: number;
	readonly sourceId: string;
	readonly source: string;
	readonly duration: string;
	readonly conditional: boolean;
}

export interface JournalHero {
	readonly id: string;
	readonly cardId: string;
	readonly name: string;
	readonly status: HeroState["status"];
	readonly life: number;
	readonly maxLife: number;
	readonly damage: number;
	readonly hitBonus: number;
	readonly dice: number;
	readonly impeto: number;
	readonly xp: number;
	readonly usedPowers: readonly string[];
	readonly healBlocked: boolean;
	readonly conditions: readonly string[];
	readonly skills: readonly JournalSkill[];
	readonly equipment: readonly {
		slot: ItemSlotType;
		card: JournalCard | null;
		sharedWith?: ItemSlotType;
	}[];
	readonly backpack: readonly (JournalCard | null)[];
	readonly modifiers: readonly JournalModifier[];
}

export interface JournalEnemy {
	readonly id: string;
	readonly cardId: string;
	readonly name: string;
	readonly status: EnemyState["status"];
	readonly life: number;
	readonly maxLife: number;
	readonly damage: number;
	readonly hitBonus: number;
	readonly dice: number;
	readonly conditions: readonly string[];
	readonly tokens: Readonly<Record<string, number>>;
	readonly skills: readonly JournalSkill[];
	readonly modifiers: readonly JournalModifier[];
}

export interface JournalStateSnapshot {
	readonly schemaVersion: number;
	readonly sequence: number;
	readonly timestamp: number;
	readonly gameId: string;
	readonly status: AscensaoGame["status"];
	readonly mode: AscensaoGame["mode"];
	readonly difficulty: AscensaoGame["difficulty"];
	readonly round: number | null;
	readonly combatPhase: string | null;
	readonly selectedHeroId: string | null;
	readonly combatPairs: readonly { heroId: string; enemyId: string }[];
	readonly heroesActed: readonly string[];
	readonly preparedAbilities: readonly {
		readonly key: string;
		readonly abilityId: string;
		readonly sourceCardId: string;
		readonly event: string;
	}[];
	readonly groupXp: number;
	readonly despertar: number;
	readonly roomsCleared: number;
	readonly creaturesDefeated: number;
	readonly room: { card: JournalCard; status: string; effect: string } | null;
	readonly heroes: readonly JournalHero[];
	readonly enemies: readonly JournalEnemy[];
	readonly defeatedEnemies: readonly JournalEnemy[];
	readonly artifacts: readonly {
		card: JournalCard;
		carriedBy: string | null;
		state: "available" | "active" | "disabled";
	}[];
	readonly decks: readonly {
		id: DeckName;
		available: number;
		discarded: readonly JournalCard[];
		removed: number;
	}[];
	readonly revealedPaths: readonly JournalCard[];
	readonly pendingRewards: readonly JournalCard[];
	readonly pendingChoices: readonly string[];
	readonly flags: readonly string[];
	readonly blocks: readonly { key: string; sources: readonly string[] }[];
	readonly tokens: readonly { key: string; count: number }[];
	readonly roomModifiers: readonly {
		targetId: string;
		modifier: JournalModifier;
	}[];
	readonly issues: readonly string[];
}

export interface JournalEntry {
	readonly sequence: number;
	readonly timestamp: number;
	readonly actionId: string;
	readonly actionType: Action["type"];
	readonly summary: string;
	readonly messages: readonly string[];
	readonly changes: readonly string[];
	readonly roll: CombatRollResult | null;
	readonly interrupt?: {
		readonly id: string;
		readonly skillId: string;
		readonly event: string;
		readonly sourceCardId: string;
		readonly decision: "opened" | "applied" | "skipped";
		readonly continuation: string;
	};
	readonly before: JournalStateSnapshot;
	readonly after: JournalStateSnapshot;
}

export interface GameJournal {
	readonly schemaVersion: number;
	readonly gameId: string;
	readonly entries: readonly JournalEntry[];
	readonly current: JournalStateSnapshot;
	readonly omittedEntries: number;
}

function skillsForCard(engine: GameEngine,
	cardId: string,
	usedPowers: Readonly<Record<string, boolean>> = {},
): JournalSkill[] {
	return abilityGrants(engine, cardId).map((grant) => {
		return {
			id: grant.abilityId,
			name: skillName(engine, grant.abilityId),
			text: skillText(engine, grant.abilityId),
			activation: grant.activation.kind,
			requirements: [
				grant.requiresAwakening ? "Requer Despertar" : "",
				grant.activation.conditions?.length ? "Condições da carta" : "",
				grant.activation.limit
					? `Limite: ${grant.activation.limit.maxUses}/${grant.activation.limit.scope}`
					: "",
			]
				.filter(Boolean)
				.join(" · "),
			used: Boolean(usedPowers[grant.id] || usedPowers[grant.abilityId]),
		};
	});
}

function cardProjection(engine: GameEngine,
	id: string,
	state?: "ready" | "exhausted",
	includeSkills = true,
): JournalCard {
	const card = cardById(engine, id);
	return {
		id,
		name: cardName(engine, id),
		type: card?.type ?? "unknown",
		...(state ? { state } : {}),
		skills: includeSkills ? skillsForCard(engine, id) : [],
		...(card?.type === "item" && card.allowedHeroIds?.length
			? {
					restriction: `Heróis permitidos: ${card.allowedHeroIds.map((heroId) => cardName(engine, heroId)).join(", ")}`,
				}
			: {}),
	};
}

function modifierProjection(engine: GameEngine, mod: ModifierComponent): JournalModifier {
	return {
		target: mod.target,
		operation: mod.operation,
		value: mod.value,
		sourceId: mod.source,
		source:
			skillName(engine, mod.source) !== mod.source
				? skillName(engine, mod.source)
				: cardName(engine, mod.source),
		duration:
			mod.duration.kind === "rounds"
				? `${mod.duration.remaining} rodada(s)`
				: mod.duration.kind,
		conditional: Boolean(mod.condition),
	};
}

function heroProjection(engine: GameEngine, source: JournalHeroSource): JournalHero {
	const { hero } = source;
	const equipment = EQUIPMENT_SLOTS.map((slot) => {
		const cardId = hero.activeItems[slot];
		if (slot === "hand2" && !cardId && hero.activeItems.hand1) {
			const firstHand = cardById(engine, hero.activeItems.hand1);
			if (
				firstHand?.type === "item" &&
				firstHand.equipmentSlot === "two_hands"
			) {
				return { slot, card: null, sharedWith: "hand1" as ItemSlotType };
			}
		}
		return {
			slot,
			card: cardId
				? cardProjection(engine,
						cardId,
						source.exhaustedItemIds.includes(cardId) ? "exhausted" : "ready",
					)
				: null,
		};
	});
	return {
		id: hero.id,
		cardId: hero.cardId,
		name: cardName(engine, hero.cardId),
		status: hero.status,
		life: hero.currentLife,
		maxLife: hero.maxLife,
		damage: hero.damage,
		hitBonus: hero.hitBonus,
		dice: hero.dice,
		impeto: source.impeto,
		xp: hero.xp,
		healBlocked: Boolean(hero.healBlocked),
		conditions: [...hero.conditions],
		usedPowers: [
			...Object.entries(hero.usedPowers)
				.filter(([, used]) => used)
				.map(([id]) => id),
			...(source.powerUsedThisRoom ? ["Poder usado nesta sala"] : []),
		],
		skills: skillsForCard(engine, hero.cardId, hero.usedPowers).map((skill) => ({
			...skill,
			used:
				skill.used ||
				Boolean(
					source.powerUsedThisRoom &&
						skillById(engine, skill.id)?.category === "hero_power",
				),
		})),
		equipment,
		backpack: Array.from(
			{ length: Math.max(backpackCapacity(engine), hero.backpack.length) },
			(_, index) =>
				hero.backpack[index] ? cardProjection(engine, hero.backpack[index]) : null,
		),
		modifiers: source.modifiers.map((modifier) => modifierProjection(engine, modifier)),
	};
}

function enemyProjection(engine: GameEngine, { enemy, modifiers }: JournalEnemySource): JournalEnemy {
	return {
		id: enemy.id,
		cardId: enemy.cardId,
		name: cardName(engine, enemy.cardId),
		status: enemy.status,
		life: enemy.currentLife,
		maxLife: enemy.maxLife,
		damage: enemy.damage,
		hitBonus: enemy.hitBonus,
		dice: enemy.dice,
		conditions: [...enemy.conditions],
		tokens: { ...enemy.tokens },
		skills: skillsForCard(engine, enemy.cardId),
		modifiers: modifiers.map((modifier) => modifierProjection(engine, modifier)),
	};
}

function detectIssues(engine: GameEngine, snap: JournalSnapshot): string[] {
	const issues: string[] = [];
	for (const { hero } of snap.heroes) {
		const name = cardName(engine, hero.cardId);
		if (hero.currentLife < 0 || hero.currentLife > hero.maxLife)
			issues.push(
				`${name}: vida ${hero.currentLife} fora do intervalo 0–${hero.maxLife}`,
			);
		if (hero.backpack.length > backpackCapacity(engine))
			issues.push(`${name}: mochila acima de ${backpackCapacity(engine)} cartas`);
		const equipped = Object.values(hero.activeItems).filter(
			(id): id is string => Boolean(id),
		);
		if (new Set(equipped).size !== equipped.length)
			issues.push(`${name}: item duplicado em espaços equipados`);
		if (equipped.some((id) => hero.backpack.includes(id)))
			issues.push(`${name}: item simultaneamente equipado e na mochila`);
		const firstHand = hero.activeItems.hand1
			? cardById(engine, hero.activeItems.hand1)
			: undefined;
		if (
			firstHand?.type === "item" &&
			firstHand.equipmentSlot === "two_hands" &&
			hero.activeItems.hand2
		)
			issues.push(`${name}: item de duas mãos conflita com Mão 2`);
	}
	for (const { enemy } of [...snap.enemies, ...snap.defeatedEnemies]) {
		if (enemy.currentLife < 0 || enemy.currentLife > enemy.maxLife)
			issues.push(
				`${cardName(engine, enemy.cardId)}: vida ${enemy.currentLife} fora do intervalo 0–${enemy.maxLife}`,
			);
	}
	return issues;
}

export function projectJournalSnapshot(engine: GameEngine,
	snap: JournalSnapshot,
	timestamp = Date.now(),
): JournalStateSnapshot {
	const activeModifiers = snap.worldModifiers.map(({ targetId, modifier }) => ({
		targetId,
		modifier: modifierProjection(engine, modifier),
	}));
	const room = snap.currentRoom;
	const roomSkillIds = new Set(
		room ? abilityGrants(engine, room.cardId).map((grant) => grant.abilityId) : [],
	);
	const combat = snap.combat;
	const interrupt = snap.pendingInterrupt;
	return {
		schemaVersion: JOURNAL_SCHEMA_VERSION,
		sequence: snap.actionCount,
		timestamp,
		gameId: snap.gameId,
		status: snap.status,
		mode: snap.mode,
		difficulty: snap.difficulty,
		round: combat?.round ?? null,
		combatPhase: combat?.phase ?? null,
		selectedHeroId: combat?.selectedHeroId ?? null,
		combatPairs: combat?.pairs.map((pair) => ({ ...pair })) ?? [],
		heroesActed: [...(combat?.heroesActed ?? [])],
		preparedAbilities: snap.preparedAbilities.map((entry) => ({ ...entry })),
		groupXp: snap.groupXp,
		despertar: snap.despertar,
		roomsCleared: snap.roomsCleared,
		creaturesDefeated: snap.creaturesDefeated,
		room: room
			? {
					card: cardProjection(engine, room.cardId),
					status: room.status,
					effect:
						room.effect || cardScaling(engine, room.cardId),
				}
			: null,
		heroes: snap.heroes.map((source) => heroProjection(engine, source)),
		enemies: snap.enemies.map((source) => enemyProjection(engine, source)),
		defeatedEnemies: snap.defeatedEnemies.map((source) => enemyProjection(engine, source)),
		artifacts: snap.artifacts.map((artifact) => {
			const grantIds = new Set(
				abilityGrants(engine, artifact.cardId).map((grant) => grant.abilityId),
			);
			return {
				card: cardProjection(engine, artifact.cardId),
				carriedBy: artifact.carriedBy,
				state: artifact.disabled
					? ("disabled" as const)
					: activeModifiers.some(({ modifier }) =>
								grantIds.has(modifier.sourceId),
							)
						? ("active" as const)
						: ("available" as const),
			};
		}),
		decks: snap.decks.map((deck) => ({
			id: deck.id,
			available: deck.available,
			discarded: deck.discarded.map((cardId) =>
				cardProjection(engine, cardId, undefined, false),
			),
			removed: deck.removed,
		})),
		revealedPaths: snap.paths.map((id) => cardProjection(engine, id)),
		pendingRewards: snap.pendingRewardCardIds.map((id) => cardProjection(engine, id)),
		pendingChoices: [
			snap.pendingSkillChoice
				? `${snap.pendingSkillChoice.prompt}: ${snap.pendingSkillChoice.optionLabels.join(", ")}`
				: undefined,
			snap.pendingSkillTarget
				? `${snap.pendingSkillTarget.prompt}: ${snap.pendingSkillTarget.candidateLabels.join(", ")}`
				: undefined,
			interrupt
				? `Interrupção: ${skillName(engine, interrupt.skillId)} (${cardName(engine, interrupt.sourceCardId)}) — ${interrupt.reason}`
				: undefined,
		].filter(
			(value): value is string => typeof value === "string" && value.length > 0,
		),
		flags: [...snap.enabledFlags],
		blocks: snap.blocks.map((block) => ({
			key: block.key,
			sources: [...block.sources],
		})),
		tokens: snap.tokens.map((token) => ({ ...token })),
		roomModifiers: activeModifiers.filter(({ modifier }) =>
			roomSkillIds.has(modifier.sourceId),
		),
		issues: detectIssues(engine, snap),
	};
}

export function projectJournalState(engine: GameEngine,
	state: GameState,
	timestamp = Date.now(),
): JournalStateSnapshot {
	return projectJournalSnapshot(engine, journalSnapshotOf(state), timestamp);
}

function changed(engine: GameEngine,
	before: JournalStateSnapshot,
	after: JournalStateSnapshot,
): string[] {
	const changes: string[] = [];
	if (before.status !== after.status)
		changes.push(`Fase: ${before.status} → ${after.status}`);
	if (before.round !== after.round)
		changes.push(`Rodada: ${before.round ?? "—"} → ${after.round ?? "—"}`);
	if (before.selectedHeroId !== after.selectedHeroId)
		changes.push(
			`Herói selecionado: ${before.selectedHeroId ?? "—"} → ${after.selectedHeroId ?? "—"}`,
		);
	if (JSON.stringify(before.combatPairs) !== JSON.stringify(after.combatPairs))
		changes.push("Alvos de combate alterados");
	if (JSON.stringify(before.heroesActed) !== JSON.stringify(after.heroesActed))
		changes.push("Ações da rodada alteradas");
	for (const entry of after.preparedAbilities) {
		if (!before.preparedAbilities.some((old) => old.key === entry.key))
			changes.push(`${skillName(engine, entry.abilityId)} preparado para ${entry.event}`);
	}
	for (const entry of before.preparedAbilities) {
		if (!after.preparedAbilities.some((current) => current.key === entry.key))
			changes.push(`${skillName(engine, entry.abilityId)}: preparação encerrada`);
	}
	if (before.room?.card.id !== after.room?.card.id)
		changes.push(
			`Sala: ${before.room?.card.name ?? "—"} → ${after.room?.card.name ?? "—"}`,
		);
	if (before.despertar !== after.despertar)
		changes.push(`Despertar: ${before.despertar} → ${after.despertar}`);
	if (before.groupXp !== after.groupXp)
		changes.push(`XP do grupo: ${before.groupXp} → ${after.groupXp}`);
	for (const hero of after.heroes) {
		const old = before.heroes.find((entry) => entry.id === hero.id);
		if (!old) {
			changes.push(`${hero.name} entrou na partida`);
			continue;
		}
		if (old.life !== hero.life)
			changes.push(`${hero.name}: vida ${old.life} → ${hero.life}`);
		if (old.status !== hero.status)
			changes.push(`${hero.name}: ${old.status} → ${hero.status}`);
		if (JSON.stringify(old.usedPowers) !== JSON.stringify(hero.usedPowers))
			changes.push(`${hero.name}: habilidades utilizadas alteradas`);
		for (const slot of hero.equipment) {
			const previous = old.equipment.find((entry) => entry.slot === slot.slot);
			if (previous?.card?.id !== slot.card?.id)
				changes.push(
					`${hero.name}, ${slot.slot}: ${previous?.card?.name ?? "vazio"} → ${slot.card?.name ?? "vazio"}`,
				);
		}
		if (
			JSON.stringify(old.backpack.map((card) => card?.id)) !==
			JSON.stringify(hero.backpack.map((card) => card?.id))
		) {
			changes.push(
				`${hero.name}, mochila: ${
					old.backpack
						.filter(Boolean)
						.map((card) => card?.name)
						.join(", ") || "vazia"
				} → ${
					hero.backpack
						.filter(Boolean)
						.map((card) => card?.name)
						.join(", ") || "vazia"
				}`,
			);
		}
		if (JSON.stringify(old.modifiers) !== JSON.stringify(hero.modifiers))
			changes.push(`${hero.name}: modificadores alterados`);
	}
	for (const enemy of after.enemies) {
		const old =
			before.enemies.find((entry) => entry.id === enemy.id) ??
			before.defeatedEnemies.find((entry) => entry.id === enemy.id);
		if (!old) {
			changes.push(`${enemy.name} apareceu`);
			continue;
		}
		if (old.life !== enemy.life)
			changes.push(`${enemy.name}: vida ${old.life} → ${enemy.life}`);
		if (old.status !== enemy.status)
			changes.push(`${enemy.name}: ${old.status} → ${enemy.status}`);
		if (JSON.stringify(old.modifiers) !== JSON.stringify(enemy.modifiers))
			changes.push(`${enemy.name}: modificadores alterados`);
	}
	for (const enemy of after.defeatedEnemies) {
		if (!before.defeatedEnemies.some((entry) => entry.id === enemy.id))
			changes.push(`${enemy.name} foi derrotado com ${enemy.life} PV`);
	}
	for (const deck of after.decks) {
		const old = before.decks.find((entry) => entry.id === deck.id);
		if (
			old &&
			(old.available !== deck.available ||
				old.discarded.length !== deck.discarded.length ||
				old.removed !== deck.removed)
		) {
			changes.push(
				`${deck.id}: pilha ${old.available} → ${deck.available}, descarte ${old.discarded.length} → ${deck.discarded.length}, removidas ${old.removed} → ${deck.removed}`,
			);
		}
	}
	if (JSON.stringify(before.artifacts) !== JSON.stringify(after.artifacts))
		changes.push("Artefatos do grupo alterados");
	if (JSON.stringify(before.flags) !== JSON.stringify(after.flags))
		changes.push("Condições globais alteradas");
	if (
		JSON.stringify(before.pendingChoices) !==
		JSON.stringify(after.pendingChoices)
	)
		changes.push("Escolhas pendentes alteradas");
	if (
		JSON.stringify(before.roomModifiers) !== JSON.stringify(after.roomModifiers)
	)
		changes.push("Modificadores da sala alterados");
	if (JSON.stringify(before.issues) !== JSON.stringify(after.issues))
		changes.push("Inconsistências detectadas alteradas");
	return changes;
}

function actionSummary(engine: GameEngine,
	action: Action,
	changes: readonly string[],
	before: JournalStateSnapshot,
	after: JournalStateSnapshot,
): string {
	if (action.type === "USE_ITEM" || action.type === "USE_SKILL" || action.type === "USE_POWER") {
		const added = after.preparedAbilities.find((entry) =>
			!before.preparedAbilities.some((previous) => previous.key === entry.key));
		if (added) return `Preparada: ${skillName(engine, added.abilityId)}`;
		const removed = before.preparedAbilities.find((entry) =>
			!after.preparedAbilities.some((current) => current.key === entry.key));
		if (removed) return `Preparação cancelada: ${skillName(engine, removed.abilityId)}`;
	}
	if (
		action.type === "APPLY_TRIGGER_INTERRUPT" ||
		action.type === "SKIP_TRIGGER_INTERRUPT"
	)
		return `${action.type === "APPLY_TRIGGER_INTERRUPT" ? "Interrupção aplicada" : "Interrupção ignorada"}: ${action.payload?.interruptId ?? "sem ID"}`;
	if (action.type === "INV_MOVE" || action.type === "INV_ASSIGN_ITEM")
		return `Movimento: ${cardName(engine, action.payload.itemId)}`;
	if (action.type === "USE_ITEM")
		return `Item usado: ${cardName(engine, action.payload.itemId)}`;
	if (action.type === "USE_SKILL")
		return `Habilidade: ${skillName(engine, action.payload.skillId)}`;
	if (action.type === "SKILL_CHOICE")
		return `Escolha: ${skillName(engine, action.payload.skillId)} — ${action.payload.choice}`;
	if (action.type === "CHOOSE_PATH")
		return `Caminho escolhido: ${cardName(engine, action.payload.cardId)}`;
	if (
		action.type === "CHOOSE_HERO_FOR_ROUND" ||
		action.type === "USE_POWER" ||
		action.type === "DECLARE_FLEE"
	) {
		return `${action.type === "USE_POWER" ? "Poder usado" : action.type === "DECLARE_FLEE" ? "Fuga declarada" : "Herói escolhido"}: ${after.heroes.find((hero) => hero.id === action.payload.heroId)?.name ?? action.payload.heroId}`;
	}
	if (action.type === "CHOOSE_TARGET")
		return `Alvo escolhido: ${after.enemies.find((enemy) => enemy.id === action.payload.enemyId)?.name ?? action.payload.enemyId}`;
	return changes[0] ?? action.type.replaceAll("_", " ");
}

export function createGameJournal(engine: GameEngine,
	initial: GameState,
	limit = DEFAULT_JOURNAL_LIMIT,
) {
	let entries: JournalEntry[] = [];
	let omittedEntries = 0;
	let lastState = initial;
	let lastSnap = journalSnapshotOf(initial);
	let current = projectJournalSnapshot(engine, lastSnap);
	const maxEntries = Math.max(1, Math.floor(limit));
	return {
		get(): GameJournal {
			return {
				schemaVersion: JOURNAL_SCHEMA_VERSION,
				gameId: current.gameId,
				current,
				entries,
				omittedEntries,
			};
		},
		record(
			action: Action,
			beforeState: GameState,
			afterState: GameState,
		): void {
			if (action.type === "START_GAME") {
				entries = [];
				omittedEntries = 0;
			}
			const timestamp = Date.now();
			const reuse = beforeState === lastState;
			const beforeSnap = reuse ? lastSnap : journalSnapshotOf(beforeState);
			const afterSnap = journalSnapshotOf(afterState);
			const before = reuse
				? current
				: projectJournalSnapshot(engine, beforeSnap, timestamp);
			const after = projectJournalSnapshot(engine, afterSnap, timestamp);
			current = after;
			lastState = afterState;
			lastSnap = afterSnap;
			if (afterState === beforeState) return;
			const sequence = afterSnap.lastActionSeq ?? entries.length;
			const changes = changed(engine, before, after);
			const messages = afterSnap.eventLog.slice(
				action.type === "START_GAME" ||
					afterSnap.eventLog.length < beforeSnap.eventLog.length
					? 0
					: beforeSnap.eventLog.length,
			);
			const rollChanged =
				afterSnap.combat?.lastRoll !== beforeSnap.combat?.lastRoll;
			const roll =
				(rollChanged ? afterSnap.combat?.lastRoll : null) ??
				(action.type === "RESOLVE_ATTACK"
					? beforeSnap.combat?.lastRoll
					: null) ??
				null;
			const entry: JournalEntry = {
				sequence,
				timestamp,
				actionId: `${afterSnap.gameId}:${sequence}`,
				actionType: action.type,
				interrupt: (() => {
					const decision =
						action.type === "APPLY_TRIGGER_INTERRUPT"
							? ("applied" as const)
							: action.type === "SKIP_TRIGGER_INTERRUPT"
								? ("skipped" as const)
								: ("opened" as const);
					const pending =
						decision === "opened"
							? afterSnap.pendingInterrupt
							: beforeSnap.pendingInterrupt;
					return pending
						? {
								id: pending.id,
								skillId: pending.skillId,
								event: pending.event,
								sourceCardId: pending.sourceCardId,
								decision,
								continuation: pending.continuation,
							}
						: undefined;
				})(),
				summary: beforeSnap.pendingInterrupt &&
					(action.type === "APPLY_TRIGGER_INTERRUPT" || action.type === "SKIP_TRIGGER_INTERRUPT")
					? `${action.type === "APPLY_TRIGGER_INTERRUPT" ? "Interrupção aplicada" : "Interrupção ignorada"}: ${skillName(engine, beforeSnap.pendingInterrupt.skillId)}`
					: actionSummary(engine, action, changes, before, after),
				messages: [...messages],
				changes,
				roll: roll
					? {
							...roll,
							heroResults: [...roll.heroResults],
							enemyResults: [...roll.enemyResults],
							heroBreakdown: roll.heroBreakdown.map((part) => ({ ...part })),
							enemyBreakdown: roll.enemyBreakdown.map((part) => ({ ...part })),
						}
					: null,
				before,
				after,
			};
			entries = [...entries, entry];
			if (entries.length > maxEntries) {
				omittedEntries += entries.length - maxEntries;
				entries = entries.slice(-maxEntries);
			}
		},
		sync(state: GameState): void {
			entries = [];
			omittedEntries = 0;
			lastSnap = journalSnapshotOf(state);
			current = projectJournalSnapshot(engine, lastSnap);
			lastState = state;
		},
	};
}

export function exportJournalJson(engine: GameEngine, journal: GameJournal): string {
	return JSON.stringify(
		{
			schemaVersion: journal.schemaVersion,
			gameVersion: gameVersion(engine),
			gameId: journal.gameId,
			omittedEntries: journal.omittedEntries,
			entries: journal.entries,
			finalState: journal.current,
		},
		null,
		2,
	);
}

function modifierText(mod: JournalModifier): string {
	return `${mod.target}: ${mod.operation} ${mod.value > 0 ? "+" : ""}${mod.value} — ${mod.source} (${mod.duration}${mod.conditional ? ", contextual" : ""})`;
}

function snapshotText(snapshot: JournalStateSnapshot): string[] {
	const lines = [
		`Fase: ${snapshot.status} · Rodada: ${snapshot.round ?? "—"} · Sala: ${snapshot.room?.card.name ?? "nenhuma"}`,
		`Despertar: ${snapshot.despertar} · XP do grupo: ${snapshot.groupXp} · Salas concluídas: ${snapshot.roomsCleared}`,
	];
	if (snapshot.room?.effect)
		lines.push(`Efeito da sala: ${snapshot.room.effect}`);
	for (const { targetId, modifier } of snapshot.roomModifiers)
		lines.push(`  Sala → ${targetId}: ${modifierText(modifier)}`);
	if (snapshot.flags.length)
		lines.push(`Condições globais: ${snapshot.flags.join(", ")}`);
	if (snapshot.pendingChoices.length)
		lines.push(`Escolhas pendentes: ${snapshot.pendingChoices.join("; ")}`);
	if (snapshot.pendingRewards.length)
		lines.push(
			`Recompensas pendentes: ${snapshot.pendingRewards.map((card) => card.name).join(", ")}`,
		);
	lines.push("", "HERÓIS");
	for (const hero of snapshot.heroes) {
		lines.push(
			`${hero.name} (${hero.id}) — ${hero.status} — Vida ${hero.life}/${hero.maxLife}`,
		);
		lines.push(
			`  Dano base ${hero.damage} · Acerto base ${hero.hitBonus} · Dados ${hero.dice} · Ímpeto ${hero.impeto} · XP ${hero.xp}`,
		);
		if (hero.conditions.length)
			lines.push(`  Condições: ${hero.conditions.join(", ")}`);
		for (const slot of hero.equipment)
			lines.push(
				`  ${slot.slot}: ${slot.sharedWith ? `ocupado por ${slot.sharedWith}` : slot.card ? `${slot.card.name} (${slot.card.id}${slot.card.state ? `, ${slot.card.state}` : ""})` : "vazio"}`,
			);
		lines.push(
			`  Mochila: ${hero.backpack.map((card) => card?.name ?? "vazio").join(" | ")}`,
		);
		for (const skill of hero.skills)
			lines.push(
				`  Habilidade: ${skill.name}${skill.used ? " (usada)" : ""}${skill.text ? ` — ${skill.text}` : ""}`,
			);
		for (const mod of hero.modifiers)
			lines.push(`  Modificador: ${modifierText(mod)}`);
	}
	lines.push("", "CRIATURAS ATIVAS E DERROTADAS");
	for (const enemy of [...snapshot.enemies, ...snapshot.defeatedEnemies]) {
		lines.push(
			`${enemy.name} (${enemy.id}) — ${enemy.status} — Vida ${enemy.life}/${enemy.maxLife}`,
		);
		lines.push(
			`  Dano base ${enemy.damage} · Acerto base ${enemy.hitBonus} · Dados ${enemy.dice}`,
		);
		if (enemy.conditions.length)
			lines.push(`  Condições: ${enemy.conditions.join(", ")}`);
		for (const mod of enemy.modifiers)
			lines.push(`  Modificador: ${modifierText(mod)}`);
	}
	lines.push("", "ARTEFATOS");
	for (const artifact of snapshot.artifacts)
		lines.push(
			`${artifact.card.name} (${artifact.card.id}) — ${artifact.state} — Portador: ${artifact.carriedBy ?? "grupo"}`,
		);
	lines.push("", "BARALHOS");
	for (const deck of snapshot.decks) {
		lines.push(
			`${deck.id}: ${deck.available} restantes, ${deck.discarded.length} descartadas, ${deck.removed} removidas`,
		);
		if (deck.discarded.length)
			lines.push(
				`  Descarte: ${deck.discarded.map((card) => card.name).join(", ")}`,
			);
	}
	return lines;
}

export function exportJournalText(engine: GameEngine, journal: GameJournal): string {
	const lines = [
		`DIÁRIO DE PARTIDA — ${journal.gameId}`,
		`Versão: ${gameVersion(engine)} · Registros omitidos pelo limite: ${journal.omittedEntries}`,
		`Fase final: ${journal.current.status} · Sala: ${journal.current.room?.card.name ?? "nenhuma"}`,
		"",
		"HISTÓRICO",
	];
	for (const entry of journal.entries) {
		lines.push(
			`[${new Date(entry.timestamp).toLocaleTimeString("pt-BR")}] #${entry.sequence} ${entry.summary}`,
		);
		if (entry.interrupt)
			lines.push(
				`  Trigger ${entry.interrupt.id} · ${entry.interrupt.decision} · ${entry.interrupt.event} · continuação ${entry.interrupt.continuation}`,
			);
		for (const change of entry.changes) lines.push(`  ${change}`);
		for (const message of entry.messages) lines.push(`  Motor: ${message}`);
		if (entry.roll) {
			lines.push(
				`  Herói: [${entry.roll.heroResults.join(", ")}] + ${entry.roll.heroBreakdown.map((part) => `${part.source} ${part.value}`).join(", ")} = ${entry.roll.heroTotal}`,
			);
			lines.push(
				`  Criatura: [${entry.roll.enemyResults.join(", ")}] + ${entry.roll.enemyBreakdown.map((part) => `${part.source} ${part.value}`).join(", ")} = ${entry.roll.enemyTotal}`,
			);
		}
	}
	lines.push("", "ESTADO FINAL", ...snapshotText(journal.current));
	const errors = journal.entries.flatMap((entry) =>
		entry.messages.filter((message) => /\[(erro|aviso)\]/i.test(message)),
	);
	const findings = [...errors, ...journal.current.issues];
	lines.push(
		"",
		"ERROS E AVISOS",
		...(findings.length ? findings : ["Nenhum erro ou aviso registrado."]),
	);
	return lines.join("\n");
}
