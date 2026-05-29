# Expansion Plan — primitivas do ScriptCtx por Lote

Lista das adições ao `ScriptCtx` (`src/core/scripts/context.ts`) que cada lote vai precisar.
Não implementar antes do lote — entram apenas quando a habilidade que precisa está sendo portada.

---

## Fase 2 — Fachada do pipeline (Passo 9)

Antes dos lotes, o ScriptCtx precisa das APIs de pipeline que **ainda não existem**:

| primitiva | para substituir |
|---|---|
| `action.pushEffect(descriptor)` | `applyDamage`, `applyHeal` diretos |
| `action.addComponent(entityId, component)` | mutações diretas em `combat.*` |
| `action.removeComponentsBySource(entityId, source)` | limpeza de modifiers |
| `action.emit(event)` | chamadas diretas ao bus |
| `action.requestChoice(options)` | atribuição de `state.pendingSkillChoice` |

**Habilidade de smoke test:** `skill_living_ember_oil` — migrar `action.dealDamage` → `action.pushEffect`.

---

## Lote 1 — DSL pura (~35 habilidades)

Habilidades: skill_last_light_healing, skill_bastion_guard, skill_charred_plate, skill_choking_ashes, skill_treacherous_attack, skill_gelatinous_body, skill_chains_prison, skill_forge_smoke, skill_forge_awakening, skill_ruined_floor, skill_crimson_chains, skill_sealed_door, skill_cowardly_flee, skill_path_corruption, item_skill_block, purple_raging_flames, purple_forge_chains, purple_ruin_ashes, purple_ash_protection, purple_dark_awakening, purple_deadly_awakening, purple_healing_rupture, purple_ancient_veil_prison, dungeon_skill_confinement, dungeon_skill_uneven_floor, dungeon_skill_column_fall, boss_skill_dark_forge_pressure, dungeon_skill_subboss_room, dungeon_skill_empty_room, skill_living_ember (versão simples).

**Novos ScriptCtx.query necessários neste lote:** nenhum (DSL pura usa apenas $params e $source/$target).

**Novos kinds de DSL necessários:**
- `advance_dungeon_level` (skill_forge_awakening e similares)
- `set_no_reward` (skill_cowardly_flee)
- `for_each` (purple_raging_flames: damage a todos os heróis)
- `block_action` com `what: "flee"` (crimson_chains, sealed_door, purple_forge_chains)
- `block_action` com `what: "heal"` (skill_forge_smoke)

**Handlers deletados ao fim do lote:**
`direct_damage` (se skill_living_ember migrar), `heal` (se skill_last_light_healing migrar), `armor` (parcial — quando todas as habilidades de herói migrarem), `flee_block`, `heal_block`/`healBlock`, `dungeonLevel`, `discardDungeon`, `reward`.

---

## Lote 2 — DSL com condicional (~10 habilidades)

Habilidades: skill_final_dawn_light, skill_lone_beast, skill_hidden_flame_presence, skill_pack_courage, purple_crimson_plate, boss_skill_living_ash_throne, boss_skill_azhakar_ascension, item_skill_last_light_blade, item_skill_block_and_last_light_ward, skill_last_light_ward, skill_life_drain.

**Novos ScriptCtx.query necessários:**
- `query.roomEnemyCount(): number`
- `query.dungeonLevel(): number`
- `query.isTargetType(enemyId, types: string[]): boolean`

**Novos ConditionNode kinds:**
- `room_enemy_count` (`op`, `value`)
- `target_is_type` (`types: string[]`)

**Novos kinds de DSL:**
- `add_trigger` (skill_life_drain: on_deal_damage → apply_heal)
- `purple_damage_reduction` stat em `add_modifier`
- `first_damage_prevented` stat em `add_modifier` (purple_crimson_plate, boss_skill_living_ash_throne)

**Handlers deletados ao fim do lote:**
`tohit`, `tohit_damage` (parcial), `purple_damage_reduction`, `armor` (restante creature skills).

---

## Lote 3 — DSL com choose_one (~5 habilidades)

Habilidades: skill_last_light_miracle, power_greater_last_light_miracle, power_last_light_oath, skill_dark_tribute, purple_dark_tribute, purple_blood_tribute.

**Novos kinds de DSL:**
- `choose_one` com `options[]`
- `apply_full_heal` (power_greater_last_light_miracle)
- `prevent_destroy` (power_greater_last_light_miracle — "sobrevive com 1 vida")
- `discard_from` com `pile: "item"` (dark_tribute)

**Novos ScriptCtx.action:**
- `action.requestChoice(options)` (já previsto na Fase 2)

**Handlers deletados:**
`heal_or_damage_bonus`, `heal_or_survive`, `item_or_discardDungeon` (parcial).

---

## Lote 4 — Scripts (~30 habilidades)

Habilidades: skill_crimson_fury, skill_rift_rune, skill_hunter_focus (passive), skill_perfect_rune, skill_rift_second_chance, skill_minor_rune, skill_piercing_strike, skill_preserved_path, skill_path_safeguard, skill_rift_light_step, skill_prey_mark, skill_return_rite, skill_rekindled_forge, skill_forge_spoils, skill_illuminate_path, skill_scorching_heat, skill_last_light_shield, skill_protective_veil, skill_focus_deflection, skill_opportunity_shot, power_restored_path, power_supreme_rift_rune, power_mighty_crimson_fury, power_deep_veil_echo, power_hunter_execution, purple_ember_blood, purple_veil_retaliation, purple_depths_seal, purple_deep_veil_seal, purple_crimson_shackles, purple_blood_tribute, dungeon_skill_dead_torches, dungeon_skill_rekindled_forge, dungeon_skill_summon_guardian, dungeon_skill_forge_spoils, item_skill_deadly_edge, item_skill_mystic_draw, item_skill_last_light_blade (se condição não coberta por DSL), item_skill_drain_life_and_deadly_edge, item_skill_crimson_fury_mighty.

**Novos ScriptCtx.query necessários (sob demanda por habilidade):**
- `query.isPrey(enemyId): boolean`
- `query.isAloneInRoom(): boolean`
- `query.groupHasItem(itemId): boolean`
- `query.heroHealBlocked(heroId): boolean`

**Novos ScriptCtx.action necessários:**
- `action.fixDie(side, index, value)` — power_supreme_rift_rune, power_hunter_execution
- `action.rerollDie(side, index)` — skill_rift_second_chance, skill_minor_rune
- `action.openDiceSelection(opts)` — skill_rift_rune (interativo)
- `action.preventDestroy(heroId)` — power_greater_last_light_miracle (se não migrar para DSL)
- `action.grantEcoToken(heroId)` — power_deep_veil_echo
- `action.spendEcoToken(heroId, option)` — power_deep_veil_echo
- `action.markAsPrey(enemyId)` — skill_prey_mark
- `action.revealDungeonCards(n)` — skill_illuminate_path
- `action.drawArtifact()` — item_skill_mystic_draw
- `action.drawSpecificItem(filter)` — dungeon_skill_rekindled_forge
- `action.spawnEnemy(cardId)` — dungeon_skill_summon_guardian
- `action.redirectCombatTarget(heroId, newEnemyId)` — skill_focus_deflection
- `action.cancelAction(actionType)` — skill_opportunity_shot

**Handlers deletados ao fim do lote (todos os restantes):**
`damage_bonus`, `dice_modification`, `diceFix`, `diceFix_damage`, `damage_bonus_duration`, `token`, `prevent_damage`, `discardDungeon_prevention`, `discardDungeonLock`, `recoverDungeon`, `reroll`, `mark_and_tohit`, `targetProtection`, `targetRedirect_or_tohit`, `dungeon`, `drawItem`, `itemControl`, `splash_damage`, `tohit_penalty`, `item_or_discardDungeon` (restante).

---

## Resumo de contagem

| Lote | Habilidades | Handlers deletados |
|---|---|---|
| Fase 2 (Passo 9) | 1 (smoke test) | — |
| Lote 1 | ~30 | ~7 |
| Lote 2 | ~11 | ~3 |
| Lote 3 | ~6 | ~3 |
| Lote 4 | ~40 | ~22 |
| **Total** | **~88** | **~35** |

> Nota: skill_living_ember_oil (script) e skill_living_ember (DSL) são entradas distintas.
> O count de 88 inclui ambas.
