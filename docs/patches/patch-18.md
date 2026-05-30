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

**Princípio inegociável — migração total, sem wrapper.**
> Não fica nada do legacy ao fim do patch. `fireTrigger` é apagado. Os campos
> `damageReduction`, `bonusNextAttack`, `tohitPenaltyByHero`, `extraDice`,
> `tohitPenaltyByHero`, `prey`, `targetProtectionByHero`, `ecoTokens`,
> `fleeAttemptByHero`, `shieldsUsedThisCombat`, `itemControlByEnemy`,
> `bossFirstDamageReduced` saem do `CombatState`. As flags persistentes em
> `state.flags` (`dungeonDiscardPrevented`, `fleeBlocked`, `discardDungeonLocked`)
> viram `ModifierComponent`/`TokenComponent` no world ou ficam só como sinalizadores
> derivados (não fonte da verdade). Mesma funcionalidade, formato único.
> Se ao fim do Lote G um `grep` por qualquer um desses nomes ainda achar uso de
> produção, o patch não terminou.

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

## Lote E — Catálogo completo de eventos no bus

**Alvo:** dar ao bus **todos os eventos** que os triggers reativos precisam consumir.
Sem isso o Lote F não consegue migrar tudo e sobra trigger-string órfã.
Sem mudança de comportamento de combate ainda — só infra de eventos.

**Inventário prévio (obrigatório antes de escrever código):**

Levantar **todas** as strings em `def.trigger` usadas em `skills.json` que **não** sejam
manuais (excluir `on_use` e variantes `once_per_*` puras detectadas por
`isManuallyActivatable`) nem passivas (`while_equipped`, `while_in_play`, `while_active`,
`while_room_active*`, `room_passive`). O resultado deve cobrir ~40 strings reativas.

Cada string vira **um par `{ event, condition }`** no Lote F. O evento vem deste catálogo;
a condition é uma função pura `(entity, event, world) => boolean`.

**Arquivos:**

- [`src/core/events/types.ts`](../../src/core/events/types.ts) — adicionar a união completa:
  ```ts
  // Já existentes
  | { type: "DamageAboutToBeDealt"; payload: { ... } }
  | { type: "HealAboutToBeApplied"; payload: { ... } }
  // Lote E
  | { type: "RollAboutToHappen";          payload: { heroId: string; enemyId: string; round: number } }
  | { type: "RollResolved";               payload: { heroId: string; enemyId: string;
                                                      heroTotal: number; enemyTotal: number;
                                                      heroResults: readonly number[];
                                                      enemyResults: readonly number[] } }
  | { type: "DamageDealt";                payload: { sourceId: string; targetId: string;
                                                      amount: number; damageType: string } }
  | { type: "EnemyDestroyed";             payload: { enemyId: string; sourceId: string;
                                                      roomFirstKill: boolean } }
  | { type: "HeroDefeated";               payload: { heroId: string; sourceId: string } }
  | { type: "HeroTargeted";               payload: { heroId: string; sourceId: string;
                                                      roomFirstTime: boolean } }
  | { type: "HeroTargetedByEffect";       payload: { heroId: string; skillId: string;
                                                      roomFirstTime: boolean } }
  | { type: "TargetChosen";               payload: { sourceId: string; targetId: string;
                                                      sourceType: "hero" | "enemy";
                                                      roomFirstTime: boolean } }
  | { type: "HeroLostCombat";             payload: { heroId: string; enemyId: string;
                                                      roomFirstTime: boolean } }
  | { type: "HeroFled";                   payload: { heroId: string } }
  | { type: "PathsRevealed";              payload: { cards: readonly string[] } }
  | { type: "DungeonCardDiscarded";       payload: { cardName: string; reason: "effect" | "extra" } }
  | { type: "ItemEffectAppliedTo";        payload: { heroId: string; itemName: string;
                                                      sourceId: string; roomFirstTime: boolean } }
  | { type: "SkillUsed";                  payload: { sourceId: string; skillId: string } }
  | { type: "RoomEntered";                payload: { roomName: string } }
  | { type: "CombatStarted";              payload: { roomName: string } }
  | { type: "RoundEnded";                 payload: { round: number } }
  | { type: "RoundStarted";               payload: { round: number } }
  ```

  Os flags `roomFirstTime` / `roomFirstKill` são preenchidos pelo emissor consultando
  contadores em `state.flags` (introduzidos sob demanda) ou queries no world. Isso permite
  que filtros `first_*_in_room` virem `condition` no `TriggerComponent` sem precisar de
  guards inventados.

- [`src/core/reducer/combat.ts`](../../src/core/reducer/combat.ts) —
  `handleRollDice`: emite `RollAboutToHappen` antes; `RollResolved` depois.
  `handleStartCombat`: emite `CombatStarted` + `RoundStarted(round=1)`.
  `handleChooseTarget`: emite `TargetChosen`.
  `handleChooseHeroForRound` / next-round logic: emite `RoundEnded(round)` + `RoundStarted(round+1)`.
  `handlePassHeroAction` / `handleCheckCombatEnd`: emite `HeroLostCombat` quando aplicável.

- [`src/core/systems/damageSystem.ts`](../../src/core/systems/damageSystem.ts) —
  `applyDamage`: emite `DamageDealt` após resolver; se `currentLife <= 0`, emite
  `EnemyDestroyed` (alvo é inimigo) ou `HeroDefeated` (alvo é herói).
  Janela pré (`DamageAboutToBeDealt`) já existe — mantém.

- [`src/core/reducer/exploration.ts`](../../src/core/reducer/exploration.ts) —
  `handleRevealRoom`: emite `RoomEntered`.
  `handleOpenPaths`: emite `PathsRevealed`.
  `discardFromDungeonDeck` (helper): emite `DungeonCardDiscarded`.

- [`src/core/reducer/combat.ts:handleUseItem`](../../src/core/reducer/combat.ts) —
  emite `ItemEffectAppliedTo` para cada herói alvo.

- [`src/core/skills/useSkill.ts:fireOnUseSkill`](../../src/core/skills/useSkill.ts) —
  emite `SkillUsed` antes de executar o effect/script.

- [`src/core/reducer/combat.ts:handleDeclareFlee`](../../src/core/reducer/combat.ts) —
  emite `HeroFled` quando fuga é resolvida.

**Testes (novos):**

- `src/core/events/__tests__/event-emission.test.ts` — pra cada evento, um cenário
  determinístico que verifica que `emit` é chamado no momento certo, com payload
  correto. Use o framework de teste atual; instale TriggerComponents espiões.

**Critério de saída:**

- Bus emite **todos** os eventos listados acima.
- Cada emissor é testado isoladamente.
- Nenhuma skill ainda usa esses eventos — Lote F faz a ligação.
- 553 testes atuais continuam verdes.

**Risco:** médio (mexe em vários pontos do reducer). Tamanho: grande.

---

## Lote F — Installer cobre 100% dos triggers

**Alvo:** substituir o despacho por string ([`fireTrigger`](../../src/core/skills/dispatch.ts))
por instalação automática de `TriggerComponent` no world. **Cobertura total.**
Quando o lote terminar, `fireTrigger` não tem mais clientes — Lote G só apaga.
**Sem mexer no JSON da skill.**

**Arquivos:**

- **Novo:** `src/core/ecs/installTriggers.ts` — tabela completa + installer:
  ```ts
  type InstallFn = (def: SkillDefinition, ref: CardSkillRef) => Omit<TriggerComponent, "type">;

  // Cada string em def.trigger vira um TriggerComponent completo, com condition
  // pros filtros (if_alone_in_room, vs_boss_or_subboss, first_in_room, etc.).
  const TRIGGER_TO_INSTALL: Record<string, InstallFn> = {
    // ── Reativos simples ─────────────────────────────────────────────────
    before_attack:   (def) => ({ on: "RollAboutToHappen", effect: def.effect, source: def.id,
                                  duration: { kind: "permanent" }, priority: 0 }),
    after_roll:      (def) => ({ on: "RollResolved", ... }),
    on_damage_taken: (def) => ({ on: "DamageAboutToBeDealt", ... }),
    on_take_damage:  (def) => ({ on: "DamageDealt", ... }),
    on_take_attack_damage: (def) => ({ on: "DamageDealt", ...,
                                       condition: (e, ev) => ev.payload.damageType === "attack" }),
    on_hit_received: (def) => ({ on: "DamageDealt", ... }),
    on_deal_damage:  (def) => ({ on: "DamageDealt", ...,
                                 condition: (e, ev) => ev.payload.sourceId === e.id }),
    on_destroyed:    (def) => ({ on: "EnemyDestroyed", ...,
                                 condition: (e, ev) => ev.payload.enemyId === e.id }),
    on_destroy_creature_with_attack: (def) => ({ on: "EnemyDestroyed", ...,
                                                  condition: (e, ev) => ev.payload.sourceId === e.id }),
    on_dungeon_discard: (def) => ({ on: "DungeonCardDiscarded", ... }),
    on_flee_or_leave_play: (def) => ({ on: "HeroFled", ... }),
    on_first_targeted: (def) => ({ on: "HeroTargeted", ...,
                                    condition: (e, ev) => ev.payload.roomFirstTime }),
    on_first_target_chosen_in_room: (def) => ({ on: "TargetChosen", ...,
                                                  condition: (e, ev) => ev.payload.roomFirstTime }),
    on_first_target_chosen_by_creature: (def) => ({ on: "TargetChosen", ...,
                                                    condition: (e, ev) =>
                                                      ev.payload.roomFirstTime &&
                                                      ev.payload.sourceType === "enemy" }),
    on_first_creature_destroyed_in_room: (def) => ({ on: "EnemyDestroyed", ...,
                                                      condition: (e, ev) => ev.payload.roomFirstKill }),
    on_hero_lose_combat_in_room: (def) => ({ on: "HeroLostCombat", ... }),
    on_purple_effect_damage_taken: (def) => ({ on: "DamageDealt", ...,
                                                condition: (e, ev) => ev.payload.damageType === "purple" }),
    on_enter_room:   (def) => ({ on: "RoomEntered", ... }),
    on_room_reveal:  (def) => ({ on: "RoomEntered", ... }),
    on_reveal_paths: (def) => ({ on: "PathsRevealed", ... }),
    on_enter_combat: (def) => ({ on: "CombatStarted", ... }),
    start_of_combat: (def) => ({ on: "CombatStarted", ... }),
    before_combat:   (def) => ({ on: "CombatStarted", ... }),
    before_first_combat_in_room: (def) => ({ on: "CombatStarted", ...,
                                              condition: (e, ev, w) => isFirstCombatInRoom(w) }),

    // ── Filtros de combate (todos disparam no RollAboutToHappen) ───────
    combat:          (def) => ({ on: "RollAboutToHappen", ... }),
    combat_vs_boss_or_subboss: (def) => ({ on: "RollAboutToHappen", ...,
                                           condition: (e, ev, w) => targetIsBossOrSubboss(w, ev.payload.enemyId) }),
    combat_if_alone_in_room: (def) => ({ on: "RollAboutToHappen", ...,
                                          condition: (e, ev, w) => activeEnemyCount(w) === 1 }),
    combat_if_another_creature_in_room: (def) => ({ on: "RollAboutToHappen", ...,
                                                     condition: (e, ev, w) => activeEnemyCount(w) > 1 }),
    combat_if_dungeon_red_or_purple: (def) => ({ on: "RollAboutToHappen", ...,
                                                  condition: (e, ev, w, s) => s.despertar >= 3 }),
    combat_and_on_damage_dealt: (def) => /* composta: instala 2 triggers */,
    when_half_life_or_less: (def) => ({ on: "RollAboutToHappen", ...,
                                         condition: (e, ev, w) => entityIsHalfLifeOrLess(w, ev.payload.enemyId) }),

    // ── "First" e contagens ────────────────────────────────────────────
    first_damage_each_round: (def) => ({ on: "DamageDealt", ...,
                                          condition: (e, ev, w, s) => isFirstDamageThisRound(s) }),
    first_round_in_room: (def) => ({ on: "RoundStarted", ...,
                                     condition: (e, ev) => ev.payload.round === 1 }),
    first_roll_in_room: (def) => ({ on: "RollAboutToHappen", ...,
                                    condition: (e, ev, w, s) => isFirstRollInRoom(s) }),
    first_item_effect_received: (def) => ({ on: "ItemEffectAppliedTo", ...,
                                             condition: (e, ev) => ev.payload.roomFirstTime }),
    first_hero_lose_combat_in_room: (def) => ({ on: "HeroLostCombat", ...,
                                                 condition: (e, ev) => ev.payload.roomFirstTime }),
    after_each_combat_round_if_purple: (def) => ({ on: "RoundEnded", ...,
                                                    condition: (e, ev, w, s) => s.despertar >= 3 }),

    // ── once_per_* compostos (não-manuais; o once_* puro é manual) ────
    before_attack_once_per_game: (def) => ({ on: "RollAboutToHappen", ...,
                                              duration: { kind: "permanent" },
                                              // guard once_per_game é flag no payload do TriggerComponent;
                                              // bus consome e remove o trigger após disparar 1x.
                                              consumeAfterFire: { scope: "game" } }),
    once_per_room_on_dungeon_discard:    (def) => ({ on: "DungeonCardDiscarded", ...,
                                                      consumeAfterFire: { scope: "room" } }),
    once_per_room_on_targeted:           (def) => ({ on: "HeroTargeted", ...,
                                                      consumeAfterFire: { scope: "room" } }),
    once_per_room_on_targeted_by_effect: (def) => ({ on: "HeroTargetedByEffect", ...,
                                                      consumeAfterFire: { scope: "room" } }),
    once_per_room_on_extra_dungeon_discard: (def) => ({ on: "DungeonCardDiscarded", ...,
                                                         condition: (e, ev) => ev.payload.reason === "extra",
                                                         consumeAfterFire: { scope: "room" } }),
    once_per_room_after_roll:            (def) => ({ on: "RollResolved", ...,
                                                      consumeAfterFire: { scope: "room" } }),
    once_per_round_on_damage_taken:      (def) => ({ on: "DamageDealt", ...,
                                                      consumeAfterFire: { scope: "round" } }),
    once_per_game_on_use_furia_rubra:    (def) => ({ on: "SkillUsed", ...,
                                                      condition: (e, ev) => ev.payload.skillId === "skill_crimson_fury",
                                                      consumeAfterFire: { scope: "game" } }),
    once_per_game_on_defeat_creature:    (def) => ({ on: "EnemyDestroyed", ...,
                                                      consumeAfterFire: { scope: "game" } }),
    once_per_game_after_any_roll:        (def) => ({ on: "RollResolved", ...,
                                                      consumeAfterFire: { scope: "game" } }),
    once_per_game_after_roll_vs_prey:    (def) => ({ on: "RollResolved", ...,
                                                      condition: (e, ev, w, s) => ev.payload.enemyId === s.combat?.prey,
                                                      consumeAfterFire: { scope: "game" } }),

    // ── Passivos: instalados como ModifierComponent ou skill state, não trigger ─
    // while_equipped, while_in_play, while_active, while_room_active*, room_passive
    // são tratados separadamente abaixo (não entram em TRIGGER_TO_INSTALL).
  };

  export function installSkillTriggers(
    world: World, entityId: EntityId, skills: readonly CardSkillRef[],
    state: GameState,
  ): World {
    for (const { def, ref } of skills) {
      if (isManuallyActivatable(def)) continue;          // on_use / once_per_* puros — vão por fireOnUseSkill
      if (isPassive(def.trigger)) {                      // while_*, room_passive — instala como ModifierComponent
        world = installPassive(world, entityId, def, ref, state);
        continue;
      }
      const factory = TRIGGER_TO_INSTALL[def.trigger];
      if (!factory) throw new Error(`patch-18: trigger "${def.trigger}" não tem installer`);
      const trigger = factory(def, ref);
      world = addComponent(world, entityId, { type: "trigger", ...trigger });
    }
    return world;
  }
  ```
  A factory pode retornar um objeto extra `consumeAfterFire: { scope: "game"|"room"|"round" }`
  que o bus consome: ao disparar uma vez, remove o `TriggerComponent` do world. Substitui
  os contadores `oncePer.game/room/round` do CombatState.

- **Novo:** `src/core/ecs/installPassive.ts` — converte skills `while_*` em `ModifierComponent`
  permanentes no world (Foco do Caçador equipado vira `{ target: "hit_bonus", value: +4,
  duration: { kind: "passive" }, source: "skill_hunter_focus" }`). A retirada do item / saída
  da sala remove os componentes pelo `source`.

- [`src/core/reducer/setup.ts`](../../src/core/reducer/setup.ts) — após criar cada herói,
  `installSkillTriggers(world, heroId, cardSkills(heroCardId), state)`.
- [`src/core/reducer/exploration.ts:handleSpawnEnemies`](../../src/core/reducer/exploration.ts) —
  pra cada inimigo spawnado.
- [`src/core/reducer/exploration.ts:handleRevealRoom`](../../src/core/reducer/exploration.ts) —
  pra a sala (skills com category `habilidade_dungeon`).
- [`src/core/reducer/reward.ts`](../../src/core/reducer/reward.ts) — ao equipar/desequipar
  item: install/remove dos triggers e passivos do item.
- [`src/core/events/bus.ts`](../../src/core/events/bus.ts) — consumir
  `consumeAfterFire` no fim do `emit`: depois que o efeito do trigger é processado, se a
  scope dele expirou, remover o `TriggerComponent`. `scope: "game"` é único (one-shot);
  `scope: "room"` reseta com `RoomEntered` (tick); `scope: "round"` reseta com `RoundStarted`.

**Triggers manuais** (`on_use`, `once_per_*` puros sem `_on_`/`_after_`) **não entram aqui** —
continuam sendo despachados por [`fireOnUseSkill`](../../src/core/skills/useSkill.ts), que
é a rota correta pra ativação por clique do jogador. Esse caminho **não é legacy**, é o
contrato com a UI; permanece.

**Testes:**

- `src/core/skills/__tests__/migrated/<trigger_string>.test.ts` — pra **cada** string em
  `TRIGGER_TO_INSTALL`, um cenário que prova: skill instalada → evento disparado → efeito
  aplicado → (se `consumeAfterFire`) trigger removido após disparar.
- `src/core/ecs/__tests__/passive-install.test.ts` — equipar/desequipar item, entrar/sair
  da sala, install/remove dos passivos.
- `src/core/skills/__tests__/migrated/coverage.test.ts` — varre `skills.json` e verifica
  que **toda** skill não-manual tem cobertura no installer (`TRIGGER_TO_INSTALL[def.trigger]`
  existe ou `isPassive(def.trigger) === true`). Falha se uma string nova aparecer sem
  mapeamento — protege regressão.

**Critério de saída:**

- `npm test` verde.
- `grep -rn "fireTrigger" src/core/` mostra que o único uso é a definição em `dispatch.ts`
  e os call sites antigos no reducer — todos podem ser removidos no Lote G.
- Inventário do Lote E está 100% coberto: nenhuma skill não-manual sobra sem
  `TRIGGER_TO_INSTALL` ou `installPassive`.

**Risco:** alto (cobertura total = muita superfície). Tamanho: grande.

---

## Lote G — Cleanup total (sem legacy)

**Alvo:** remover **tudo** que é legado. Não fica wrapper, não fica fallback,
não fica gaveta vazia. O `world` ECS é fonte única da verdade.

**Arquivos:**

- [`src/core/state/combatState.ts`](../../src/core/state/combatState.ts) — remover
  do `CombatState`:
  - `bonusNextAttack`, `damageReduction`, `tohitPenaltyByHero`, `extraDice`
  - `prey`, `targetProtectionByHero`, `ecoTokens`, `fleeAttemptByHero`
  - `shieldsUsedThisCombat`, `itemControlByEnemy`, `bossFirstDamageReduced`
  - `oncePer` (`{ room, combat, round }`) — substituído pelo `consumeAfterFire` no bus
  - `temporaryEffects` (genérico não usado)

  Sobra do `CombatState`: `round`, `phase`, `selectedHeroId`, `heroesActed`, `pairs`,
  `lastRoll`, `pendingDiceSelection`, `powersUsedThisRoom` (este último vira tag
  `once_per_room` no fireOnUseSkill, mas ok manter por simplicidade — não é modifier).

- [`src/core/state/gameState.ts`](../../src/core/state/gameState.ts) — remover
  `state.flags.dungeonDiscardPrevented`, `fleeBlocked`, `discardDungeonLocked` e
  qualquer outro flag persistente que tenha equivalente no world (auditar caso a caso).
  Se algum flag for transiente (não é efeito ativo, só um sinal de uma ação), pode ficar.

- [`src/core/effects/resolver.ts`](../../src/core/effects/resolver.ts) — `case "add_modifier"`
  vira **só** escrita no world. O switch por stat sai inteiro. Os `case`s que escreviam
  em `damageReduction`/`bonusNextAttack`/`tohitPenaltyByHero`/`flags.*` desaparecem.

- [`src/core/projection/playerView.ts`](../../src/core/projection/playerView.ts) —
  `projectBuffsByHero` e `projectGroupBuffs` leem **só** do world. Nenhuma referência
  a `combat.damageReduction`, `state.flags.*`, etc.

- [`src/core/skills/dispatch.ts`](../../src/core/skills/dispatch.ts) — **`fireTrigger`
  removido inteiro.** Não há mais despacho por string-trigger. Todos os call sites
  antigos (`fireTrigger(state, "start_of_combat", ctx)`, etc.) viram `emit(state, { type: "CombatStarted", payload: ... })`.

- [`src/core/ecs/sync.ts`](../../src/core/ecs/sync.ts) — revisar `DYNAMIC_COMPONENT_TYPES`.
  Se modifiers e triggers sempre vivem no world (nunca no HeroState), o conjunto pode
  ficar vazio ou só conter `condition`/`token`. Verifique que a remoção não quebra
  `syncEntityFromHero/Enemy`.

- [`src/core/reducer/combat.ts`](../../src/core/reducer/combat.ts),
  [`src/core/reducer/exploration.ts`](../../src/core/reducer/exploration.ts),
  [`src/core/reducer/boss.ts`](../../src/core/reducer/boss.ts) — toda escrita em
  `state.combat.damageReduction[...] = ...` (e os outros campos removidos) deve ter sido
  trocada por `emit(...)` ou install de `ModifierComponent` em lotes anteriores.
  Lote G só varre e confirma.

- [`src/core/README.md`](../../src/core/README.md) e
  [`src/data/README.md`](../../src/data/README.md) — refletir que o ECS é fonte da
  verdade; remover a tabela "O que NÃO está conectado" (não existe mais legado).

**Testes:**

- Toda a suíte (553+) verde.
- Asserções automatizadas no `coverage.test.ts`:
  ```
  grep -rn "damageReduction\|bonusNextAttack\|tohitPenaltyByHero\|fireTrigger" src/core/
    → vazio (exceto comentários históricos)
  grep -rn "state\.flags\.dungeonDiscardPrevented" src/core/
    → vazio
  ```

**Critério de saída:**

- Diff do lote é majoritariamente **deleções**.
- README do core perde toda menção a "ainda subutilizado" / "dual-write" / "Fase 7" do ECS.
- `grep` por qualquer nome legacy retorna zero. Migração total confirmada.

**Risco:** baixo (todas as leituras já migraram em lotes anteriores). Tamanho: pequeno.

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

## Decisões já tomadas (não revisitar)

- **`fireTrigger` é apagado inteiro no Lote G.** Sem wrapper, sem fallback. Migração total.
- **`tohit_penalty` reusa `hit_bonus` com valor negativo.** ECS-idiomático, sem duplicar
  enum, sem duplicar agregação. Polaridade buff/debuff vive na projeção, não no storage.
- **Triggers manuais** (`on_use` + `once_per_*` puros) continuam em `fireOnUseSkill` —
  esse é o contrato com a UI pra ativação por clique, **não é legacy**, permanece.

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
