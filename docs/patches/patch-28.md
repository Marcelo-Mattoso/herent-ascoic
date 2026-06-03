# Patch 28 — Extrair pt-BR de `cards.yaml` para locale

Brief auto-contido.

**Pré-requisitos:** patch-27 concluído (cards já vivem em YAML). Sem ele, este patch tem que conviver com vírgulas e aspas e fica ainda mais ruidoso.

**Objetivo:** repetir para o catálogo de cartas o que o patch-26 fez para o `skills.yaml` — separar o conteúdo **mecânico/estrutural** (ids, stats, refs de skill) do conteúdo **exibido em pt-BR** (nomes, estilo, tags, condições escritas). Resultado:

- `src/data/cards.yaml` → ids, stats, listas de skills, classes/tipos. Língua-neutro.
- `src/data/cards.locale.pt-BR.yaml` → `name`, `style`, `tags`, e demais textos.

**Princípio:** `cards.yaml` é contrato; `cards.locale.*.yaml` é apresentação. Espelha a divisão já estabelecida em skills.

**Fora de escopo:**
- Criar locale para outras línguas. O `pt-BR` é o único alvo. Estrutura preparada para extensão, sem implementação.
- Redesenhar `cardTypes.ts` além do mínimo necessário para acomodar a separação.

---

## Inventário de campos pt-BR em `cards.yaml`

Levantamento de [src/core/data/cardTypes.ts](../../src/core/data/cardTypes.ts) e amostragem dos 80 cards:

| Campo | Tipos de carta | Natureza |
|---|---|---|
| `name` | todos (80) | rótulo |
| `style` | hero, creature, subboss | descrição |
| `tags` | item | lista de rótulos |
| `condition` | boss | texto livre |
| `victory` | boss | texto livre |
| `dice` | boss | texto livre ("3 dados vermelhos") |
| `artifactBonus` | boss | texto livre |
| `dungeonScaling` | boss | texto livre |
| `specialCreature` | room (2) | **usado como lookup key** |
| `linkedSubbossName` | subboss_room (2) | **usado como lookup key** |

Os dois últimos têm uso duplo: são pt-BR **e** servem de chave para `getCardByName(...)`. São o principal trabalho de fundo deste patch.

---

## Bloqueio prévio: `cardName` no estado

Hoje o estado de runtime guarda `cardName` (string pt-BR) em vários lugares e usa `getCardByName(name)` como lookup primário ([src/core/data/cards.ts:57](../../src/core/data/cards.ts:57), marcado `@deprecated`). Inventário rápido (`grep -rn "cardName" src/`):

- `state.heroes[].cardName`
- `state.activeEnemies[].cardName`
- ações `CHOOSE_PATH { cardName }`
- eventos `ItemDiscarded { cardName }` etc.
- `effects/resolver.ts` (vários)
- `reducer/combat.ts`, `reducer/exploration.ts`
- `projection/playerView.ts`

A separação só fecha quando esses pontos passarem a operar por `cardId`. O grosso do patch é essa migração — não a edição do YAML.

---

## Lote A — Substituir `cardName` por `cardId` no estado

**Escopo:** trocar a chave primária de identificação de carta no runtime de `name` (pt-BR) para `id` (estável, ASCII).

**Mudanças:**
- `state.heroes[].cardName` → `state.heroes[].cardId`. Análogo para `activeEnemies`.
- `action CHOOSE_PATH { cardName }` → `{ cardId }`. Atualizar criadores e UI que dispara a action.
- Todos os eventos com `cardName` no payload: renomear para `cardId`. Atualizar listeners.
- `effects/resolver.ts`: substituir `cardName: name` por `cardId: id` em criação de heroes/enemies (linhas ~406, 431, 477, 524).
- `reducer/combat.ts`, `reducer/exploration.ts`, `projection/playerView.ts`: trocar `getCardByName(name)` por `getCardById(id)`.
- `projection/playerView.ts:222-252`: ao formar `{ name: ... }` para a UI, derivar via `getCardById(id).name` (que ainda é pt-BR até o Lote C).
- Remover `getCardByName` ou deixar com `@deprecated` rígido (lançar warning).
- `room.specialCreature` e `subboss_room.linkedSubbossName` no `cardTypes.ts`: renomear para `specialCreatureId` / `linkedSubbossId`, valor passa a ser id (`creature_jailer_red_dungeon`, não `"Carcereiro da Masmorra Rubra"`). Atualizar os 4 cards afetados.
- Atualizar `reducer/exploration.ts:66,111,204` para o novo nome de campo.

**Critério de aceite:**
- `grep -rn "cardName" src/` → 0 (excluindo testes que validem ausência).
- `grep -rn "getCardByName" src/` → 0.
- Suite passa. Snapshots de jogo (se existirem) reconstruídos.
- Preview do app: jogada completa sem console error.

**Risco:** **alto** — toca runtime, ações, eventos, projeção UI. Idealmente entregue em sub-lotes:
- A1: ECS state (`heroes`, `activeEnemies`).
- A2: actions + events.
- A3: resolver + reducers.
- A4: room/subboss_room campos `*Name` → `*Id` (com edição do `cards.yaml`).

---

## Lote B — Estender schema do locale

**Escopo:** criar `cards.locale.pt-BR.yaml` e seu loader, espelhando a estrutura de `skills.locale.pt-BR.yaml`.

**Mudanças:**
- Novo `src/data/cards.locale.pt-BR.yaml`, schema:
  ```yaml
  <cardId>:
    name: ...
    style: ...        # opcional, só heroes/creatures/subbosses
    tags: [...]       # opcional, só itens
    condition: ...    # opcional, só boss
    victory: ...      # opcional, só boss
    dice: ...         # opcional, só boss
    artifactBonus: ...
    dungeonScaling: ...
  ```
- Novo `src/core/data/cardLocale.ts` análogo a `skillLocale.ts`: `getCardLocale(cardId): { name, style?, tags?, ... }`.
- Atualizar `cardTypes.ts`: marcar `name`, `style`, `tags`, etc. como **derivados** (não na fonte estrutural). Em runtime, a UI passa a chamar `getCardLocale(card.id).name`.
- `validateRaw` em `cards.ts`: ajustar para exigir só `id` + `type` (não `name`).

**Critério de aceite:**
- Schema do locale aceita as 80 entradas; faltas geram erro construtivo.
- `tsc` limpo.
- Loader cobre 100% dos campos pt-BR catalogados acima.

**Risco:** médio. Mexe em `cardTypes.ts` e `cards.ts:validateRaw`. Mas é mecânico.

---

## Lote C — Migrar conteúdo

**Escopo:** mover de fato os campos pt-BR de `cards.yaml` para `cards.locale.pt-BR.yaml`.

**Mudanças:**
- Script one-off em `scripts/extract-card-locale.mjs` que lê `cards.yaml`, separa campos pt-BR (lista do inventário), grava `cards.locale.pt-BR.yaml`, regrava `cards.yaml` sem os campos extraídos.
- Conferir amostral em 1 carta por tipo (hero, creature, subboss, room, subboss_room, item, artifact, boss).
- Atualizar consumidores de UI que ainda fazem `card.name` para `getCardLocale(card.id).name`. Ponto principal: `projection/playerView.ts` e componentes em `src/ui/`.

**Critério de aceite:**
- `cards.yaml` zero strings pt-BR. Validação: `grep -E "[áéíóúãõçÁÉÍÓÚÃÕÇ]" src/data/cards.yaml` → 0 (excluindo possíveis comentários, que devem ser em pt-BR mesmo).
- `cards.locale.pt-BR.yaml` cobre todos os ids do `cards.yaml`. Teste de integridade referencial dos dois sentidos.
- UI renderiza identicamente ao estado pré-patch (smoke manual + screenshot).
- Suite passa.

**Risco:** baixo após Lote A. Conteúdo isolado.

---

## Lote D — Travar schema mecânico

**Escopo:** depois do C, garantir que `cards.yaml` não possa receber campos pt-BR de volta.

**Mudanças:**
- Adicionar validação (Zod ou validador artesanal) em `cards.ts:validateRaw` que rejeite `name`, `style`, `tags`, `condition`, `victory`, `dice`, `artifactBonus`, `dungeonScaling` se aparecerem na fonte estrutural.
- Teste de integridade: `cards.yaml` parse passa pelo validador estrito.
- Teste cruzado: cada `cardId` em `cards.yaml` tem entrada em `cards.locale.pt-BR.yaml`, e vice-versa.

**Critério de aceite:**
- Reintroduzir `name: "x"` em qualquer entrada do `cards.yaml` quebra a validação.
- Suite passa.

**Risco:** zero.

---

## Critério de aceite global

- [ ] `cards.yaml` zero conteúdo pt-BR.
- [ ] `cards.locale.pt-BR.yaml` cobre todas as 80 cartas.
- [ ] Runtime usa `cardId` em todo lugar; `cardName` extinto do estado.
- [ ] `getCardByName` removido.
- [ ] Schema mecânico rejeita campos pt-BR.
- [ ] Suite passa; UI funciona end-to-end.

## Ordem sugerida

1. Lote A (cardId no runtime — preparatório, sem mexer no YAML ainda).
2. Lote B (schema do locale + loader).
3. Lote C (migrar conteúdo).
4. Lote D (validar e travar).

Sequencial obrigatório. Lote A é o **maior custo** e deve ser entregue em sub-lotes A1-A4 com PR/commit independentes, porque toca o runtime do jogo. B-D são pequenos depois disso.

---

## Riscos / abertos

- **Snapshots e replays:** se houver replays salvos em `cards.json`/disco com `cardName` literal, precisarão de migração. Verificar `replay/`, `src/core/replay/`.
- **Tests** que constroem state mockado com `cardName: "..."` precisarão ser atualizados em batch. Considerar varredura ampla antes do Lote A1.
- **UI deeplinks** (tooltips, modais de detalhe) que recebem `name` como prop terão que receber `id` e resolver o nome via locale. Mapear em `src/ui/components/`.
- **Tags**: hoje são lista de strings em pt-BR. Decidir se viram lista de **ids de tag** (`["equipable", "weapon"]`) com locale separado para o rótulo, ou se ficam só em `cards.locale.pt-BR.yaml` como lista de strings exibíveis. Recomendação: ids ASCII no `cards.yaml` + locale dos rótulos, para permitir filtros estáveis na UI. Detalhar antes de iniciar o Lote C.
- **Boss textos longos** (`condition`, `victory`, `dungeonScaling`, `artifactBonus`): pode ser interessante quebrar em chaves estruturais futuras (ex.: `condition` virar um descritor mecânico). Fora deste patch — manter como string no locale por ora.
