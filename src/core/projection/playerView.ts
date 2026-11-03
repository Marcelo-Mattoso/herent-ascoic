import { projectAbilityActionsForHero, type AbilityActionView } from "./abilityActions";


import { type HeroInventoryView, projectHeroInventory } from "./inventoryView";
import { projectSkillChoice } from "./skillChoiceView";
import type { TargetCandidate } from "../data/skillTypes";
import type { ModifierComponent } from "../ecs/types";
import type { ChoiceOption, PauseReason, PendingEffect } from "../effects/stack";

import type { ColorIndex } from "../state/color";
import type {
	CombatPhase,
	CombatRollResult,
	CombatState,
} from "../state/combatState";
import type { EnemyState } from "../state/enemyState";
import type {
	Difficulty,
	GameMode,
	GameState,
	GroupArtifact,
	PendingReward,
} from "../state/gameState";

// Re-exporta tipos de configuração usados pela UI (ex: Setup.tsx)
export type { Difficulty, GameMode };

import type { HeroState } from "../state/heroState";
import type { RoomState } from "../state/roomState";
import type { GameStatus } from "../state/status";
import type { PendingTriggerInterrupt } from "../triggers/engine";
import { cardById, cardName, skillById, skillName, skillOwners, skillsOf } from "../gameEngine";
import type { GameEngine } from "../gameEngine";

import type { PausedState } from "../effects/stack";
import { pileCards, pileCount } from "./zoneView";
import { scopedCountOf, scopedFlagOf, awakeningOf, countersOf, enemiesOf, heroesOf, impetoOf, powerUsedThisRoom, worldOf, pausedOf, pendingSkillTargetOf, pendingTriggerInterruptOf } from "../state/access";
import { gameOf } from "../../engine/state";
// Aliases estruturais — iguais ao shape interno por enquanto.
// Mudam quando ECS entra plenamente: a projeção reconstruirá HeroView a partir de componentes.
export type HeroView = HeroState & { readonly impeto: ColorIndex; readonly eco: number };

const heroViewCache = new WeakMap<
	readonly HeroState[],
	{ counters: unknown; views: readonly HeroView[] }
>();

function heroViews(state: GameState): readonly HeroView[] {
	const heroes = heroesOf(state);
	const cached = heroViewCache.get(heroes);
	if (cached && cached.counters === countersOf(state)) return cached.views;
	const views = heroes.map((hero) => ({
		...hero,
		impeto: impetoOf(state, hero.id),
		eco: scopedCountOf(state, "game", "eco", hero.id),
	}));
	heroViewCache.set(heroes, { counters: countersOf(state), views });
	return views;
}
export type EnemyView = EnemyState;
export type RoomView = RoomState;

// ── Influências Ativas ────────────────────────────────────────────────────────
// Grafo completo de "quem está fazendo efeito sobre quem" no estado atual.
// Cada ModifierComponent no world é uma influência.

export type InfluenceActor =
	| { kind: "hero"; id: string; name: string }
	| { kind: "enemy"; id: string; name: string }
	| { kind: "room"; id: string; name: string }
	| { kind: "item"; id: string; name: string }
	| { kind: "group" }
	| { kind: "dungeon" }
	| { kind: "self"; id: string; name: string };

export type InfluenceScope =
	| "room_to_group"
	| "room_to_hero"
	| "hero_to_dungeon"
	| "hero_to_group"
	| "hero_to_self"
	| "hero_to_enemy"
	| "enemy_to_hero"
	| "enemy_to_group"
	| "dungeon_to_group"
	| "item_to_hero"
	| "unknown";

export interface InfluenceView {
	readonly id: string;
	readonly from: InfluenceActor;
	readonly to: InfluenceActor;
	readonly kind: "buff" | "debuff" | "neutral";
	readonly icon: string;
	readonly label: string;
	readonly source: string;
	readonly duration: string;
	readonly scope: InfluenceScope;
}

export type SkillChoiceView = NonNullable<
	ReturnType<typeof projectSkillChoice>
>;

export interface PausedView {
	readonly reason: PauseReason;
	readonly options: readonly ChoiceOption[];
	readonly resumeFrom: PendingEffect;
}

function pausedViewOf(paused: PausedState | null): PausedView | null {
	if (!paused) return null;
	const labels = (paused.choice.data as { labels?: Record<string, string> } | undefined)?.labels;
	return {
		reason: paused.choice.id,
		options: paused.choice.options.map((id) => ({ id, label: labels?.[id] ?? id })),
		resumeFrom: paused.resumeFrom,
	};
}

export interface PlayerView {
	readonly status: GameStatus;
	readonly mode: GameMode;
	readonly difficulty: Difficulty;
	readonly heroes: readonly HeroView[];
	readonly inventoryByHero: Readonly<Record<string, HeroInventoryView>>;
	readonly abilityActionsByHero: Readonly<Record<string, readonly AbilityActionView[]>>;
	readonly enemies: readonly EnemyView[];
	readonly currentRoom: RoomView | null;
	readonly combat: {
		readonly phase: CombatPhase;
		readonly selectedHeroId: string | null;
		readonly round: number;
		readonly heroesActed: readonly string[];
		readonly powersUsedThisRoom: Readonly<Record<string, boolean>>;
		readonly lastRoll: CombatRollResult | null;
		readonly pendingPhysicalRoll?: CombatState["pendingPhysicalRoll"];
		readonly extraEnemiesRemaining?: CombatState["extraEnemiesRemaining"];
		readonly pendingDiceSelection: CombatState["pendingDiceSelection"];
		readonly buffsByHero: Readonly<Record<string, readonly InfluenceView[]>>;
	} | null;
	readonly groupXp: number;
	readonly despertar: ColorIndex;
	readonly groupArtifacts: readonly GroupArtifact[];
	readonly roomsCleared: number;
	readonly creaturesDefeated: number;
	readonly bossCardId: string;
	readonly bossCardName: string; // derivado de cardById(engine, bossCardId).name
	readonly winner: string | undefined;
	readonly paths: readonly string[];
	readonly pendingRewards: readonly PendingReward[];
	readonly eventLog: readonly string[];
	readonly alphaLog: readonly string[];
	readonly damageFeedback: NonNullable<import("../state/gameState").AscensaoGame["damageFeedback"]>;
	readonly healFeedback: NonNullable<import("../state/gameState").AscensaoGame["healFeedback"]>;
	readonly extraAttackFeedback: NonNullable<import("../state/gameState").AscensaoGame["extraAttackFeedback"]>;
	// Efeitos que afetam o grupo todo (recursos compartilhados: deck, fuga, sala).
	// Vivem aqui — não duplicados nas BuffBars dos heróis.
	readonly groupBuffs: readonly InfluenceView[];
	readonly activeInfluences: readonly InfluenceView[];
	readonly decks: {
		readonly dungeonDeck: {
			readonly available: number;
			readonly discarded: readonly string[];
		};
		readonly enemyDeck: {
			readonly available: number;
			readonly discarded: number;
		};
		readonly artifactDeck: {
			readonly available: readonly string[];
			readonly discarded: number;
		};
		readonly itemDeck: {
			readonly available: readonly string[];
			readonly discarded: number;
		};
	};
	// Passo 8: estado de pausa para input do jogador durante resolução de efeitos.
	readonly paused: PausedView | null;
	// Escolha de skill pendente (integrada ao paused no futuro; mantida para compatibilidade).
	readonly pendingSkillChoice: SkillChoiceView | null;
	readonly pendingSkillTarget: {
		readonly skillId: string;
		readonly sourceId: string;
		readonly prompt: string;
		readonly candidates: readonly TargetCandidate[];
	} | null;
	readonly pendingTriggerInterrupt: PendingTriggerInterrupt | null;
}

export function playerView(engine: GameEngine, state: GameState): PlayerView {
	const activeInfluences = projectActiveInfluences(engine, state);
	const heroIds = new Set(heroesOf(state).map((h) => h.id));

	// buffsByHero: influências cujo alvo é um herói específico
	const buffsByHero: Record<string, InfluenceView[]> = {};
	if (gameOf(state).combat) {
		for (const inf of activeInfluences) {
			if (inf.to.kind === "hero" && heroIds.has(inf.to.id)) {
				if (!buffsByHero[inf.to.id]) buffsByHero[inf.to.id] = [];
				buffsByHero[inf.to.id].push(inf);
			}
		}
	}

	// groupBuffs: influências cujo alvo é o grupo ou dungeon
	const groupBuffs = activeInfluences.filter(
		(i) => i.to.kind === "group" || i.to.kind === "dungeon",
	);

	return {
		status: gameOf(state).status,
		mode: gameOf(state).mode,
		difficulty: gameOf(state).difficulty,
		heroes: heroViews(state),
		inventoryByHero: Object.fromEntries(
			heroesOf(state).map((hero) => [hero.id, projectHeroInventory(engine, state, hero)]),
		),
		abilityActionsByHero: Object.fromEntries(heroesOf(state).map((hero) => [
			hero.id, projectAbilityActionsForHero(engine, state, hero.id),
		])),
		enemies: enemiesOf(state),
		currentRoom: gameOf(state).currentRoom,
		combat: gameOf(state).combat
			? {
					phase: gameOf(state).combat!.phase,
					selectedHeroId: gameOf(state).combat!.selectedHeroId,
					round: gameOf(state).combat!.round,
					heroesActed: gameOf(state).combat!.heroesActed,
					powersUsedThisRoom: Object.fromEntries(
						heroesOf(state)
							.filter((hero) => powerUsedThisRoom(state, hero.id))
							.map((hero) => [hero.id, true]),
					),
					lastRoll: gameOf(state).combat!.lastRoll,
					...(gameOf(state).combat!.pendingPhysicalRoll
						? { pendingPhysicalRoll: gameOf(state).combat!.pendingPhysicalRoll }
						: {}),
					...(gameOf(state).combat!.extraEnemiesRemaining
						? { extraEnemiesRemaining: gameOf(state).combat!.extraEnemiesRemaining }
						: {}),
					pendingDiceSelection: gameOf(state).combat!.pendingDiceSelection,
					buffsByHero,
				}
			: null,
		groupXp: gameOf(state).groupXp,
		despertar: awakeningOf(state),
		groupArtifacts: gameOf(state).groupArtifacts,
		roomsCleared: gameOf(state).roomsCleared,
		creaturesDefeated: gameOf(state).creaturesDefeated,
		bossCardId: gameOf(state).bossCardId,
		bossCardName: cardName(engine, gameOf(state).bossCardId),
		winner: gameOf(state).winner,
		paths: gameOf(state).paths,
		pendingRewards: gameOf(state).pendingRewards,
		eventLog: gameOf(state).eventLog,
		alphaLog: gameOf(state).alphaLog ?? [],
		damageFeedback: gameOf(state).damageFeedback ?? [],
		healFeedback: gameOf(state).healFeedback ?? [],
		extraAttackFeedback: gameOf(state).extraAttackFeedback ?? [],
		groupBuffs,
		decks: {
			dungeonDeck: {
				available: pileCount(state, "dungeonDeck", "available"),
				discarded: pileCards(state, "dungeonDeck", "discarded"),
			},
			enemyDeck: {
				available: pileCount(state, "enemyDeck", "available"),
				discarded: pileCount(state, "enemyDeck", "discarded"),
			},
			artifactDeck: {
				available: pileCards(state, "artifactDeck", "available"),
				discarded: pileCount(state, "artifactDeck", "discarded"),
			},
			itemDeck: {
				available: pileCards(state, "itemDeck", "available"),
				discarded: pileCount(state, "itemDeck", "discarded"),
			},
		},
		paused: pausedViewOf(pausedOf(state)),
		pendingSkillChoice: projectSkillChoice(engine, state),
		pendingSkillTarget: pendingSkillTargetOf(state) ?? null,
		pendingTriggerInterrupt: pendingTriggerInterruptOf(state) ?? null,
		activeInfluences,
	};
}

// ── projectActiveInfluences ──────────────────────────────────────────────────

function resolveFromActor(engine: GameEngine, skillId: string, state: GameState): InfluenceActor {
	const cardIds = skillOwners(engine, skillId);
	for (const cardId of cardIds) {
		const card = cardById(engine, cardId);
		if (!card) continue;
		if (card.type === "hero") {
			const hero = heroesOf(state).find((h) => h.cardId === cardId);
			if (hero)
				return { kind: "hero", id: hero.id, name: cardName(engine, card.id) };
		}
		if (card.type === "creature" || card.type === "subboss") {
			const enemy = enemiesOf(state).find((e) => e.cardId === cardId);
			if (enemy)
				return { kind: "enemy", id: enemy.id, name: cardName(engine, card.id) };
		}
		if (card.type === "room" || card.type === "subboss_room") {
			if (gameOf(state).currentRoom?.cardId === cardId) {
				return { kind: "room", id: cardId, name: cardName(engine, card.id) };
			}
		}
		if (card.type === "item" || card.type === "artifact") {
			// Passiva while_equipped — "from" é o item
			return { kind: "item", id: cardId, name: cardName(engine, card.id) };
		}
	}
	return { kind: "dungeon" };
}

function resolveToActor(engine: GameEngine, 
	entityId: string,
	entityType: string,
	state: GameState,
): InfluenceActor {
	if (entityType === "hero") {
		const hero = heroesOf(state).find((h) => h.id === entityId);
		if (hero)
			return {
				kind: "hero",
				id: hero.id,
				name: cardName(engine, hero.cardId),
			};
	}
	if (entityType === "enemy" || entityType === "subboss") {
		const enemy = enemiesOf(state).find((e) => e.id === entityId);
		if (enemy)
			return {
				kind: "enemy",
				id: enemy.id,
				name: cardName(engine, enemy.cardId),
			};
	}
	if (entityType === "room") {
		return { kind: "dungeon" };
	}
	return { kind: "dungeon" };
}

function deriveScope(from: InfluenceActor, to: InfluenceActor): InfluenceScope {
	const f = from.kind;
	const t = to.kind;
	if (f === "item" && t === "hero") return "item_to_hero";
	if (f === "hero" && t === "group") return "hero_to_group";
	if (f === "hero" && t === "dungeon") return "hero_to_dungeon";
	if (f === "hero" && t === "hero") return "hero_to_self";
	if (f === "hero" && t === "enemy") return "hero_to_enemy";
	if (f === "enemy" && t === "hero") return "enemy_to_hero";
	if (f === "enemy" && t === "group") return "enemy_to_group";
	if (f === "room" && t === "hero") return "room_to_hero";
	if (f === "room" && t === "group") return "room_to_group";
	if (f === "dungeon" && t === "group") return "dungeon_to_group";
	return "unknown";
}

function modifierKind(mod: ModifierComponent): "buff" | "debuff" | "neutral" {
	const positive =
		mod.target === "damage_dealt" ||
		mod.target === "hit_bonus" ||
		mod.target === "healing_received" ||
		mod.target === "dice_count";
	if (positive) return mod.value > 0 ? "buff" : "debuff";
	// damage_taken: negativo = reduz dano = buff; positivo = debuff
	if (mod.target === "damage_taken") return mod.value < 0 ? "buff" : "debuff";
	return "neutral";
}

function modifierIcon(mod: ModifierComponent): string {
	switch (mod.target) {
		case "damage_dealt":
			return mod.value > 0 ? "⚔️" : "💀";
		case "damage_taken":
			return mod.value < 0 ? "🛡️" : "🩸";
		case "hit_bonus":
			return mod.value > 0 ? "🎯" : "🌫️";
		case "dice_count":
			return mod.value > 0 ? "🎲" : "🎲";
		case "healing_received":
			return "💚";
		default:
			return "✨";
	}
}

function modifierLabel(mod: ModifierComponent): string {
	const abs = Math.abs(mod.value);
	switch (mod.target) {
		case "damage_dealt":
			return `${mod.value > 0 ? "+" : ""}${mod.value} dano causado`;
		case "damage_taken":
			return mod.value < 0 ? `-${abs} dano sofrido` : `+${abs} dano sofrido`;
		case "hit_bonus":
			return `${mod.value > 0 ? "+" : ""}${mod.value} acerto`;
		case "dice_count":
			return `${mod.value > 0 ? "+" : ""}${mod.value} dado`;
		case "healing_received":
			return `${mod.value > 0 ? "+" : ""}${mod.value} cura`;
		default:
			return `${mod.value > 0 ? "+" : ""}${mod.value}`;
	}
}

function durationText(d: ModifierComponent["duration"]): string {
	switch (d.kind) {
		case "permanent":
			return "passivo";
		case "this_turn":
			return "até fim da rodada";
		case "this_combat":
			return "até fim do combate";
		case "once":
			return "próximo evento";
		case "rounds":
			return `${d.remaining} rodada(s)`;
	}
	return "temporário";
}

function projectActiveInfluences(engine: GameEngine, state: GameState): readonly InfluenceView[] {
	const world = worldOf(state);
	const heroIds = new Set(heroesOf(state).map((h) => h.id));

	// Collect all (entityId, modifier) pairs
	type ModEntry = {
		entityId: string;
		entityType: string;
		modifier: ModifierComponent;
	};
	const allMods: ModEntry[] = [];
	for (const entity of Object.values(world.entities)) {
		for (const comp of entity.components) {
			if (comp.type === "modifier") {
				allMods.push({
					entityId: entity.id,
					entityType: entity.type,
					modifier: comp as ModifierComponent,
				});
			}
		}
	}

	// Group by (source, target, value, operation) to detect group fan-out
	const grouped = new Map<string, ModEntry[]>();
	for (const entry of allMods) {
		const m = entry.modifier;
		const key = `${m.source}:${m.target}:${m.value}:${m.operation}`;
		const arr = grouped.get(key);
		if (arr) arr.push(entry);
		else grouped.set(key, [entry]);
	}

	const influences: InfluenceView[] = [];

	for (const [key, entries] of grouped) {
		const first = entries[0];
		const mod = first.modifier;
		const skillId = mod.source;
		const skillDef = skillById(engine, skillId);
		const sourceName = skillDef ? skillName(engine, skillId) : skillId;
		const fromActor = resolveFromActor(engine, skillId, state);

		// Fan-out: all targets are heroes and covers all (or most) heroes → collapse to group
		const targetIds = entries.map((e) => e.entityId);
		const allTargetHeroes = targetIds.every((id) => heroIds.has(id));
		const coversGroup = allTargetHeroes && entries.length > 1;

		if (coversGroup) {
			const toActor: InfluenceActor = { kind: "group" };
			influences.push({
				id: `${key}:group`,
				from: fromActor,
				to: toActor,
				kind: modifierKind(mod),
				icon: modifierIcon(mod),
				label: modifierLabel(mod),
				source: sourceName,
				duration: durationText(mod.duration),
				scope: deriveScope(fromActor, toActor),
			});
		} else {
			for (let i = 0; i < entries.length; i++) {
				const entry = entries[i];
				const toActor = resolveToActor(engine, entry.entityId, entry.entityType, state);
				influences.push({
					id: `${key}:${entry.entityId}:${i}`,
					from: fromActor,
					to: toActor,
					kind: modifierKind(mod),
					icon: modifierIcon(mod),
					label: modifierLabel(mod),
					source: sourceName,
					duration: durationText(mod.duration),
					scope: deriveScope(fromActor, toActor),
				});
			}
		}
	}

	// ── Efeitos de estado legacy (combat + flags) ───────────────────────────

	// Flags globais → influências dungeon/group
	if (gameOf(state).flags.dungeonDiscardPrevented) {
		const ladino = heroesOf(state).find((h) => {
			const card = cardById(engine, h.cardId);
			return card?.type === "hero" && card.preservesDungeonDiscard === true;
		});
		const from: InfluenceActor = ladino
			? {
					kind: "hero",
					id: ladino.id,
					name: cardName(engine, ladino.cardId),
				}
			: { kind: "dungeon" };
		influences.push({
			id: "flag:dungeon-discard-prevented",
			from,
			to: { kind: "dungeon" },
			kind: "buff",
			icon: "🗝️",
			label: "Caminho Preservado",
			source: "Ladino das Fendas",
			duration: "até próximo uso",
			scope: "hero_to_dungeon",
		});
	}
	if (gameOf(state).flags.fleeBlocked) {
		influences.push({
			id: "flag:flee-blocked",
			from: { kind: "dungeon" },
			to: { kind: "group" },
			kind: "debuff",
			icon: "🚷",
			label: "Fuga bloqueada",
			source: "Efeito de sala/inimigo",
			duration: "até fim da sala",
			scope: "dungeon_to_group",
		});
	}
	if (gameOf(state).flags.discardDungeonLocked) {
		influences.push({
			id: "flag:discard-dungeon-locked",
			from: { kind: "dungeon" },
			to: { kind: "group" },
			kind: "neutral",
			icon: "🔒",
			label: "Descartes trancados",
			source: "Efeito de sala",
			duration: "até fim da sala",
			scope: "dungeon_to_group",
		});
	}

	// Efeitos de combate legacy (não migrados para ECS world ainda)
	if (gameOf(state).combat) {
		const combat = gameOf(state).combat;

		// Marca da Presa
		for (const [heroId, preyId] of Object.entries(combat!.preyByHero)) {
			const hero = heroesOf(state).find((entry) => entry.id === heroId);
			const preyEnemy = enemiesOf(state).find((entry) => entry.id === preyId);
			if (!hero || !preyEnemy) continue;
			influences.push({
				id: `prey:${hero.id}`,
				from: { kind: "hero", id: hero.id, name: cardName(engine, hero.cardId) },
				to: { kind: "enemy", id: preyEnemy.id, name: cardName(engine, preyEnemy.cardId) },
				kind: "buff",
				icon: "🎯",
				label: `Marca: ${cardName(engine, preyEnemy.cardId)}`,
				source: "Caçador",
				duration: "até matar a presa",
				scope: "hero_to_enemy",
			});
		}

		for (const hero of heroesOf(state)) {
			const id = hero.id;
			const heroName = cardName(engine, hero.cardId);
			const toActor: InfluenceActor = { kind: "hero", id, name: heroName };

			// Eco do Necromante
			const eco = scopedCountOf(state, "game", "eco", id);
			if (eco > 0) {
				influences.push({
					id: `eco:${id}`,
					from: { kind: "hero", id, name: heroName },
					to: toActor,
					kind: "buff",
					icon: "👻",
					label: "Eco",
					source: "Necromante",
					duration: "token disponível",
					scope: "hero_to_self",
				});
			}

			// Véu Protetor
			if (scopedFlagOf(state, "combat", "targetProtection", id)) {
				influences.push({
					id: `veil:${id}`,
					from: {
						kind: "hero",
						id,
						name: cardName(engine, hero.cardId),
					},
					to: toActor,
					kind: "buff",
					icon: "✨",
					label: "Véu Protetor",
					source: "Véu Protetor",
					duration: "próximo efeito direcionado",
					scope: "hero_to_self",
				});
			}

			// Fuga declarada
			if (scopedFlagOf(state, "combat", "fleeAttempt", id)) {
				influences.push({
					id: `flee:${id}`,
					from: {
						kind: "hero",
						id,
						name: cardName(engine, hero.cardId),
					},
					to: toActor,
					kind: "neutral",
					icon: "🏃",
					label: "Fuga declarada",
					source: "Decisão do jogador",
					duration: "próximo confronto",
					scope: "hero_to_self",
				});
			}

			// Passivas while_equipped sem modifier ECS (chip visual de item equipado)
			const equippedItems = Object.values(hero.activeItems).filter(
				(id): id is string => typeof id === "string" && id.length > 0,
			);
			for (const itemId of equippedItems) {
				const itemCard = cardById(engine, itemId);
				if (!itemCard) continue;
				const itemName = cardName(engine, itemCard.id);
				for (const { def } of skillsOf(engine, itemCard.id)) {
					if (def.operate_type !== "op_passive") continue;
					influences.push({
						id: `equipped:${itemId}:${def.id}`,
						from: { kind: "item", id: itemCard.id, name: itemName },
						to: toActor,
						kind: "buff",
						icon: "🔮",
						label: skillName(engine, def.id),
						source: itemName,
						duration: "passivo",
						scope: "item_to_hero",
					});
				}
			}
		}
	}

	return influences;
}
