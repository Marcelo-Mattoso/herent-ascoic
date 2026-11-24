/** Escolha contextual de poderes com cargas finitas. Nenhuma mutação nas regras. */
import type { HeroView, PlayerView } from "@/core/projection/playerView";
import type { AbilityMove } from "./observe";
import { cardAbilityGrants, lookupAbilityById } from "@/core/data/abilities";
import { effectKinds } from "@/core/abilities/trace";

const ratio = (h: {currentLife: number; maxLife: number}) => h.maxLife ? h.currentLife / h.maxLife : 1;

/** Valor de ativação, sem presumir que preparar a habilidade já produziu efeito. */
export function scoreStrategicPower(view: PlayerView, ability: AbilityMove,
  owner: HeroView, bestAttack: number, stagnantRounds = 0): number {
  const definition = lookupAbilityById(ability.abilityId);
  const grant = cardAbilityGrants(owner.cardId).find(g => g.abilityId === ability.abilityId);
  const kinds = new Set(effectKinds(definition?.effect));
  const text = JSON.stringify(definition?.effect ?? []);
  const heroes = view.heroes.filter(h => h.status === "active");
  const enemies = view.enemies.filter(e => e.status === "active");
  const boss = view.status === "BOSS_COMBAT" || enemies.some(e => e.id === "boss");
  const maxStrike = Math.max(0, ...enemies.map(e => e.damage));
  const weakest = Math.min(1, ...heroes.map(ratio));
  const missing = Math.max(0, ...heroes.map(h => h.maxLife - h.currentLife));
  const wounded = missing > 0;
  const lethal = maxStrike > 0 && heroes.some(h => h.currentLife <= maxStrike + 1);
  const threatened = lethal || weakest <= 0.35 || enemies.length > heroes.length && weakest <= 0.65;
  // Se o herói pode atacar, pagar uma ação custa tempo e dano esperado.
  const opportunity = grant?.activation.actionCost === "consume_hero_action" && bestAttack >= 0
    ? Math.min(60, Math.max(0, (bestAttack - 100) * 0.55)) : 0;
  const stagnantPenalty = stagnantRounds >= 3 && bestAttack >= 0 ? 65 : 0;

  if (kinds.has("i_recover_dungeon")) {
    const discarded = view.decks.dungeonDeck.discarded.length;
    const remaining = view.decks.dungeonDeck.available;
    if (!discarded || boss) return -1;
    if (remaining <= 2) return 245 - opportunity;
    if (remaining <= 5 && view.roomsCleared >= 4) return 185 - opportunity;
    return 45 - opportunity;
  }
  const healing = ability.heals || kinds.has("i_heal") || kinds.has("i_full_heal");
  const healingAlternative = kinds.has("i_choose_one") &&
    (kinds.has("p_modifier") || kinds.has("i_prevent_destroy"));
  if (healing) {
    if (!wounded && !healingAlternative) return -1;
    if (wounded && lethal) return 290 - opportunity - stagnantPenalty;
    if (wounded && weakest <= 0.35) return 255 - opportunity - stagnantPenalty;
    if (boss && wounded && (missing >= 5 || weakest <= 0.65))
      return 235 - opportunity - stagnantPenalty;
    if (boss && healingAlternative && enemies.length) return 195 - opportunity - stagnantPenalty;
    if (!boss && wounded && missing >= 6 && weakest <= 0.55)
      return 190 - opportunity - stagnantPenalty;
    return 25;
  }
  const defense = kinds.has("p_block") || kinds.has("i_prevent_destroy") ||
    kinds.has("i_prevent_next_damage") || kinds.has("i_poison_ward") ||
    text.includes('"s_damage_reduction"') || text.includes('"s_damage_taken"');
  const offense = kinds.has("i_damage") || kinds.has("i_apply_poison") ||
    kinds.has("i_apply_damage_over_time") || kinds.has("i_set_die") ||
    kinds.has("i_modify_die") || kinds.has("i_reroll") ||
    text.includes('"s_hit_bonus"') || text.includes('"s_damage_dealt"') ||
    text.includes('"s_damage"');
  if (defense && !offense) {
    if (!enemies.length) return -1;
    // Proteção breve não justifica sacrificar um ataque com vida saudável.
    if (lethal) return 270 + heroes.length * 5 - opportunity - stagnantPenalty;
    if (boss && heroes.length > 1)
      return 170 + heroes.length * 12 - opportunity - stagnantPenalty;
    if (boss && weakest <= 0.5) return 170 - opportunity - stagnantPenalty;
    return 35;
  }
  if (offense) {
    if (!enemies.length) return -1;
    if (boss) return 245 - opportunity;
    // Antes do chefe, salvar uma partida em risco supera guardar a carga.
    if (threatened && weakest <= 0.5) return 215 - opportunity;
    return 40;
  }
  // Poder não classificado: baixa prioridade fora do chefe; sem "bônus grátis".
  if (!enemies.length) return 30;
  if (boss) return 175 - opportunity;
  return threatened ? 150 - opportunity : 35;
}
