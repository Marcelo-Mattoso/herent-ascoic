# Patch 12 — Refazer `skills.json`: DSL ou script por habilidade

Brief de implementação auto-contido. Não depende de conversa prévia.

**Pré-requisitos:**
- **Patch-10** (sistema de scripts) — fornece `src/data/scripts/`, `ScriptCtx`, `handlers/script.ts`, `src/core/scripts/registry.ts`. Bloqueante.
- **Patch-11** (ids canônicos) — fornece `skill_xxx` / `power_xxx` / `purple_xxx` / `item_skill_xxx` / `dungeon_skill_xxx` / `boss_skill_xxx` como identificadores estáveis. Bloqueante.

**Escopo deliberado:**
- Toca **apenas** `src/data/skills.json`. `src/data/cards.json` fica intocado.
- **Não renomeia** arquivos nem tipos. `skills.json` continua sendo `skills.json`, `SkillDefinition` continua sendo `SkillDefinition`. Mudanças léxicas amplas são problema de outro patch (ou nunca).

---

## Protocolo de execução (economia de tokens)

Quem implementa este patch trabalha **uma fase por vez** e gasta o mínimo de tokens:

- **Não releia arquivos.** O harness rastreia o estado pós-edição; `Edit` falha se o trecho não bater. Não reabra um arquivo "para conferir" depois de editar.
- **Leia em paralelo, leia uma vez.** Dispare os `Read` de uma fase no mesmo turno. Cada arquivo, uma leitura.
- **Não leia `skills.json` inteiro.** São 82 entradas. Use `Grep`/`Read offset+limit` para a entrada que está migrando. Migração em massa (Lotes) = processar entrada por entrada, não despejar o arquivo no contexto.
- **`Edit` (diff), nunca `Write` o arquivo todo** quando só um trecho muda.
- **Valide uma vez por fase, não por edição.** `npm test` / `build` / `lint` ao fechar a fase ou o lote — não após cada handler migrado. Para iterar num teste só, rode o arquivo de teste isolado (`vitest run <path>`), não a suíte inteira.
- **Greps de aceite são comandos exatos.** Rode-os como escritos; não explore em volta.
- **Relate em uma linha por fase.** Sem colar diffs grandes nem narrar passo a passo.
- **Não carregue contexto das fases seguintes** até chegar nelas. A Fase 0 produz specs que são lidas sob demanda no lote correspondente, não todas de uma vez.

---

## Diagnóstico

Hoje, comportamento de uma habilidade vive **espalhado em três fontes que se contradizem** e em **dois pipelines paralelos que não se falam**.

**Três fontes que se contradizem.** Cada habilidade existe em:
- `skills.json` (`type`, `value`, `trigger`, `target`) — metadados que **deveriam** ditar comportamento, mas são tão genéricos que não ditam.
- `src/core/skills/handlers/<type>.ts` (37 handlers genéricos) — um handler serve N habilidades; ele não sabe qual está executando, só sabe o tipo.
- `label` em `cards.json` — única descrição completa do comportamento esperado, em prosa, sem compilador.

O Frasco de Óleo Incendiário (Brasa Viva) provou isso na carne: `direct_damage` chamava `parseNumber("2/3")` → `null`, guard `if (!amount) return state`, nada acontecia. Anos quebrado, sem alarme. A função "Brasa Viva" não existia como artefato em lugar nenhum.

**Dois pipelines que não se falam.** O projeto tem dois subsistemas de effects que o doc de arquitetura ([`docs/engine/v2/card_game_architecture.html`](../engine/v2/card_game_architecture.html)) descreve como **um único bloco "Triggers · stack · ECS"**:

- **Effect stack** (`src/core/effects/`) — fila LIFO/FIFO de `PendingEffect`, drenada por `drainStack`. Resolve `apply_damage`, `apply_heal`, `noop`. Ordem regida por [`src/data/event_rules.json`](../../src/data/event_rules.json).
- **ECS components** (`src/core/ecs/types.ts`) — `ModifierComponent` (target/operation/value/duration), `TriggerComponent` (on/condition/effect), `ConditionComponent`. Aplicados via `src/core/systems/modifierSystem.ts` e `src/core/events/effectResolver.ts`.

Os comentários no código contam que o refator ECS estava sendo feito em **Passos numerados** e parou:
- [`modifierSystem.ts:1-2`](../../src/core/systems/modifierSystem.ts) — *"Passo 6: apenas a query utilitária. A aplicação em tempo real vem no Passo 7 (event bus)."*
- [`ecs/sync.ts:1-3`](../../src/core/ecs/sync.ts) — *"transição ECS está em andamento (Passos 5-6). Quando todos os handlers migrarem para sistemas, estes helpers são removidos."*
- [`effectResolver.ts:3-4`](../../src/core/events/effectResolver.ts) — *"Passo 7: accumulator effects. Passo 8: push_to_stack — adia efeito para drenagem posterior."*
- [`effects/stack.ts:5-6`](../../src/core/effects/stack.ts) — *"Passo 8: efeitos encadeados são enfileirados aqui em vez de aplicados imediatamente."*

O **Passo 9 nunca foi feito**: habilidades nunca passaram a emitir para o bus. Os 37 handlers mutam state direto (`combat.bonusNextAttack[id] = [...]`, `applyDamage(state, id, n)`), ignorando o pipeline que estava esperando. Modifiers em ECS existem mas não interceptam dano de skill, porque o dano de skill não emite evento.

Este patch fecha as duas coisas de uma vez: refaz `skills.json` para que cada habilidade tenha **um corpo definido** (DSL ou script), e faz esse corpo **plugar no pipeline existente** em vez de criar um terceiro caminho paralelo.

---

## Objetivo

Reescrever toda entrada de `src/data/skills.json` para que cada habilidade declare seu comportamento **explicitamente**, em uma de duas formas:

- **DSL** — campo `effect: EffectDescriptor[]`. Array de nós tipados que o evaluator empurra para o pipeline (stack + ECS). Cabe ~50-70% das habilidades.
- **Script** — campo `script: "<skill_id>"`. Arquivo em `src/data/scripts/<skill_id>.ts` exporta `run(ctx)`. Para o resto.

Ambos caminhos **terminam no pipeline ECS**: empurram para `EffectStack`, adicionam `ModifierComponent`, emitem eventos no bus. Não há mais mutação direta de `combat.bonusNextAttack` ou similares.

Ao final:
- `skills.json` tem 82 entradas com `effect` **ou** `script` declarado.
- Os 37 handlers em `src/core/skills/handlers/` morrem (exceto talvez `noop`).
- O Passo 9 da migração ECS está fechado.
- O Frasco e qualquer irmão silencioso aparecem como teste vermelho durante o port e são consertados no mesmo PR.

---

## Forma das entradas pós-patch

### Variante DSL

```json
{
  "id": "skill_red_fury",
  "name": "Fúria Rubra",
  "category": "habilidade",
  "trigger": { "on": "before_attack" },
  "target": "self",
  "params": { "cost": 2 },
  "effect": [
    { "kind": "apply_damage",
      "to": "$source",
      "amount": "$cost",
      "minimum": 1 },
    { "kind": "add_modifier",
      "to": "$source",
      "stat": "damage_dealt",
      "operation": "add",
      "value": { "op": "mul", "args": ["$cost", 3] },
      "duration": { "kind": "once" } }
  ],
  "usedBy": [...]
}
```

### Variante script

```json
{
  "id": "skill_living_ember",
  "name": "Brasa Viva",
  "category": "habilidade_item",
  "trigger": { "on": "on_use" },
  "target": "enemy_creature",
  "params": { "base": 2, "boosted": 3 },
  "script": "skill_living_ember",
  "usedBy": [...]
}
```

E `src/data/scripts/skill_living_ember.ts`:

```ts
import type { ScriptHandler } from "@/core/scripts/types";

export const run: ScriptHandler = (ctx) => {
  const enemyId = ctx.skillCtx.targetEnemyIds?.[0];
  if (!enemyId) return ctx.state;
  const boosted = ctx.query.creatureHasSkill(enemyId, "skill_gelatinous_body");
  const amount = boosted
    ? (ctx.params.boosted as number)
    : (ctx.params.base as number);
  return ctx.action.pushEffect({
    type: "apply_damage",
    targetId: enemyId,
    amount,
  });
};
```

### Regras de exclusividade

- Toda entrada tem **exatamente um** dos dois: `effect` ou `script`. Nunca os dois. Nunca nenhum.
- Schema valida no carregamento.
- `type` antigo é **removido** de toda entrada. `value` antigo também (substituído por `params` quando há variação).

---

## Forma do `trigger`

Hoje `trigger` é uma string que mistura **duas perguntas distintas** que o `parseTrigger` (`src/core/skills/dispatch.ts`) desembrulha na mão:

- **Quando** a habilidade é considerada — o evento (`before_attack`, `on_use`, `passive`).
- **Se** ela pode disparar agora — codificado dentro do próprio nome via aliases compostos (`combat_if_dungeon_red_or_purple`, `combat_against_self`) e guards de cardinalidade (`once_per_combat`, `once_per_game`).

Isso é a mesma separação que o `TriggerComponent` da ECS (`src/core/ecs/types.ts`) já modela: `{ on: EventType, condition?: ComponentPredicate, ... }`. O `on` é o evento; o `condition` é a regra. O patch alinha `skills.json` a essa estrutura.

Pós-patch, `trigger` deixa de ser string e passa a ser objeto:

```json
"trigger": {
  "on": "before_attack",
  "when": { "kind": "compare", "op": "eq", "left": "$dungeon.color", "right": "red" },
  "limit": "once_per_combat"
}
```

| Campo   | Obrigatório | Significado                                                                 |
| ------- | ----------- | --------------------------------------------------------------------------- |
| `on`    | sim         | `EventType` puro. O evento que põe a habilidade em consideração.            |
| `when`  | não         | `ConditionNode` — gate "pode disparar?". **Reusa o mesmo vocabulário de condição da DSL de effect.** Avaliado pelo mesmo evaluator. Ausente = sempre permite. |
| `limit` | não         | Guard de cardinalidade consumível (`once_per_game` / `once_per_combat` / `once_per_room` / `once_per_round`). Ausente = sem limite. |

Regras:

- **`when` não inventa linguagem nova.** É um `ConditionNode` da tabela de Condições abaixo (`has_skill`, `has_condition`, `compare`, `and`/`or`/`not`). Um único evaluator de condição serve duas posições: o gate do trigger e o nó `if` dentro de `effect`.
- **`limit` é separado de `when` de propósito.** `when` é uma pergunta pura (sem efeito colateral). `limit` exige mutação — marcar a habilidade como já usada naquele escopo. Misturar os dois quebraria a pureza do evaluator de condição. O dispatcher checa `limit` contra o estado de uso antes de avaliar `when`.
- **Aliases compostos morrem.** `combat_if_dungeon_red_or_purple` deixa de existir como string mágica: vira `{ "on": "combat", "when": { "kind": "or", ... } }`. O `parseTrigger` encolhe para só normalizar `on` e ler `limit`/`when`; a lógica de string-parsing de condição sai.
- **Sem "trigger script" separado.** Se a condição é complexa demais para `when` (varrer o tabuleiro, contar cartas, lógica fora da gramática), a habilidade inteira já é `script` — e o script checa a condição em TS no início de `run` e retorna `ctx.state` inalterado se não passar. Não há granularidade "DSL no effect mas script só no trigger".

---

## Vocabulário da DSL

Discriminado por `kind`. Cobre o que `EffectDescriptor` e `ModifierComponent` já sabem fazer no pipeline existente.

### Effects (vão para o pipeline)

| `kind`            | Argumentos principais                                            | Pipeline                  |
| ----------------- | ---------------------------------------------------------------- | ------------------------- |
| `apply_damage`    | `to`, `amount`, `minimum?`                                       | push para `EffectStack`   |
| `apply_heal`      | `to`, `amount`                                                   | push para `EffectStack`   |
| `add_modifier`    | `to`, `stat`, `operation`, `value`, `duration`, `condition?`     | addComponent              |
| `add_trigger`    | `to`, `on`, `effect`, `duration`, `condition?`, `priority?`      | addComponent              |
| `add_condition`   | `to`, `conditionType`, `duration`                                | addComponent              |
| `remove_modifier` | `to`, `source?` (qual habilidade originou)                       | removeComponent           |
| `block_action`    | `what` (`flee` / `heal` / `dungeon_discard`)                     | addComponent              |
| `draw_from`       | `pile` (`dungeon` / `item_deck`), `count`                        | push para `EffectStack`   |
| `discard_from`    | `pile`, `count`                                                  | push para `EffectStack`   |
| `move_card`       | `cardId`, `from`, `to`                                           | push para `EffectStack`   |
| `redirect_target` | `from`, `to`                                                     | mutação do evento em voo  |
| `noop`            | —                                                                | —                         |

### Composição

| `kind`        | Argumentos                                                       |
| ------------- | ---------------------------------------------------------------- |
| `if`          | `when: ConditionNode`, `then: EffectDescriptor[]`, `else?: ...` |
| `choose_one`  | `options: { label, effect: EffectDescriptor[] }[]`              |
| `for_each`    | `over` (`targets` / `allies` / `enemies`), `as`, `do: ...`      |

### Expressões (no campo `amount`, `value`, etc.)

| Forma                                          | Significado            |
| ---------------------------------------------- | ---------------------- |
| `2` (número)                                   | literal                |
| `"$nome"`                                      | ref a `params.nome` ou aos refs `$source`, `$target`, `$value` |
| `{ "op": "add"\|"sub"\|"mul"\|"min"\|"max", "args": [...] }` | aritmética             |

### Condições

| `kind`           | Argumentos                                          |
| ---------------- | --------------------------------------------------- |
| `has_skill`      | `of`, `skillId`                                     |
| `has_condition`  | `of`, `conditionType`                               |
| `compare`        | `op` (`lt`/`lte`/`eq`/`gte`/`gt`), `left`, `right`  |
| `and` / `or` / `not` | composição lógica                               |

Estes `ConditionNode` servem **duas posições**: o nó `if` dentro de `effect` e o campo `when` do `trigger`. Mesmo schema, mesmo evaluator (`resolveCondition`).

Total: ~12 effects + 3 nós de composição + 3 nós de expressão + 4 nós de condição = **~22 nós**. Cobre o catálogo atual estimado em ~70% DSL / 30% script.

### Refs simbólicas reservadas

- `$source` — entidade que disparou a habilidade (sourceHeroId ou sourceEnemyId).
- `$target` — alvo escolhido (resolve para targetHeroIds[0] / targetEnemyIds[0]).
- `$targets` — todos os alvos.
- `$value` — compat: o valor legado de `usedBy[].value`. Use `params` em vez disso quando possível.
- `$<nome>` — referência a `params.<nome>` da habilidade (com override possível em `usedBy[]`).

---

## ScriptCtx: API que ambos caminhos consomem

Para a Variante Script, o `ScriptCtx` existente (patch-10) cresce com primitivas que **plugam no pipeline**, não que mutam state direto. Esta é a fachada também usada pelo evaluator da DSL — os dois caminhos compartilham o vocabulário.

```ts
export interface ScriptCtx {
  readonly state: GameState;
  readonly skillCtx: SkillContext;
  readonly params: Readonly<Record<string, unknown>>; // params da habilidade
  
  readonly query: {
    creatureHasSkill(enemyId: string, skillId: string): boolean;
    heroWithLowestLife(): string | null;
    targetHasCondition(targetId: string, conditionType: string): boolean;
    diceRolled(): readonly number[];
    currentAttackerId(): string | null;
    currentDefenderId(): string | null;
    // cresce sob demanda
  };
  
  readonly action: {
    // Empurra para a EffectStack — drenado em ordem.
    pushEffect(descriptor: EffectDescriptor): GameState;
    
    // Adiciona componente (Modifier/Trigger/Condition) na entidade.
    addComponent(entityId: string, component: Component): GameState;
    removeComponentsBySource(entityId: string, source: string): GameState;
    
    // Emite evento no bus — modifiers/triggers em ECS podem interceptar.
    emit(event: GameEvent): GameState;
    
    // Continuação após escolha (SKILL_CHOICE).
    requestChoice(options: ChoiceOption[]): GameState;
  };
  
  readonly log: (msg: string) => GameState;
}
```

Regra inegociável: **`action.*` nunca muta state direto**. Todo efeito passa por `pushEffect`, `addComponent` ou `emit`. Isso fecha o Passo 9 — Capitão Garfo das duas camadas se reúne aqui.

---

## Inventário

Pós patch-11:

- **82 entradas** em `skills.json`, cada uma com `id` canônico.
- **37 handlers** em `src/core/skills/handlers/`, cada um abrigando lógica de 1-5 habilidades.
- **1 habilidade já migrada para script** (`skill_living_ember` via patch-10).

Distribuição estimada pós-port (refinada na Fase 0):

| Caminho                                          | Estimativa | Exemplo |
| ------------------------------------------------ | ---------- | ------- |
| DSL pura (sem condicional, sem composição)       | ~35        | `apply_damage` direto, `apply_heal`, `add_modifier` |
| DSL com `if`                                     | ~10        | "se condição X, modificador Y" |
| DSL com `choose_one`                             | ~5         | Juramento da Última Luz, Heal/Survive |
| Script (lógica que DSL não cobre limpo)          | ~30        | Frasco, manipulação de masmorra, dado |
| `noop` explícito                                 | ~2         | placeholders |

São números chutados — fechar na Fase 0.

---

## Plano em fases

Cada fase é um (ou mais) commits atômicos. Lotes 1-4 podem ser PRs separados ou um único PR longo conforme apetite.

### Fase 0 — Spec + decisão DSL/script por habilidade

Antes de codar, para cada uma das 81 habilidades restantes (skill_living_ember já feito) escrever spec em `tools/skill-port/specs/<skill_id>.md`:

```markdown
# <skill_id> — <name PT-BR>

## Origem
- type/value/trigger/target atuais
- Handler atual e o que ele faz
- Label(s) das cartas em usedBy[]

## Trigger decomposto
- `on`: evento puro extraído da string antiga.
- `when`: condição extraída do alias composto (ou nenhuma).
- `limit`: guard de cardinalidade extraído (ou nenhum).

## Comportamento esperado
Prosa derivada de leitura crítica da label. Quando label promete
mais que o handler entrega, ganha a label (é a intenção do designer).

## Decisão: DSL ou script
Marcar uma das duas, com justificativa de uma linha.

## Casos de teste
1. <descrição>: dado X, quando Y, então Z.
```

Saídas paralelas:
- `tools/skill-port/expansion-plan.md` — listagem das primitivas faltantes no `ScriptCtx` por lote.
- `tools/skill-port/dsl-vocabulary.md` — refinamento dos `kind`s da DSL conforme specs revelem necessidade.
- `tools/skill-port/bugs-found.md` — lista de bugs históricos (Frasco-like) descobertos na leitura crítica das labels.

**Aceite:** 81 specs gravadas e revisadas pelo designer. Decisão DSL/script tomada por habilidade. Lista de bugs históricos publicada para revisão.

---

### Fase 1 — Schema TS e evaluator da DSL

1. Criar `src/core/skills/dsl/types.ts` com a união discriminada por `kind` (Effect, Composition, Expr, Condition). Schema Zod equivalente em `src/core/skills/dsl/schema.ts`.

2. Criar `src/core/skills/dsl/evaluate.ts`: `evaluate(effects: EffectDescriptor[], ctx: ScriptCtx): GameState`. Caminha o array, resolve refs (`$source`, `$target`, `$param`), avalia expressões, despacha:
   - `apply_damage` / `apply_heal` / `draw_from` / ... → `ctx.action.pushEffect(...)`
   - `add_modifier` / `add_trigger` / `add_condition` / `block_action` → `ctx.action.addComponent(...)`
   - `if` → avalia `ConditionNode`, recurse no ramo certo
   - `choose_one` → `ctx.action.requestChoice(...)` e pausa
   - `for_each` → loop sobre alvos resolvidos

3. Criar `src/core/skills/dsl/resolveExpr.ts` para `ExprNode` e `src/core/skills/dsl/resolveCondition.ts` para `ConditionNode`. Funções puras. `resolveCondition` é o evaluator compartilhado pelo nó `if` e pelo `trigger.when` — uma só implementação.

4. Criar `src/core/skills/dsl/resolveTrigger.ts`: dado o `trigger` (`{ on, when?, limit? }`) e o `ScriptCtx`, decide se a habilidade dispara — checa `limit` contra o estado de uso, depois avalia `when` via `resolveCondition`. Não emite efeito; só responde sim/não. Schema Zod do `trigger` (objeto, não string) entra em `schema.ts`.

5. Teste unitário do evaluator com fixtures isolados (Fúria Rubra como caso de prova: dado `cost=2`, push de `apply_damage` com `amount=2` + `addComponent ModifierComponent` com `value=6 duration=once`). Teste de `resolveTrigger` cobrindo `when` verdadeiro/falso e `limit` esgotado.

**Aceite:** evaluator passa testes unitários para os ~5 kinds mais usados. `resolveTrigger` passa teste de gate (`when`) e de cardinalidade (`limit`). Schema Zod rejeita `trigger` em formato string antigo e `effect`/`when` inválidos com erro legível. Nenhuma habilidade real ainda migrada — só infra.

---

### Fase 2 — Passo 9: ScriptCtx como fachada do pipeline

Fechar o gap entre os dois mundos. Atualizar `src/core/scripts/context.ts` para que `ctx.action.*` chame exclusivamente as APIs do pipeline:

1. `action.pushEffect(descriptor)` — chama `addPending` em `src/core/effects/stack.ts`.
2. `action.addComponent(id, component)` — opera sobre o `World` ECS, sincronizado via `src/core/ecs/sync.ts`.
3. `action.removeComponentsBySource(id, source)` — para limpeza de modifiers expirados/dispelled.
4. `action.emit(event)` — passa pelo `bus.ts`, permite que `applyEffect` em `effectResolver.ts` intercepte.
5. `action.requestChoice(options)` — registra `pendingSkillChoice` no `GameState`, pausa drenagem.

Atualizar `skill_living_ember.ts` para usar a API nova (substituir `action.dealDamage` por `action.pushEffect({ type: "apply_damage", ... })`). Teste existente continua verde.

Adicionar `action.dealDamage` como deprecated no contexto antigo — mantém compat por uma janela curta.

**Aceite:** `skill_living_ember` migrado para `pushEffect`. Smoke test existente verde. Handler de damage no resolver atende a chamada vinda do script.

---

### Lote 1 — DSL pura: dano, cura, modifier simples (Fase 3)

Para cada habilidade marcada como "DSL pura" na Fase 0:

1. Em `skills.json`, remover `type` e `value`. Adicionar `effect: [...]` no formato DSL. Adicionar `params` se houver variação numérica.
2. Em `usedBy[]`, manter `value` apenas se o evaluator ainda precisa dele para `$value`. Preferir adicionar `params` no `usedBy[]` que sobrescreve os defaults da habilidade.
3. Escrever teste em `src/core/skills/dsl/__tests__/<skill_id>.test.ts`: monta `GameState`, dispara, asserta `EffectStack` ou `World` resultante.

Quando o último consumidor de um handler genérico (`direct_damage`, `heal`, `armor`, `prevent_damage`, `splash_damage`, `flee_block`, `heal_block`) cai, **deletar o handler no mesmo commit** e remover do `src/core/skills/handlers/index.ts`.

Estimativa: ~35 habilidades migradas, ~7 handlers deletados.

**Aceite:** lote completo, `npm test` verde, lint sem imports mortos.

---

### Lote 2 — DSL com condicional (Fase 4)

Para habilidades marcadas como "DSL com `if`":

1. Adicionar nó `if` ao evaluator (se ainda não estiver).
2. Migrar cada habilidade adicionando `effect: [{ "kind": "if", "when": ..., "then": ..., "else": ... }]` ou similar.
3. Teste cobre ambos os ramos da condicional.

Handlers absorvidos: `damage_bonus`, `damage_bonus_duration` (parte), `purple_damage_reduction`, `heal_or_survive` (parte).

**Crítico:** este lote inclui as habilidades que estão silenciosamente quebradas (tipo Frasco antes do patch-10). Cada teste do tipo "condicional" precisa ser escrito a partir da spec **antes** de olhar o handler antigo. Comparar depois — quando diverge, é bug histórico. Registrar em `tools/skill-port/bugs-fixed.md`.

Estimativa: ~10 habilidades migradas, ~4 handlers deletados.

**Aceite:** lote completo, bugs históricos do tipo Frasco fechados e listados.

---

### Lote 3 — DSL com escolha (Fase 5)

Para habilidades com `choose_one`:

1. Adicionar `kind: "choose_one"` ao evaluator. Cada opção tem `label` e `effect: EffectDescriptor[]`.
2. Mecanismo de pausa: evaluator chama `action.requestChoice(options)`, retorna estado pausado com `pendingSkillChoice`.
3. Continuação: quando o jogador escolhe, dispatcher retoma chamando `evaluate(chosenEffect, ctx)`.

Handlers absorvidos: `heal_or_damage_bonus`, `heal_or_survive` (parte), `item_or_discardDungeon`.

**Decisão:** escolhas com lógica de ramo muito assimétrica (uma opção é trivial, outra é complexa) podem ir para script. Avaliar caso a caso na Fase 0.

Estimativa: ~5 habilidades migradas, ~3 handlers deletados.

**Aceite:** lote completo, fluxo de escolha testado end-to-end.

---

### Lote 4 — Script (Fase 6)

Tudo que sobrou. Habilidades cuja lógica não cabe em DSL ou que pagariam preço alto em legibilidade tentando caber.

Para cada uma:

1. Criar `src/data/scripts/<skill_id>.ts` com export `run`.
2. Em `skills.json`, marcar `"script": "<skill_id>"`. Remover `type`, `value`. Manter `params` se houver.
3. Criar teste em `src/data/scripts/__tests__/<skill_id>.test.ts`.

Estimativa: ~30 habilidades migradas. Handlers absorvidos: `dice_modification`, `diceFix`, `diceFix_damage`, `reroll`, `tohit`, `tohit_damage`, `tohit_penalty`, `mark_and_tohit`, `targetProtection`, `targetRedirect_or_tohit`, `dungeon`, `dungeonLevel`, `discardDungeon`, `discardDungeonLock`, `discardDungeon_prevention`, `recoverDungeon`, `drawItem`, `itemControl`, `reward`, `token`.

**Decisão revisitada por habilidade:** durante o port, se um script ficar 80% repetindo padrão que poderia ser nó DSL novo, **reabrir o vocabulário da DSL** e migrar para DSL. O número de `kind`s é elástico — não congele cedo.

**Aceite:** lote completo, ~20 handlers deletados.

---

### Fase 7 — Morte dos handlers genéricos e do registry antigo

Quando os lotes fecharam:

1. Confirmar que `src/core/skills/handlers/` tem **só** `script.ts`, `noop.ts`, `index.ts`. Tudo mais deletado nos lotes.
2. Atualizar `src/core/skills/dispatch.ts`: substituir o `getHandler(type)` por dispatch baseado em `effect` vs `script`:
   - Primeiro, `resolveTrigger(trigger, ctx)` decide se a habilidade dispara. Se não, segue sem efeito.
   - Se a `SkillDefinition` tem `effect`, chama `evaluate(effect, ctx)`.
   - Se tem `script`, chama `getScript(skillId).run(ctx)`.
   - Caso contrário, warn e segue.
   - Encolher `parseTrigger`: remover o string-parsing de aliases compostos (`_if_dungeon_red_or_purple`, `_against_self`) — essa lógica agora vive em `trigger.when`. Sobra só a leitura do objeto `{ on, when, limit }`.
3. Apagar `src/core/skills/registry.ts` (mapa `type → handler`). Sem consumidores.
4. Apagar `src/core/skills/valueParsers.ts`. DSL e scripts leem `params` tipados; `parseNumber("2/3")` é coisa do passado.
5. Apagar `src/core/skills/handlers/script.ts` antigo (despachador via `value`). Dispatcher novo despacha por id direto.
6. Remover campo `type` de `SkillDefinition` em `src/core/data/skillTypes.ts`. Remover união `SkillType`.
7. Atualizar Zod schema do loader de `skills.json` para exigir `effect XOR script` e rejeitar entrada com `type`.

**Aceite:**
- `git grep "SkillHandler" src/core/` retorna zero (sobrou `ScriptHandler` e o evaluator).
- `git grep "parseNumber\|parseSlashPair" src/` retorna zero.
- `git grep "\"type\":" src/data/skills.json` retorna zero (só `category`, `cardType`).
- `npm test`, `npm run build`, `npm run lint` passam.

---

### Fase 8 — Guard rails

Defesas para o sistema não regredir:

1. **Lint determinístico** em `src/data/scripts/` — já existe (patch-10). Confirmar cobertura.
2. **Schema Zod** rejeita entrada de `skills.json` sem `effect XOR script`, e rejeita `trigger` em formato string (exige objeto `{ on, when?, limit? }`).
3. **Lint de paridade script ↔ arquivo:** teste no CI que valida:
   - Cada `script: "x"` em `skills.json` tem `src/data/scripts/x.ts` exportando `run`.
   - Cada `<x>.ts` em `src/data/scripts/` tem entrada `script: "<x>"` em `skills.json`.
   - Quebra simétrica = build red.
4. **Lint de teste obrigatório:** habilidade com `script` exige `src/data/scripts/__tests__/<id>.test.ts`. Habilidade com `effect` exige `src/core/skills/dsl/__tests__/<id>.test.ts`.
5. **ScriptCtx documentado:** `src/core/scripts/types.ts` ganha comentário enumerando o vocabulário final de `query` e `action`. Adições novas só via patch.

**Aceite:** `npm run lint` quebra em qualquer das violações acima.

---

## Restrições e regras

1. **`skills.json` é o único arquivo de dados tocado.** `cards.json` não é alterado neste patch. O campo `label` lá continua sendo a string de display da UI — quando virar derivada (ou morta), é trabalho de outro patch.

2. **Cada entrada tem `effect` XOR `script`.** Schema valida. Nunca os dois, nunca nenhum.

3. **`action.*` no `ScriptCtx` nunca muta state direto.** Tudo via `pushEffect`, `addComponent`, `emit`, `requestChoice`. Esta é a regra que fecha o Passo 9.

4. **Vocabulário da DSL cresce sob demanda.** Cada `kind` novo entra quando uma habilidade real precisa. Nunca especulativo.

5. **`ScriptCtx` cresce sob demanda.** Primitivas em `query.*` e `action.*` entram quando um script precisa. Documentar no commit.

6. **Bugs históricos são corrigidos no port, não preservados.** Quando a spec da label diz mais que o handler antigo entregava, novo caminho entrega o que a spec diz. Registrar em `bugs-fixed.md`.

7. **Convivência por lote, não global.** Cada lote remove os handlers que absorveu no mesmo PR. Sem acúmulo de handler morto entre lotes.

8. **Nome do script é o `skill_id`.** Quem busca *"o que `skill_red_fury` faz?"* abre `src/data/scripts/skill_red_fury.ts` se for script, ou lê `skills.json[id=skill_red_fury].effect` se for DSL. Um lugar, uma resposta.

9. **`usedBy[].value` continua compat para o `$value` legacy.** Migração para `params` é gradual e feita por habilidade durante seu lote. Não exigir varredura global.

10. **`trigger` é sempre objeto `{ on, when?, limit? }`.** Schema rejeita a forma string antiga. `when` só usa `ConditionNode`; `limit` só usa os guards de cardinalidade enumerados. Condição que não cabe em `when` empurra a habilidade para `script` — nunca para uma gramática de trigger paralela.

---

## Decisões explícitas

- **Por que manter `skills.json`/`cards.json` como nomes.** O usuário pediu. Rename é trabalho ortogonal e dispensável.
- **Por que DSL + script, e não um só.** DSL não cobre 100% das habilidades sem ficar feia (escolhas com ramos assimétricos, condicionais complexas sobre múltiplas entidades). Script puro repete demais (35 habilidades de `apply_damage` simples viram 35 funções de 5 linhas idênticas). Híbrido aproveita o ponto bom de cada.
- **Por que plugar no pipeline ECS em vez de manter caminho direto.** Porque o pipeline já existe, está parcialmente wired (Passos 5-8), e tem benefícios concretos: interceptação de eventos por modifiers, ordenação de effects via stack, stacking declarativo de buffs via duração/condition. Reaproveitar é mais barato e mais correto que reinventar.
- **Por que não tocar `cards.json`.** Patch focado. `cards.json.label` continua sendo display da UI. Mudança lá é problema de outro patch ou de outra hora.
- **Por que `effect` é array, não nó único.** Para refletir o modelo L2J (`<for><effect/></for>`) e permitir composição flat onde ela basta (skill que causa dano + aplica status: dois nós no array, sem `kind: "sequence"` envolvendo).
- **Por que `trigger` vira objeto `{ on, when?, limit? }`.** Separa as duas perguntas que a string antiga fundia: *quando considerar* (`on`) e *se pode disparar* (`when`/`limit`) — espelhando o `<cond>` separado do `<effect>` no L2J e o campo `condition?` que o `TriggerComponent` da ECS já tem. Aliases compostos (`combat_if_dungeon_red_or_purple`) deixam de ser strings mágicas inauditáveis.
- **Por que `when` reusa o `ConditionNode` da DSL, e não uma "DSL de trigger" nova.** Um único vocabulário e um único evaluator de condição servem as duas posições (gate do trigger e nó `if`). Inventar uma segunda gramática só para o trigger seria custo sem retorno.
- **Por que `limit` é campo separado de `when`.** `when` é pergunta pura (avaliável sem efeito colateral); `limit` consome estado (marca como usado). Mantê-los distintos preserva a pureza de `resolveCondition`.
- **Por que não há "trigger script" isolado.** Condição complexa demais para `when` significa que a habilidade inteira já é `script` — o `run` checa a condição em TS no topo e retorna `ctx.state` inalterado se falhar. Granularidade extra (DSL no effect, script só no trigger) não paga seu custo.

---

## Definição de pronto

- [ ] Fase 0: 81 specs gravadas e revisadas, decisão DSL/script tomada por habilidade.
- [ ] Fase 1: tipos + evaluator + schema da DSL operacionais.
- [ ] Fase 2: `ScriptCtx.action.*` é fachada do pipeline. `skill_living_ember` migrado para o shape novo.
- [ ] Lote 1 (Fase 3): ~35 habilidades DSL puras, ~7 handlers deletados.
- [ ] Lote 2 (Fase 4): ~10 habilidades DSL com condicional, ~4 handlers deletados, bugs históricos listados.
- [ ] Lote 3 (Fase 5): ~5 habilidades DSL com escolha, ~3 handlers deletados.
- [ ] Lote 4 (Fase 6): ~30 habilidades migradas para script, ~20 handlers deletados.
- [ ] Fase 7: `src/core/skills/handlers/` tem só `noop.ts` (ou está vazia). `registry.ts`, `valueParsers.ts` deletados. Campo `type` removido de `SkillDefinition`.
- [ ] Fase 8: guard rails ativos no CI.
- [ ] `npm test`, `npm run build`, `npm run lint` passam.
- [ ] `tools/skill-port/bugs-fixed.md` revisado pelo designer.

---

## Convenção de commit

Conforme `CLAUDE.md`: mensagens em PT-BR, **sem** linha `Co-Authored-By: Claude`. Um commit por fase ou por sub-lote interno. Sugestão:

- `docs(skill-port): specs e decisão DSL/script por habilidade (Fase 0)`
- `feat(skills): DSL EffectDescriptor + evaluator (Fase 1)`
- `refactor(scripts): ScriptCtx como fachada do pipeline ECS (Passo 9)`
- `feat(skills): lote 1 — DSL pura para dano/cura/modifier`
- `chore(skills): remover handlers absorvidos pelo lote 1`
- `feat(skills): lote 2 — DSL com if/then/else`
- `fix(skills): bugs históricos descobertos no lote 2`
- `chore(skills): remover handlers absorvidos pelo lote 2`
- `feat(skills): lote 3 — DSL com choose_one`
- `feat(skills): lote 4 — scripts para o longo tail`
- `refactor(skills): remover registry por type e valueParsers (Fase 7)`
- `feat(lint): paridade DSL/script e cobertura de teste obrigatória`
