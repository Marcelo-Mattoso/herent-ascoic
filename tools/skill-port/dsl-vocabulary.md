# DSL Vocabulary — refinamento pós Fase 0

Baseado na análise das 88 habilidades. Cada `kind` novo entra quando uma habilidade real precisa.

---

## Effects (empurram para o pipeline)

| `kind` | Argumentos | Habilidades que precisam |
|---|---|---|
| `apply_damage` | `to`, `amount`, `minimum?` | skill_living_ember, skill_treacherous_attack, skill_choking_ashes, purple_raging_flames, dungeon_skill_column_fall, skill_piercing_strike |
| `apply_heal` | `to`, `amount` | skill_last_light_healing, skill_life_drain |
| `apply_full_heal` | `to` | power_greater_last_light_miracle |
| `prevent_destroy` | `to`, `min_life?` | power_greater_last_light_miracle ("sobrevive com 1 de vida") |
| `add_modifier` | `to`, `stat`, `operation`, `value`, `duration`, `condition?` | skill_bastion_guard, item_skill_block, skill_gelatinous_body, skill_crimson_chains, ... |
| `add_trigger` | `to`, `on`, `effect`, `duration`, `condition?`, `priority?` | purple_ember_blood, purple_veil_retaliation, skill_life_drain |
| `add_condition` | `to`, `conditionType`, `duration` | skill_crimson_chains (flee_block como condition) |
| `remove_modifier` | `to`, `source?` | (limpeza de modifiers expirados) |
| `block_action` | `what` (`flee` / `heal` / `dungeon_discard` / `power_use` / `dungeon_level_reduction`) | skill_sealed_door, purple_forge_chains, purple_depths_seal, purple_deep_veil_seal |
| `discard_from` | `pile` (`dungeon` / `item`), `count`, `who?` | skill_ruined_floor, purple_ruin_ashes, dungeon_skill_uneven_floor, boss_skill_dark_forge_pressure |
| `draw_from` | `pile` (`dungeon` / `item_deck` / `artifact_deck`), `count` | item_skill_mystic_draw, dungeon_skill_forge_spoils |
| `move_card` | `cardId?`, `from`, `to` | power_restored_path (dungeon discard → deck) |
| `advance_dungeon_level` | `amount` | skill_forge_awakening, purple_dark_awakening, purple_deadly_awakening |
| `set_no_reward` | `to` | skill_cowardly_flee |
| `noop` | — | dungeon_skill_subboss_room, dungeon_skill_empty_room |

### Stats para `add_modifier`

| stat | usado por |
|---|---|
| `damage_reduction` | skill_bastion_guard, skill_charred_plate, purple_ash_protection, item_skill_block, power_unbreakable_bastion_guard |
| `purple_damage_reduction` | skill_last_light_ward, item_skill_block_and_last_light_ward |
| `tohit_bonus` | skill_hunter_focus, skill_hidden_flame_presence, skill_pack_courage, boss_skill_azhakar_ascension |
| `tohit_penalty` | skill_gelatinous_body, skill_chains_prison, skill_scorching_heat, purple_ancient_veil_prison |
| `damage_bonus` | skill_final_dawn_light, skill_lone_beast, item_skill_deadly_edge |
| `damage_penalty` | purple_crimson_shackles (junto com tohit_penalty) |
| `heal_blocked` | skill_forge_smoke, purple_healing_rupture |
| `flee_blocked` | skill_crimson_chains, skill_sealed_door, purple_forge_chains, dungeon_skill_confinement |
| `dungeon_discard_prevention` | skill_preserved_path, skill_path_safeguard, skill_rift_light_step |
| `dungeon_discard_locked` | skill_path_corruption |
| `first_damage_prevented` | purple_crimson_plate, boss_skill_living_ash_throne (once_per_round) |

---

## Composição

| `kind` | Argumentos |
|---|---|
| `if` | `when: ConditionNode`, `then: EffectDescriptor[]`, `else?: EffectDescriptor[]` |
| `choose_one` | `options: { label, effect: EffectDescriptor[] }[]` |
| `for_each` | `over` (`targets` / `allies` / `enemies` / `all_heroes`), `as`, `do: EffectDescriptor[]` |

**Habilidades que usam `choose_one`:** skill_last_light_miracle, power_greater_last_light_miracle, power_last_light_oath, skill_dark_tribute, purple_dark_tribute, purple_blood_tribute, dungeon_skill_dead_torches (esta última tem condição especial — vai para script).

**Habilidades que usam `for_each`:** purple_raging_flames (apply_damage a todos os heróis), power_unbreakable_bastion_guard (damage_reduction a todos os heróis).

---

## Durações para `add_modifier`

| `kind` | significado |
|---|---|
| `once` | consome e remove após o primeiro disparo |
| `until_end_of_round` | remove ao fim da rodada |
| `until_end_of_combat` | remove ao fim do combate |
| `while_in_play` | enquanto a entidade-fonte estiver ativa |
| `passive` | permanente (item equipado) |
| `once_per_round` | disponível uma vez por rodada (repõe) |

---

## Expressões (`amount`, `value`)

| forma | significado |
|---|---|
| `2` (número) | literal |
| `"$nome"` | ref a `params.nome` |
| `"$source"` | entidade que disparou a skill |
| `"$target"` | alvo resolvido |
| `"$targets"` | todos os alvos |
| `"$value"` | compat: `usedBy[].value` legado |
| `{ "op": "mul", "args": ["$cost", 3] }` | aritmética |
| `{ "op": "div", "args": ["$self.maxLife", 2] }` | aritmética com ref de stat |

---

## Condições (`ConditionNode`) — usadas em `trigger.when` e nó `if`

| `kind` | argumentos | exemplo de uso |
|---|---|---|
| `has_skill` | `of`, `skillId` | skill_living_ember_oil (alvo tem skill_gelatinous_body) |
| `has_condition` | `of`, `conditionType` | — |
| `compare` | `op` (`lt/lte/eq/gte/gt/in`), `left`, `right` | skill_final_dawn_light ($dungeon.level >= 3), boss_skill_azhakar_ascension |
| `and` / `or` / `not` | composição lógica | skill_final_dawn_light (red OR purple) |
| `target_is_type` | `types: string[]` | item_skill_last_light_blade (boss or subboss) |
| `room_enemy_count` | `op`, `value` | skill_lone_beast (= 1), skill_hidden_flame_presence (> 1) |
| `beat_roll_by` | `amount` | item_skill_deadly_edge (vencer por 4+) |

---

## Refs simbólicas reservadas

| ref | resolve para |
|---|---|
| `$source` | entidade que disparou a skill |
| `$target` | alvo primário |
| `$targets` | todos os alvos |
| `$value` | `usedBy[].value` legado |
| `$<nome>` | `params.<nome>` da habilidade |
| `$self` | a própria entidade portadora da skill |
| `$dungeon.level` | `state.despertar` |
| `$room.enemy_count` | quantidade de inimigos ativos na sala |
| `$damage.source` | origem do dano (attack / effect / purple) |
| `$damage.type` | tipo do dano |
| `$round.first_damage` | flag de primeiro dano da rodada |
| `$room.round_count` | rodadas decorridas na sala atual |
| `$room.combat_count` | combates realizados na sala atual |
| `$self.currentLife` | vida atual da entidade |
| `$self.maxLife` | vida máxima da entidade |

---

## Primitivas ainda faltantes no `ScriptCtx` (para scripts dos Lotes)

Mapeado por habilidade que precisará — cresce sob demanda nos lotes:

| primitiva | precisam |
|---|---|
| `query.roomEnemyCount()` | skill_lone_beast, skill_hidden_flame_presence, skill_pack_courage |
| `query.isAloneInRoom()` | skill_lone_beast |
| `query.isPrey(enemyId)` | power_hunter_execution |
| `query.dungeonLevel()` | skill_final_dawn_light, boss_skill_dark_forge_pressure |
| `query.heroWithLowestLife()` | skill_choking_ashes, skill_treacherous_attack |
| `query.heroHealBlocked(heroId)` | skill_last_light_healing (já existe parcialmente) |
| `query.groupHasItem(itemId)` | dungeon_skill_dead_torches (verificar Tocha de Breu) |
| `action.fixDie(side, index, value)` | power_supreme_rift_rune, power_hunter_execution |
| `action.rerollDie(side, index)` | skill_rift_second_chance, skill_minor_rune, skill_perfect_rune |
| `action.openDiceSelection(opts)` | skill_rift_rune (interativo) |
| `action.preventDestroy(heroId)` | power_greater_last_light_miracle ("survive") |
| `action.grantEcoToken(heroId)` | power_deep_veil_echo |
| `action.spendEcoToken(heroId)` | power_deep_veil_echo |
| `action.markAsPrey(enemyId)` | skill_prey_mark |
| `action.revealDungeonCards(n)` | skill_illuminate_path |
| `action.drawArtifact()` | item_skill_mystic_draw |
| `action.drawSpecificItem(filter)` | dungeon_skill_rekindled_forge |
| `action.spawnEnemy(cardId)` | dungeon_skill_summon_guardian |
| `action.redirectCombatTarget(heroId, newEnemyId)` | skill_focus_deflection |
| `action.cancelAction(actionType)` | skill_opportunity_shot ("ao invés de combater") |
