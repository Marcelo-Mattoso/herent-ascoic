# Patch 29 — Lotes B, C e D do patch-28 + limpezas pendentes

**Pré-requisito:** patch-28 Lote A concluído (runtime usa `cardId` em todo lugar).

**Objetivo:** completar a separação mecânico/locale para o catálogo de cartas.
Após este patch: `cards.yaml` é contrato puro (sem strings pt-BR); `cards.locale.pt-BR.yaml` concentra toda apresentação; schema mecânico rejeita contaminação.

---

## Limpezas pendentes do Lote A (não bloqueantes, mas pré-condição limpa)

Itens descobertos depois do commit do Lote A. Pequenos e rápidos — podem entrar em um sub-lote antes do B ou junto com ele.

| Arquivo | Problema |
|---|---|
| `src/data/README.md` | Tabela ainda menciona `linkedSubbossName` — atualizar para `linkedSubbossId` |
| `src/core/ecs/sync.ts:29` | Variável chamada `itemName` agora guarda ID; renomear para `itemId` (cosmético, não quebra nada) |
| `src/core/ecs/types.ts:73` | Campo `item_equipped.itemName` guarda ID desde o Lote A — renomear para `itemId` |
| `src/core/events/types.ts:185` | `ItemEffectAppliedTo.itemName` — idem, renomear para `itemId` |
| `src/core/reducer/combat.ts:719` | Emite `ItemEffectAppliedTo` com `itemName:` — renomear payload |
| `src/core/state/combatState.ts:55` | Comentário menciona "Escudo Rachado" (nome) — atualizar para `item_cracked_shield` |
| `src/core/reducer/combat.ts:4` | Comentário de cabeçalho menciona nomes pt-BR — atualizar |
| `src/core/skills/dsl/__tests__/lote2.test.ts:101` | Falha pré-existente: `expect(...).toBe(1)` passa `e1` inexistente no world; adicionar enemy ao estado do teste |

---

## Lote B — Schema do locale + loader

**Escopo:** criar infraestrutura do arquivo de locale, análogo ao que existe em `skills.locale.pt-BR.yaml` + `skillLocale.ts`.

**Mudanças:**

1. Novo `src/data/cards.locale.pt-BR.yaml`, schema:
   ```yaml
   <cardId>:
     name: ...
     style: ...        # opcional — hero, creature, subboss
     tags: [...]       # opcional — item
     condition: ...    # opcional — boss
     victory: ...      # opcional — boss
     dice: ...         # opcional — boss
     artifactBonus: ...
     dungeonScaling: ...
   ```

2. Novo `src/core/data/cardLocale.ts`:
   ```ts
   export interface CardLocale {
     name: string;
     style?: string;
     tags?: readonly string[];
     condition?: string;
     victory?: string;
     dice?: string;
     artifactBonus?: string;
     dungeonScaling?: string;
   }
   export function getCardLocale(cardId: string): CardLocale | undefined
   export function getCardName(cardId: string): string  // shortcut: locale.name ?? cardId
   ```

3. `cardTypes.ts`: marcar `name`, `style`, `tags`, `condition`, `victory`, `dice`, `artifactBonus`, `dungeonScaling` como **opcionais** (prefixo `readonly?` ou remoção do campo — decidir na implementação). Campos obrigatórios ficam só `id` e `type`.

4. `cards.ts:validateRaw`: exigir apenas `id` e `type` (remover verificação de `name`).

**Critério de aceite:**
- `tsc` limpo.
- `getCardLocale("hero_crimson_barbarian").name` retorna `"Bárbaro Rubro"` (testado em unit).
- `getCardName("hero_crimson_barbarian")` retorna `"Bárbaro Rubro"`.
- O arquivo locale tem todas as 80 entradas (validado por teste de integridade).

**Risco:** baixo. Infraestrutura nova não toca fluxo de jogo.

---

## Lote C — Migrar conteúdo

**Escopo:** mover strings pt-BR de `cards.yaml` para `cards.locale.pt-BR.yaml`; atualizar consumidores que ainda lêem `card.name` diretamente.

**Mudanças:**

1. Script one-off `scripts/extract-card-locale.mjs`:
   - Lê `src/data/cards.yaml`.
   - Extrai campos pt-BR por tipo de carta (inventário do patch-28).
   - Grava `src/data/cards.locale.pt-BR.yaml`.
   - Regrava `src/data/cards.yaml` sem esses campos.

2. Atualizar todos os pontos que ainda fazem `card.name` (ou `card?.name`) para chamar `getCardName(card.id)`:
   - `src/core/reducer/exploration.ts` — mensagens de log (`card.name`, `subbossCard.name`)
   - `src/core/reducer/setup.ts` — log de início de partida
   - `src/core/reducer/reward.ts` — log de artefato comprado
   - `src/core/reducer/progression.ts` — log de subchefe injetado
   - `src/ui/components/Setup.tsx` — `h.name` nos botões de seleção
   - `src/data/scripts/skill_focus_deflection.ts` — `getCardById(id)?.name`
   - Qualquer outro consumidor identificado com `grep -rn "\.name\b" src/core src/ui`

3. Verificação amostral: 1 carta por tipo no locale vs yaml.

**Critério de aceite:**
- `grep -E "[áéíóúãõçÁÉÍÓÚÃÕÇ]" src/data/cards.yaml` → 0 (exceto comentários).
- `cards.locale.pt-BR.yaml` cobre todos os 80 `cardId`s presentes em `cards.yaml`.
- `grep -rn "card\.name\b\|card?\?\.name\b" src/core src/ui` → 0 (exceto no loader `cardLocale.ts` e `cards.ts`).
- Suite passa; UI exibe nomes corretos (smoke manual).

**Risco:** médio. O script de extração é destrutivo sobre o YAML — fazer backup / rodar em branch isolada. `Setup.tsx` precisa de atenção: atualmente usa `h.name` para exibir heróis; após C, usa `getCardName(h.id)` (h ainda tem `.name` na interface TypeScript até o schema ser travado).

**Aberto — tags:** hoje `tags` em items são listas de strings pt-BR. Decidir se viram `tagIds` ASCII (ex: `["equipable", "weapon"]`) ou ficam como exibíveis no locale. Recomendação: exibíveis no locale por ora; migração para IDs é escopo futuro.

---

## Lote D — Travar schema mecânico

**Escopo:** impedir que campos pt-BR retornem para `cards.yaml`.

**Mudanças:**

1. `cards.ts:validateRaw` (ou função separada `validateStrict`): rejeitar qualquer entrada que contenha `name`, `style`, `tags`, `condition`, `victory`, `dice`, `artifactBonus`, `dungeonScaling` na fonte estrutural.

2. Atualizar `cardTypes.ts`: remover os campos opcionais que restaram (torná-los inexistentes no tipo TypeScript). `AnyCard` passa a ser 100% mecânico.

3. Testes:
   - Reintroduzir `name: "x"` numa entrada de `cards.yaml` → teste de parseamento quebra.
   - Teste bidirecional: cada `cardId` em `cards.yaml` tem entrada em `cards.locale.pt-BR.yaml` e vice-versa.

**Critério de aceite:**
- `tsc` limpo com os campos removidos dos tipos.
- Teste de validação estrita passa.
- Teste de integridade cruzada yaml↔locale passa.
- Suite completa passa.

**Risco:** zero após C.

---

## Ordem de execução

```
Limpezas Lote A  →  Lote B  →  Lote C  →  Lote D
```

B e "limpezas Lote A" podem rodar juntos. C é o lote mais arriscado (edição do YAML) — isolar em branch/commit específico. D é trivial após C.

---

## Riscos globais

- **`cards.yaml` após C**: a reescrita pelo script pode perder formatação (comentários, order de campos). Revisar diff antes de commitar.
- **Snapshots/replays salvos em disco**: se existirem saves com `cardName` literal (string pt-BR), precisarão de migração — verificar `src/core/replay/` e `src/core/ports/persistence.ts`.
- **`Setup.tsx`**: exibição do boss (`boss.condition`) ainda lê `card.condition` — após C este campo some do card; garantir que `getCardLocale(boss.id).condition` está sendo chamado.
- **Testes com fake IDs em decks** (`"Adaga"`, `"Amuleto Antigo"` etc.): após Lote D, se o loader falhar ao não encontrar locale para esses IDs, os testes quebrarão. Avaliar se esses decks devem usar IDs reais.
