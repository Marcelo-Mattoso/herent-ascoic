/** Cenários descobertos a partir de contratos, sem IDs de chefes/skills hardcoded. */
import { getCardsByType, getAllCards } from "@/core/data/cards";
import { lookupAbilityById } from "@/core/data/abilities";
import { witnessEffectKinds } from "./effectWitness";
import { removeEntity } from "@/core/ecs/world";
import { reducer } from "@/core/reducer";
import { legalActions } from "@/core/legalActions";
import { playerView } from "@/core/projection/playerView";
import { cardAbilityGrants } from "@/core/data/abilities";
import { skillById } from "@/core/gameEngine";
import { recordOfEnemy, spawnEnemy, withWorld, worldOf, heroesOf, withUnitStats } from "@/core/state/access";
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
  readonly witnessedKinds?: readonly string[];
}

function makeBossFixture(cardId: string): { state: GameState; boss: EnemyState } {
  const started = combat("hero_eternal_rest_cleric");
  const boss: EnemyState = {
    id: "boss", cardId, maxLife: 40, currentLife: 40, damage: 2, hitBonus: 0,
    dice: 1, tokens: {}, conditions: [], firstDamageTakenThisTurn: false, status: "active",
  };
  const populated = withWorld(started, spawnEnemy(removeEntity(worldOf(started), "audit-enemy"), boss));
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

/** Executa um grant manual por meio do reducer, seguindo escolhas legais, sem ID de skill no teste. */
function probeManualHero(cardId: string, abilityId: string):
  { readonly observed: boolean; readonly kinds: readonly string[] } | null {
  let state = combat(cardId);
  const hero = heroesOf(state)[0];
  if (!hero) return null;
  const definition = lookupAbilityById(abilityId);
  if (effectKinds(definition?.effect).some(kind =>
    kind === "i_heal" || kind === "i_full_heal")) {
    state = withUnitStats(state, hero.id, {
      currentLife: Math.max(1, Math.floor(hero.maxLife / 2)),
    });
  }
  const before = state;
  const action = playerView(auditEngine, state).abilityActionsByHero[hero.id]?.find(a =>
    a.abilityId === abilityId && a.status === "available");
  if (!action || (action.activation !== "manual" && action.activation !== "manual_prepare"))
    return null;
  const initial = gameOf(state).abilityTrace?.at(-1)?.sequence ?? 0;
  state = reducer(auditEngine, state, action.kind === "power" ?
    { type: "USE_POWER", payload: { heroId: hero.id } } :
    { type: "USE_SKILL", payload: { skillId: abilityId, sourceId: hero.id } });
  for (let step = 0; step < 7; step++) {
    const evidence = (gameOf(state).abilityTrace ?? []).find(entry =>
      entry.sequence > initial && entry.abilityId === abilityId &&
      entry.outcome === "executed");
    if (evidence) return { observed: true,
      kinds: witnessEffectKinds(before, state, effectKinds(definition?.effect)) };
    const offered = legalActions(auditEngine, state);
    const choice = offered.find(item =>
      item.type === "SKILL_CHOICE" || item.type === "SELECT_SKILL_TARGET" ||
      item.type === "APPLY_TRIGGER_INTERRUPT" || item.type === "SELECT_DIE");
    if (choice) { state = reducer(auditEngine, state, choice); continue; }
    const projected = playerView(auditEngine, state).abilityActionsByHero[hero.id]?.find(
      entry => entry.abilityId === abilityId);
    if (projected?.status !== "prepared") break;
    state = reducer(auditEngine, state, { type: "USE_SKILL", payload: {
      skillId: abilityId, sourceId: hero.id,
      ...(projected.validTargetIds.length ? { targetIds: [projected.validTargetIds[0]!] } : {}),
    } });
  }
  return null;
}


/** Comprova apenas a fase de preparação de triggers voluntários do herói,
 * em vez de inferir que o efeito futuro ocorreu por ter sido armado. */
function probeVoluntaryHeroPreparation(cardId: string, abilityId: string): boolean {
  const state = combat(cardId);
  const hero = heroesOf(state)[0];
  if (!hero) return false;
  const projected = playerView(auditEngine, state).abilityActionsByHero[hero.id]?.find(
    action => action.abilityId === abilityId && action.activation === "prepare" &&
      action.status === "available");
  if (!projected) return false;
  const next = reducer(auditEngine, state, projected.kind === "power"
    ? { type: "USE_POWER", payload: { heroId: hero.id } }
    : { type: "USE_SKILL", payload: { skillId: abilityId, sourceId: hero.id } });
  return Object.values(gameOf(next).preparedAbilities ?? {}).some(entry =>
    entry.sourceHeroId === hero.id && entry.abilityId === abilityId);
}

/** Não sinaliza PASS quando o cenário não demonstra o efeito declarado. */
export function runAutoContractProbes(): AutoContractProbe[] {
  const probes: AutoContractProbe[] = [];
  for (const hero of getCardsByType("hero")) {
    for (const grant of cardAbilityGrants(hero.id).filter(g =>
      g.activation.kind === "manual" ||
      (g.activation.kind === "event" && g.activation.decision === "optional"))) {
      const base = { sourceCardId: hero.id, abilityId: grant.abilityId,
        grantId: grant.id, category: "manual" };
      try {
        if (grant.activation.kind === "event") {
          const prepared = probeVoluntaryHeroPreparation(hero.id, grant.abilityId);
          probes.push({ ...base, status: prepared ? "PASS" : "NOT_COVERED",
            detail: prepared
              ? "Trigger voluntário preparado no reducer real; efeito posterior, custo e limite ainda sem prova"
              : "Trigger não pôde ser preparado nesta fixture; condição/janela ainda sem cobertura" });
          continue;
        }
        const proof = probeManualHero(hero.id, grant.abilityId);
        probes.push({ ...base, status: proof?.kinds.length ? "PASS" : "NOT_COVERED",
          witnessedKinds: proof?.kinds ?? [],
          detail: proof?.kinds.length
            ? "Mudança observável após ativação no reducer: " + proof.kinds.join(", ") +
              "; duração, limites, alvos alternativos e isolamento ainda pendentes"
            : proof?.observed ? "Ativação executada, mas o cenário não comprovou efeito observável" :
              "Ação não reproduzível na fixture genérica: exige condição, recurso ou contexto específico" });
      } catch (error) {
        probes.push({ ...base, status: "NOT_COVERED",
          detail: "Fixture incompleta ou rejeição do reducer: " +
            (error instanceof Error ? error.message : String(error)) });
      }
    }
  }
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
          const witnesses = observed ? witnessEffectKinds(state, next, effectKinds(ability.effect)) : [];
          probes.push({ ...base, status: witnesses.length ? "PASS" : "NOT_COVERED",
            witnessedKinds: witnesses,
            detail: witnesses.length
              ? "Evento disparou e produziu mudança observável de " + witnesses.join(", ") +
                "; efeito ainda não isolado dos outros eventos"
              : observed ? "Evento disparou, mas falta asserção de efeito observável na fixture" :
                "Gatilho não reproduzido neste contexto; requer fixture que satisfaça suas condições" });
        } else {
          probes.push({ ...base, status: "NOT_COVERED", detail: "Evento sem fixture automática de execução" });
        }
      } catch (error) {
        probes.push({ ...base, status: isInlineBossSkill(ability) ? "FAIL" : "NOT_COVERED",
          detail: (isInlineBossSkill(ability) ? "Contrato inline violado: " : "Fixture incompleta: ") +
            (error instanceof Error ? error.message : String(error)) });
      }
    }
  }
  // Inventário completo: não omitir fontes sem fixture, inclusive itens, salas e criaturas.
  const tested = new Set(probes.map(p => p.sourceCardId + "::" + p.grantId));
  for (const card of getAllCards()) for (const grant of cardAbilityGrants(card.id)) {
    if (tested.has(card.id + "::" + grant.id)) continue;
    probes.push({ sourceCardId: card.id, abilityId: grant.abilityId, grantId: grant.id,
      category: grant.activation.event ?? grant.activation.kind, status: "NOT_COVERED",
      detail: "Fonte " + card.type + " ainda sem fixture automática reproduzível" });
  }
  return probes.sort((a, b) => a.sourceCardId.localeCompare(b.sourceCardId) ||
    a.grantId.localeCompare(b.grantId));
}
