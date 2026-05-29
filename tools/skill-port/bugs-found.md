# Bugs encontrados na Fase 0 (leitura crítica das labels)

Todos confirmados por comparação entre `label` (intenção do designer) e handler atual.

---

## CRÍTICOS — efeito nunca executa (handler não registrado)

| skill_id | type | problema |
|---|---|---|
| `purple_ember_blood` | `damage_reflect` | Não registrado. Retaliação nunca dispara. |
| `purple_veil_retaliation` | `damage_reflect` | Não registrado. Retaliação nunca dispara. |
| `purple_depths_seal` | `powerBlock` | Não registrado. Heróis usam poderes normally. |
| `purple_deep_veil_seal` | `dungeonLock` | Não registrado. Nível de masmorra pode ser reduzido. |
| `purple_crimson_shackles` | `tohit_damage_penalty` | Não registrado. Penalidade dupla nunca aplicada. |
| `purple_blood_tribute` | `item_or_damage` | Não registrado. Tributo nunca cobrado. |
| `dungeon_skill_dead_torches` | `item_or_tohit_penalty` | Não registrado. Penalidade nunca aplicada. |
| `dungeon_skill_rekindled_forge` | `drawSpecificItem` | Não registrado. Item equipável nunca sacado. |
| `item_skill_mystic_draw` | `drawArtifact` | Não registrado. Artefato nunca sacado. |
| `item_skill_drain_life_and_deadly_edge` | `tohit_damage_heal` | Não registrado. Skill inteira inoperante. |
| `item_skill_block_and_last_light_ward` | `armor_purple_damage_reduction` | Não registrado. Skill inteira inoperante. |
| `item_skill_crimson_fury_mighty` | `self_damage_for_damage_until_end_of_combat` | Não registrado. Skill inteira inoperante. |
| `skill_rekindled_forge` | `recover_item` | Não registrado. Habilidade de herói inoperante. |

---

## CRÍTICOS — handler errado / comportamento incorreto

| skill_id | problema |
|---|---|
| `skill_piercing_strike` | `type='direct_damage'` mas label diz "outra criatura da mesma sala". Handler `direct_damage` aplica a `ctx.targetEnemyIds` ou herói de menor vida — nunca à "outra criatura". O handler correto seria `splash_damage`. |
| `skill_charred_plate` | `handleArmor` aplica `damageReduction` a **todos os heróis ativos**, não à criatura-fonte. Criatura nunca recebe redução. |
| `purple_ash_protection` | Mesmo bug: `handleArmor` afeta heróis, criatura não é protegida. |
| `purple_crimson_plate` | Mesmo bug: `handleArmor` afeta heróis, não a criatura. |
| `boss_skill_living_ash_throne` | Mesmo bug: `handleArmor` afeta heróis, o boss Azhakar não recebe a redução. |
| `item_skill_last_light_blade` | `handleTohitDamage` não verifica se o alvo é boss/subboss — bônus de dano aplicado contra qualquer inimigo. |
| `item_skill_deadly_edge` | Condição "vencer a rolagem por 4 ou mais" não é verificada. Bônus de dano aplicado incondicionalmente. |
| `skill_rift_second_chance` | `handleReroll` filtra dados com `value === 1` (igual a `skill_minor_rune`). Label diz "rerrole 1 dado aliado" sem restrição de valor. |
| `skill_scorching_heat` | `handleTohitPenalty` usa `ctx.sourceHeroId` para aplicar penalidade, mas skill de criatura que penaliza todos os heróis não tem `sourceHeroId`. Penalidade nunca aplicada. |

---

## SÉRIOS — efeito parcialmente implementado

| skill_id | problema |
|---|---|
| `power_mighty_crimson_fury` | Handler adiciona `temporaryEffects['furia-rubra-duracao']` mas `damage_bonus` handler não lê essa flag. Duração "até fim do combate" nunca funciona — bônus sempre some após 1 ataque. |
| `skill_last_light_shield` | `handlePreventDamage` apenas loga. Nenhuma prevenção real de dano ocorre. |
| `power_hunter_execution` | Handler adiciona +1 em `bonusNextAttack` mas não transforma dado azul em 6. Metade do efeito ausente. |
| `power_deep_veil_echo` | `handleToken` concede 1 Eco em `combat.ecoTokens` mas não há implementação do gasto (3 opções da label: +3 acerto / -2 dano / ver 2 cartas do deck). |
| `skill_opportunity_shot` | "ao invés de combater" não implementado — handler aplica dano mas não cancela o combate normal. Herói pode combater E usar o tiro. |
| `skill_last_light_ward` | `handlePurpleDamageReduction` armazena valor em `state.flags` com cast incorreto para `boolean`. Código consumidor do flag pode não ler o número corretamente. Trigger `on_purple_effect_damage_taken` pode não estar wired no dispatcher. |

---

## RISCOS — comportamento dependente de contexto ausente

| skill_id | problema |
|---|---|
| `skill_forge_smoke` | `handleHealBlock` depende de `ctx.targetHeroIds`. Skill passiva de sala pode não ter `targetHeroIds` populado no dispatch. |
| `purple_healing_rupture` | Mesmo risco de `skill_forge_smoke`. |
| `dungeon_skill_summon_guardian` | `type='roomSpecial'` não registrado intencionalmente. Spawn do guardião tratado via `handleSpawnEnemies` sem modelar a condição "enquanto em jogo, impede prevenção de descarte". Comportamento pós-derrota do guardião não implementado. |

---

## JÁ CORRIGIDO (referência)

| skill_id | bug | corrigido em |
|---|---|---|
| `skill_living_ember_oil` | `parseNumber("2/3")` → `null` → guard `if (!amount) return state` → dano nunca aplicado | patch-10 |

---

## Contagem

- 13 skills com handler **não registrado** (efeito zero)
- 9 skills com handler **errado ou incompleto**
- 6 skills com efeito **parcial**
- 3 skills com **risco de ctx vazio**
- **Total: 31 skills com bugs** (35% do catálogo)
