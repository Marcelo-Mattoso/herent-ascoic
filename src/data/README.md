# src/data — Catálogos do jogo

Este diretório contém os dados estáticos do jogo: cartas (`cards.yaml`), habilidades (`skills.yaml` + locale), scripts de comportamento (`scripts/`), regras de eventos (`event_rules.json`) e balanceamento (`balance.json`).

---

## Arquitetura em três camadas

| Arquivo | Responsabilidade |
|---------|-----------------|
| `skills.yaml` | **Comportamento (DSL v2).** Define o que cada habilidade faz — `effect` DSL ou `script`, trigger, operate_type, nature, targeting. Sem textos. |
| `skills.locale.pt-BR.yaml` | **Display.** Nomes, labels e textos de cada skill em PT-BR. Separado para facilitar tradução. |
| `cards.yaml` | **Composição.** Define quais habilidades cada carta usa, com quais parâmetros, e sob quais condições (ex.: requer Despertar 4). |

Regra: **nenhum dado de comportamento ou template fica na carta.** A carta só referencia skills por `skillId`.

---

## `cards.yaml`

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
| `boss` | `dice`, `lifeBase`, `hitBonusBase`, `damage`, `condition`, `artifactBonus`, `dungeonScaling`, `victory` |

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
| `skillId` | `string` — **obrigatório** | Id canônico da skill em `skills.yaml`. |
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

**Boss:**
```json
{
  "id": "boss_azhakar",
  "type": "boss",
  ...
  "skills": [
    { "skillId": "boss_skill_living_ash_throne",   "params": { "value": 1 } },
    { "skillId": "boss_skill_dark_forge_pressure", "params": { "value": 1 } },
    { "skillId": "boss_skill_azhakar_ascension",   "params": { "value": 2 } }
  ]
}
```

O nome de cada habilidade do boss é lido do locale (`skills.locale.pt-BR.yaml[skillId].name`) — não é duplicado no card.

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

## `skills.yaml`

Catálogo de todas as habilidades do jogo. Usa o formato DSL v2.

### Estrutura do arquivo

```yaml
version: "1.0"
categories: [hero_skill, hero_power, monster_purple, item_skill, dungeon_skill, boss_skill]
abilities:
  - id: skill_last_light_healing
    category: hero_skill
    operate_type: op_active
    nature: [nat_magical, nat_holy]
    target_type: tgt_target
    affect_scope: scp_single
    affect_object: obj_friend
    effect:
      - kind: i_heal
        to: $target
        amount: $value
```

### Campos de uma skill

| Campo | Obrigatório | Descrição |
|-------|-------------|-----------|
| `id` | sim | Identificador único. Convenção de prefixo abaixo. |
| `category` | sim | Slot de UI (ver tabela de Categorias). |
| `operate_type` | sim | `op_active` (manual), `op_triggered` (reativo), `op_passive`. |
| `trigger` | condicional | Obrigatório se `op_triggered`. Objeto `{ event: "evt_*" }`. |
| `nature` | sim | Lista de `nat_*` — tipos e elementos que descrevem o efeito. |
| `target_type` | sim | `tgt_self`, `tgt_target`, `tgt_enemy`, `tgt_item`, `tgt_others`, `tgt_none`. |
| `affect_scope` | sim | `scp_single`, `scp_party_full`, `scp_dead_party`, `scp_room`, `scp_none`. |
| `affect_object` | sim | `obj_friend`, `obj_not_friend`, `obj_all`. |
| `effect` | um dos dois | Array de nós DSL v2 (preferido). |
| `script` | um dos dois | Nome do arquivo em `scripts/` para lógica imperativa (sem `.ts`). Legado — use `effect` sempre que possível. |
| `params` | opcional | Valores fixos injetados no contexto de execução junto com `$value`. |

**`effect` XOR `script`:** toda skill deve ter exatamente um dos dois.

### Categorias

| `category` | Slot de UI | Tipo de carta |
|------------|-----------|---------------|
| `hero_skill` | Habilidade do herói | Herói |
| `hero_power` | Poder do herói | Herói |
| `monster_purple` | Efeito roxo (Despertar 4) | Criatura, Subchefe |
| `item_skill` | Efeito do item/artefato | Item, Artefato |
| `dungeon_skill` | Efeito da sala | Sala |
| `boss_skill` | Habilidade do chefe | Boss |

A categoria determina onde a skill é exibida. Habilidades e poderes de herói compartilham o mesmo tipo de carta mas categorias distintas.

### Operate type e trigger

| `operate_type` | Comportamento |
|---|---|
| `op_active` | Manual — o jogador ativa clicando "Usar habilidade"/"Usar poder". |
| `op_triggered` | Reativo — dispara automaticamente ao ocorrer `trigger.event`. |
| `op_passive` | Passivo — aplicado enquanto a entidade está em campo. |

Eventos de trigger (prefixo `evt_`): `evt_attack_declared`, `evt_roll`, `evt_damage_taken`, `evt_entity_destroyed`, `evt_room_entered`, `evt_dungeon_discard`, entre outros. Definidos em [`src/data/event_rules.json`](event_rules.json).

#### Manual vs reativo

O core distingue triggers **manuais** de **reativos** via `isManuallyActivatable` ([`src/core/skills/useSkill.ts`](../core/skills/useSkill.ts)):

- **Manual (`op_active`):** o jogador clica "Usar habilidade". Inclui skills com guard `once_per_*` sem `_on_`/`_after_` no nome do trigger legado.
- **Reativo (`op_triggered`):** disparado pelo handler do evento; **não** ativável pelo jogador via clique.

Se a UI tentar ativar manualmente uma skill reativa, `fireOnUseSkill` rejeita com aviso no log e não aplica efeito.

### DSL de efeitos (`effect`) — vocabulário v2

Array de nós `EffectNode`. Tipos completos em [`src/core/skills/dsl/types.ts`](../core/skills/dsl/types.ts). Os mais usados:

```yaml
# Causar dano (i_*)
- kind: i_damage
  to: $target
  amount: $value
  minimum: 1      # opcional — piso de dano

# Curar (i_*)
- kind: i_heal
  to: $target
  amount: $value

# Cura total
- kind: i_full_heal
  to: $target

# Adicionar modificador temporário (p_*)
- kind: p_modifier
  to: $source
  stat: s_damage_reduction    # stat prefixada s_*
  operation: add
  value: $value
  duration:
    kind: once                # once | until_end_of_round | until_end_of_combat | while_in_play | passive | once_per_round

# Condicional (i_*)
- kind: i_if
  when:
    kind: compare
    op: gte
    left: $dungeon_level
    right: 3
  then:
    - kind: i_damage
      to: $target
      amount: 2

# Escolha do jogador (i_*)
- kind: i_choose_one
  options:
    - id: opt_heal
      effect:
        - kind: i_heal
          to: $source
          amount: 3
    - id: opt_attack
      effect:
        - kind: i_damage
          to: $target
          amount: 3

# Descartar do deck (i_*)
- kind: i_discard
  pile: dungeon
  count: 1

# Modificar dado (i_*)
- kind: i_modify_die
  delta: $value
  die_side: hero   # hero | enemy | any
```

**Prefixos do vocabulário DSL v2:**

| Prefixo | Família |
|---|---|
| `i_*` | Imperativo — efeito que altera estado |
| `p_*` | Componente ECS — instala modifier/trigger |
| `s_*` | Stat — alvo de `p_modifier` |
| `nat_*` | Nature — tipo/elemento do efeito |
| `tgt_*` | Target type |
| `scp_*` | Affect scope |
| `obj_*` | Affect object |
| `evt_*` | Evento de trigger |
| `op_*` | Operate type |

**Referências simbólicas** (prefixo `$`):

| Símbolo | Resolve para |
|---------|-------------|
| `$value` | `params.value` da carta (número) |
| `$source` | ID da entidade que disparou |
| `$target` | ID do alvo primário |
| `$dungeon_level` | Nível atual do Despertar (0–4) |

**Durações** para `p_modifier` (validadas em [`src/core/skills/dsl/schema.ts`](../core/skills/dsl/schema.ts)):

| `kind` | Duração |
|--------|---------|
| `once` | Consome-se no primeiro hit |
| `until_end_of_round` | Até fim da rodada de combate |
| `until_end_of_combat` | Até fim do combate inteiro |
| `once_per_round` | Pode disparar uma vez por rodada |
| `while_in_play` | Enquanto a entidade estiver em jogo |
| `passive` | Permanente (item equipado) |

---

## `skills.locale.pt-BR.yaml`

Contém nomes, labels e textos de cada skill em PT-BR. Separado de `skills.yaml` para facilitar a adição de novos idiomas.

### Formato

```yaml
skill_last_light_healing:
  name: Cura da Última Luz
  label: "Cura da Última Luz ({value}): cure {value} de vida de um herói ou criatura aliada."
  text: cure {value} de vida de um herói ou criatura aliada.
```

| Campo | Descrição |
|---|---|
| `name` | Nome exibido na UI. |
| `label` | Label compacto com valor inline. Formato: `"Nome ({value}): texto."` |
| `text` | Texto descritivo sem nome, para exibição em tooltips/detalhe. |

O placeholder `{value}` é substituído em runtime pelo `params.value` da carta.

### Como adicionar um idioma

1. Crie `skills.locale.<lang>.yaml` com a mesma estrutura de chaves.
2. Registre o loader em `src/core/data/skills.ts` para carregar o arquivo correspondente.

---

## `event_rules.json`

Define a ordem de disparo para cada evento do bus (`src/core/events/bus.ts`).

```json
{
  "DamageAboutToBeDealt": "lifo",
  "HealApplied": "fifo"
}
```

- **`fifo`** — first in, first out (ordem de registro).
- **`lifo`** — last in, first out (mais recente dispara primeiro — útil para intercepção de dano).

---

### Scripts (`scripts/`)

Use `script` em vez de `effect` quando a lógica precisar de condicionais imperativas, loops, ou acesso ao estado que a DSL não cobre. **`script` é legado** — antes de criar um novo script, verifique se a DSL já cobre o caso com os nós `i_if`, `i_for_each`, `i_choose_one`, etc.

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
2. **Adicione a entrada em `skills.yaml`** (em `abilities:`) com todos os campos obrigatórios.
3. **Adicione a entrada em `skills.locale.pt-BR.yaml`** com `name`, `label` e `text`.
4. **Implemente o comportamento:**
   - Lógica simples → campo `effect` com nós DSL v2.
   - Lógica imperativa sem equivalente DSL → campo `script` com o nome do arquivo; crie `src/data/scripts/<id>.ts`.
5. **Nenhuma alteração em `cards.yaml`** neste passo — a skill existe mas ainda não é usada por ninguém.

## Como adicionar uma nova carta

1. **Crie a entrada em `cards.yaml`** com `id`, `type`, `name`, e os campos do tipo correspondente.
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

- Todo `skillId` em `cards.yaml` **deve existir** em `skills.yaml`. Erro lançado no boot se falhar.

O teste `src/core/data/skills.test.ts` verifica:

- Todos os `skillId`s em `cards.yaml` existem em `skills.yaml`.
- Toda skill referenciada aparece no índice reverso (`skillUsedBy`).

O schema guard (`src/core/skills/dsl/__tests__/schema-guard.test.ts`) valida:

- Cada skill com `effect` ou `script` passa no `SkillDefinitionV2Schema`.
- Toda skill tem exatamente um de `effect` ou `script`.
