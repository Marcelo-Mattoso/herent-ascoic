// Projeção do estado de jogo para a UI.
// Camada de tradução entre GameState (shape interno) e PlayerView (contrato estável da UI).
// Quando o shape interno mudar (ECS, effect stack), a UI continua lendo a mesma forma.
//
// Passo 9: adicionados campos pós-ECS — paused e pendingSkillChoice.

import { getCardById } from "../data/cards";
import { getCardName } from "../data/cardLocale";
import { getSkillName } from "../data/skillLocale";
import type { ModifierComponent } from "../ecs/types";
import type { PausedState } from "../effects/stack";
import { cardSkills, lookupSkillById, skillUsedBy } from "../skills/lookup";
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

// Aliases estruturais — iguais ao shape interno por enquanto.
// Mudam quando ECS entra plenamente: a projeção reconstruirá HeroView a partir de componentes.
export type HeroView = HeroState;
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

export interface PlayerView {
	readonly status: GameStatus;
	readonly mode: GameMode;
	readonly heroes: readonly HeroView[];
	readonly enemies: readonly EnemyView[];
	readonly currentRoom: RoomView | null;
	readonly combat: {
		readonly phase: CombatPhase;
		readonly selectedHeroId: string | null;
		readonly round: number;
		readonly heroesActed: readonly string[];
		readonly powersUsedThisRoom: Readonly<Record<string, boolean>>;
		readonly lastRoll: CombatRollResult | null;
		readonly pendingDiceSelection: CombatState["pendingDiceSelection"];
		readonly buffsByHero: Readonly<Record<string, readonly InfluenceView[]>>;
	} | null;
	readonly groupXp: number;
	readonly despertar: ColorIndex;
	readonly groupArtifacts: readonly GroupArtifact[];
	readonly roomsCleared: number;
	readonly creaturesDefeated: number;
	readonly bossCardName: string; // derivado de getCardById(bossCardId).name
	readonly winner: string | undefined;
	readonly paths: readonly string[];
	readonly pendingRewards: readonly PendingReward[];
	readonly eventLog: readonly string[];
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
	readonly paused: PausedState | null;
	// Escolha de skill pendente (integrada ao paused no futuro; mantida para compatibilidade).
	readonly pendingSkillChoice: {
		readonly skillId: string;
		readonly prompt: string;
		readonly options: readonly {
			readonly id: string;
			readonly label: string;
		}[];
		readonly sourceHeroId?: string;
	} | null;
}

export function playerView(state: GameState): PlayerView {
	const activeInfluences = projectActiveInfluences(state);
	const heroIds = new Set(state.heroes.map((h) => h.id));

	// buffsByHero: influências cujo alvo é um herói específico
	const buffsByHero: Record<string, InfluenceView[]> = {};
	if (state.combat) {
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
		status: state.status,
		mode: state.mode,
		heroes: state.heroes,
		enemies: state.activeEnemies,
		currentRoom: state.currentRoom,
		combat: state.combat
			? {
					phase: state.combat.phase,
					selectedHeroId: state.combat.selectedHeroId,
					round: state.combat.round,
					heroesActed: state.combat.heroesActed,
					powersUsedThisRoom: state.combat.powersUsedThisRoom,
					lastRoll: state.combat.lastRoll,
					pendingDiceSelection: state.combat.pendingDiceSelection,
					buffsByHero,
				}
			: null,
		groupXp: state.groupXp,
		despertar: state.despertar,
		groupArtifacts: state.groupArtifacts,
		roomsCleared: state.roomsCleared,
		creaturesDefeated: state.creaturesDefeated,
		bossCardName: getCardById(state.bossCardId)?.name ?? state.bossCardId,
		winner: state.winner,
		paths: state.paths,
		pendingRewards: state.pendingRewards,
		eventLog: state.eventLog,
		groupBuffs,
		decks: {
			dungeonDeck: {
				available: state.decks.dungeonDeck.available.length,
				discarded: state.decks.dungeonDeck.discarded,
			},
			enemyDeck: {
				available: state.decks.enemyDeck.available.length,
				discarded: state.decks.enemyDeck.discarded.length,
			},
			artifactDeck: {
				available: state.decks.artifactDeck.available,
				discarded: state.decks.artifactDeck.discarded.length,
			},
			itemDeck: {
				available: state.decks.itemDeck.available,
				discarded: state.decks.itemDeck.discarded.length,
			},
		},
		paused: state.paused,
		pendingSkillChoice: state.pendingSkillChoice ?? null,
		activeInfluences,
	};
}

// ── projectActiveInfluences ──────────────────────────────────────────────────

function resolveFromActor(skillId: string, state: GameState): InfluenceActor {
	const cardIds = skillUsedBy(skillId);
	for (const cardId of cardIds) {
		const card = getCardById(cardId);
		if (!card) continue;
		if (card.type === "hero") {
			const hero = state.heroes.find((h) => h.cardId === cardId);
			if (hero) return { kind: "hero", id: hero.id, name: getCardName(card.id) };
		}
		if (card.type === "creature" || card.type === "subboss") {
			const enemy = state.activeEnemies.find((e) => e.cardId === cardId);
			if (enemy) return { kind: "enemy", id: enemy.id, name: getCardName(card.id) };
		}
		if (card.type === "room" || card.type === "subboss_room") {
			if (state.currentRoom?.cardId === cardId) {
				return { kind: "room", id: cardId, name: getCardName(card.id) };
			}
		}
		if (card.type === "item" || card.type === "artifact") {
			// Passiva while_equipped — "from" é o item
			return { kind: "item", id: cardId, name: getCardName(card.id) };
		}
	}
	return { kind: "dungeon" };
}

function resolveToActor(
	entityId: string,
	entityType: string,
	state: GameState,
): InfluenceActor {
	if (entityType === "hero") {
		const hero = state.heroes.find((h) => h.id === entityId);
		if (hero) return { kind: "hero", id: hero.id, name: getCardById(hero.cardId)?.name ?? hero.cardId };
	}
	if (entityType === "enemy" || entityType === "subboss") {
		const enemy = state.activeEnemies.find((e) => e.id === entityId);
		if (enemy) return { kind: "enemy", id: enemy.id, name: getCardById(enemy.cardId)?.name ?? enemy.cardId };
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
		case "damage_dealt": return mod.value > 0 ? "⚔️" : "💀";
		case "damage_taken": return mod.value < 0 ? "🛡️" : "🩸";
		case "hit_bonus": return mod.value > 0 ? "🎯" : "🌫️";
		case "dice_count": return mod.value > 0 ? "🎲" : "🎲";
		case "healing_received": return "💚";
		default: return "✨";
	}
}

function modifierLabel(mod: ModifierComponent): string {
	const abs = Math.abs(mod.value);
	switch (mod.target) {
		case "damage_dealt": return `${mod.value > 0 ? "+" : ""}${mod.value} dano causado`;
		case "damage_taken": return mod.value < 0 ? `-${abs} dano sofrido` : `+${abs} dano sofrido`;
		case "hit_bonus": return `${mod.value > 0 ? "+" : ""}${mod.value} acerto`;
		case "dice_count": return `${mod.value > 0 ? "+" : ""}${mod.value} dado`;
		case "healing_received": return `${mod.value > 0 ? "+" : ""}${mod.value} cura`;
		default: return `${mod.value > 0 ? "+" : ""}${mod.value}`;
	}
}

function durationText(d: ModifierComponent["duration"]): string {
	switch (d.kind) {
		case "permanent": return "passivo";
		case "this_turn": return "até fim da rodada";
		case "this_combat": return "até fim do combate";
		case "once": return "próximo evento";
		case "rounds": return `${d.remaining} rodada(s)`;
	}
}

function projectActiveInfluences(state: GameState): readonly InfluenceView[] {
	const world = state.world;
	const heroIds = new Set(state.heroes.map((h) => h.id));

	// Collect all (entityId, modifier) pairs
	type ModEntry = { entityId: string; entityType: string; modifier: ModifierComponent };
	const allMods: ModEntry[] = [];
	for (const entity of Object.values(world.entities)) {
		for (const comp of entity.components) {
			if (comp.type === "modifier") {
				allMods.push({ entityId: entity.id, entityType: entity.type, modifier: comp as ModifierComponent });
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
		const skillDef = lookupSkillById(skillId);
		const sourceName = skillDef ? getSkillName(skillId) : skillId;
		const fromActor = resolveFromActor(skillId, state);

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
				const toActor = resolveToActor(entry.entityId, entry.entityType, state);
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
	if (state.flags.dungeonDiscardPrevented) {
		const ladino = state.heroes.find((h) => h.cardId === "hero_rift_rogue");
		const from: InfluenceActor = ladino
			? { kind: "hero", id: ladino.id, name: getCardById(ladino.cardId)?.name ?? ladino.cardId }
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
	if (state.flags.fleeBlocked) {
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
	if (state.flags.discardDungeonLocked) {
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
	if (state.combat) {
		const combat = state.combat;

		// Marca da Presa
		const preyEnemy = combat.prey
			? state.activeEnemies.find((e) => e.id === combat.prey)
			: null;
		if (preyEnemy) {
			const preyName = getCardById(preyEnemy.cardId)?.name ?? preyEnemy.cardId;
			for (const hero of state.heroes) {
				const heroName = getCardById(hero.cardId)?.name ?? hero.cardId;
				influences.push({
					id: `prey:${hero.id}`,
					from: { kind: "hero", id: hero.id, name: heroName },
					to: { kind: "enemy", id: preyEnemy.id, name: preyName },
					kind: "buff",
					icon: "🎯",
					label: `Marca: ${preyName}`,
					source: "Caçador",
					duration: "até matar a presa",
					scope: "hero_to_enemy",
				});
			}
		}

		for (const hero of state.heroes) {
			const id = hero.id;
			const heroName = getCardById(hero.cardId)?.name ?? hero.cardId;
			const toActor: InfluenceActor = { kind: "hero", id, name: heroName };

			// Dado extra
			const extra = combat.extraDice[id] ?? 0;
			if (extra > 0) {
				influences.push({
					id: `extra-dice:${id}`,
					from: { kind: "hero", id, name: heroName },
					to: toActor,
					kind: "buff",
					icon: "🎲",
					label: `+${extra} dado`,
					source: "Poder do herói",
					duration: "próxima rolagem",
					scope: "hero_to_self",
				});
			}

			// Eco do Necromante
			const eco = combat.ecoTokens[id] ?? 0;
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
			if (combat.targetProtectionByHero[id]) {
				influences.push({
					id: `veil:${id}`,
					from: { kind: "hero", id, name: getCardById(hero.cardId)?.name ?? hero.cardId },
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
			if (combat.fleeAttemptByHero[id]) {
				influences.push({
					id: `flee:${id}`,
					from: { kind: "hero", id, name: getCardById(hero.cardId)?.name ?? hero.cardId },
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
				const itemCard = getCardById(itemId);
				if (!itemCard) continue;
				const itemName = itemCard.name;
				for (const { def } of cardSkills(itemCard.id)) {
					if (def.trigger !== "while_equipped") continue;
					influences.push({
						id: `equipped:${itemId}:${def.id}`,
						from: { kind: "item", id: itemCard.id, name: itemName },
						to: toActor,
						kind: "buff",
						icon: "🔮",
						label: getSkillName(def.id),
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
