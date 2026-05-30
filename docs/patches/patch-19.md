# Patch 19 — Painel de Influências e refinamento da BuffBar (consumir ECS)

Brief de implementação auto-contido. Não depende de conversa prévia.

**Pré-requisitos:**
- **Patch-18 completo.** O `world` ECS é fonte da verdade dos `ModifierComponent` e
  `TriggerComponent`. Os campos legacy (`damageReduction`, `bonusNextAttack`,
  `tohitPenaltyByHero`, `extraDice`, `prey`, `targetProtectionByHero`, `ecoTokens`,
  `fleeAttemptByHero`, `state.flags.dungeonDiscardPrevented`, `state.flags.fleeBlocked`,
  `state.flags.discardDungeonLocked`) **não existem mais**. `fireTrigger` foi apagado.
  Se algum desses ainda estiver no código, **pare e volte pro patch-18**.

**Objetivo:** dar ao jogador a visão completa de **quem está fazendo efeito sobre quem**
no estado atual — não só os buffs do herói em foco, mas o grafo inteiro:

```
   DUNGEON ◄──── Ladino (Caminho Preservado)
   SALA "Tochas Mortas" ──► GRUPO (descarta 1 item por rodada)
   GUERREIRO (Guarda Inquebrável) ──► todos os heróis (-1 dano sofrido)
   SALAMANDRA (Calor Escaldante) ──► todos os heróis em combate (-2 acerto)
   GUERREIRO ──► Aranha (Fúria Rubra: +6 no próximo ataque vs. ela)
```

O nome do conceito no código é **influência ativa**: cada relação `(origem → alvo)`
com um efeito ativo no momento. Cada `ModifierComponent` no world é exatamente isso
(traz `source` e `entityId`), e cada `TriggerComponent` "armado" também (traz `source`
e o evento que espera).

**Princípio inegociável — núcleo é fonte da verdade.**
> A UI **não interpreta** state cru. Toda a derivação de influências
> (`{ from, to, label, kind, duration, source, scope }`) acontece em
> [`src/core/projection/playerView.ts`](../../src/core/projection/playerView.ts).
> Os componentes em `src/ui/` só renderizam. Se um lote propor lógica de agregação
> ou de polaridade dentro de `src/ui/`, **rejeite o lote** — manda pra projeção.

**Princípio inegociável — `skills.json` / `cards.json` não mudam.**
> Igual ao patch-18. Toda informação semântica (nome da skill, label, fonte) sai do
> `ModifierComponent.source` e do catálogo via `lookupSkillById`.

---

## Protocolo de execução

- **Não releia arquivos.** Edit por trecho, harness rastreia.
- **Commit por lote.** Mensagem: `feat(ui): patch-19 Lote X — <resumo>`.
- **Não use `Co-Authored-By`.** Conforme [CLAUDE.md](../../CLAUDE.md).
- **`src/core/projection/` é core.** Mudar projeção é OK e está dentro do escopo.
  O proibido é colocar lógica de derivação em `src/ui/`.

---

## Lote A — Projeção `view.activeInfluences`

**Alvo:** transformar o grafo de modifiers/triggers do world numa lista projetada
pronta pra UI consumir.

**Arquivos:**

- [`src/core/projection/playerView.ts`](../../src/core/projection/playerView.ts) — novo tipo:
  ```ts
  // Quem é "origem" ou "alvo" de uma influência. IDs específicos quando possível,
  // categoria abstrata quando o efeito é de grupo/dungeon/sala.
  export type InfluenceActor =
    | { kind: "hero";    id: string; name: string }
    | { kind: "enemy";   id: string; name: string }
    | { kind: "room";    id: string; name: string }
    | { kind: "group" }                       // todos os heróis ativos
    | { kind: "dungeon" }                     // recursos compartilhados (deck etc.)
    | { kind: "self";    id: string; name: string };

  export interface InfluenceView {
    readonly id: string;                      // estável: <source>:<entityId>:<seq>
    readonly from: InfluenceActor;            // quem está aplicando
    readonly to: InfluenceActor;              // sobre quem
    readonly kind: "buff" | "debuff" | "neutral";
    readonly icon: string;
    readonly label: string;                   // ex: "-1 dano sofrido"
    readonly source: string;                  // nome da skill ("Guarda Inquebrável do Bastião")
    readonly duration: string;                // "até fim da rodada", "próximo ataque", "passivo"
    // Categorização pra UI agrupar:
    readonly scope:
      | "room_to_group"
      | "room_to_hero"
      | "hero_to_dungeon"
      | "hero_to_group"
      | "hero_to_self"
      | "hero_to_enemy"
      | "enemy_to_hero"
      | "enemy_to_group"
      | "dungeon_to_group"
      | "item_to_hero";                       // passivas while_equipped
  }
  ```

- Adicionar `view.activeInfluences: readonly InfluenceView[]` no `PlayerView`.

- Nova função `projectActiveInfluences(state)`:
  - Varre `queryWithComponent(world, "modifier")` → cada `ModifierComponent` é uma influência.
  - Varre `queryWithComponent(world, "trigger")` filtrando os "armados que esperam algo
    específico" (ex: `consumeAfterFire` setado, ou skill com efeito visível pendente como
    Caminho Preservado / Fúria Rubra).
  - Determina `from` a partir de `ModifierComponent.source` (rastreia: skill X → carta dona
    da skill → entityId dono da carta).
  - Determina `to` a partir do `entityId` que carrega o Component.
  - Categoriza em `scope` com base nos `kind`s de from/to.
  - Resolve `source` (nome legível da skill) via `lookupSkillById(modifier.source)?.name`.
  - Resolve `duration` mapeando o `Duration` ECS pra texto curto:
    - `permanent` → "passivo"
    - `this_turn` / `until_end_of_round` → "até fim da rodada"
    - `this_combat` / `until_end_of_combat` → "até fim do combate"
    - `rounds` → `"${remaining} rodada(s)"`
    - `once` → "próximo evento"

- **Helper `resolveOwnerEntity(world, skillId)`** em [`src/core/ecs/world.ts`](../../src/core/ecs/world.ts):
  dado um `skillId` (ex: `power_unbreakable_bastion_guard`), retorna a `Entity` que
  declara essa skill (foi instalada por `installSkillTriggers` ou `installPassive`).
  Implementação: varrer entidades procurando aquela cuja carta-base inclui o `skillId`.
  Cache opcional via `state.flags._skillOwnerIndex` se ficar caro.

**Manter compat (lotes B/C vão refatorar):**
- `view.combat.buffsByHero` e `view.groupBuffs` continuam projetados como hoje.
  Eles passam a ser **derivados de `view.activeInfluences`** filtrando por `to.id === heroId`
  e por `scope ∈ {room_to_group, dungeon_to_group, hero_to_group}` respectivamente.
  Nada na UI quebra.

**Testes:**

- `src/core/projection/__tests__/activeInfluences.test.ts`:
  - Cenário com Guarda Inquebrável aplicada → 3 influências `hero_to_group` (origem
    Guerreiro, destino group abstrato; ou 3 influências `hero_to_hero` se decidirmos
    fan-out por herói — ver pontos abertos).
  - Cenário com Caminho Preservado armada → 1 influência `hero_to_dungeon`.
  - Cenário com Calor Escaldante (Salamandra ativa) → N influências `enemy_to_hero`.
  - Cenário com Foco do Caçador equipado → 1 influência `item_to_hero` com source = item.

**Critério de saída:**

- `view.activeInfluences` populado corretamente em cenários de teste.
- `view.combat.buffsByHero` e `view.groupBuffs` continuam funcionando (derivados).
- BuffBar atual renderiza igualzinho — Lote A não muda UI.

**Risco:** médio (rastreio source → entidade dona pode ter casos de borda). Tamanho: médio.

---

## Lote B — Componente `InfluencePanel`

**Alvo:** novo componente UI que renderiza `view.activeInfluences` agrupado por
categoria. Convive com a BuffBar atual (substituição vem no Lote C).

**Arquivos:**

- **Novo:** `src/ui/components/InfluencePanel.tsx` — renderiza influências agrupadas
  por `scope`, com header por categoria:
  ```
  ┌─ INFLUÊNCIAS ATIVAS ──────────────────────────────────────┐
  │                                                            │
  │ SALA → GRUPO                                               │
  │   🔥 -1 carta de item/rodada · Tochas Mortas               │
  │                                                            │
  │ HERÓIS → GRUPO                                             │
  │   🛡️ -1 dano sofrido · Guarda Inquebrável (Guerreiro)      │
  │                                                            │
  │ HERÓIS → DUNGEON                                           │
  │   🗝️ próximo descarte devolvido · Caminho Preservado       │
  │                                                            │
  │ INIMIGOS → HERÓIS                                          │
  │   🌫️ -2 acerto · Calor Escaldante (Salamandra)             │
  │                                                            │
  │ HERÓIS → INIMIGOS                                          │
  │   ⚔️ +6 dano próximo ataque · Fúria Rubra (Guerreiro→Aranha) │
  └────────────────────────────────────────────────────────────┘
  ```
- Estrutura:
  ```tsx
  function InfluencePanel({ influences }: { influences: readonly InfluenceView[] }) {
    const groups = useMemo(() => groupByScope(influences), [influences]);
    // groups: Record<scope, InfluenceView[]>
    return (
      <div className="...">
        {SCOPE_ORDER.map(scope =>
          groups[scope]?.length ? (
            <Section key={scope} title={SCOPE_LABELS[scope]}>
              {groups[scope].map(inf => <InfluenceChip key={inf.id} influence={inf} />)}
            </Section>
          ) : null
        )}
      </div>
    );
  }
  ```
- `groupByScope` e `SCOPE_ORDER` / `SCOPE_LABELS` são constantes locais do componente.
  Lógica é pura função de agrupamento — não interpreta dados.

- [`src/ui/screens/Exploration.tsx`](../../src/ui/screens/Exploration.tsx) — adicionar
  toggle `📊 Influências` na barra de status superior (similar ao `📋 Log`). Quando
  ativo, renderiza `<InfluencePanel influences={view.activeInfluences} />` numa
  posição decidida pelo dono do repo (ver pontos abertos).

**Testes:**

- `src/ui/components/__tests__/InfluencePanel.test.tsx` (Vitest + Testing Library):
  - Render com influências de cada scope → cabeçalhos corretos aparecem.
  - Sem influências de um scope → seção esconde.
  - Lista vazia → mensagem "Nenhuma influência ativa".

**Critério de saída:**

- Painel renderiza com cabeçalhos por categoria.
- Toggle funciona, sem regressão na BuffBar existente.

**Risco:** baixo. Tamanho: médio.

---

## Lote C — Refinar BuffBar e remover duplicação

**Alvo:** decidir entre **manter BuffBar + InfluencePanel** (dois pontos de leitura
diferentes) ou **migrar BuffBar pra projeção via `activeInfluences`** (uma fonte só,
filtrada). Após o lote, sem duplicação de lógica de chip.

**Trabalho concreto:**

- [`src/ui/components/BuffBar.tsx`](../../src/ui/components/BuffBar.tsx) — passa a aceitar
  `InfluenceView[]` em vez de `BuffView[]` (ou um adapter na projeção converte). Mantém o
  mesmo visual de chip.
- [`src/core/projection/playerView.ts`](../../src/core/projection/playerView.ts) —
  `buffsByHero[heroId]` vira `activeInfluences.filter(i => i.to.id === heroId)`.
  `groupBuffs` vira `activeInfluences.filter(i => i.to.kind === "group" || i.to.kind === "dungeon")`.
  `BuffView` pode ser removido — substituído por `InfluenceView`.
- [`src/ui/screens/Exploration.tsx`](../../src/ui/screens/Exploration.tsx) — a barra
  unificada (grupo no topo + herói em baixo) lê das novas listas filtradas. Sem mudança
  visual.

**Granularidade do chip — decisão pendente** (ver pontos abertos):
- **Opção A — um chip por `ModifierComponent`.** Mostra source individual. Pode poluir
  quando vários modifiers do mesmo source coexistem (ex: dois usos da mesma skill).
- **Opção B — agrupar por `source` na projeção, somando `value`.** Compacto. Perde
  granularidade de duração se vários modifiers do mesmo source têm `Duration` diferente.

**Testes:**

- BuffBar não regressiona: snapshot dos chips existentes continua o mesmo (com a
  granularidade decidida).
- Source dos chips agora é o nome real da skill (ex: "Guarda Inquebrável do Bastião").

**Critério de saída:**

- `BuffView` removido do código (ou renomeado pra `InfluenceView`).
- BuffBar consome `InfluenceView`.
- Sem duplicação de lógica de derivação em `src/ui/`.

**Risco:** baixo. Tamanho: pequeno.

---

## Lote D — Polimento opcional

Lote opcional pra refinar a UX após uso real. Skip se não houver demanda.

- **Filtro por entidade.** Clicar num herói/inimigo no tabuleiro destaca só as
  influências de/para ele no `InfluencePanel`.
- **Hover no chip → highlight no tabuleiro.** Passar mouse num chip "Calor Escaldante
  (Salamandra)" pinta a Salamandra no Board.
- **Categorização em árvore visual** (em vez de seções planas) — desenha as flechas
  origem→destino com SVG. Mais bonito, mais caro de implementar.
- **Tooltip rico.** Hover mostra a descrição completa da skill (textTemplate do catálogo).
- **Histórico/diff por rodada.** "O que mudou desde a rodada anterior?" — exige
  snapshot e diff; cabe num patch futuro se virar prioridade.

Critério de saída: o que o dono do repo aceitar. Cada item vai num commit separado dentro
deste lote.

---

## Ordem e dependências

| Lote | Depende de | Tamanho |
|---|---|---|
| A | patch-18 fechado | médio |
| B | A | médio |
| C | A, B | pequeno |
| D | A, B, C | variável |

Recomendação: A → B → C → D. Cada um commitável e shipável independente.

---

## Pontos abertos pra dono do repo decidir antes de iniciar

1. **Fan-out de influência de grupo.** Guarda Inquebrável aplica `damage_taken: -1` em
   **três** ModifierComponents (um por herói, criados pelo `for_each over all_heroes`).
   No InfluencePanel, isso deve aparecer como:
   - **A — uma linha agrupada:** "🛡️ -1 dano · Guarda Inquebrável → grupo (3 heróis)"
   - **B — três linhas individuais:** "🛡️ -1 dano · Guerreiro" + "Mago" + "Ladino"
   - **C — uma linha por target abstrato:** detecta que o efeito é uniforme e mostra
     "Guarda Inquebrável → todos os heróis ativos".

2. **Onde o `InfluencePanel` fica na tela.**
   - **A — toggle (📊 Influências)** abre e cobre parte da tela (igual ao Log).
   - **B — sempre visível** como bloco abaixo da BuffBar, abaixo do tabuleiro.
   - **C — sidebar lateral fixa** (mais espaço pra UI, mas mexe no layout do Board).

3. **BuffBar sobrevive ao InfluencePanel?** Há overlap intencional (BuffBar foca no herói
   em foco, Painel mostra tudo)?
   - **A — sim, ambos.** BuffBar continua sendo o resumo rápido do herói em foco.
   - **B — só InfluencePanel.** BuffBar some; o painel cumpre os dois papéis.

4. **Granularidade do chip de modifier** (Lote C). Opção A (um por modifier) ou
   B (agrupar por source)?

Resolva esses quatro antes de começar o Lote A.
