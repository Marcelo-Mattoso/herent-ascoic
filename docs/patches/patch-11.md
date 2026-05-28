# Patch 11 — IDs canônicos no data layer

Brief de implementação auto-contido. Não depende de conversa prévia.

**Pré-requisito:** patch-10 não bloqueia este patch, mas se for aplicado depois é importante saber que scripts de carta (`src/data/scripts/*.ts`) também passam a referenciar cartas/skills por `id`, não por nome.

---

## Objetivo

Introduzir um campo `id` canônico em **toda** entrada de `src/data/cards.json` e `src/data/skills.json`. **Todos os vínculos entre dados** (carta ↔ skill, skill ↔ cartas que a usam, qualquer referência cruzada futura) passam a ser feitos por `id` — nunca mais por `name` em português.

O `name` continua existindo como **rótulo de display** (PT-BR). Identificador estável e referenciador é o `id`.

---

## Convenção do `id`

Formato: **`<prefixo_tipo>_<nome_em_ingles_snake_case>`**

- Tudo minúsculo, ASCII, `[a-z0-9_]+`.
- Inglês (não PT-BR). Tradução semântica, não transliteração.
- `snake_case` com `_` como separador. Sem hífens.
- Prefixo do tipo é **mandatório** — facilita grep, evita colisão entre namespaces.

### Prefixos por tipo

**Cartas (`src/data/cards.json`)** — usa o campo `type` da própria carta:

| Tipo da carta       | Prefixo       | Exemplo                          |
| ------------------- | ------------- | -------------------------------- |
| `hero`              | `hero_`       | `hero_eternal_rest_cleric`       |
| `creature`          | `creature_`   | `creature_broken_gates_watcher`  |
| `item`              | `item_`       | `item_fury_potion`               |
| `room`              | `room_`       | `room_forsaken_chapel`           |
| `boss`              | `boss_`       | `boss_azhakar`                   |
| `subboss`           | `subboss_`    | `subboss_iron_warden`            |
| `subbossRoom`       | `subboss_room_` | `subboss_room_iron_warden_hall` |
| `artifact`          | `artifact_`   | `artifact_emberforge_shard`      |

Regra: o prefixo é o `type` literal da carta em snake_case. Se um `type` novo entrar no catálogo, o prefixo segue a mesma regra mecânica.

**Skills (`src/data/skills.json`)** — usa o campo `category` traduzido:

| Categoria do JSON         | Prefixo        | Exemplo                       |
| ------------------------- | -------------- | ----------------------------- |
| `habilidade`              | `skill_`       | `skill_red_fury`              |
| `poder_heroi`             | `power_`       | `power_greater_miracle`       |
| `efeito_roxo_monstro`     | `purple_`      | `purple_smoldering_breath`    |
| `habilidade_item`         | `item_skill_`  | `item_skill_healing_potion`   |
| `habilidade_dungeon`      | `dungeon_skill_` | `dungeon_skill_cave_in`     |
| `habilidade_chefe`        | `boss_skill_`  | `boss_skill_world_breaker`    |

### Exemplos de tradução

| PT-BR                            | snake_case en               | id final                          |
| -------------------------------- | --------------------------- | --------------------------------- |
| Clérigo do Descanso Eterno       | `eternal_rest_cleric`       | `hero_eternal_rest_cleric`        |
| Bárbaro Rubro                    | `red_barbarian`             | `hero_red_barbarian`              |
| Vigia das Portas Quebradas       | `broken_gates_watcher`      | `creature_broken_gates_watcher`   |
| Fúria Rubra                      | `red_fury`                  | `skill_red_fury`                  |
| Cura da Última Luz               | `last_light_healing`        | `skill_last_light_healing`        |
| Milagre Maior da Última Luz      | `greater_last_light_miracle`| `power_greater_last_light_miracle`|

Tradução é **prerrogativa do designer**. O patch entrega uma proposta de tradução para revisão, não impõe.

---

## Inventário atual

Antes de implementar, ter em mente o tamanho do trabalho:

- `src/data/cards.json` — ~193 entradas, **nenhuma** com `id` hoje.
- `src/data/skills.json` — 82 entradas, todas já com um `id` em formato antigo (kebab-case PT-BR, ex: `habilidade-furia-rubra`). **Esses ids serão reescritos**, não preservados.
- Cross-refs hoje:
  - Cartas inline-am dados de skill (campos `skill`, `power`, `effect`) com `name` PT-BR — sem ponteiro de id.
  - Skills referenciam cartas via `usedBy[].card` (string PT-BR) + `usedBy[].cardType`.

Lookups no core hoje rodam por nome — ver `src/core/data/cards.ts:48` (`getCardByName`). Esse é o ponto central a virar.

---

## Plano em fases

Cada fase é um commit atômico. Ordem importa: não pular.

### Fase 0 — Decidir traduções e revisar

1. Gerar um arquivo `tools/id-migration/proposed-ids.json` listando, para cada entrada de `cards.json` e `skills.json`:
   - `name` PT-BR original
   - `id` proposto (seguindo a convenção acima)
   - `type` / `category` da entrada
2. Revisar com o designer. Traduções ambíguas são resolvidas aqui, não depois.
3. Quando aprovado, esse JSON vira a **fonte de verdade** das migrações das próximas fases.

**Aceite:** `tools/id-migration/proposed-ids.json` revisado e aprovado. Sem duplicatas (id único globalmente, não só dentro do tipo).

---

### Fase 1 — Adicionar `id` em `cards.json`

1. Escrever script `tools/id-migration/apply-card-ids.ts` que:
   - Lê `proposed-ids.json` e `src/data/cards.json`.
   - Para cada carta, casa por `name` e injeta o campo `id` **como primeira chave** do objeto (antes de `type`).
   - Reescreve `src/data/cards.json` preservando a ordem das cartas.
2. Rodar via `npm run script tools/id-migration/apply-card-ids.ts`.
3. Commitar o JSON atualizado.

**Não tocar em mais nada nesta fase.** Cartas ganham `id`, mas o code base continua usando `name`. É um campo novo dormente.

**Aceite:** `npm test` passa. Todas as 193 cartas têm `id` único, todos seguem a regex `^(hero|creature|item|room|boss|subboss|subboss_room|artifact)_[a-z0-9_]+$`.

---

### Fase 2 — Reescrever `id` em `skills.json`

1. Escrever script `tools/id-migration/apply-skill-ids.ts` que:
   - Lê `proposed-ids.json` e `src/data/skills.json`.
   - Para cada habilidade em `abilities[]`, **substitui** o `id` antigo pelo novo (formato canônico).
   - Mantém todos os outros campos intactos.
2. Rodar e commitar.

**Aceite:** as 82 entradas têm `id` no formato canônico. Nada mais tocado.

---

### Fase 3 — Migrar `usedBy[].card` para id

A estrutura `usedBy[]` em `skills.json` hoje aponta para a carta pelo `name` PT-BR. Trocar.

1. Renomear o campo `card` → `cardId` em todas as entradas de `usedBy[]`.
2. Substituir o valor (nome PT-BR) pelo `id` correspondente, usando o `proposed-ids.json` como tabela de conversão.
3. Manter `cardType` por enquanto (será removido em fase futura — redundante uma vez que id carrega o tipo no prefixo, mas remoção fica fora do escopo deste patch).

Script: `tools/id-migration/migrate-usedby.ts`.

**Aceite:** nenhuma string PT-BR de nome de carta sobra em `usedBy[]`. Grep por `"card":` em `skills.json` retorna zero.

---

### Fase 4 — Adicionar `skillId` nas referências inline em `cards.json`

Hoje cartas inline-am skills assim:

```json
"skill": {
  "name": "Cura da Última Luz",
  "type": "heal",
  "value": 3,
  "trigger": "on_use",
  ...
}
```

Adicionar `skillId` como **primeira chave** do objeto inline:

```json
"skill": {
  "skillId": "skill_last_light_healing",
  "name": "Cura da Última Luz",
  "type": "heal",
  "value": 3,
  ...
}
```

Aplicar para os campos `skill`, `power`, `effect` de toda carta que os tenha. Lookup é feito casando o `name` PT-BR inline contra o catálogo de `skills.json` (que nesse ponto já tem `id` correto).

Script: `tools/id-migration/inject-skill-ids-in-cards.ts`.

**Decisão escopo:** *não* extrair o conteúdo da skill para fora do inline neste patch. Deixar dado duplicado por enquanto. Desduplicação (cartas só guardando `skillId`, dados resolvidos do catálogo) é refactor separado — escopo grande demais para misturar com a migração de ids.

**Aceite:** todo campo inline `skill`/`power`/`effect` em qualquer carta tem `skillId` apontando para uma entrada existente em `skills.json`. Validação: rodar script que verifica integridade referencial.

---

### Fase 5 — Loader e API de lookup no core

Atualizar `src/core/data/cards.ts`:

1. Estender `validateRaw` para exigir o campo `id` (string não vazia, casa com a regex de convenção).
2. Adicionar `getCardById(id: string): AnyCard | undefined` — passa a ser o lookup canônico.
3. **Manter** `getCardByName` por compat temporária, marcado `@deprecated`. Não usar em código novo.
4. Construir índice `Map<string, AnyCard>` por id na inicialização — lookup O(1) em vez de scan O(n) do find atual.

Atualizar `src/core/data/skills.ts` (se existir loader equivalente; criar se não existir) para expor `getSkillById(id: string)` operando sobre `skills.json`.

Atualizar `src/core/data/cardTypes.ts` para incluir `id: string` em `AnyCard` (e nas variantes específicas).

**Aceite:** `npm run build` passa. Nenhum chamador novo de `getCardByName` foi introduzido. `getCardById("hero_red_barbarian")` retorna a carta esperada.

---

### Fase 6 — Entidades carregam `cardId`

Hoje entidades em `GameState` carregam `cardName: string`. Adicionar `cardId: string` ao lado, populado no setup a partir do `id` da carta de origem.

1. Atualizar fábricas em `src/core/state/gameState.ts` e `src/core/reducer/setup.ts` para popular `cardId` ao criar herói/inimigo/item.
2. **Manter** `cardName` para display — é o rótulo PT-BR exibido no eventLog, modais, UI. Não remover.
3. Em qualquer lugar do core que faça `cardName === "..."` (PT-BR literal), trocar por comparação contra `cardId === "..."`. Grep por strings PT-BR literais em `src/core/` deve retornar zero após esta fase.

**Aceite:** nenhuma comparação contra nome PT-BR sobra em `src/core/`. Eventos, replay e projeções continuam funcionando — a UI ainda lê `cardName` para display.

---

### Fase 7 — Lookup de skills inline por id

Onde o resolver/dispatch hoje encontra a skill via `name` inline (`useSkill`, `dispatch`, `lookup` em `src/core/skills/`), trocar para usar `skillId` (que existe a partir da Fase 4).

**Aceite:** `npm test` passa. Dispatch de skills funciona end-to-end por id, não por nome.

---

### Fase 8 — Limpeza

1. Auditar `src/core/` por usos remanescentes de `getCardByName` e `name`-based lookup. Migrar para `id`.
2. Remover `getCardByName` quando não houver mais chamadores (ou mantê-lo apenas para UI, se ainda necessário em algum modal de busca por nome).
3. Atualizar testes que usem nome PT-BR como chave para usarem `id`.

**Aceite:** `git grep "getCardByName" src/core/` retorna zero (ou apenas o próprio export marcado @deprecated). `npm test`, `npm run build`, `npm run lint` passam.

---

## Restrições e regras

1. **Nome (`name`) nunca é identificador.** Após a Fase 6, comparar contra `name` em código de `src/core/` é bug.
2. **`id` é imutável após merge.** Mudar um id depois quebra saves, replays, scripts. Tratamento como migração de schema.
3. **Sem ids ad-hoc.** Todo id novo passa pela convenção e entra via update controlado de `proposed-ids.json` + reaplicação dos scripts.
4. **Não desduplicar skill inline → referência neste patch.** Está fora de escopo. Patch separado.
5. **Não remover `cardType` de `usedBy[]` neste patch.** Redundante, mas remoção é refactor independente.
6. **Scripts de migração ficam em `tools/id-migration/`.** Não em `src/data/scripts/` (que após patch-10 é exclusivo de scripts de carta).
7. **Determinismo de saves:** verificar se `localStorage` carrega saves antigos sem `cardId`. Se sim, factory deve preencher `cardId` derivando de `cardName` durante a leitura — *uma vez*. Migração transparente.

---

## Definição de pronto

- [ ] Fase 0: `proposed-ids.json` aprovado, sem duplicatas.
- [ ] Fase 1: todas as 193 cartas têm `id` canônico.
- [ ] Fase 2: todas as 82 skills têm `id` no formato novo.
- [ ] Fase 3: `usedBy[].cardId` substituiu `usedBy[].card`.
- [ ] Fase 4: todo `skill`/`power`/`effect` inline em cartas tem `skillId`.
- [ ] Fase 5: `getCardById` / `getSkillById` operacionais, índice O(1).
- [ ] Fase 6: entidades carregam `cardId`, comparações em `src/core/` por id.
- [ ] Fase 7: dispatch de skills por id.
- [ ] Fase 8: `getCardByName` removido ou isolado na UI.
- [ ] `npm test`, `npm run build`, `npm run lint` passam.
- [ ] Save antigo (sem `cardId`) carrega sem quebrar — migração transparente no loader.
- [ ] Grep validador: `git grep -P '"name":\s*"[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]' src/core/` retorna zero.

---

## Convenção de commit

Conforme `CLAUDE.md`: mensagens em PT-BR, **sem** linha `Co-Authored-By: Claude`. Um commit por fase. Sugestão:

- `chore(data): proposta de ids canônicos (proposed-ids.json)`
- `refactor(data): adicionar id em todas as cartas de cards.json`
- `refactor(data): reescrever id de skills.json no formato canônico`
- `refactor(data): usedBy[].card -> usedBy[].cardId`
- `refactor(data): adicionar skillId em referências inline de cartas`
- `feat(core): lookup de cartas e skills por id (O(1))`
- `refactor(core): entidades carregam cardId, comparações por id`
- `refactor(skills): dispatch via skillId`
- `chore(core): remover lookup por nome remanescente`
