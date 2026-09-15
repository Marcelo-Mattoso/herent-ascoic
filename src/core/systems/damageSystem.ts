// Sistema de dano — ponto único para toda aplicação de dano no jogo.
// Atualiza tanto os arrays legados (heroes/enemies) quanto o ECS world.
// Passo 7: applyDamage emite DamageAboutToBeDealt (pré) e DamageDealt (pós).
// applyDamageMin1 é custo de vida (sem janela de bus — não é dano recebido de inimigo).

import { syncEntityFromEnemy, syncEntityFromHero } from "../ecs/sync";
import type { EntityId } from "../ecs/types";
import {
	removeEntity,
	removeModifiersAppliedBySource,
	removeModifiersForSource,
} from "../ecs/world";
import { emit } from "../events/bus";
import type { DamageType } from "../events/types";
import { resolveSkillWindow } from "../skills/resolveSkillWindow";
import {
	removeBlocksAppliedBySource,
	removeBlocksForSource,
} from "../state/blockHelpers";
import type { EnemyState } from "../state/enemyState";
import type { GameState } from "../state/gameState";
import type { HeroState } from "../state/heroState";

export interface DamageOptions {
	readonly sourceId?: EntityId;
	readonly damageType?: DamageType;
}

function damageTriggerContext(
	state: GameState,
	sourceId: EntityId,
	targetId: EntityId,
	amount: number,
) {
	const sourceHeroId = state.heroes.some((hero) => hero.id === sourceId)
		? sourceId
		: undefined;
	const sourceEnemyId = state.activeEnemies.some((enemy) => enemy.id === sourceId)
		? sourceId
		: undefined;
	const targetHeroIds = state.heroes.some((hero) => hero.id === targetId)
		? [targetId]
		: [];
	const targetEnemyIds = state.activeEnemies.some((enemy) => enemy.id === targetId)
		? [targetId]
		: [];
	return {
		sourceHeroId,
		sourceEnemyId,
		targetHeroIds,
		targetEnemyIds,
		value: amount,
		round: state.combat?.round ?? 0,
	};
}

// Aplica dano bruto sem passar pelo bus (usado internamente após o bus resolver o amount).
function applyDamageRaw(
	state: GameState,
	targetId: EntityId,
	amount: number,
	minLife: number,
): GameState {
	const heroIdx = state.heroes.findIndex((h) => h.id === targetId);
	if (heroIdx >= 0) {
		const hero = state.heroes[heroIdx] as HeroState;
		const newLife = Math.max(minLife, hero.currentLife - amount);
		const updated: HeroState = {
			...hero,
			currentLife: newLife,
			status: newLife <= 0 ? "defeated" : hero.status,
		};
		return {
			...state,
			heroes: state.heroes.map((h) => (h.id === targetId ? updated : h)),
			world: syncEntityFromHero(state.world, updated),
		};
	}

	const enemyIdx = state.activeEnemies.findIndex((e) => e.id === targetId);
	if (enemyIdx >= 0) {
		const enemy = state.activeEnemies[enemyIdx] as EnemyState;
		const newLife = Math.max(minLife, enemy.currentLife - amount);
		const updated: EnemyState = {
			...enemy,
			currentLife: newLife,
			status: newLife <= 0 ? "defeated" : enemy.status,
		};
		return {
			...state,
			activeEnemies: state.activeEnemies.map((e) =>
				e.id === targetId ? updated : e,
			),
			world: syncEntityFromEnemy(state.world, updated),
		};
	}

	return state;
}

// Aplica dano com janela de pré-evento (bus): ouvintes podem modificar o amount.
export function applyDamage(
	state: GameState,
	targetId: EntityId,
	amount: number,
	opts?: DamageOptions,
): GameState {
	if (
		!state.heroes.some((hero) => hero.id === targetId) &&
		!state.activeEnemies.some((enemy) => enemy.id === targetId)
	) {
		return state;
	}
	const sourceId = opts?.sourceId ?? "system";
	const damageType = opts?.damageType ?? "physical";

	// Janela pré: listeners podem reduzir/aumentar o dano.
	const { state: s1, event: modified } = emit(state, {
		type: "DamageAboutToBeDealt",
		payload: { sourceId, targetId, damageType, amount },
	});
	if (s1.pendingTriggerInterrupt) return s1;
	const finalAmount = (modified.payload as { amount: number }).amount;

	// Aplicar o dano com o valor modificado.
	const s2 = applyDamageRaw(s1, targetId, finalAmount, 0);

	// Janela pós: listeners reagem ao dano já aplicado.
	const { state: s3 } = emit(s2, {
		type: "DamageDealt",
		payload: { sourceId, targetId, damageType, amount: finalAmount },
	});
	if (s3.pendingTriggerInterrupt) return s3;

	const ctx = damageTriggerContext(s3, sourceId, targetId, finalAmount);
	let s4 = resolveSkillWindow(s3, {
		event: "evt_damage_dealt",
		ctx: { triggeredBy: "evt_damage_dealt", ...ctx },
	});
	if (s4.pendingTriggerInterrupt || s4.pendingSkillChoice) return s4;

	// "Acerto" é especificamente dano de um herói contra uma criatura.
	if (ctx.sourceHeroId && ctx.targetEnemyIds.length > 0) {
		s4 = resolveSkillWindow(s4, {
			event: "evt_hit",
			// O alvo do contra-ataque é o agressor; o inimigo atingido continua
			// em targetEnemyIds para filtrar a reação correta no TriggerEngine.
			ctx: {
				triggeredBy: "evt_hit",
				...ctx,
				targetHeroIds: [ctx.sourceHeroId],
			},
		});
		if (s4.pendingTriggerInterrupt || s4.pendingSkillChoice) return s4;
	}

	// Lote E: emite EnemyDestroyed ou HeroDefeated quando entidade é derrotada
	const defeatedHero = s4.heroes.find(
		(h) => h.id === targetId && h.status === "defeated",
	);
	if (defeatedHero) {
		({ state: s4 } = emit(s4, {
			type: "HeroDefeated",
			payload: { heroId: targetId, sourceId },
		}));
		// Efeitos ativos emitidos pelo herói deixam de valer ao ser derrotado.
		s4 = {
			...s4,
			world: removeModifiersAppliedBySource(s4.world, targetId),
		};
		s4 = removeBlocksAppliedBySource(s4, targetId);
	}
	const defeatedEnemy = s4.activeEnemies.find(
		(e) => e.id === targetId && e.status === "defeated",
	);
	if (defeatedEnemy) {
		const defeatCtx = damageTriggerContext(s4, sourceId, targetId, finalAmount);
		s4 = resolveSkillWindow(s4, {
			event: "evt_destroy",
			ctx: { triggeredBy: "evt_destroy", ...defeatCtx },
		});
		if (s4.pendingTriggerInterrupt || s4.pendingSkillChoice) return s4;
		if (defeatCtx.sourceHeroId) {
			s4 = resolveSkillWindow(s4, {
				event: "evt_kill",
				ctx: { triggeredBy: "evt_kill", ...defeatCtx },
			});
			if (s4.pendingTriggerInterrupt || s4.pendingSkillChoice) return s4;
		}
		const preyByHero = Object.fromEntries(
			Object.entries(s4.combat?.preyByHero ?? {}).filter(
				([, preyId]) => preyId !== targetId,
			),
		);
		if (s4.combat) {
			s4 = {
				...s4,
				combat: {
					...s4.combat,
					prey: s4.combat.prey === targetId ? null : s4.combat.prey,
					preyByHero,
				},
			};
		}
		const roomFirstKill = s4.creaturesDefeated === 0;
		({ state: s4 } = emit(s4, {
			type: "EnemyDestroyed",
			payload: { enemyId: targetId, sourceId, roomFirstKill },
		}));
		// Remove entidade ECS do inimigo derrotado e limpa modifiers/blocks while_source_in_play
		// que esta entidade tenha aplicado em outras entidades (ex: gelatinous_body, forge_chains).
		const worldAfterRemove = removeEntity(s4.world, targetId);
		s4 = { ...s4, world: removeModifiersForSource(worldAfterRemove, targetId) };
		s4 = removeBlocksForSource(s4, targetId);
	}

	return s4;
}

// Aplica custo de vida mínimo 1 (skill cost / self-damage).
// NÃO passa pelo bus — custos de skill não ativam redutores de dano de inimigos.
export function applyDamageMin1(
	state: GameState,
	targetId: EntityId,
	amount: number,
): GameState {
	return applyDamageRaw(state, targetId, amount, 1);
}
