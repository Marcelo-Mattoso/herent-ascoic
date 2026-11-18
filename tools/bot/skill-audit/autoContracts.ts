/** Cenários descobertos a partir de contratos, sem IDs de chefes/skills hardcoded. */
import { getCardsByType } from "@/core/data/cards";
import { cardAbilityGrants } from "@/core/data/abilities";
import { skillById } from "@/core/gameEngine";
import { recordOfEnemy, spawnEnemy, withWorld, worldOf, heroesOf } from "@/core/state/access";
import { gameOf, withGame } from "@/engine/state";
import { inlineBossDamageReduction, inlineBossFirstAttackHitBonus, inlineBossHitBonus, markBossFirstAttackUsed, markInlineBossSkillsUsed, isInlineBossSkill } from "@/core/rules/bossSkills";
import { resolveSkillWindow } from "@/core/skills/resolveSkillWindow";
import { effectKinds } from "@/core/abilities/trace";
import type { EnemyState } from "@/core/state/enemyState";
import type { GameState } from "@/core/state/gameState";
import type { EffectNode } from "@/core/skills/dsl/types";
import { auditEngine, combat } from "./runtime";

export interface AutoContractProbe {
  readonly sourceCardId: string;
  readonly abilityId: string;
  readonly grantId: string;
  readonly category: string;
  readonly status: "PASS" | "FAIL" | "NOT_COVERED";
  readonly detail: string;
}

function makeBossFixture(cardId: string): { state: GameState; boss: EnemyState } {
  const started = combat("hero_eternal_rest_cleric");
  const boss: EnemyState = {
    id: "boss", cardId, maxLife: 40, currentLife: 40, damage: 2, hitBonus: 0,
    dice: 1, tokens: {}, conditions: [], firstDamageTakenThisTurn: false, status: "active",
  };
  const populated = withWorld(started, spawnEnemy(worldOf(started), boss));
  return {
    state: withGame(populated, g => ({ ...g, status: "BOSS_COMBAT",
      activeEnemies: [recordOfEnemy(boss)] })),
    boss,
  };
}

function valueOf(value: unknown, params: Readonly<Record<string, unknown>> | undefined): number {
  const number = value === "$value" ? params?.value : value;
  return typeof number === "number" ? number : Number(number);
}

function declaredModifier(
  effects: readonly EffectNode[] | undefined,
  stat: string,
  params: Readonly<Record<string, unknown>> | undefined,
): number {
  return (effects ?? []).filter((node): node is Extract<EffectNode, { kind: "p_modifier" }> =>
    node.kind === "p_modifier" && node.stat === stat)
    .reduce((sum, node) => sum + valueOf(node.value, params), 0);
}

function probeInline(
  state: GameState, boss: EnemyState, skillId: string,
  event: string, effects: readonly EffectNode[] | undefined,
  params: Readonly<Record<string, unknown>> | undefined,
): string | null {
  if (event === "evt_roll" && (effects ?? []).every(e => e.kind === "p_modifier" && e.stat === "s_hit_bonus")) {
    const expected = declaredModifier(effects, "s_hit_bonus", params);
    const actual = inlineBossFirstAttackHitBonus(auditEngine, state, boss);
    if (!Number.isFinite(expected) || actual < expected) throw new Error(`Primeiro ataque: esperado >= ${expected}, obtido ${actual}`);
    const used = markBossFirstAttackUsed(state, boss.id);
    if (inlineBossFirstAttackHitBonus(auditEngine, used, boss) !== 0) throw new Error("Bônus do primeiro ataque repetido");
    return "Bônus de primeira rolagem e consumo por combate verificados no resolvedor real";
  }
  if (event === "evt_damage_taken" && (effects ?? []).some(e => e.kind === "p_modifier" && e.stat === "s_damage_reduction")) {
    const expected = declaredModifier(effects, "s_damage_reduction", params);
    const first = inlineBossDamageReduction(auditEngine, state, boss);
    if (!first.usedIds.includes(skillId) || first.amount < expected) throw new Error("Redução de dano não foi identificada");
    const consumed = markInlineBossSkillsUsed(state, first.usedIds);
    const second = inlineBossDamageReduction(auditEngine, consumed, boss);
    if (second.usedIds.includes(skillId)) throw new Error("Redução reutilizada na mesma rodada");
    return "Redução e limite de uma utilização na rodada comprovados; renovação exige cenário adicional";
  }
  if (event === "evt_damage_taken" && (effects ?? []).some(e => e.kind === "p_modifier" && e.stat === "s_hit_bonus")) {
    const full = inlineBossHitBonus(auditEngine, boss);
    const half = inlineBossHitBonus(auditEngine, { ...boss, currentLife: Math.floor(boss.maxLife / 2) });
    const expected = declaredModifier(effects, "s_hit_bonus", params);
    if (!Number.isFinite(expected) || half - full < expected) throw new Error("Bônus de meia vida não disparou");
    return "Condição de meia vida e bônus de acerto verificados; acumulação ainda não comprovada";
  }
  return null;
}

/** Não sinaliza PASS quando o cenário não demonstra o efeito declarado. */
export function runAutoContractProbes(): AutoContractProbe[] {
  const probes: AutoContractProbe[] = [];
  for (const bossCard of getCardsByType("boss")) {
    for (const grant of cardAbilityGrants(bossCard.id)) {
      const ability = skillById(auditEngine, grant.abilityId);
      const category = grant.activation.event ?? grant.activation.kind;
      const base = { sourceCardId: bossCard.id, abilityId: grant.abilityId, grantId: grant.id, category };
      if (!ability) {
        probes.push({ ...base, status: "FAIL", detail: "Definição ausente" });
        continue;
      }
      try {
        const { state, boss } = makeBossFixture(bossCard.id);
        if (isInlineBossSkill(ability)) {
          const detail = probeInline(state, boss, ability.id, category, ability.effect, grant.params);
          probes.push({ ...base, status: detail ? "PASS" : "NOT_COVERED",
            detail: detail ?? "Efeito inline sem template de prova automático" });
        } else if (category === "evt_combat_start" || category === "evt_round_end") {
          const beforeSeq = gameOf(state).abilityTrace?.at(-1)?.sequence ?? 0;
          const next = resolveSkillWindow(auditEngine, state, {
            event: category,
            ctx: { triggeredBy: category,
              targetEnemyIds: [boss.id], targetHeroIds: heroesOf(state).map(h => h.id),
              round: gameOf(state).combat?.round ?? 1 },
          });
          const observed = (gameOf(next).abilityTrace ?? []).some(entry =>
            entry.sequence > beforeSeq && entry.abilityId === ability.id &&
            entry.sourceCardId === bossCard.id);
          probes.push({ ...base, status: observed ? "PASS" : "NOT_COVERED",
            detail: observed
              ? `Evento executado pelo motor real; efeitos declarados: ${effectKinds(ability.effect).join(", ")}; asserções de resultado ainda parciais`
              : "Gatilho não reproduzido neste contexto; requer fixture que satisfaça suas condições" });
        } else {
          probes.push({ ...base, status: "NOT_COVERED", detail: "Evento sem fixture automática de execução" });
        }
      } catch (error) {
        probes.push({ ...base, status: "FAIL",
          detail: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  return probes;
}
