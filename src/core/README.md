# src/core — Motor de jogo

Núcleo de regras do **Ascensão Heróica**. Puro TypeScript: sem React, sem DOM, sem `window`. Todo o estado, transições, resolução de combate, skills e efeitos vivem aqui. A UI consome o core via projeção e nunca duplica lógica de jogo.

> **Regra de ouro:** o core é a fonte da verdade. Se a UI precisa saber alguma coisa para renderizar, o core projeta. Se a UI precisa mudar alguma coisa, ela dispara uma `Action`. Nada acontece "do lado da UI".

---

## Visão geral

```
                     ┌──────────────────────┐
   UI dispatches ──▶ │   reducer(state, A)  │ ──▶ next GameState
                     └──────────┬───────────┘
                                │
                  ┌─────────────┼──────────────┐
                  ▼             ▼              ▼
            handlers       effect stack    skills (DSL/script)
          (combat, room,   (pushEffect →   (fireOnUseSkill,
           reward, boss)    drainStack)     fireTrigger)
                  │             │              │
                  └─────────────┼──────────────┘
                                ▼
                     ┌──────────────────────┐
                     │   GameState (novo)   │
                     └──────────┬───────────┘
                                │
                                ▼
                     ┌──────────────────────┐
                     │  playerView(state)   │ ──▶ PlayerView (UI lê)
                     └──────────────────────┘
```

- **Dispatch é síncrono.** Quando `adapter.dispatch(action)` retorna, o estado já está atualizado e todos os efeitos derivados foram resolvidos.
- **Imutável.** Reducers e handlers nunca mutam — sempre retornam novo `GameState`.
- **Estado válido sempre.** Toda transição de `status` passa por `assertTransition` ([rules/stateMachine.ts](rules/stateMachine.ts)) contra a tabela de [`src/data/transitions.json`](../data/transitions.json).

---

## Estrutura

| Pasta | Papel |
|---|---|
| [`actions/`](actions/) | Tipos discriminados (`Action`) e criadores. A "linguagem" pela qual a UI fala com o core. |
| [`adapter/`](adapter/) | `EngineAdapter` (interface) e `createInProcessAdapter` (única implementação atual). Garante import transitivo do registry de skills. |
| [`config/`](config/) | Constantes globais (limites, valores de balanceamento). |
| [`data/`](data/) | Loaders de `cards.json` e `skills.yaml` — tipos derivados (`CardDefinition`, `SkillDefinition`) e busca por id/nome. |
| [`ecs/`](ecs/) | Entity-Component-System. `world.ts`, `types.ts` (Modifier/Trigger/Token/Condition), `sync.ts` para dual-write durante a transição. `installTriggers.ts` instala triggers reativos de skills por entidade; `installPassive.ts` instala passivos (while_equipped e similares). Os modifiers ainda vivem em `CombatState` durante a transição; o ECS é a fonte futura. |
| [`effects/`](effects/) | Stack de efeitos pendentes (`stack.ts`) e resolver que materializa cada `kind` em mutação de estado (`resolver.ts`). Drenado ao fim de cada action. |
| [`events/`](events/) | Event bus síncrono. Pontos de extensão para "DamageAboutToBeDealt", "HealAboutToBeApplied", etc. |
| [`persistence/`](persistence/) | Porta de persistência (in-memory / localStorage). |
| [`ports/`](ports/) | Interfaces abstratas que separam o core de I/O. |
| [`projection/`](projection/) | `playerView.ts` traduz `GameState` em `PlayerView` (contrato estável da UI). Inclui projeção de buffs ativos por herói e de grupo. |
| [`reducer/`](reducer/) | Handlers por domínio: `setup`, `exploration`, `combat`, `boss`, `reward`, `progression`. `index.ts` é o switch raiz + `drainStack` + validação de transição. |
| [`replay/`](replay/) | Engine de replay determinístico. Mesma seed + mesmo `actionLog` → mesmo estado final. |
| [`rules/`](rules/) | Funções puras: rolagem de dados, cálculo de combate, escudo, máquina de estados, condição do boss, escala de cores. |
| [`scripts/`](scripts/) | `buildScriptCtx` — contexto passado a scripts de skills (acesso seguro a `state`, helpers de log/dano/cura, push de efeitos). |
| [`skills/`](skills/) | Catálogo, dispatch por trigger, DSL v2 (em [`dsl/`](skills/dsl/)), `useSkill` (ativação manual), `lookup`, `renderLabel`, `targeting`. O vocabulário DSL usa prefixos: `i_*` (imperativo/efeito), `p_*` (componente ECS), `s_*` (stat), `nat_*` (nature), `tgt_*` (target), `scp_*` (scope), `obj_*` (object), `evt_*` (evento). **Skills são preferencialmente DSL; script só para lógica única.** |
| [`state/`](state/) | Tipos imutáveis: `GameState`, `HeroState`, `EnemyState`, `CombatState`, `RoomState`, `status` (machine), color. Factories iniciais. |
| [`strategies/`](strategies/) | Pontos de extensão plugáveis (ex: `targetSelection` para escolha de alvo do inimigo). |
| [`systems/`](systems/) | Sistemas que percorrem o estado: `damageSystem`, `healSystem`, `conditionSystem`. Chamados pelo resolver e por handlers. |

---

## Fluxo de uma action

Exemplo: jogador clica em "Usar poder" do Guerreiro.

1. **UI** chama `dispatch({ type: "USE_POWER", payload: { heroId } })`.
2. **`reducer/index.ts`** roteia para `handleUsePower(state, heroId)` em [`reducer/combat.ts`](reducer/combat.ts).
3. Handler valida (em combate? poder já usado nesta sala?), marca `powersUsedThisRoom`, e chama `fireOnUseSkill({ skillId, sourceId })`.
4. **`skills/useSkill.ts`** verifica `isManuallyActivatable(def)`. Se o trigger não é manual (ex: `before_attack`, `_on_*`, `_after_*`), loga aviso e retorna sem efeito.
5. Skill manualmente ativável dispara o `effect` (DSL) ou `script`:
   - **DSL** ([`skills/dsl/evaluate.ts`](skills/dsl/evaluate.ts)) percorre os nós e chama `ctx.action.pushEffect(...)` para cada `EffectDescriptor` produzido.
   - **Script** ([`scripts/context.ts`](scripts/context.ts)) recebe um `ScriptCtx` com helpers e devolve novo estado.
6. **`reducer/index.ts:reducerCore`** chama `drainStack(state)` ao fim, materializando cada `EffectDescriptor` da fila ([`effects/resolver.ts`](effects/resolver.ts)) em mutação concreta do `GameState`.
7. **`applyAndValidate`** confere que a transição de `status` é válida na máquina de estados antes de devolver.
8. Estado novo volta ao adapter; UI re-renderiza a partir da projeção.

Tudo isso é síncrono.

---

## State machine

`GameStatus` ([`state/status.ts`](state/status.ts)) lista todos os estados possíveis. A tabela de transições válidas vive em [`src/data/transitions.json`](../data/transitions.json) e é consultada por [`rules/stateMachine.ts`](rules/stateMachine.ts):

```ts
assertTransition("RESOLVE_ATTACK", "CHECK_COMBAT_END"); // OK
assertTransition("MAIN_MENU", "BOSS_COMBAT");           // throws em dev/test
```

Toda mudança de `status` no reducer é validada. Em produção apenas loga `console.error`; em dev/test lança.

---

## Skills

Duas categorias na ativação:

| Trigger | Dispara como | Exemplo |
|---|---|---|
| `on_use`, `once_per_game`, `once_per_room`, `once_per_combat`, e suas variantes `_until_*` ou `_instead_of_*` | **Manual** — o jogador clica "Usar habilidade" / "Usar poder". | Guarda Inquebrável do Bastião (`once_per_game_until_end_of_round`) |
| `before_attack`, `after_roll`, `on_take_damage`, `while_equipped`, e tudo com `_on_*` ou `_after_*` no meio | **Reativo** — disparado automaticamente pelo handler do evento. | Fúria Rubra (`before_attack`), Caminho Preservado (`once_per_room_on_dungeon_discard`) |

O critério está em `isManuallyActivatable` ([`skills/useSkill.ts`](skills/useSkill.ts)). Triggers que parecem manuais (`once_per_*`) mas contêm `_on_*`/`_after_*` no meio são considerados reativos.

Toda skill define **`effect` XOR `script`**:

- **`effect`** — array de nós DSL ([`skills/dsl/types.ts`](skills/dsl/types.ts)). Preferido: declarativo, testável, reutilizável. Cobertura de tipos via `SkillDefinitionV2Schema`.
- **`script`** — arquivo `.ts` em [`src/data/scripts/`](../data/scripts/) com export `run(ctx)`. Usado só quando a lógica não cabe em primitivos DSL.

**Adicione uma primitiva DSL no core antes de criar um script.** Efeitos repetidos viram `kind`, ativados por JSON; scripts são exceção.

---

## Effect stack

Skills DSL não mutam estado direto — empurram `EffectDescriptor`s para uma fila. Exemplo de uma skill que cura:

```ts
// dentro do evaluate:
ctx.action.pushEffect({ kind: "apply_heal", to: heroId, amount: 3 });
```

Ao fim do dispatch, `drainStack(state)` em [`effects/resolver.ts`](effects/resolver.ts) consome a fila em ordem, traduzindo cada descritor em mutação concreta (`applyHeal`, `applyDamage`, `add_modifier` em `damageReduction[heroId]`, etc.).

Vantagens:
- Ordem determinística.
- Sem recursão direta.
- Pausas para input do jogador (`PausedState`) são representáveis: a stack fica suspensa até o jogador resolver.
- Limite de profundidade (`MAX_STACK_DEPTH = 64`) protege contra loops infinitos.

---

## Projection

A UI nunca lê `GameState` cru. Toda informação chega via `playerView(state)` em [`projection/playerView.ts`](projection/playerView.ts), que devolve um `PlayerView` — contrato estável.

Pontos importantes:

- `view.combat` é `null` fora de combate (em REVEAL_ROOM, REWARD_PHASE, etc.). A UI deve tratar.
- `view.combat.buffsByHero[heroId]` é um array de `BuffView` (chips de efeitos ativos por herói).
- `view.groupBuffs` lista os efeitos que afetam o grupo (flags como `dungeonDiscardPrevented`).
- `BuffView` carrega `kind: "buff" | "debuff" | "neutral"` (polaridade pra cor) e `source` (origem semântica).

Mudanças no shape interno (ex: quando o ECS virar fonte) não devem quebrar a `PlayerView`.

---

## Replay

Pacote serializável (`gameId`, `seed`, `actionLog`) reproduz a partida no `replayFromPackage`. Útil para:

- Bug reports (mande o JSON do replay).
- Testes de regressão.
- Cursor passo-a-passo no Replay Viewer (Ctrl+Shift+R na UI).

Determinismo depende de **toda fonte de aleatoriedade** passar pelo `rng` interno (`rules/dice.ts:rollDiceRng`). Nada de `Math.random()` no core.

---

## Testes

- **`src/core/reducer/reducer.test.ts`** — pipeline integrado action por action.
- **`src/core/skills/__tests__/`** — cobertura por skill, `activatable.test.ts` valida a heurística manual vs reativo.
- **`src/core/skills/dsl/__tests__/`** — guard de schema (toda skill com `effect` valida contra `SkillDefinitionV2Schema`) + testes por kind DSL.
- **`src/core/data/skills.test.ts`** — toda referência em `cards.json` tem skill correspondente em `skills.json`.
- **`src/core/replay/replayEngine.test.ts`** — round-trip de replay.

Rodar:

```bash
npm test              # tudo
npm test reducer      # filtro por nome
npm run script tools/dev-scripts/exemplo.ts   # script avulso com acesso ao core
```

---

## Convenções

- **`rounds.remaining` decrementa em fim de rodada.** Modifiers com `duration: { kind: "rounds", remaining: N }` têm N decrementado a cada `end_of_round` via `decrementRoundsModifiers`. Quando `remaining` atinge 0 o modifier é removido. Usado internamente por `once_per_round` em skills DSL.
- **`while_source_in_play` expira com a entidade-fonte.** Modifiers com este kind carregam `sourceEntityId`. Ao remover uma entidade via `removeEntity`, chamar também `removeModifiersForSource(world, entityId)` para limpar modifiers dependentes instalados em outras entidades.
- **Sem `Math.random()`.** Sempre `rollDiceRng(n, rng)`. Determinismo é invariante.
- **Sem mutação.** `state.foo = bar` é proibido. Sempre `{ ...state, foo: bar }`.
- **`log(state, mensagem)`** ([`reducer/utils.ts`](reducer/utils.ts)) é a única forma correta de adicionar entrada ao `eventLog`.
- **Trigger composto** — quando criar um trigger novo, decida se é manual (sem `_on_`/`_after_`) ou reativo (com). `isManuallyActivatable` segue essa regra.
- **Validação de transição** — ao criar status novo, atualize `transitions.json` antes de qualquer reducer que escreva nele.
- **Estado projetado** — efeito novo que precisa aparecer na UI? Adicione campo em `BuffView` ou em `PlayerView.combat`; nunca exponha `GameState` cru.

---

## Referências

| Documento | Conteúdo |
|---|---|
| [`docs/arquitetura-mvp1.md`](../../docs/arquitetura-mvp1.md) | Decisões de arquitetura do MVP 1 |
| [`docs/engine/v2/`](../../docs/engine/v2/) | Design detalhado do motor v2 (ECS, DSL, event bus) |
| [`docs/patches/`](../../docs/patches/) | Histórico de patches — contexto de cada mudança |
| [`src/data/README.md`](../data/README.md) | Formato de `cards.json`, `skills.yaml` e locale |
