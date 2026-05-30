# Patch 18 — ECS como fonte da verdade dos modificadores e triggers

Brief de implementação auto-contido. Não depende de conversa prévia.

**Pré-requisitos:**
- **Patch-16/17** (DSL como fonte do comportamento de skill) já aplicados.
- **Infra ECS já existente** (NÃO recriar): [`src/core/ecs/world.ts`](../../src/core/ecs/world.ts)
  (entities, components, query), [`src/core/ecs/types.ts`](../../src/core/ecs/types.ts)
  (`ModifierComponent`, `TriggerComponent`, `Duration`),
  [`src/core/ecs/sync.ts`](../../src/core/ecs/sync.ts) (preserva componentes dinâmicos),
  [`src/core/events/bus.ts`](../../src/core/events/bus.ts) (`emit` síncrono com janelas pré/pós).
  Tudo testado. **Não** mexa em world.ts/types.ts a não ser que um lote diga explicitamente.

**Objetivo:** terminar a migração ECS. Hoje os modificadores de combate vivem em campos
especializados do `CombatState` (`damageReduction`, `bonusNextAttack`, `tohitPenaltyByHero`…)
e os triggers reativos são despachados por string em [`src/core/skills/dispatch.ts:fireTrigger`](../../src/core/skills/dispatch.ts).
A infra ECS (`world` com `ModifierComponent`/`TriggerComponent`) existe paralela mas é quase
inerte — só health faz dual-write hoje. Este patch move modificadores e triggers reativos
para o `world` em etapas, mantendo dual-write até a leitura migrar, e depois descarta o legacy.

**Princípio inegociável — `skills.json` não muda.**
> O autor de skill continua declarando `trigger`, `effect`, `script`, `target`, `duration`
> exatamente como hoje. Toda a complexidade fica no engine TypeScript. Se um lote propor
> mudança em JSON de skill ou de carta, **rejeite o lote** e pare pra revisar.

**Princípio inegociável — só mexe no core.**
> Este patch toca **exclusivamente** em `src/core/` (e nos READMEs em `src/core/` e
> `src/data/`). **Nada em `src/ui/`.** A `BuffBar` e os componentes existentes
> continuam recebendo `view.combat.buffsByHero[]` e `view.groupBuffs[]` com o mesmo
> shape — quem muda o que vai dentro da lista é a projeção (que é core). Se um lote
> propor edição em `src/ui/`, **rejeite o lote**. Mudanças visuais (painel de
> influências, granularidade de chip, agrupamento) ficam pro **patch-19**, que
> consome o ECS já migrado.

**Diretriz de execução:**
> **Dual-write → switch reads → drop legacy.** Cada modifier/trigger é migrado em três passos
> independentes. Enquanto a leitura ainda usa o campo legacy, a escrita popula os dois lados.
> A matemática de combate nunca muda no mesmo lote em que o storage muda — leitura troca
> num lote seguinte. Em todo ponto intermediário, `npm test` (553+ atuais) tem que passar
> e o replay (`src/core/replay/replayEngine.test.ts`) tem que continuar determinístico.

---

## Protocolo de execução (economia de tokens)

Quem implementa trabalha **um lote por vez**:

- **Não releia arquivos.** O harness rastreia o estado pós-edição.
- **Leia em paralelo, leia uma vez.** Os `Read` de um lote devem cair no mesmo turno.
- **Não leia `skills.json`/`cards.json`.** Eles **não** mudam neste patch. Se você abrir um
  deles, parou de seguir o brief.
- **Adicione testes antes da migração de leitura.** Ao mover um stat pro world, o teste novo
  prova que o `ModifierComponent` está lá; só no lote seguinte a função de cálculo passa a ler
  do world.
- **Commit por lote.** Mensagem: `feat(ecs): patch-18 Lote X — <resumo>`.
- **Não use `Co-Authored-By`.** Conforme [CLAUDE.md](../../CLAUDE.md).

---

## Lote A — Infra de modifiers no world (dual-write começa)

**Alvo:** fazer `add_modifier` da DSL escrever também no `world`, e introduzir
helpers de agregação/expiração reutilizáveis. **Nenhum cálculo de combate muda.**

**Arquivos:**

- [`src/core/effects/resolver.ts`](../../src/core/effects/resolver.ts) — no `case "add_modifier"`,
  antes de retornar, adicionar `ModifierComponent` ao `state.world` via `ecsAddComponent`.
  ID do componente derivado de `source + stat + seq` (use o `pending.seq` do effect stack).
  O `target` do `ModifierComponent` mapeia o `stat` da DSL:
  - `damage_reduction` → `damage_taken`
  - `damage_bonus` → `damage_dealt`
  - `tohit_bonus` / `tohit_penalty` → `hit_bonus`
  - `dice_count` → `dice_count`
- [`src/core/ecs/world.ts`](../../src/core/ecs/world.ts) — novos helpers:
  ```ts
  export function getModifierTotal(
    world: World, entityId: EntityId, target: ModifierComponent["target"],
  ): number
  // Soma respeitando operation: add, multiply, set (último vence), clamp (min/max).

  export function tickModifierDurations(
    world: World, scope: "end_of_round" | "end_of_combat" | "once_consumed",
  ): World
  // Remove ModifierComponents cuja Duration expira no scope.
  ```
  Mapeamento `Duration` DSL → `Duration` ECS já existe parcialmente em
  [`src/core/skills/dsl/evaluate.ts:mapDuration`](../../src/core/skills/dsl/evaluate.ts);
  reutilize.
- [`src/core/reducer/combat.ts`](../../src/core/reducer/combat.ts) — plugar
  `tickModifierDurations(world, "end_of_round")` nos pontos onde hoje o `CombatState`
  zera buffs de rodada. Procure pelos lugares que mexem em `bonusNextAttack`/
  `damageReduction` na transição entre rodadas; injete a chamada ECS junto.

**Testes (novos):**

- `src/core/ecs/__tests__/modifier-aggregator.test.ts` — `getModifierTotal` soma várias
  entradas com `add`; `set` sobrescreve; `clamp` respeita min/max; missing entity → 0.
- `src/core/ecs/__tests__/modifier-durations.test.ts` — `tickModifierDurations` remove
  `until_end_of_round` no end_of_round; mantém `until_end_of_combat`; consome `once`.
- `src/core/effects/__tests__/resolver-dual-write.test.ts` — após disparar
  `power_unbreakable_bastion_guard`, **tanto** `combat.damageReduction[heroId] === 1`
  **quanto** `getModifierTotal(world, heroId, "damage_taken") === -1`.

**Critério de saída:**

- `npm test` verde (553 atuais + novos).
- Após `USE_POWER` do Guerreiro num combate real (via vite-node ou teste de integração),
  os dois lados estão sincronizados.
- **Nenhuma mudança visível na UI** (matemática continua lendo do legacy).

**Risco:** baixo. Tamanho: médio.

---

## Lote B — Switch reads de `damage_reduction`

**Alvo:** matemática de dano sofrido lê do world. Campo legacy continua
populado por compatibilidade.

**Arquivos:**

- [`src/core/systems/damageSystem.ts`](../../src/core/systems/damageSystem.ts) —
  na função `applyDamage` (ou onde a redução de dano é aplicada hoje), substituir
  ```ts
  const reduction = state.combat?.damageReduction[targetId] ?? 0;
  ```
  por
  ```ts
  const reduction = -getModifierTotal(state.world, targetId, "damage_taken");
  ```
  (sinal invertido: modificador `add` com valor `+1` em `damage_reduction` legacy
  corresponde a `damage_taken: -1` no ECS.)
- [`src/core/projection/playerView.ts:projectBuffsByHero`](../../src/core/projection/playerView.ts) —
  troca a leitura de `combat.damageReduction[id]` por uma agregação a partir do world
  (`queryWithComponent("modifier")` filtrado por `entityId` e `target === "damage_taken"`).
  A **regra de agregação** (1 chip por modifier ou agrupar por source) fica em aberto
  pro patch-19 decidir — neste patch, mantenha o comportamento atual (1 chip agregado
  com soma) pra não introduzir mudança visual. Apenas a fonte da soma muda.

**Testes:**

- `src/core/systems/__tests__/damageSystem.test.ts` (se existir; senão criar) —
  dano sofrido com redução via ECS dá mesmo resultado que com redução via legacy.
  Force os dois cenários e compare.
- Atualizar testes da BuffBar/projection que assumam chip agregado: passam a esperar
  `N` chips, cada um com `source` do skill que criou.

**Critério de saída:**

- Replay determinístico ([`src/core/replay/replayEngine.test.ts`](../../src/core/replay/replayEngine.test.ts))
  continua produzindo mesmo estado final pra cada seed das fixtures.
- BuffBar **renderiza igualzinho** (mesma soma, mesmo chip agregado). O source só passa
  a ser o real (`"power_unbreakable_bastion_guard"` em vez de `"Modificador defensivo"`)
  porque a projeção tem acesso ao `ModifierComponent.source` — mas isso é uma melhora
  invisível pro shape de `BuffView`.
- Se você zerar `combat.damageReduction` manualmente em runtime, a matemática **não
  muda** (porque a leitura agora vem do world). Esse é o teste de fumaça.

**Risco:** médio (mexe na matemática de dano). Tamanho: pequeno.

---

## Lote C — Switch reads de `damage_bonus` / `hit_bonus`

**Alvo:** rolagem de ataque lê bônus do world.

**Arquivos:**

- [`src/core/reducer/combat.ts:collectHeroBonuses`](../../src/core/reducer/combat.ts) —
  substituir leitura de `state.combat?.bonusNextAttack?.[hero.id]` por
  agregação via `queryWithComponent(world, "modifier")` filtrando por
  `entityId === hero.id && target ∈ {damage_dealt, hit_bonus}`. Cada entrada vira um
  `BonusEntry` com `source` = `ModifierComponent.source` (id da skill) e `value`.
- Mesma coisa pra cálculo do inimigo (procure `bonusNextAttack?.[enemy.id]`).
- Consumo `once`: bônus marcado com `duration: { kind: "once" }` deve sair do world
  após o ataque ser resolvido. Adicione `tickModifierDurations(world, "once_consumed")`
  no `handleResolveAttack` logo antes do log final.

**Testes:**

- `src/core/skills/__tests__/migrated/crimson-fury.test.ts` — Fúria Rubra dispara,
  bônus aparece em **uma** rolagem, e some na próxima.
- Idem para Juramento, Coragem de Bando, Fio Mortal — uma skill testada por categoria.

**Critério de saída:**

- Replay determinístico continua igual.
- Manualmente zerar `combat.bonusNextAttack` em runtime não muda o roll — confirma
  que leitura vem do world.

**Risco:** alto (cobre maior parte das skills ofensivas). Tamanho: médio.

---

## Lote D — Switch reads de `tohit_penalty`

**Alvo:** penalidade de acerto lê do world. Mesma estratégia do Lote C.

**Arquivos:**

- [`src/core/reducer/combat.ts:collectHeroBonuses`](../../src/core/reducer/combat.ts) —
  no trecho que adiciona `penalidade`, ler de `getModifierTotal(world, hero.id, "hit_bonus")`
  filtrando apenas componentes com `value < 0` (ou, mais limpo: introduzir um stat ECS
  `tohit_penalty` e mapear no resolver). Use o que ficar mais legível.

**Testes:**

- Calor Escaldante e Corpo Gelatinoso continuam aplicando -X acerto no herói correto;
  expira no fim do combate via `tickModifierDurations(world, "end_of_combat")`.

**Critério de saída:**

- Combate contra Salamandra (Calor Escaldante) produz mesmo `tohit` que hoje.

**Risco:** baixo. Tamanho: pequeno.

---

## Lote E — Eventos novos no bus

**Alvo:** dar ao bus os eventos que os triggers vão precisar consumir.
Preparação pro Lote F. Sem mudança de comportamento ainda.

**Arquivos:**

- [`src/core/events/types.ts`](../../src/core/events/types.ts) — novos `GameEvent`:
  ```ts
  | { type: "RollAboutToHappen"; payload: { heroId: string; enemyId: string } }
  | { type: "RollResolved";      payload: { heroId: string; enemyId: string;
                                              heroTotal: number; enemyTotal: number } }
  | { type: "EnemyDestroyed";    payload: { enemyId: string; sourceId: string } }
  | { type: "RoomEntered";       payload: { roomName: string } }
  | { type: "CombatStarted";     payload: { roomName: string } }
  | { type: "RoundEnded";        payload: { round: number } }
  ```
- [`src/core/reducer/combat.ts:handleRollDice`](../../src/core/reducer/combat.ts) —
  `emit(state, { type: "RollAboutToHappen", ... })` antes da rolagem;
  `emit(...RollResolved)` depois.
- [`src/core/systems/damageSystem.ts`](../../src/core/systems/damageSystem.ts) —
  quando `currentLife <= 0`, `emit(EnemyDestroyed)`.
- [`src/core/reducer/exploration.ts:handleRevealRoom`](../../src/core/reducer/exploration.ts) —
  `emit(RoomEntered)` ao popular `currentRoom`.
- [`src/core/reducer/combat.ts:handleStartCombat`](../../src/core/reducer/combat.ts) —
  `emit(CombatStarted)`; no fim de cada rodada, `emit(RoundEnded)`.

**Testes:**

- `src/core/events/__tests__/new-events.test.ts` — instalar um `TriggerComponent` que
  escuta cada evento e verificar que dispara no momento certo.

**Critério de saída:**

- Bus emite 6 eventos novos.
- Nenhuma skill ainda usa esses eventos — Lote F faz a ligação.

**Risco:** baixo. Tamanho: médio.

---

## Lote F — Instalar TriggerComponents a partir do trigger declarado da skill

**Alvo:** substituir o despacho por string ([`fireTrigger`](../../src/core/skills/dispatch.ts))
por instalação automática de `TriggerComponent` no world, **sem mexer no JSON da skill**.

**Arquivos:**

- **Novo:** `src/core/ecs/installTriggers.ts` — tabela de mapeamento e installer:
  ```ts
  // Tabela única do core. Não exposta na DSL.
  const TRIGGER_TO_EVENT: Partial<Record<string, GameEventType>> = {
    before_attack: "RollAboutToHappen",
    after_roll:    "RollResolved",
    on_damage_taken: "DamageAboutToBeDealt",
    on_destroyed:    "EnemyDestroyed",
    start_of_combat: "CombatStarted",
    on_enter_room:   "RoomEntered",
    on_room_reveal:  "RoomEntered",
    // ...completar conforme migração avança.
  };

  export function installSkillTriggers(
    world: World, entityId: EntityId, skills: readonly CardSkillRef[],
  ): World {
    for (const { def, ref } of skills) {
      if (isManuallyActivatable(def)) continue;          // on_use / once_per_* — não instala
      const eventType = TRIGGER_TO_EVENT[def.trigger];
      if (!eventType) continue;                          // sem evento → continua no fireTrigger legacy
      world = addComponent(world, entityId, {
        type: "trigger",
        on: eventType,
        effect: def.effect as EffectDescriptor,         // DSL pré-resolvida
        source: def.id,
        duration: { kind: "permanent" },                // skill base do herói vive enquanto ele está em jogo
        priority: 0,
        condition: undefined,
      });
    }
    return world;
  }
  ```
- [`src/core/reducer/setup.ts`](../../src/core/reducer/setup.ts) — após criar cada herói,
  chamar `installSkillTriggers(world, heroId, cardSkills(heroCardId))`.
- [`src/core/reducer/exploration.ts:handleSpawnEnemies`](../../src/core/reducer/exploration.ts) —
  idem para cada inimigo spawnado.
- [`src/core/reducer/reward.ts`](../../src/core/reducer/reward.ts) (handleInvAssignItem ou
  equivalente) — ao equipar item, instalar triggers do item.
- [`src/core/skills/dispatch.ts:fireTrigger`](../../src/core/skills/dispatch.ts) — vira
  wrapper fino:
  ```ts
  export function fireTrigger(state, triggerName, ctx) {
    // 1. Emite no bus se houver evento equivalente — TriggerComponents do world reagem.
    const event = LEGACY_TO_EVENT[triggerName];
    let next = state;
    if (event) {
      const r = emit(state, { type: event, payload: buildPayload(triggerName, ctx) });
      next = r.state;
    }
    // 2. Fallback pro dispatch antigo pra triggers sem evento (skills ainda não migradas).
    return legacyDispatch(next, triggerName, ctx);
  }
  ```

**Migração de skills em ondas (dentro deste lote):**

Para cada trigger string que ganhou evento equivalente no Lote E, popular
`TRIGGER_TO_EVENT` e rodar a suíte. Quando todas as skills daquela string forem cobertas
pelo bus, o `legacyDispatch` pra aquela string não tem mais clientes (e pode ser apagado
do switch interno).

Triggers sem evento equivalente (`combat_if_alone_in_room`, `once_per_room_on_dungeon_discard`,
`combat_vs_boss_or_subboss`, etc.) **continuam no dispatcher legacy** até alguém modelar o evento.
Migração parcial é o estado esperado de saída do Lote F.

**Testes:**

- `src/core/skills/__tests__/migrated/<trigger>.test.ts` — uma suíte por trigger migrado
  prova comportamento idêntico antes/depois.
- `src/core/skills/__tests__/dispatch-fallback.test.ts` — skill com trigger não mapeado
  ainda dispara via legacy.

**Critério de saída:**

- Toda string de trigger em `TRIGGER_TO_EVENT` tem teste de migração.
- Replay determinístico continua.
- Nenhuma mudança em `skills.json` / `cards.json`.

**Risco:** alto (mexe em ~30 skills indiretamente, mas sem editar o JSON delas).
Tamanho: grande, em ondas.

---

## Lote G — Cleanup

**Alvo:** remover o legacy depois que todo mundo lê do world.

**Arquivos:**

- [`src/core/state/combatState.ts`](../../src/core/state/combatState.ts) — remover
  campos `damageReduction`, `bonusNextAttack`, `tohitPenaltyByHero` (e os escrevem em
  resolver/handlers). Atualizar `createEmptyCombatState`.
- [`src/core/effects/resolver.ts`](../../src/core/effects/resolver.ts) — `add_modifier`
  agora só escreve no world; o switch por stat sai inteiro.
- [`src/core/projection/playerView.ts`](../../src/core/projection/playerView.ts) —
  `projectBuffsByHero` lê **só** do world; remove referências a `combat.*`
  pra esses três campos.
- [`src/core/skills/dispatch.ts:fireTrigger`](../../src/core/skills/dispatch.ts) — se
  todas as strings migraram, apaga o legacy e vira `bus.emit` puro. Se sobrou string
  sem evento (esperado), mantém o caminho como atalho documentado.
- [`src/core/ecs/sync.ts`](../../src/core/ecs/sync.ts) — `DYNAMIC_COMPONENT_TYPES` deixa
  de precisar preservar `modifier` se ele agora sempre vive no world (não duplicado em
  HeroState). Verifique se a remoção quebra `syncEntityFromHero`.
- [`src/core/README.md`](../../src/core/README.md) e
  [`src/data/README.md`](../../src/data/README.md) — refletir que o ECS virou fonte da
  verdade dos modifiers; atualizar a tabela "O que NÃO está conectado".

**Testes:**

- Toda a suíte (553+) verde.
- `grep -rn "damageReduction\|bonusNextAttack\|tohitPenaltyByHero" src/` retorna zero
  (exceto comentários históricos no patch-18).

**Critério de saída:**

- Diff final é majoritariamente **deleções**.
- README do core perde a frase "Ainda subutilizado" sobre ECS.

**Risco:** baixo (todas as leituras já migraram). Tamanho: pequeno.

---

## Ordem e dependências

| Lote | Depende de | Pode rodar em paralelo com |
|---|---|---|
| A | — | — |
| B | A | E |
| C | A | E |
| D | A | E |
| E | — | B, C, D |
| F | A, E | — |
| G | A, B, C, D, E, F | — |

Recomendação: A → (B + E paralelos) → C → D → F → G.

---

## Pontos abertos pra dono do repo decidir antes de iniciar

1. **`fireTrigger` no Lote G.** Apaga inteiro (assume migração 100%) ou mantém como
   wrapper que faz `bus.emit + fallback`?
2. **Stat `tohit_penalty` no ECS.** Reusar `hit_bonus` com valor negativo (mais simples)
   ou criar `tohit_penalty` separado (mais legível ao varrer o world)?

Resolva esses dois antes de começar o Lote A.

> Decisões de UI (granularidade do chip, agrupamento por source, painel de influências)
> ficam pro **patch-19**. Patch-18 entrega o ECS como fonte da verdade; patch-19 consome.

---

## O que vem depois (patch-19, fora deste brief)

Quando patch-18 fechar, o world terá toda a informação de "quem está aplicando o quê
em quem" como dado uniforme. Isso habilita um **painel de influências** na UI:

```
   DUNGEON ◄──── Ladino (Caminho Preservado)
   SALA "Tochas Mortas" ──► GRUPO (descarte por rodada)
   GUERREIRO (Guarda Inquebrável) ──► todos os heróis (−1 dano)
   SALAMANDRA (Calor Escaldante) ──► todos os heróis (−2 acerto)
```

Patch-19 será sobre **projetar essas relações em `view.activeInfluences`** (core) e
**renderizar** num componente novo (UI). Não escreva nada disso em patch-18.
