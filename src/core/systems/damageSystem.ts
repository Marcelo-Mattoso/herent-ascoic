// Sistema de dano — ponto único para toda aplicação de dano no jogo.
// Atualiza tanto os arrays legados (heroes/enemies) quanto o ECS world.
// Passo 7: applyDamage emite DamageAboutToBeDealt (pré) e DamageDealt (pós).
// applyDamageMin1 é custo de vida (sem janela de bus — não é dano recebido de inimigo).

import { syncEntityFromEnemy, syncEntityFromHero } from "../ecs/sync";
import type { EntityId } from "../ecs/types";
import { removeEntity } from "../ecs/world";
import { emit } from "../events/bus";
import type { DamageType } from "../events/types";
import type { EnemyState } from "../state/enemyState";
import type { GameState } from "../state/gameState";
import type { HeroState } from "../state/heroState";

export interface DamageOptions {
	readonly sourceId?: EntityId;
	readonly damageType?: DamageType;
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
	const sourceId = opts?.sourceId ?? "system";
	const damageType = opts?.damageType ?? "physical";

	// Janela pré: listeners podem reduzir/aumentar o dano.
	const { state: s1, event: modified } = emit(state, {
		type: "DamageAboutToBeDealt",
		payload: { sourceId, targetId, damageType, amount },
	});
	const finalAmount = (modified.payload as { amount: number }).amount;

	// Aplicar o dano com o valor modificado.
	const s2 = applyDamageRaw(s1, targetId, finalAmount, 0);

	// Janela pós: listeners reagem ao dano já aplicado.
	const { state: s3 } = emit(s2, {
		type: "DamageDealt",
		payload: { sourceId, targetId, damageType, amount: finalAmount },
	});

	// Lote E: emite EnemyDestroyed ou HeroDefeated quando entidade é derrotada
	let s4 = s3;
	const defeatedHero = s4.heroes.find((h) => h.id === targetId && h.status === "defeated");
	if (defeatedHero) {
		({ state: s4 } = emit(s4, {
			type: "HeroDefeated",
			payload: { heroId: targetId, sourceId },
		}));
	}
	const defeatedEnemy = s4.activeEnemies.find((e) => e.id === targetId && e.status === "defeated");
	if (defeatedEnemy) {
		const roomFirstKill = s4.creaturesDefeated === 0;
		({ state: s4 } = emit(s4, {
			type: "EnemyDestroyed",
			payload: { enemyId: targetId, sourceId, roomFirstKill },
		}));
		// Remove entidade ECS do inimigo derrotado: drop dos modificadores
		// while_in_play (passivos como purple_ash_protection) que ficariam
		// pendurados no world depois da morte.
		s4 = { ...s4, world: removeEntity(s4.world, targetId) };
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
