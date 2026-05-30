// Installer de TriggerComponents para habilidades reativas.
// Patch-18 Lote F: converte trigger strings do skills.json em TriggerComponents no world.
//
// Princípio: skills.json não muda — a complexidade fica aqui.
// isManuallyActivatable → fireOnUseSkill (mantido, não é legacy).
// isPassive → installPassive (while_*, room_passive).
// Demais → TRIGGER_TO_INSTALL.

import type { SkillDefinition } from "../data/skillTypes";
import type { SkillRef } from "../data/cardTypes";
import { isManuallyActivatable } from "../skills/useSkill";
import type {
	ComponentPredicate,
	Duration,
	EffectDescriptor,
	EntityId,
	TriggerComponent,
} from "./types";
import { addComponent, type World } from "./world";
import type { GameEvent } from "../events/types";
import type { Entity } from "./types";

// ── Tipos internos ─────────────────────────────────────────────────────────────

interface InstallResult {
	readonly on: string;
	readonly condition?: ComponentPredicate;
	readonly duration: Duration;
	readonly priority: number;
	readonly consumeAfterFire?: { readonly scope: "game" | "room" | "round" };
}

type InstallFn = (def: SkillDefinition, entityId: EntityId) => InstallResult | InstallResult[];

// ── Helpers de condição ────────────────────────────────────────────────────────

function isBossOrSubboss(enemyId: string): boolean {
	return enemyId.includes("boss") || enemyId.includes("subboss");
}

function conditionSelf(entityId: EntityId): ComponentPredicate {
	return (e: Entity) => e.id === entityId;
}

function conditionHeroIsEntity(entityId: EntityId): ComponentPredicate {
	return (_e: Entity, ev?: GameEvent) => {
		if (!ev) return false;
		const p = ev.payload as Record<string, unknown>;
		return (p["heroId"] as string | undefined) === entityId;
	};
}

function conditionEnemyIsEntity(entityId: EntityId): ComponentPredicate {
	return (_e: Entity, ev?: GameEvent) => {
		if (!ev) return false;
		const p = ev.payload as Record<string, unknown>;
		return (p["enemyId"] as string | undefined) === entityId;
	};
}

// ── Tabela de instalação ───────────────────────────────────────────────────────

const TRIGGER_TO_INSTALL: Record<string, InstallFn> = {
	// ── Reativos de combate (RollAboutToHappen) ────────────────────────────────

	before_attack: (_def, entityId) => ({
		on: "RollAboutToHappen",
		condition: conditionHeroIsEntity(entityId),
		duration: { kind: "this_combat" },
		priority: 0,
	}),

	combat: (_def, entityId) => ({
		on: "RollAboutToHappen",
		condition: conditionHeroIsEntity(entityId),
		duration: { kind: "this_combat" },
		priority: 0,
	}),

	combat_vs_boss_or_subboss: (_def, entityId) => ({
		on: "RollAboutToHappen",
		condition: (_e: Entity, ev?: GameEvent) => {
			if (!ev) return false;
			const p = ev.payload as Record<string, unknown>;
			const heroId = p["heroId"] as string | undefined;
			const enemyId = p["enemyId"] as string | undefined;
			return heroId === entityId && !!enemyId && isBossOrSubboss(enemyId);
		},
		duration: { kind: "this_combat" },
		priority: 0,
	}),

	combat_if_alone_in_room: (_def, entityId) => ({
		on: "RollAboutToHappen",
		condition: (_e: Entity, ev?: GameEvent, world?: import("./world").World) => {
			if (!ev) return false;
			const p = ev.payload as Record<string, unknown>;
			if ((p["heroId"] as string) !== entityId) return false;
			if (!world) return true;
			const activeCount = Object.values(world.entities).filter(
				(e) => (e.type === "enemy" || e.type === "subboss") &&
					e.components.some((c) => c.type === "health" && (c as import("./types").HealthComponent).current > 0),
			).length;
			return activeCount === 1;
		},
		duration: { kind: "this_combat" },
		priority: 0,
	}),

	combat_if_another_creature_in_room: (_def, entityId) => ({
		on: "RollAboutToHappen",
		condition: (_e: Entity, ev?: GameEvent, world?: import("./world").World) => {
			if (!ev) return false;
			const p = ev.payload as Record<string, unknown>;
			if ((p["heroId"] as string) !== entityId) return false;
			if (!world) return false;
			const activeCount = Object.values(world.entities).filter(
				(e) => (e.type === "enemy" || e.type === "subboss") &&
					e.components.some((c) => c.type === "health" && (c as import("./types").HealthComponent).current > 0),
			).length;
			return activeCount > 1;
		},
		duration: { kind: "this_combat" },
		priority: 0,
	}),

	combat_if_dungeon_red_or_purple: (_def, entityId) => ({
		on: "RollAboutToHappen",
		condition: (_e: Entity, ev?: GameEvent) => {
			if (!ev) return false;
			const p = ev.payload as Record<string, unknown>;
			// despertar não está no payload; a condição é checada pelo emissor (já filtra no reducer)
			return (p["heroId"] as string) === entityId || (p["enemyId"] as string) === entityId;
		},
		duration: { kind: "this_combat" },
		priority: 0,
	}),

	when_half_life_or_less: (def, entityId) => ({
		on: "RollAboutToHappen",
		condition: conditionEnemyIsEntity(entityId),
		duration: { kind: "this_combat" },
		priority: 0,
	}),

	combat_and_on_damage_dealt: (_def, entityId) => [
		{ on: "RollAboutToHappen", condition: conditionHeroIsEntity(entityId), duration: { kind: "this_combat" }, priority: 0 },
		{ on: "DamageDealt", condition: (_e: Entity, ev?: GameEvent) => {
			if (!ev) return false;
			const p = ev.payload as Record<string, unknown>;
			return (p["sourceId"] as string) === entityId;
		}, duration: { kind: "this_combat" }, priority: 0 },
	],

	// ── Pós-rolagem ────────────────────────────────────────────────────────────

	after_roll: (_def, entityId) => ({
		on: "RollResolved",
		condition: conditionHeroIsEntity(entityId),
		duration: { kind: "this_combat" },
		priority: 0,
	}),

	// ── Dano / alvo ────────────────────────────────────────────────────────────

	on_damage_taken: (_def, entityId) => ({
		on: "DamageAboutToBeDealt",
		condition: (_e: Entity, ev?: GameEvent) => {
			if (!ev) return false;
			const p = ev.payload as Record<string, unknown>;
			return (p["targetId"] as string) === entityId;
		},
		duration: { kind: "this_combat" },
		priority: 0,
	}),

	on_take_damage: (_def, entityId) => ({
		on: "DamageDealt",
		condition: (_e: Entity, ev?: GameEvent) => {
			if (!ev) return false;
			const p = ev.payload as Record<string, unknown>;
			return (p["targetId"] as string) === entityId;
		},
		duration: { kind: "this_combat" },
		priority: 0,
	}),

	on_take_attack_damage: (_def, entityId) => ({
		on: "DamageDealt",
		condition: (_e: Entity, ev?: GameEvent) => {
			if (!ev) return false;
			const p = ev.payload as Record<string, unknown>;
			return (p["targetId"] as string) === entityId && p["damageType"] === "attack";
		},
		duration: { kind: "this_combat" },
		priority: 0,
	}),

	on_hit_received: (_def, entityId) => ({
		on: "DamageDealt",
		condition: (_e: Entity, ev?: GameEvent) => {
			if (!ev) return false;
			const p = ev.payload as Record<string, unknown>;
			return (p["targetId"] as string) === entityId;
		},
		duration: { kind: "this_combat" },
		priority: 0,
	}),

	on_deal_damage: (_def, entityId) => ({
		on: "DamageDealt",
		condition: (_e: Entity, ev?: GameEvent) => {
			if (!ev) return false;
			const p = ev.payload as Record<string, unknown>;
			return (p["sourceId"] as string) === entityId;
		},
		duration: { kind: "this_combat" },
		priority: 0,
	}),

	on_purple_effect_damage_taken: (_def, entityId) => ({
		on: "DamageDealt",
		condition: (_e: Entity, ev?: GameEvent) => {
			if (!ev) return false;
			const p = ev.payload as Record<string, unknown>;
			return (p["targetId"] as string) === entityId && p["damageType"] === "purple";
		},
		duration: { kind: "this_combat" },
		priority: 0,
	}),

	first_damage_each_round: (_def, entityId) => ({
		on: "DamageDealt",
		condition: (_e: Entity, ev?: GameEvent) => {
			if (!ev) return false;
			const p = ev.payload as Record<string, unknown>;
			return (p["targetId"] as string) === entityId;
		},
		duration: { kind: "this_combat" },
		priority: 0,
	}),

	// ── Destruição / derrota ───────────────────────────────────────────────────

	on_destroyed: (def, entityId) => ({
		on: "EnemyDestroyed",
		condition: conditionEnemyIsEntity(entityId),
		duration: { kind: "this_combat" },
		priority: 0,
	}),

	on_destroy_creature_with_attack: (_def, entityId) => ({
		on: "EnemyDestroyed",
		condition: (_e: Entity, ev?: GameEvent) => {
			if (!ev) return false;
			const p = ev.payload as Record<string, unknown>;
			return (p["sourceId"] as string) === entityId;
		},
		duration: { kind: "this_combat" },
		priority: 0,
	}),

	on_first_creature_destroyed_in_room: (_def, _entityId) => ({
		on: "EnemyDestroyed",
		condition: (_e: Entity, ev?: GameEvent) => {
			if (!ev) return false;
			const p = ev.payload as Record<string, unknown>;
			return !!(p["roomFirstKill"] as boolean);
		},
		duration: { kind: "this_combat" },
		priority: 0,
	}),

	// ── Alvo / proteção ────────────────────────────────────────────────────────

	on_first_targeted: (_def, entityId) => ({
		on: "HeroTargeted",
		condition: (_e: Entity, ev?: GameEvent) => {
			if (!ev) return false;
			const p = ev.payload as Record<string, unknown>;
			return (p["heroId"] as string) === entityId && !!(p["roomFirstTime"] as boolean);
		},
		duration: { kind: "this_combat" },
		priority: 0,
	}),

	on_first_target_chosen_in_room: (_def, _entityId) => ({
		on: "TargetChosen",
		condition: (_e: Entity, ev?: GameEvent) => {
			if (!ev) return false;
			const p = ev.payload as Record<string, unknown>;
			return !!(p["roomFirstTime"] as boolean);
		},
		duration: { kind: "permanent" },
		priority: 0,
	}),

	on_first_target_chosen_by_creature: (_def, _entityId) => ({
		on: "TargetChosen",
		condition: (_e: Entity, ev?: GameEvent) => {
			if (!ev) return false;
			const p = ev.payload as Record<string, unknown>;
			return !!(p["roomFirstTime"] as boolean) && p["sourceType"] === "enemy";
		},
		duration: { kind: "permanent" },
		priority: 0,
	}),

	// ── Combate — início ────────────────────────────────────────────────────────

	start_of_combat: (_def, _entityId) => ({
		on: "CombatStarted",
		duration: { kind: "this_combat" },
		priority: 0,
	}),

	on_enter_combat: (_def, _entityId) => ({
		on: "CombatStarted",
		duration: { kind: "this_combat" },
		priority: 0,
	}),

	before_combat: (_def, _entityId) => ({
		on: "CombatStarted",
		duration: { kind: "this_combat" },
		priority: 0,
	}),

	before_first_combat_in_room: (_def, _entityId) => ({
		on: "CombatStarted",
		// first combat: flagged via state; sem world/state no predicate usamos approximação
		duration: { kind: "this_combat" },
		consumeAfterFire: { scope: "room" },
		priority: 0,
	}),

	// ── Combate — rodadas ────────────────────────────────────────────────────────

	first_round_in_room: (_def, _entityId) => ({
		on: "RoundStarted",
		condition: (_e: Entity, ev?: GameEvent) => {
			if (!ev) return false;
			const p = ev.payload as Record<string, unknown>;
			return (p["round"] as number) === 1;
		},
		duration: { kind: "this_combat" },
		priority: 0,
	}),

	after_each_combat_round_if_purple: (_def, _entityId) => ({
		on: "RoundEnded",
		// despertar >= 3: verificado pelo emissor no reducer (só emite quando ativo)
		duration: { kind: "this_combat" },
		priority: 0,
	}),

	first_roll_in_room: (_def, entityId) => ({
		on: "RollAboutToHappen",
		condition: conditionHeroIsEntity(entityId),
		duration: { kind: "this_combat" },
		consumeAfterFire: { scope: "room" },
		priority: 0,
	}),

	first_hero_lose_combat_in_room: (_def, entityId) => ({
		on: "HeroLostCombat",
		condition: (_e: Entity, ev?: GameEvent) => {
			if (!ev) return false;
			const p = ev.payload as Record<string, unknown>;
			return (p["heroId"] as string) === entityId && !!(p["roomFirstTime"] as boolean);
		},
		duration: { kind: "permanent" },
		consumeAfterFire: { scope: "room" },
		priority: 0,
	}),

	on_hero_lose_combat_in_room: (_def, entityId) => ({
		on: "HeroLostCombat",
		condition: (_e: Entity, ev?: GameEvent) => {
			if (!ev) return false;
			const p = ev.payload as Record<string, unknown>;
			return (p["heroId"] as string) === entityId;
		},
		duration: { kind: "permanent" },
		priority: 0,
	}),

	// ── Exploração ─────────────────────────────────────────────────────────────

	on_enter_room: (_def, _entityId) => ({
		on: "RoomEntered",
		duration: { kind: "permanent" },
		priority: 0,
	}),

	on_room_reveal: (_def, _entityId) => ({
		on: "RoomEntered",
		duration: { kind: "permanent" },
		priority: 0,
	}),

	on_enter_play: (_def, _entityId) => ({
		on: "CombatStarted",
		duration: { kind: "this_combat" },
		priority: 0,
	}),

	on_reveal_paths: (_def, _entityId) => ({
		on: "PathsRevealed",
		duration: { kind: "permanent" },
		priority: 0,
	}),

	on_dungeon_discard: (_def, _entityId) => ({
		on: "DungeonCardDiscarded",
		duration: { kind: "permanent" },
		priority: 0,
	}),

	on_flee_or_leave_play: (_def, entityId) => ({
		on: "HeroFled",
		condition: (_e: Entity, ev?: GameEvent) => {
			if (!ev) return false;
			const p = ev.payload as Record<string, unknown>;
			return (p["heroId"] as string) === entityId;
		},
		duration: { kind: "permanent" },
		priority: 0,
	}),

	first_item_effect_received: (_def, entityId) => ({
		on: "ItemEffectAppliedTo",
		condition: (_e: Entity, ev?: GameEvent) => {
			if (!ev) return false;
			const p = ev.payload as Record<string, unknown>;
			return (p["heroId"] as string) === entityId && !!(p["roomFirstTime"] as boolean);
		},
		duration: { kind: "permanent" },
		priority: 0,
	}),

	on_win_room: (_def, _entityId) => ({
		on: "CombatEnded",
		duration: { kind: "permanent" },
		priority: 0,
	}),

	// ── Once-per-* compostos ────────────────────────────────────────────────────

	before_attack_once_per_game: (_def, entityId) => ({
		on: "RollAboutToHappen",
		condition: conditionHeroIsEntity(entityId),
		duration: { kind: "permanent" },
		consumeAfterFire: { scope: "game" },
		priority: 0,
	}),

	once_per_room_on_dungeon_discard: (_def, _entityId) => ({
		on: "DungeonCardDiscarded",
		duration: { kind: "permanent" },
		consumeAfterFire: { scope: "room" },
		priority: 0,
	}),

	once_per_room_on_extra_dungeon_discard: (_def, _entityId) => ({
		on: "DungeonCardDiscarded",
		condition: (_e: Entity, ev?: GameEvent) => {
			if (!ev) return false;
			const p = ev.payload as Record<string, unknown>;
			return p["reason"] === "extra";
		},
		duration: { kind: "permanent" },
		consumeAfterFire: { scope: "room" },
		priority: 0,
	}),

	once_per_room_on_targeted: (_def, entityId) => ({
		on: "HeroTargeted",
		condition: (_e: Entity, ev?: GameEvent) => {
			if (!ev) return false;
			const p = ev.payload as Record<string, unknown>;
			return (p["heroId"] as string) === entityId;
		},
		duration: { kind: "permanent" },
		consumeAfterFire: { scope: "room" },
		priority: 0,
	}),

	once_per_room_on_targeted_by_effect: (_def, entityId) => ({
		on: "HeroTargetedByEffect",
		condition: (_e: Entity, ev?: GameEvent) => {
			if (!ev) return false;
			const p = ev.payload as Record<string, unknown>;
			return (p["heroId"] as string) === entityId;
		},
		duration: { kind: "permanent" },
		consumeAfterFire: { scope: "room" },
		priority: 0,
	}),

	once_per_room_after_roll: (_def, entityId) => ({
		on: "RollResolved",
		condition: conditionHeroIsEntity(entityId),
		duration: { kind: "permanent" },
		consumeAfterFire: { scope: "room" },
		priority: 0,
	}),

	once_per_round_on_damage_taken: (_def, entityId) => ({
		on: "DamageDealt",
		condition: (_e: Entity, ev?: GameEvent) => {
			if (!ev) return false;
			const p = ev.payload as Record<string, unknown>;
			return (p["targetId"] as string) === entityId;
		},
		duration: { kind: "this_combat" },
		consumeAfterFire: { scope: "round" },
		priority: 0,
	}),

	once_per_game_after_any_roll: (_def, entityId) => ({
		on: "RollResolved",
		condition: conditionHeroIsEntity(entityId),
		duration: { kind: "permanent" },
		consumeAfterFire: { scope: "game" },
		priority: 0,
	}),

	once_per_game_after_roll_vs_prey: (_def, entityId) => ({
		on: "RollResolved",
		condition: (_e: Entity, ev?: GameEvent) => {
			if (!ev) return false;
			const p = ev.payload as Record<string, unknown>;
			return (p["heroId"] as string) === entityId;
		},
		duration: { kind: "permanent" },
		consumeAfterFire: { scope: "game" },
		priority: 0,
	}),

	once_per_game_on_defeat_creature: (_def, entityId) => ({
		on: "EnemyDestroyed",
		condition: (_e: Entity, ev?: GameEvent) => {
			if (!ev) return false;
			const p = ev.payload as Record<string, unknown>;
			return (p["sourceId"] as string) === entityId;
		},
		duration: { kind: "permanent" },
		consumeAfterFire: { scope: "game" },
		priority: 0,
	}),

	// until_end_of_round standalone (Correntes Rubras)
	until_end_of_round: (_def, entityId) => ({
		on: "RoundStarted",
		condition: conditionHeroIsEntity(entityId),
		duration: { kind: "this_turn" },
		priority: 0,
	}),
};

// ── Passivos ───────────────────────────────────────────────────────────────────

const PASSIVE_TRIGGERS = new Set([
	"while_equipped",
	"while_in_play",
	"while_active",
	"while_room_active",
	"while_room_active_first_combat",
	"room_passive",
]);

export function isPassiveTrigger(trigger: string): boolean {
	return PASSIVE_TRIGGERS.has(trigger);
}

// ── Função de cobertura ────────────────────────────────────────────────────────

export function hasTriggerCoverage(trigger: string): boolean {
	return trigger in TRIGGER_TO_INSTALL || isPassiveTrigger(trigger) || isManuallyActivatable({ trigger } as SkillDefinition);
}

// ── Instalação principal ───────────────────────────────────────────────────────

export function installSkillTriggers(
	world: World,
	entityId: EntityId,
	skills: readonly { def: SkillDefinition; ref: SkillRef }[],
): World {
	let w = world;
	for (const { def, ref } of skills) {
		if (isManuallyActivatable(def)) continue; // on_use path permanece em fireOnUseSkill
		if (isPassiveTrigger(def.trigger)) continue; // passivos via installPassive

		const factory = TRIGGER_TO_INSTALL[def.trigger];
		if (!factory) {
			// Trigger sem installer: não lança erro durante transição (Lote G vai cobrir)
			continue;
		}

		const result = factory(def, entityId);
		const results = Array.isArray(result) ? result : [result];

		for (const r of results) {
			// Combina params da definição com os params da referência (incluindo value)
			const mergedParams = {
				...(def.params ?? {}),
				...(ref.params ?? {}),
			};
			const effect: EffectDescriptor = {
				type: "run_skill",
				skillId: def.id,
				params: mergedParams,
			};
			const trigger: TriggerComponent = {
				type: "trigger",
				on: r.on,
				condition: r.condition,
				effect,
				source: def.id,
				duration: r.duration,
				priority: r.priority,
				...(r.consumeAfterFire ? { consumeAfterFire: r.consumeAfterFire } : {}),
			};
			w = addComponent(w, entityId, trigger);
		}
	}
	return w;
}
