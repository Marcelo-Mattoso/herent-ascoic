# src/data — Catálogos do jogo

Este diretório contém os dados estáticos do jogo: cartas (`cards.json`), habilidades (`skills.json`) e scripts de comportamento (`scripts/`).

---

## Arquitetura em duas camadas

| Arquivo | Responsabilidade |
|---------|-----------------|
| `skills.json` | **Comportamento e display.** Define o que cada habilidade faz (`effect` DSL ou `script`), o template de texto, o trigger, o alvo, e a categoria. |
| `cards.json` | **Composição.** Define quais habilidades cada carta usa, com quais parâmetros, e sob quais condições (ex.: requer Despertar 4). |

Regra: **nenhum dado de comportamento ou template fica na carta.** A carta só referencia skills por `skillId`.

---

## `cards.json`

Array de objetos. Cada objeto é uma carta discriminada pelo campo `type`.

### Tipos disponíveis

| `type` | Campos extras obrigatórios |
|--------|---------------------------|
| `hero` | `diceByColor`, `life[5]`, `hitBonus[5]`, `damage`, `style` |
| `creature` | `diceByColor`, `life[5]`, `hitBonus[5]`, `damage`, `xp`, `reward`, `rewardType` |
| `subboss` | mesmo que `creature` |
| `room` | `exits`, `enemiesByPlayers[4]`, `reward`, `rewardType` |
| `subboss_room` | `exits`, `reward`, `rewardType`, `linkedSubbossName` |
| `item` | `itemClass`, `tags[]` |
| `artifact` | `countsAs: "artifact"` |
| `boss` | `dice`, `lifeBase`, `hitBonusBase`, `damage`, `condition`, `artifactBonus`, `dungeonScaling`, `victory`, `abilities[]` |

### Campo `skills`

Todo tipo (exceto `boss`) tem `skills: SkillRef[]`. O boss tem `skills` dentro de cada `ability`.

```json
"skills": [
  { "skillId": "skill_last_light_healing", "params": { "value": 3 } },
  { "skillId": "power_greater_last_light_miracle" }
]
```

`SkillRef` aceita três campos:

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `skillId` | `string` — **obrigatório** | Id canônico da skill em `skills.json`. |
| `params` | `{ value: number\|string }` — opcional | Override do valor padrão da skill. Omita se a skill não usa variável ou se o valor é o default. |
| `requiresAwakening` | `true` — opcional | Só dispara quando `despertar === 4`. Substitui o antigo slot `purpleEffect`. |

### Convenções de `params.value`

| Formato | Uso |
|---------|-----|
| `3` | Número simples — ex.: "cure 3 de vida" |
| `"6/1"` | Par de valores usados pela skill (ex.: "até 6, mínimo 1") |
| `"5/5"` | Pares iguais — dois valores independentes |
| `"1/3/2/2"` | Quatro valores — skill com múltiplos estágios |
| `"full/1"` | Semântica especial — "total ou mínimo 1" |

O dispatch normaliza slash-pairs extraindo o primeiro número para `$value`. A lógica completa fica no script/DSL da skill.

### Exemplos de cada tipo

**Herói:**
```json
{
  "id": "hero_crimson_barbarian",
  "type": "hero",
  "name": "Bárbaro Rubro",
  "diceByColor": [1, 1, 2, 2, 3],
  "life": [12, 14, 16, 18, 20],
  "hitBonus": [5, 7, 10, 14, 18],
  "damage": 4,
  "style": "dano, risco, Deserto Rubro, sacrifício.",
  "skills": [
    { "skillId": "skill_crimson_fury", "params": { "value": 2 } },
    { "skillId": "power_unstoppable_fury" }
  ]
}
```

**Criatura (com efeito roxo):**
```json
{
  "id": "creature_dark_cave_goblin",
  "type": "creature",
  "name": "Goblin das Cavernas Escuras",
  "diceByColor": [1, 1, 2, 2, 3],
  "life": [1, 2, 3, 5, 7],
  "hitBonus": [2, 3, 5, 7, 10],
  "damage": 2,
  "xp": 1,
  "reward": 1,
  "rewardType": "item",
  "skills": [
    { "skillId": "skill_cowardly_flee" },
    { "skillId": "purple_dark_tribute", "params": { "value": 1 }, "requiresAwakening": true }
  ]
}
```

**Item:**
```json
{
  "id": "item_lesser_vigor_potion",
  "type": "item",
  "name": "Poção de Vigor Menor",
  "itemClass": "consumable",
  "tags": ["poção", "cura"],
  "skills": [
    { "skillId": "skill_last_light_healing", "params": { "value": 2 } }
  ]
}
```

**Boss (abilities com skills):**
```json
{
  "id": "boss_azhakar",
  "type": "boss",
  ...
  "abilities": [
    {
      "name": "Trono de Cinzas Vivas",
      "skills": [
        { "skillId": "boss_skill_living_ash_throne", "params": { "value": 1 } }
      ]
    }
  ]
}
```

### IDs canônicos

| Tipo de carta | Prefixo do `id` | Prefixo do `skillId` |
|--------------|-----------------|----------------------|
| Herói | `hero_` | `skill_` (habilidade), `power_` (poder) |
| Criatura | `creature_` | `skill_` (efeito), `purple_` (efeito roxo) |
| Subchefe | `subboss_` | `skill_` ou `purple_` |
| Sala | `room_` | `dungeon_skill_` |
| Sala de subchefe | `subboss_room_` | `dungeon_skill_` |
| Item | `item_` | `item_skill_` (exclusivo) ou `skill_` (compartilhado) |
| Artefato | `artifact_` | `item_skill_` ou `power_` (compartilhado com herói) |
| Chefe | `boss_` | `boss_skill_` |

---

## `skills.json`

Catálogo de todas as habilidades do jogo. Cada entrada em `abilities[]` define uma skill.

### Campos de uma skill

```json
{
  "id": "skill_last_light_healing",
  "name": "Cura da Última Luz",
  "category": "habilidade",
  "usesVariable": true,
  "defaultValue": null,
  "trigger": "on_use",
  "target": "hero_or_ally_creature",
  "textTemplate": "cure {value} de vida de um herói ou criatura aliada.",
  "labelTemplate": "Cura da Última Luz ({value}): cure {value} de vida de um herói ou criatura aliada.",
  "effect": [
    { "kind": "apply_heal", "to": "$target", "amount": "$value" }
  ]
}
```

| Campo | Obrigatório | Descrição |
|-------|-------------|-----------|
| `id` | sim | Identificador único. Convenção de prefixo acima. |
| `name` | sim | Nome em PT-BR exibido na UI. |
| `category` | sim | Define em qual slot de UI a skill aparece (ver tabela abaixo). |
| `usesVariable` | sim | `true` se o template usa `{value}` e cada carta pode ter um valor diferente. |
| `defaultValue` | sim | Valor padrão se a carta não declarar `params`. `null` = sem default. |
| `trigger` | sim | Quando a skill dispara (ver seção Triggers). |
| `target` | sim | Alvo padrão da skill. |
| `textTemplate` | sim | Texto descritivo com `{value}` como placeholder. |
| `labelTemplate` | sim | Label compacto exibido na UI. Formato: `"Nome ({value}): texto."` |
| `effect` | um dos dois | Array de nós DSL que descrevem o efeito (preferido para lógica simples). |
| `script` | um dos dois | Nome do arquivo em `scripts/` para lógica complexa (sem `.ts`). |
| `params` | opcional | Valores fixos da skill injetados no contexto de execução junto com `$value`. |
| `notes` | opcional | Notas internas — não exibidas na UI. |

**`effect` XOR `script`:** toda skill deve ter exatamente um dos dois.

### Categorias

| `category` | Slot de UI | Tipo de carta |
|------------|-----------|---------------|
| `habilidade` | Habilidade do herói | Herói |
| `poder_heroi` | Poder do herói | Herói |
| `efeito_roxo_monstro` | Efeito roxo (Despertar 4) | Criatura, Subchefe |
| `habilidade_item` | Efeito do item/artefato | Item, Artefato |
| `habilidade_dungeon` | Efeito da sala | Sala |
| `habilidade_chefe` | Habilidade do chefe | Boss |

A categoria determina onde a skill é exibida. Habilidades e poderes de herói compartilham o mesmo tipo de carta mas categorias distintas.

### Triggers

O campo `trigger` aceita a string de nome do evento. Os principais:

| Trigger | Quando dispara |
|---------|---------------|
| `on_use` | O jogador ativa manualmente. |
| `before_attack` | Antes de rolar dados de ataque. |
| `after_roll` | Depois de rolar dados. |
| `on_damage_taken` | Quando uma entidade vai sofrer dano. |
| `on_destroyed` | Quando a entidade é destruída. |
| `while_in_play` | Passivo — checado ao entrar em combate. |
| `while_equipped` | Passivo de item equipado. |
| `on_room_reveal` | Quando a sala é revelada. |
| `on_enter_room` | Quando o grupo entra na sala. |
| `once_per_game` | Ativo, usável uma vez por jogo. |
| `once_per_room` | Ativo, usável uma vez por sala. |
| `once_per_combat` | Ativo, usável uma vez por combate. |
| `once_per_round` | Ativo, usável uma vez por rodada. |

Guards `once_per_*` são detectados automaticamente pelo dispatcher.

### DSL de efeitos (`effect`)

Array de nós `EffectNode`. Os mais usados:

```jsonc
// Causar dano
{ "kind": "apply_damage", "to": "$target", "amount": "$value" }

// Curar
{ "kind": "apply_heal", "to": "$target", "amount": "$value" }

// Cura total
{ "kind": "apply_full_heal", "to": "$target" }

// Adicionar modificador temporário
{
  "kind": "add_modifier",
  "to": "$source",
  "stat": "damage_reduction",
  "operation": "add",
  "value": "$value",
  "duration": { "kind": "once" }
}

// Condicional
{
  "kind": "if",
  "when": { "kind": "compare", "op": "gte", "left": "$dungeon_level", "right": 3 },
  "then": [ { "kind": "apply_damage", "to": "$target", "amount": 2 } ]
}

// Escolha do jogador
{
  "kind": "choose_one",
  "options": [
    { "label": "Curar", "effect": [ { "kind": "apply_heal", "to": "$source", "amount": 3 } ] },
    { "label": "Atacar", "effect": [ { "kind": "apply_damage", "to": "$target", "amount": 3 } ] }
  ]
}

// Descartar do deck
{ "kind": "discard_from", "pile": "dungeon", "count": 1 }
```

**Referências simbólicas** (prefixo `$`):

| Símbolo | Resolve para |
|---------|-------------|
| `$value` | `params.value` da carta (número) |
| `$source` | ID da entidade que disparou |
| `$target` | ID do alvo primário |
| `$dungeon_level` | Nível atual do Despertar (0–4) |

**Durações** para `add_modifier`:

| `kind` | Duração |
|--------|---------|
| `once` | Consome-se no primeiro hit |
| `until_end_of_round` | Até fim da rodada |
| `until_end_of_combat` | Até fim do combate |
| `while_in_play` | Enquanto a entidade estiver em jogo |
| `passive` | Permanente (item equipado) |

### Scripts (`scripts/`)

Use `script` em vez de `effect` quando a lógica precisar de condicionais imperativas, loops, ou acesso ao estado que a DSL não cobre.

Cada script é um arquivo `.ts` em `src/data/scripts/<skillId>.ts` com um export `run`:

```ts
import type { ScriptHandler } from "@/core/scripts/types";

export const run: ScriptHandler = (ctx) => {
  const value = (ctx.params.value as number) ?? 0;
  // ctx.state      — GameState atual (imutável)
  // ctx.sourceId   — ID do herói/inimigo que disparou
  // ctx.targetId   — ID do alvo primário
  // ctx.params     — { value, ...paramsFixos }
  // ctx.action.*   — métodos que retornam novo GameState
  // ctx.withState  — encadeia estado para múltiplos efeitos

  let state = ctx.action.pushEffect({
    kind: "apply_damage",
    to: ctx.targetId ?? "",
    amount: value,
  });
  state = ctx.withState(state).action.log(`Dano: ${value}`);
  return state;
};
```

O nome do arquivo deve ser idêntico ao campo `"script"` na skill.

---

## Como adicionar uma nova skill

1. **Escolha um id** seguindo a convenção de prefixo da tabela acima.
2. **Adicione a entrada em `skills.json`** com todos os campos obrigatórios.
3. **Implemente o comportamento:**
   - Lógica simples → campo `effect` com nós DSL.
   - Lógica complexa → campo `script` com o nome do arquivo; crie `src/data/scripts/<id>.ts`.
4. **Nenhuma alteração em `cards.json`** neste passo — a skill existe mas ainda não é usada por ninguém.

## Como adicionar uma nova carta

1. **Crie a entrada em `cards.json`** com `id`, `type`, `name`, e os campos do tipo correspondente.
2. **Declare `skills[]`** com os `SkillRef`s das habilidades que a carta usa.
   - Se a skill já existe e o valor é o mesmo que `defaultValue`, omita `params`.
   - Se o valor for diferente, declare `params: { value: X }`.
   - Para efeito roxo (Despertar 4), adicione `"requiresAwakening": true`.
3. **Se a skill ainda não existe**, crie-a primeiro (passo acima).

## Como compartilhar uma skill entre duas cartas

Skills são reutilizáveis. Se duas cartas fazem a mesma coisa com valores diferentes:

```json
// Item A — cura 2
{ "skillId": "skill_last_light_healing", "params": { "value": 2 } }

// Herói B — cura 3
{ "skillId": "skill_last_light_healing", "params": { "value": 3 } }
```

Ambas referenciam `skill_last_light_healing`. O behavior (cura) está na skill; o valor específico está na carta.

## Validações automáticas

O loader (`src/core/skills/lookup.ts`) valida na inicialização:

- Todo `skillId` em `cards.json` **deve existir** em `skills.json`. Erro lançado no boot se falhar.

O teste `src/core/data/skills.test.ts` verifica:

- Todos os `skillId`s em `cards.json` existem em `skills.json`.
- Toda skill referenciada aparece no índice reverso (`skillUsedBy`).

O schema guard (`src/core/skills/dsl/__tests__/schema-guard.test.ts`) valida:

- Cada skill com `effect` ou `script` passa no `SkillDefinitionV2Schema`.
- Toda skill tem exatamente um de `effect` ou `script`.
