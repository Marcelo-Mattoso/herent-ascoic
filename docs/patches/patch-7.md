# Patch-7 — Engine de habilidades (skills.json como contrato runtime)

## Contexto

Hoje as habilidades são apenas texto. A UI lê `skill.label`/`effect.label` em [HeroFocusPanel.tsx:187](src/ui/components/HeroFocusPanel.tsx:187) e [CardDetailModal.tsx:47](src/ui/components/modals/CardDetailModal.tsx:47), mas nenhum código branchea por `ability.type`/`trigger`/`target`. Os únicos efeitos "ligados" são hard-coded por `cardName`/`itemName` em [combat.ts:122-138](src/core/reducer/combat.ts:122) (Adaga Enferrujada, Escudo Rachado, Bárbaro Rubro skill+power) e [combat.ts:394-413](src/core/reducer/combat.ts:394) (Poção de Vigor Menor). O catálogo v3 existe em [docs/spec/v3/habilidades_1.json](docs/spec/v3/habilidades_1.json) (82 habilidades, 43 `type`s distintos, 60+ `trigger`s) mas não é consumido em runtime.

Este patch introduz uma **engine genérica de efeitos** dirigida por dados: cada `ability.type` vira um handler registrado, e cada `trigger` vira um ponto de dispatch no reducer. O catálogo runtime passa a ser `src/data/skills.json` (cópia transformada do `habilidades_1.json`, com o schema que o engine consome).

A spec do jogo (v2 §1-9) **não muda**. Só estamos materializando as regras já escritas que hoje vivem em texto.

## Princípios

1. **Catálogo é fonte única de verdade.** `cards.json` continua sendo o que o app importa, mas a engine resolve `Ability` → `SkillDefinition` via lookup pelo par `(cardName, field)` no `skills.json`. Em divergência de `type` entre dungeon e catálogo (anotada em [patch-6.md §1.3](docs/patch-6.md)), **o catálogo vence** — invertendo a decisão anterior, porque agora ele é o que o engine executa.
2. **Handlers são puros.** Cada handler tem assinatura `(state, ctx, params) => state`. Sem efeitos colaterais, sem mutação. `ctx` carrega o disparo (`heroId`/`enemyId`/`damageAmount`/etc.).
3. **Dispatch por trigger, não por `type`.** O reducer chama `fireTrigger(state, "before_attack", ctx)` em pontos fixos do fluxo. A engine percorre todas as habilidades em jogo, filtra por `trigger`, e roteia ao handler do `type`.
4. **Escopo do MVP1 = subset coberto.** Implementar todos os 43 `type`s é fora de escopo. Este patch entrega a infra + os ~15 `type`s necessários pra rodar uma partida completa da Fornalha Sombria com as 8 fichas de herói. Demais habilidades viram `noop` com log `[NÃO IMPLEMENTADO: <id>]` — não quebra runtime, só não tem efeito.
5. **Sem migração big-bang dos hard-codes.** Remoção do código antigo (Adaga, Escudo, Bárbaro, Poção de Vigor Menor) acontece na **última fase**, depois que o engine cobre os mesmos casos. Assim cada fase intermediária pode ser testada isoladamente.

## Schema do `skills.json`

Derivado de `habilidades_1.json` com transformação:

```jsonc
{
  "version": "1.0",
  "abilities": [
    {
      "id": "habilidade-furia-rubra",
      "name": "Fúria Rubra",
      "category": "habilidade",
      "type": "damage_bonus",
      "trigger": "before_attack",
      "target": "self",
      "usesVariable": true,
      "textTemplate": "...{value}...",
      "labelTemplate": "Fúria Rubra ({value}): ...",
      "usedBy": [
        { "card": "Bárbaro Rubro", "cardType": "hero", "field": "skill", "value": 2 }
      ]
    }
  ]
}
```

**Transformação aplicada na cópia v3 → `skills.json`:** nenhuma. O schema da v3 já serve. Apenas copiar o arquivo. (Se aparecer necessidade de campo extra durante implementação, ele é adicionado lá e versão sobe pra "1.1".)

## Arquivos novos

```
src/data/skills.json                          # cópia de docs/spec/v3/habilidades_1.json
src/data/skills.ts                            # import + tipos
src/data/skillTypes.ts                        # SkillDefinition, SkillUsage, SkillContext
src/core/skills/registry.ts                   # Map<type, handler> + register()
src/core/skills/lookup.ts                     # resolveSkill(cardName, field) → SkillDefinition
src/core/skills/dispatch.ts                   # fireTrigger(state, trigger, ctx) → state
src/core/skills/targeting.ts                  # resolveTarget(state, targetSpec, ctx) → ids[]
src/core/skills/handlers/index.ts             # exporta + registra todos os handlers
src/core/skills/handlers/damage_bonus.ts      # e os outros types do MVP (lista abaixo)
src/core/skills/__tests__/dispatch.test.ts
src/core/skills/__tests__/handlers.test.ts
```

## Arquivos modificados

- [src/data/cardTypes.ts](src/data/cardTypes.ts) — `Ability` ganha campo opcional `skillId?: string` pra acelerar o lookup (se ausente, lookup por `(cardName, field)` ainda funciona).
- [src/core/reducer/combat.ts](src/core/reducer/combat.ts) — pontos de dispatch (`before_attack`, `after_roll`, `on_damage_taken`, `on_destroy_creature_with_attack`, `start_of_combat`, `on_enter_combat`, `before_combat`).
- [src/core/reducer/exploration.ts](src/core/reducer/exploration.ts) — `on_room_reveal`, `on_enter_room`, `first_round_in_room`, `on_win_room`.
- [src/core/reducer/reward.ts](src/core/reducer/reward.ts) — `on_first_creature_destroyed_in_room`.
- [src/core/state/combatState.ts](src/core/state/combatState.ts) — flags pra triggers `once_per_*` (mapa `Record<skillUsageKey, true>`).
- [src/core/state/gameState.ts](src/core/state/gameState.ts) — flags pra triggers `once_per_game`.
- [src/core/actions/types.ts](src/core/actions/types.ts) — nova action `USE_SKILL { payload: { skillId, sourceId, targetIds?, value? } }` pra habilidades com `trigger: "on_use"` (skill ativa do herói, item consumível, etc.).
- [src/core/reducer/index.ts](src/core/reducer/index.ts) — case pra `USE_SKILL`.

## Fases

### Fase 1 — Catálogo runtime + tipos (sem comportamento)

1. Copiar [docs/spec/v3/habilidades_1.json](docs/spec/v3/habilidades_1.json) para `src/data/skills.json`.
2. Criar `src/data/skills.ts`:
   ```ts
   import data from "./skills.json";
   import type { SkillCatalog } from "./skillTypes";
   export const SKILLS: SkillCatalog = data as SkillCatalog;
   ```
3. Criar `src/data/skillTypes.ts` com `SkillDefinition`, `SkillUsage`, `SkillCatalog`, `SkillContext`, `TriggerName` (union de strings dos triggers usados), `TargetSpec` (union dos `target`s).
4. Teste em `src/data/skills.test.ts`: valida que o arquivo carrega, que todos os `id`s são únicos, que cada `usedBy[].card` existe em `cards.json` e que cada `usedBy[].field` aponta pra um campo do tipo `Ability` no `cards.json` (sanity check de consistência).

**Critério:** `npm run build` e `npm run test` verdes. Nenhum comportamento mudou ainda.

### Fase 2 — Lookup + dispatch + targeting (esqueleto sem handlers)

1. `src/core/skills/lookup.ts`: `resolveSkillsFor(card, field) → SkillDefinition | null`, percorre `SKILLS.abilities` e casa via `usedBy[].card === card.name && usedBy[].field === field`. Memoizar em `Map` no boot.
2. `src/core/skills/registry.ts`: `register(type, handler)`, `getHandler(type)`. Handler ausente loga warning uma vez e retorna `state` inalterado.
3. `src/core/skills/targeting.ts`: implementa os targets que aparecem no MVP. Lista real extraída de `skill`+`power` dos 8 heróis (13 targets):
   - **Personagens**: `"self"`, `"hero"`, `"heroes"`, `"hero_or_ally"`, `"hero_or_ally_creature"`, `"creature_in_room"`, `"heroes_or_self_next_attack"`
   - **Dados**: `"ally_die"`, `"ally_or_enemy_die"`, `"blue_die_and_self"`
   - **Recursos/zonas**: `"dungeon"`
   - **Inimigos** (aparecem em itens/criaturas — adicionar na Fase 6): `"enemy"`, `"all_enemies"`, `"chosen_enemy"`

   Cada target retorna `{ kind, ids?: string[], dieIndices?: number[] }` — não basta `string[]` porque alguns mexem em dados individuais, não em entidades. Targets com escolha do jogador (`hero_or_ally_creature`, `ally_die`, etc.) retornam `{ kind: "needs_selection", candidates: [...] }` e a engine emite `phase: "skill_targeting"`.
4. `src/core/skills/dispatch.ts`: `fireTrigger(state, trigger, ctx)`. Coleta todas as habilidades "em jogo" (heróis ativos com `skill`/`power`, itens equipados, criaturas ativas com `effect`/`purpleEffect`, sala atual com `effect`, artefatos com bearer), filtra por `trigger`, e roda cada handler em sequência.
5. Testes unitários: lookup com casos hit/miss, targeting pra cada tipo, dispatch sem handler registrado (smoke).

**Critério:** dispatch chamado em zero lugares ainda. Testes do esqueleto verdes.

### Fase 3 — Pontos de dispatch no reducer (engine "ligada", sem handlers reais)

Adicionar `fireTrigger(state, "...", ctx)` nestes pontos. Onde já há lógica hard-coded (Adaga/Bárbaro/Escudo), **manter a lógica antiga** — o dispatch entra ANTES da lógica antiga.

| Trigger                                      | Onde plugar                                                                        |
|----------------------------------------------|------------------------------------------------------------------------------------|
| `before_attack`                              | [combat.ts:141 handleRollDice](src/core/reducer/combat.ts:141), início             |
| `after_roll`                                 | [combat.ts:141 handleRollDice](src/core/reducer/combat.ts:141), após `rollDice()`  |
| `on_damage_taken` / `on_take_damage` / `on_take_attack_damage` / `on_hit_received` | [combat.ts:222 handleResolveAttack](src/core/reducer/combat.ts:222), ANTES de `applyShield` |
| `on_destroy_creature_with_attack`            | [combat.ts:204](src/core/reducer/combat.ts:204), quando inimigo morre              |
| `on_deal_damage`                             | [combat.ts:204](src/core/reducer/combat.ts:204), antes de aplicar dano             |
| `start_of_combat` / `on_enter_combat`        | [combat.ts:18 handleStartCombat](src/core/reducer/combat.ts:18)                    |
| `before_combat`                              | [exploration.ts handleSpawnEnemies](src/core/reducer/exploration.ts)               |
| `on_room_reveal`                             | [exploration.ts handleRevealRoom](src/core/reducer/exploration.ts)                 |
| `on_enter_room`                              | [exploration.ts handleResolveRoomEffect](src/core/reducer/exploration.ts)          |
| `first_round_in_room`                        | [combat.ts:336 handleCheckCombatEnd](src/core/reducer/combat.ts:336), na round=1   |
| `on_win_room`                                | [reward.ts handleGrantRewards](src/core/reducer/reward.ts)                         |
| `on_first_creature_destroyed_in_room`        | [combat.ts:204](src/core/reducer/combat.ts:204), com flag `firstKillInRoom`        |
| `while_equipped` / `while_in_play` / `while_active` | Avaliados sob demanda em `before_attack`/`after_roll` (não disparam, fornecem modificadores) |
| `on_use`                                     | Disparado pela action nova `USE_SKILL` (Fase 5)                                    |

**Critério:** todos os triggers compilam. Como nenhum handler está registrado, `fireTrigger` é no-op com warning. Suite de testes existente continua verde (esp. [reducer.test.ts](src/core/reducer/reducer.test.ts) e [combat.test.ts](src/core/rules/combat.test.ts)).

### Fase 4 — Handlers do MVP (lote 1: efeitos dos 8 heróis)

Implementar os `type`s que aparecem em `skill`+`power` dos 8 heróis da Fornalha Sombria. (`power` é tratado como `skill` na engine — mesma `SkillDefinition`, mesmo registry; só muda `category` e o `field` no `usedBy[]`.) Lista a obter rodando:

```js
node -e "const s=require('./src/data/skills.json'); const heroes=s.abilities.flatMap(a=>a.usedBy.filter(u=>u.cardType==='hero'&&(u.field==='skill'||u.field==='power')).map(u=>({card:u.card,field:u.field,type:a.type,trigger:a.trigger,target:a.target,id:a.id}))); console.table(heroes);"
```

Lista real (16 habilidades, 13 `type`s) — `skill` e `power` são tratados pelo **mesmo engine**; a distinção é editorial (`category`/`field`), não de runtime:

| `type`                      | Carta(s)                                   | `value`     | Complexidade |
|-----------------------------|--------------------------------------------|-------------|--------------|
| `damage_bonus`              | Bárbaro skill                              | `2`         | baixa        |
| `heal`                      | Clérigo skill                              | `3`         | baixa        |
| `armor`                     | Guerreiro skill + Guerreiro power          | `3` / `1`   | baixa (reusa [applyShield](src/core/rules/shield.ts)) |
| `dice_modification`         | Mago skill                                 | `1`         | média        |
| `discardDungeon_prevention` | Ladino skill                               | `null`      | média        |
| `mark_and_tohit`            | Caçador skill                              | `1`         | média (state de `prey` persistente) |
| `recoverDungeon`            | Necromante skill + Ladino power            | `1` / `1`   | média        |
| `tohit_damage`              | Paladino skill                             | `"2/2"`     | baixa        |
| `heal_or_survive`           | Clérigo power                              | `"full/1"`  | média (escolha do jogador) |
| `diceFix`                   | Mago power                                 | `"6/1"`     | média        |
| `damage_bonus_duration`     | Bárbaro power                              | `null`      | alta (acopla à própria skill) |
| `heal_or_damage_bonus`      | Paladino power                             | `"5/5"`     | média        |
| `token`                     | Necromante power                           | `"1/3/2/2"` | alta (recurso novo no state) |
| `diceFix_damage`            | Caçador power                              | `"6/1"`     | alta (combo) |

Cada handler em arquivo próprio em `src/core/skills/handlers/`. Cada um com teste unitário em `src/core/skills/__tests__/handlers.test.ts` cobrindo:
- caso golden path
- target ausente / inválido
- valor zero / negativo (no-op)
- interação com `once_per_*` (verifica que a flag é gravada)

**Critério:** os 8 heróis usam suas habilidades pelo engine (não pelo código antigo ainda, que coexiste). Testes específicos: criar `src/core/skills/__tests__/heroes.test.ts` com um cenário por herói exercitando `skill` e `power`.

### Fase 5 — Action `USE_SKILL` + UI mínima

1. Adicionar `USE_SKILL` em [actions/types.ts](src/core/actions/types.ts) e case no [reducer/index.ts](src/core/reducer/index.ts):
   ```ts
   case "USE_SKILL":
     return fireOnUseSkill(state, action.payload);
   ```
2. `fireOnUseSkill` valida que a habilidade é `trigger: "on_use"`, resolve o handler, e aplica.
3. UI: em [HeroFocusPanel.tsx](src/ui/components/HeroFocusPanel.tsx), adicionar botão "Usar habilidade" quando `skill.trigger === "on_use"` e habilitar conforme regra da carta. Não inventar UX nova — botão simples ao lado do label.
4. Para skills com `target` que exige escolha (`hero_or_ally_creature`, `chosen_enemy`), adicionar fase `SKILL_TARGETING` no `combat.phase` análoga a `selecting_target`. Reutilizar o mecanismo de seleção já existente do `CHOOSE_TARGET`.

**Critério:** Clérigo consegue ativar `Cura da Última Luz` em combate via UI. Cenário de teste end-to-end no [reducer.test.ts](src/core/reducer/reducer.test.ts).

### Fase 6 — Handlers do MVP (lote 2: itens, salas, criaturas)

Cobrir o que falta pra rodar uma partida sem `[NÃO IMPLEMENTADO]` em cenários comuns:

- Itens consumíveis: Poção de Vigor Menor/Maior, Poção de Fúria (`heal`, `damage_bonus`), Pedra de Afiar (`tohit`), Antídoto (`prevent_damage`), Tocha (`direct_damage` em monstros).
- Itens equipamento (`while_equipped`): Adaga Enferrujada, Espada Curta, Escudo Rachado (já parcialmente coberto pelo `applyShield`), Armadura de Couro.
- Efeitos roxos de criaturas (`on_purple_effect_damage_taken` ou trigger em `damage_reflect`): pelo menos 3 das mais comuns.
- Efeitos de sala (`on_enter_room`, `first_round_in_room`): pelo menos as 3 salas usadas no tutorial.

Skills fora dessa lista permanecem com handler `noop` + log `[SKILL NÃO IMPLEMENTADA: <id>]`. Listar em [docs/patch-7-pendencias.md](docs/patch-7-pendencias.md).

**Critério:** partida completa rodável via UI sem placeholder visível em uso normal.

### Fase 7 — Remoção do código antigo

1. Apagar branches em [combat.ts:119-139 collectHeroBonuses](src/core/reducer/combat.ts:119) referentes a Adaga, Bárbaro Rubro skill/power, e a lógica de Adaga em [combat.ts:208](src/core/reducer/combat.ts:208).
2. Apagar `case "Poção de Vigor Menor"` em [combat.ts:395 handleUseItem](src/core/reducer/combat.ts:395). `handleUseItem` vira despachante puro: resolve `skillId` do item e chama `fireOnUseSkill`.
3. Apagar `case "Bárbaro Rubro"` em [combat.ts:421 handleUsePower](src/core/reducer/combat.ts:421). Mesma coisa — vira despachante.
4. Manter `applyShield` em [shield.ts](src/core/rules/shield.ts) — é uma rule helper, não acoplada a `cardName`. O handler de `armor` chama `applyShield` se for o caso.
5. Rodar suíte completa. Esperar verde.

**Critério:** `grep -rn 'cardName ===' src/core/` retorna zero matches em código de gameplay (só em logs/UI). Os hard-codes da [combat.ts](src/core/reducer/combat.ts) sumiram.

### Fase 8 — Bump + commit + docs

1. `package.json`: `0.6.0` → `0.7.0`.
2. Atualizar [docs/arquitetura-mvp1.md](docs/arquitetura-mvp1.md) com seção "Engine de habilidades": catálogo, dispatch, registry, regra "catálogo vence em divergência".
3. Commit único por fase (8 commits no total), prefixo `feat(patch-7 fase N):`.

## Critérios de aceitação globais

- Todos os testes existentes verdes ([cards.test.ts](src/data/cards.test.ts), [combat.test.ts](src/core/rules/combat.test.ts), [reducer.test.ts](src/core/reducer/reducer.test.ts), etc.).
- Novos testes: `src/data/skills.test.ts`, `src/core/skills/__tests__/*.test.ts`, `heroes.test.ts`.
- Partida completa jogável via UI (smoke manual).
- Hard-codes por `cardName` removidos do core de gameplay.
- Skills não cobertas registradas em [docs/patch-7-pendencias.md](docs/patch-7-pendencias.md) com `id` e justificativa (ex: "fora do tutorial", "depende de mecânica X não implementada").

## Fora de escopo

- Implementar todos os 43 `type`s. Só o subset necessário pro tutorial completo.
- Reconciliar `type`s entre `cards.json` e `skills.json`. O engine resolve via catálogo (catálogo vence). Cartas com divergência rodam o `type` do catálogo silenciosamente.
- Refatorar UI além do botão "Usar habilidade".
- Animações, feedback visual de trigger, replays.
- Suporte a `usesVariable: true` com valor escolhido pelo jogador no momento do uso (ex: Fúria Rubra com `{value}` dinâmico). Usar sempre o `value` declarado em `usedBy[]`.
- Boss abilities (`category: "habilidade_chefe"`). Boss continua com a lógica em [boss.ts](src/core/reducer/boss.ts).

## Riscos

- **Ordem de resolução de triggers múltiplos.** Dois `before_attack` na mesa: qual roda primeiro? Decisão: ordem de declaração no `state` (heróis na ordem de turno, depois itens, depois criaturas). Documentar em `dispatch.ts`. Se aparecer caso onde isso quebra balanceamento, criar campo opcional `priority?: number` na `SkillDefinition`.
- **Triggers compostos.** 6 dos 8 powers de herói usam variantes de `once_per_game_*`. Casos reais a tratar:

  | Trigger composto                          | Guard            | Base trigger        | Observação                                     |
  |-------------------------------------------|------------------|---------------------|------------------------------------------------|
  | `once_per_game`                           | `oncePerGame`    | `on_use`            | Power "puro" — só ativável manualmente         |
  | `once_per_game_until_end_of_round`        | `oncePerGame`    | `on_use`            | Efeito ganha duração `until_end_of_round`      |
  | `once_per_game_after_any_roll`            | `oncePerGame`    | `after_roll`        | Reage passivamente; player escolhe se gasta    |
  | `once_per_game_on_defeat_creature`        | `oncePerGame`    | `on_destroy_creature_with_attack` | Hook já existente                |
  | `once_per_game_after_roll_vs_prey`        | `oncePerGame`    | `after_roll`        | **Novo** — requer state de `prey` (Caçador)    |
  | `once_per_game_on_use_furia_rubra`        | `oncePerGame`    | (custom)            | **Novo** — Bárbaro power se acopla à própria skill; precisa hook "depois que skill X foi usada" |

  Estratégia: parser de trigger separa guard (`once_per_<scope>`) e base; o scope vira chave no `state.oncePer<Scope>: Record<skillId, true>`. Os dois "novos" no fim da tabela exigem triggers semânticos extras no reducer — não dá só com guard genérico. Documentar em [src/core/skills/dispatch.ts](src/core/skills/dispatch.ts).

- **`value` é heterogêneo.** No catálogo aparece `number`, `null`, e strings compostas: `"2/2"`, `"5/5"`, `"6/1"`, `"full/1"`, `"1/3/2/2"`. Convenção: o handler é responsável por parsear `value` no formato que espera (ex: handler de `tohit_damage` lê `"a/b"` → `{tohit: a, damage: b}`). Centralizar parsers comuns em `src/core/skills/valueParsers.ts` (`parseSlashPair`, `parseSlashQuad`, `parseFullOr`). Cada handler valida o formato e loga `[VALUE INVÁLIDO]` se não casar.
- **Lookup por nome de carta.** Se a carta for renomeada em [cards.json](src/data/cards.json), o lookup quebra silenciosamente. O teste da Fase 1 pega isso (valida que todos os `usedBy[].card` existem).
