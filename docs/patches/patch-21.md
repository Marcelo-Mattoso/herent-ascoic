# Patch 21 — Vocabulário v2 do schema de skills

Brief de implementação auto-contido. Não depende de conversa prévia.

**Pré-requisitos:**
- **Patch-20 completo.** Copy vive em `src/data/skills.locale.pt-BR.yaml`; regra em `src/data/skills.yaml`. `SkillDefinition` não tem mais `name` / `labelTemplate` / `textTemplate`. Se algum desses ainda existir, pare e volte pro patch-20.

**Objetivo:** adotar integralmente o vocabulário do [schema v2 maximalista](../engine/v2/skill/dungeon_deck_skill_schema.html) descrito no [overview](../engine/v2/skill_system_overview.html). Sete dimensões entram juntas porque se reforçam — adoção parcial gera dois dialetos coexistindo.

**Por quê:**
- As ~64 trigger strings monolíticas (`once_per_room_after_roll`, `combat_if_dungeon_red_or_purple`) escondem 4 conceitos (operate_type, evento, condição, cooldown) no nome.
- O `target: string` monolítico (`hero_or_ally_creature`, `creatures_or_heroes_in_room`) explode em combinações nomeadas em vez de eixos ortogonais.
- 12 entradas usam `defaultValue` slash-pair (`"3/2"`, `"5/5"`) que o motor não lê — é cheat sheet humano disfarçado de dado.
- Arrays-por-cor para escala por despertar não existem hoje; `requiresAwakening` (legado) ainda atrapalha.
- Prefixos de catálogo (`i_/p_/t_/c_/s_/op_/nat_/tgt_/scp_/obj_/evt_`) dão grep-ability e fecham unions abertas (mata stat fantasma em compile).

**Princípio inegociável — vocabulário inteiro ou nada.**
> Cada dimensão do v2 supõe as outras: `operate_type` + `trigger.event` + `cooldown` + `conditions` só fazem sentido juntos; targeting de 4 eixos só vale se substituir o `target` string em todas as skills; prefixos só pagam grep-ability cobrindo o catálogo inteiro. Se um lote propor adoção parcial de uma dimensão (ex.: prefixar só metade dos `kind`), rejeite — vira dialeto duplo.

**Princípio inegociável — comportamento de jogo intacto.**
> Mesma mecânica, mesmo resultado. Patch-21 é vocabulário, não regra nova. Se um teste do motor mudou de assert, rejeite o lote.

**Princípio inegociável — scripts continuam para padrões únicos.**
> Memória do projeto: efeito repetido vira primitiva DSL no core; script só para lógica única. 8 scripts continuam como script no fim do patch-21 (charges, swap target, search-and-equip, summon, armor pierce, passive equipped, ativo que arma listener). Listados em "fora de escopo".

---

## Lote A — Valores: arrays-por-cor + null-skip + cost + slash-pairs inline

**Escopo:** matar o slash-pair de vez e abrir caminho pra escala por despertar. Tudo no eixo de valor.

**Passos:**
1. **Arrays-por-cor em `resolveExpr`** (`src/core/skills/dsl/resolveExpr.ts`):
   - Qualquer valor numérico (`amount`, `value`, `count`, etc.) aceita `number | number[5] | null[5]`.
   - Array é indexado por `state.despertar` (escala `white=0, yellow=1, orange=2, red=3, purple=4`).
   - `null` na posição = sentinela "**effect não dispara** neste despertar". Propagar para o evaluator (skip do nó).
2. **Schema Zod** (`src/core/skills/dsl/schema.ts`): `ExprNodeSchema` ganha alternativa `z.tuple([nullable(number), nullable(number), nullable(number), nullable(number), nullable(number)])`.
3. **`cost` estruturado** (`src/core/data/skillTypes.ts` + `schema.ts`):
   ```yaml
   cost:
     hp: 0
     mp: 2
     discard: 0
   ```
   Campo opcional; valores zero omissíveis. Adicionar leitura em `src/core/skills/useSkill.ts` — checar e debitar antes de despachar effect.
4. **Migração de slash-pairs** (12 entradas em `skills.yaml`):
   - `power_greater_last_light_miracle` (`full/1`) → remove (cosmético, `choose_one` já comunica)
   - `power_supreme_rift_rune` (`6/1`) → remove (script lê valores cravados)
   - `power_last_light_oath` (`5/5`) → remove (effect tem literais)
   - `power_deep_veil_echo` (`1/3/2/2`) → remove (script)
   - `power_hunter_execution` (`6/1`) → remove (script)
   - `purple_crimson_shackles` (`-3/-3`) → remove (literais no effect)
   - `item_skill_last_light_blade` (`2/2`) → remove; substituir literais por `value: 2` inline (já está) — só tirar `defaultValue` e o `params` órfão atual
   - `dungeon_skill_dead_torches` (`-1/1`) → remove
   - `dungeon_skill_forge_spoils` (`2/1`) → remove
   - `item_skill_drain_life_and_deadly_edge` (`1/1`) → remove (effect usa `$value` + literal 1)
   - `item_skill_block_and_last_light_ward` (`3/2`) → remove (effect já usa `$armor`/`$purple` via `params`; manter `params` aqui pois o exemplo correto já está parametrizado)
   - `item_skill_crimson_fury_mighty` (`2/poderosa`) → remove (effect usa `$value`)
5. **Limpeza de campos legados em `SkillDefinition`** (`src/core/data/skillTypes.ts`):
   - Remover `sourceSection?: string` — só metadado histórico, nenhum consumidor runtime.
   - Remover `usesVariable: boolean` — nenhum consumidor runtime; o effect declara se usa `$value`.
   - Remover `defaultValue: number | string | null` — `useSkill.ts:60` lê para fallback escalar; substituir pelo mecanismo já existente `cardRef.params.value`. Skills que dependem de default escalar passam a declarar via `params: { value: N }`.
   - Apagar esses 3 campos de **todas** as entradas em `skills.yaml`.
6. **`useSkill.ts:60`** — ajustar a resolução de `$value`:
   ```ts
   // Antes:
   value !== undefined ? value : (cardRef?.params?.value ?? def.defaultValue);
   // Depois:
   value !== undefined ? value : (cardRef?.params?.value ?? def.params?.value);
   ```

**Critério de aceite:**
- `skills.yaml` sem nenhum `defaultValue`, `sourceSection`, `usesVariable`.
- `resolveExpr` resolve array-por-cor em qualquer posição numérica de effect.
- `null` numa posição causa skip do effect inteiro.
- `cost.mp` debitado antes de skill ativar (teste novo).
- `npx vitest run` verde.

**Risco:** médio. Mudança em `resolveExpr` é central. Testar cada slash-pair migrado isoladamente.

---

## Lote B — Ativação: `operate_type` + `trigger.event` + `conditions[]` + `cooldown`

**Escopo:** decompor o `trigger: string` monolítico em 4 conceitos ortogonais.

**Passos:**
1. **Catálogo `op_*`** em `src/core/skills/dsl/types.ts`:
   ```ts
   export type OperateType = "op_active" | "op_active_buff" | "op_triggered" | "op_passive";
   ```
2. **Catálogo `evt_*`** (18 eventos atômicos) em `src/core/skills/dsl/types.ts`:
   - Combate: `evt_attack_declared`, `evt_roll`, `evt_hit`, `evt_damage_dealt`, `evt_damage_taken`, `evt_destroy`, `evt_kill`
   - Ciclo: `evt_combat_start`, `evt_combat_end`, `evt_round_start`, `evt_round_end`
   - Sala: `evt_room_reveal`, `evt_room_enter`, `evt_room_leave`, `evt_dungeon_discard`
   - Entidade: `evt_enter_play`, `evt_leave_play`, `evt_targeted`
3. **`conditions[]`** com `any_of` para OR (`src/core/skills/dsl/resolveCondition.ts`):
   ```yaml
   conditions:
     - { kind: awakening, gte: orange }
     - any_of:
         - { kind: target_has_status, status: bleeding }
         - { kind: target_has_status, status: poisoned }
   ```
   Combinação default é AND. Estender `ConditionNodeSchema` no Zod.
4. **`cooldown` estruturado**:
   ```yaml
   cooldown:
     scope: room  # game | room | combat | round
     charges: 1
   ```
5. **Forma nova de skill** em `SkillDefinition`:
   ```ts
   readonly operate_type: OperateType;
   readonly trigger?: { event: EventName };
   readonly conditions?: readonly ConditionNode[];
   readonly cooldown?: { scope: "game"|"room"|"combat"|"round"; charges: number };
   ```
   Remover o `trigger: TriggerName` legado.
6. **Migração das ~64 trigger strings** em `skills.yaml` para a nova forma. Tabela de mapeamento em arquivo separado (`tools/skill-port/trigger-migration.md`) — cada string vira `{ operate_type, trigger.event, conditions?, cooldown? }`.
7. **`resolveTrigger`** (`src/core/skills/dsl/resolveTrigger.ts`): substituir o parser de trigger string pelo despacho direto baseado em `operate_type` + `trigger.event`.
8. **`add_trigger` (primitiva) não vira `p_trigger`.** O schema v2 não tem primitiva de instalação de listener — reatividade fica no nível da skill (`op_triggered`). Os scripts reativos puros migram em 21-G para `op_triggered` no nível da skill.

**Critério de aceite:**
- Nenhuma entrada em `skills.yaml` usa `trigger: "string_monolítica"`.
- Todas têm `operate_type` + (se `op_triggered`) `trigger.event`.
- `conditions[]` com `any_of` validado por teste.
- `cooldown.scope = room` reseta a cada nova sala (teste).
- `npx vitest run` verde.

**Risco:** alto. Toca todas as skills + parser de trigger + condições. Sub-dividir em PRs por categoria de skill (poder de herói, item, dungeon, chefe) se ficar grande demais.

---

## Lote C — Targeting de 4 eixos

**Escopo:** substituir `target: string` por 4 campos ortogonais.

**Passos:**
1. **Catálogos** em `src/core/skills/dsl/types.ts`:
   - `target_type: tgt_self | tgt_target | tgt_enemy | tgt_item | tgt_others | tgt_none`
   - `affect_scope: scp_single | scp_party_full | scp_dead_party | scp_room | scp_none`
   - `affect_object: obj_friend | obj_not_friend | obj_all`
   - `affect_limit: { min: number; max: number }` — `{ min: 0, max: 0 }` ou omitido = sem limite
2. **`SkillDefinition`** ganha os 4 campos; perde `target: TargetSpec`.
3. **`resolveEntityRef` / `resolveEntityListRef`** (`src/core/skills/dsl/resolveExpr.ts`): compor lista de alvos a partir dos 4 eixos. Perspectiva amigo/inimigo resolve pela posição do caster (`obj_friend` para uma dungeon castando atinge monstros; para um herói atinge outros heróis).
4. **`$each`** como nova referência simbólica — iteração sobre `affect_scope` quando ≠ `scp_single`.
5. **Migração** das ~20 target strings em `skills.yaml` para os 4 eixos. Tabela em `tools/skill-port/target-migration.md`.
6. **Targeting strings legadas removidas** de `TargetSpec` em `skillTypes.ts`. Tipo deixa de existir.

**Critério de aceite:**
- Nenhuma entrada em `skills.yaml` usa `target: "..."`.
- Todas têm `target_type` + `affect_scope` + `affect_object` + (opcional) `affect_limit`.
- `$each` itera corretamente em `scp_room` / `scp_party_full` (teste).
- `npx vitest run` verde.

**Risco:** alto. Targeting é central. Cada skill precisa revisão manual de perspectiva.

---

## Lote D — `nature[]` declarativa

**Escopo:** adicionar o campo `nature: nat_*[]` em `SkillDefinition`. Sistema de resistências fica para depois.

**Passos:**
1. **Catálogo `nat_*`** em `types.ts`:
   - Tipo: `nat_physical`, `nat_magical`
   - Elementos: `nat_fire`, `nat_water`, `nat_earth`, `nat_wind`, `nat_holy`, `nat_dark`
   - Estados: `nat_bleed`, `nat_poison`, `nat_shock`, `nat_paralyze`, `nat_sleep`, `nat_hold`, `nat_derangement`
   - Especiais: `nat_death`, `nat_true`
2. **`SkillDefinition`** ganha `readonly nature: readonly Nature[]` (opcional, default `[]`).
3. **Popular `nature[]`** em todas as skills em `skills.yaml`. Ex.: `skill_last_light_healing` → `[nat_magical, nat_holy]`. Decisão skill a skill (apoio em `docs/spec/v3/habilidades_1.json` se ajudar).
4. **Sistema de resistências fica fora.** Nenhuma alteração em `damageSystem` neste lote.

**Critério de aceite:**
- Todas as skills declaram `nature: [...]` (mesmo que `[]`).
- Schema Zod valida o catálogo `nat_*` (closed enum).
- `npx vitest run` verde.

**Risco:** baixo. Campo declarativo, sem efeito de motor.

---

## Lote E — Prefixos `i_/p_/t_/c_` + `s_`

**Escopo:** codemod aplicando prefixos aos `kind` de effect e aos `stat` de modifier. Fecha `ModifierStat` como literal type estrita.

**Passos:**
1. **Renomear `kind` em `EffectNode`** (`types.ts`, `schema.ts`, `evaluate.ts`, `resolver.ts`):
   - `apply_damage` → `i_damage`
   - `apply_heal` → `i_heal`
   - `apply_full_heal` → `i_full_heal`
   - `prevent_destroy` → `i_prevent_destroy`
   - `add_modifier` → `p_modifier`
   - `add_trigger` → permanece `add_trigger` (caso especial — não migra pra `p_trigger`; ver patch-22 ou fica como extensão local)
   - `block_action` → `p_block`
   - `discard_from` → `i_discard`
   - `draw_from` → `i_draw`
   - `draw_and_choose` → `i_draw_and_choose`
   - `reveal_dungeon` → `i_reveal_dungeon`
   - `recover_dungeon` → `i_recover_dungeon`
   - `advance_dungeon_level` → `i_advance_dungeon`
   - `prevent_dungeon_discard` → `i_prevent_dungeon_discard`
   - `prevent_next_damage` → `i_prevent_next_damage`
   - `ignore_next_targeting` → `i_ignore_next_targeting`
   - `mark_target` → `i_mark_target`
   - `set_no_reward` → `i_set_no_reward`
   - `grant_pending_reward` → `i_grant_reward`
   - `choose_one` → `i_choose_one`
   - `if` → `i_if`
   - `for_each` → `i_for_each`
   - `noop` → `i_noop`
2. **Renomear `stat` em `add_modifier` / `p_modifier`** (catálogo `s_*`):
   - `damage_reduction` → `s_damage_reduction`
   - `purple_damage_reduction` → `s_purple_damage_reduction`
   - `tohit_bonus` → `s_hit_bonus`
   - `tohit_penalty` → `s_hit_penalty`
   - `damage_bonus` → `s_damage_dealt`
   - `damage_penalty` → `s_damage_penalty`
   - `heal_blocked` → `s_heal_blocked`
   - `flee_blocked` → `s_flee_blocked`
   - `dungeon_discard_prevention` → `s_dungeon_discard_prevention`
   - `dungeon_discard_locked` → `s_dungeon_discard_locked`
   - `first_damage_prevented` → `s_first_damage_prevented`
3. **Fechar `ModifierStat`** como literal union estrita. Remover `| (string & {})`. Stat fora do catálogo = erro de compile.
4. **Codemod** em `skills.yaml` aplicando os renames.
5. **Atualizar `resolver.ts:ecsTargetMap`** para usar os nomes novos.

**Critério de aceite:**
- Nenhum `kind` em `skills.yaml` sem prefixo `i_/p_`.
- Nenhum `stat` sem prefixo `s_`.
- `ModifierStat` é literal type fechado.
- `npx vitest run` verde — mesmo comportamento.

**Risco:** médio. Mecânico, mas grande superfície. Codemod cuidadoso.

---

## Lote F — Primitivas novas

**Escopo:** adicionar 5 primitivas que matam 7 scripts.

**Passos:**
1. **`i_modify_die`** — altera resultado de dado já rolado. Parâmetros: `delta: ExprNode`, `target: tgt_*`.
2. **`i_reroll`** — re-rola dado(s). Parâmetros: `count: ExprNode`, condição opcional (`only_if_value: ExprNode`).
3. **`i_set_die`** — define valor de dado. Parâmetros: `value: ExprNode`, `target: tgt_*`.
4. **`i_dispel`** — remove categoria de status. Parâmetros: `category: "buff" | "debuff" | "poison" | ...`.
5. **`i_remove_status`** — remove status específico. Parâmetros: `status: string`.
6. Implementar em `types.ts`, `schema.ts`, `evaluate.ts`, `resolver.ts` para cada uma.
7. **Migrar scripts** para as novas primitivas:
   - `skill_rift_rune` → `i_modify_die`
   - `skill_rift_second_chance` → `i_reroll`
   - `skill_perfect_rune` → `i_set_die(value: 6)`
   - `skill_minor_rune` → `i_if(die_value=1) → i_reroll`
   - `skill_rift_evasion` → `i_reroll(enemy die)`
   - `power_supreme_rift_rune` → `i_choose_one(i_set_die:6 ally / i_set_die:1 enemy)`
   - `power_hunter_execution` → `i_set_die:6 + i_if(hit) → i_damage:1`
8. Apagar os 7 arquivos de script em `src/data/scripts/`.

**Critério de aceite:**
- 7 scripts removidos.
- Testes de cada skill migrada passam com asserts equivalentes aos do script antigo.
- `npx vitest run` verde.

**Risco:** baixo-médio. Cada primitiva é isolada; cobertura por teste por skill migrada.

---

## Lote G — Scripts triviais → DSL

**Escopo:** migrar scripts que só precisam de `i_if` ou `op_triggered` (sem primitiva nova).

**Passos:**
1. `skill_crimson_fury` → `i_damage($self, $value) + p_modifier(s_damage_dealt, expr: "3*$value", once)`.
2. `skill_living_ember_oil` → `i_if(target_has_skill(gelatinous) → i_damage:3, else i_damage:2)`.
3. `purple_ember_blood` → skill inteira vira `operate_type: op_triggered, trigger.event: evt_damage_taken, effects: [i_damage($source, 1)]`. Reatividade no nível da skill.
4. `purple_veil_retaliation` → mesma forma.
5. Apagar os 4 arquivos de script.

**Critério de aceite:**
- 4 scripts removidos.
- Testes passam.
- `npx vitest run` verde.

**Risco:** baixo. Refator declarativo.

---

## Ordem dos lotes

| Ordem | Lote | Depende de |
|---|---|---|
| 1 | 21-A | nenhum (pode rodar livre) |
| 2 | 21-B | nenhum (independente de A) |
| 3 | 21-C | 21-B (operate_type fixa a forma do trigger antes do targeting) |
| 4 | 21-D | nenhum (independente) |
| 5 | 21-E | 21-A, 21-B, 21-C, 21-D estabilizados (codemod sobre alvo estável) |
| 6 | 21-F | 21-E (usa nomes novos) |
| 7 | 21-G | 21-E (usa nomes novos) |

A, B, D podem rodar em paralelo. C depende de B. E é gargalo: F e G só depois.

---

## Fora de escopo do patch-21 (seguem como `script`)

| Script | Motivo |
|---|---|
| `power_deep_veil_echo` | Sistema de charges (Eco) — único caso |
| `skill_focus_deflection` | Swap target — caso isolado |
| `skill_rekindled_forge` | Search-and-equip — sem 3º caso de uso |
| `dungeon_skill_rekindled_forge` | Idem |
| `dungeon_skill_summon_guardian` | Summon de subchefe específico |
| `skill_piercing_strike` | Armor pierce — único |
| `skill_hunter_focus` | Passive equipped — único |
| `skill_opportunity_shot` | Ativo que instala listener temporário — padrão fora do v2 |

---

## Decisões adiadas conscientemente

- **Sistema de charges** (`i_grant_charge`/`i_spend_charge`) — quando aparecer 2ª skill com recurso por carta.
- **Sistema de resistências por `nature[]`** — campo entra em 21-D, regra fica para quando o design de combate exigir.
- **Catálogo formal de `status` nominados (`p_status`)** — quando passar de ~5 status únicos em uso.
- **Primitivas `t_*` (DoT/HoT) e `c_*` (tick caster)** — zero usos hoje.
- **Primitiva `p_trigger` / `i_install_trigger`** — não prevista pelo v2; só `skill_opportunity_shot` usaria.
- **Aposentar `combat` legacy e dual-write em `add_modifier`** — patch próprio, continuidade do patch-18.

---

## Referência

- [Schema v2 completo](../engine/v2/skill/dungeon_deck_skill_schema.html) — fonte da verdade do vocabulário. Quando este doc e o schema divergirem, o schema vence.
- [Sistema de skills — visão de adoção](../engine/v2/skill_system_overview.html) — overview pragmático que conecta v2 ao código atual.
- [Patch-20](patch-20.md) — pré-requisito.
