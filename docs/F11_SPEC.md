# F11 — Unidades, atributos, habilidades, status e áreas na engine

Status: **F11a implementada** (desvios de assinatura em `TESTABILITY_PLAN.md`, seção F11a). F11b não iniciada.

## Objetivo

A engine passa a suportar nativamente, por dados e sem código do jogo:

- **Unidades**: personagem, criatura, item e **área/ambiente** são a mesma coisa (diferenciados por tags).
- **Atributos**: base, derivados (vida_max = constituição × 10), recursos com valor atual (vida, mana), modificadores e clamp.
- **Habilidades** num formato único com três ativações: `active` (usada pelo jogador, com custo e recarga), `static` (passiva contínua) e `triggered` (reage a evento).
- **Status** com duração, empilhamento, imunidade, bloqueio de ação, bloqueio de cura e habilidades próprias (ex.: sangrar).
- **Áreas com aura**: modificadores para quem está dentro e efeitos ao entrar, sair e no início do turno.
- **Pipeline de dano e cura** com tipo de dano, resistência, armadura e hooks para regras específicas.

## Decisões

1. **Modificadores e gatilhos são calculados, não guardados.** O estado guarda só fatos (base, recursos atuais, status, equipamentos, presença em áreas, recargas). Efeitos ativos são derivados das fontes vivas: quando a fonte sai, o efeito some sozinho, sem limpeza manual.
2. **Uma única pilha**: efeitos primitivos são kinds registrados (pacote `units`) e rodam pelo `runAll`/`EngineStack` existentes.
3. **Vocabulário neutro** (unit, ability, status, area, attribute, effect); a guarda de termos da engine continua sem allowlist nova.
4. **F11a antes de F11b**: F11a cria a engine nova e o cenário RPG **sem tocar em src/core**; F11b faz o Ascensão adotar, em fatias.

## Contratos (src/engine)

Arquivos novos: `units.ts`, `attributes.ts`, `abilities.ts`, `statuses.ts`, `areas.ts`, `pipeline.ts`, `reactor.ts`, `unitKinds.ts`.

### Unidades

```ts
interface UnitInstance {
  id; def; controller?; tags;
  base: Record<string, number>;      // atributos base
  pools: Record<string, number>;     // recursos atuais (vida, mana)
  statuses: StatusInstance[];
  equippedTo?; slot?;                // item equipado em quem
  presentIn: UnitId[];               // áreas em que está
  cooldowns: Record<string, number>; // habilidade -> turnos restantes
}
spawnUnit, despawnUnit, equip, unequip, enterArea, leaveArea, unitOf, unitsOf
```

### Atributos

```ts
interface AttributeDef { id; kind: "stat" | "pool"; default?; derived?: {from, mul?, add?}[]; min?; max?: number | {attr}; round? }
interface ModifierDecl { attr; op: "add" | "mul" | "set" | "min" | "max"; value; when?: KindNode }
attributeOf(s, unit, attr)   // base + derivados → add → mul → set → min/max → arredonda → clamp
activeModifiers(s, unit)     // derivado das fontes vivas (status, item equipado, aura, habilidade estática)
```
Máximo que sobe não cura; máximo que cai corta o valor atual.

### Habilidades

```ts
interface AbilityDef {
  id; activation: "active" | "static" | "triggered";
  action?;               // classe da ação ("atacar", "mover", "usar_habilidade") — usada por bloqueios
  condition?; target?; effects: KindNode[];
  cost?: {pool, amount}[]; cooldown?: {turns, tickOn?};
  modifiers?: ModifierDecl[];   // static
  on?; priority?;               // triggered
  limit?: {scope, times};
}
interface UnitDef { id; tags; base; abilities;
  equipModifiers?; equipAbilities?; aura?: AuraDef }
interface AuraDef { filter?; modifiers?; onEnter?; onLeave?; onTurnStart? }
canUseAbility(s, unit, ability, targets) → ok | {reason: "cooldown" | "custo" | "bloqueada" | "condicao" | "alvo"}
useAbility(...)  // valida, paga, grava recarga, emite "habilidade.usada", resolve efeitos
```
Integra com `cost.ts` (custo de recurso da unidade), `targets.ts` (seletor de unidade), condições registradas (novas: `in_area`, `has_status`, `attr_compare`) e contadores de escopo (`limit`).

### Status

```ts
interface StatusDef {
  id; tags;
  duration: {kind: "permanent"} | {kind: "turns", turns, tickOn, of: "holder" | "any"} | {kind: "scope", scope};
  stack: "ignore" | "refresh" | "stack" | "replace"; maxStacks?;
  modifiers?; abilities?;              // vivem enquanto o status vive
  blocks?: string[];                   // ações bloqueadas
  healGate?: { allowTags: string[] };  // bloqueia cura, exceto essas tags
  damageTaken?: Record<tipo, number>;
}
applyStatus (imunidade → status.imune; política de empilhamento), removeStatus, statusesOf, isImmune, canAct
```

### Efeitos primitivos (kinds do pacote `units`)

`damage {amount, type}`, `heal {amount, tags, pool}`, `apply_status`, `remove_status {status | tag}`, `modify_attribute {attr, delta, mode}`, `block_action {action, duration}`, `move_to_area {area}`. Cada um com schema zod e cenário YAML.

### Pipeline de dano e cura

- **Dano**: `dano.proposto` → hooks do jogo (<100) → resistência por tipo (`rules.resistance`: atributo em %, limitado a 100) → mitigação (ex.: armadura só contra `fisico`, piso 0) → hooks (≥100) → débito na vida → `dano.aplicado` → se vida 0, `unidade.derrotada`.
- **Cura**: hooks → `healGate` (status bloqueia cura sem tag permitida → `cura.bloqueada`, efetivo 0) → crédito com clamp no máximo → `cura.aplicada`.
- Hooks (`DamageHook`/`HealHook`) são o ponto de extensão para regras de um jogo (ex.: a regra roxa do Ascensão vira hook na F11b).

### Reator de gatilhos

Gatilhos ativos derivados (próprios, de item, de status, de aura), ordenados por (prioridade, unidade, habilidade), empilhados na pilha da engine. Ganchos fixos:

- **início do turno do controlador**: reduz recargas → reduz status com tick no início → gatilhos de início de turno e `aura.onTurnStart`;
- **fim do turno**: reduz status com tick no fim;
- **entrar/sair de área**: `aura.onEnter` / `aura.onLeave`;
- **escopo encerrado**: remove status com duração por escopo;
- limite de 32 reações encadeadas.

### Eventos novos

`unidade.criada`, `unidade.removida`, `unidade.derrotada`, `atributo.alterado`, `item.equipado`, `item.desequipado`, `area.entrou`, `area.saiu`, `habilidade.usada`, `acao.bloqueada`, `dano.proposto`, `dano.aplicado`, `cura.aplicada`, `cura.bloqueada`, `status.aplicado`, `status.removido {reason}`, `status.imune`.

### Montagem

`createEngine` ganha `units` (atributos, recurso de vida, mitigação, hooks) e o conteúdo ganha unidades, habilidades e status; tudo validado e congelado. `projection.ts` ganha a vista de unidade (atributos finais, status, recargas).

## Cenário de aceitação — "Margem do Lago Turvo" (original)

Rodada = turno de A + turno de E; uma ação aceita por turno; ação rejeitada não gasta o turno. Determinístico.

### Atributos

`constituicao`; `vida_max` = constituição × 10; `vida` (máx. vida_max); `mana_max`; `mana`; `armadura` (mín. 0, reduz só dano `fisico`).

### Unidades e conteúdo

- **Aria (A)**: constituição 5, mana 20, armadura 0.
  - `golpe_lamina` (ativa): 8 de dano `fisico`.
  - `lampejo` (ativa): custa 8 de mana, recarga 2 turnos, 12 de dano `arcano`.
  - `vigor_sereno` (gatilho no início do turno, só fora do lago): cura 4 com tag `regeneracao`.
  - Ações `mover` e `usar_item`.
- **Cota de Escamas** (item): enquanto equipada, armadura +3 e constituição +1.
- **Poção Comum**: cura 15 (tag `pocao`). **Antídoto**: cura 10 (tag `antidoto`) e remove status com tag `veneno`.
- **Lago Turvo** (área): aura com armadura −2 para quem está dentro; ao entrar, aplica **Cólera**.
- **Cólera** (status, tag `veneno`, permanente, não empilha): bloqueia cura sem a tag `antidoto`; habilidade própria `sangrar`, que causa 5 de dano `veneno` no início do turno do portador.
- **Raiz** (status, tag `controle`, 2 turnos, tick no fim do turno do portador): bloqueia `mover`.
- **Espreitador do Junco (E)**: constituição 3 (vida 30), armadura 3; passivas Pele Abissal (+25 `resistencia_arcana`) e Sangue Frio (imune a `veneno`).

Regra: unidade só tem atributos base e habilidades. Resistência e imunidade vêm de habilidades estáticas (`modifiers`, `immunities`), então itens, status e auras podem concedê-las.
  - `enlace`: aplica Raiz.
  - `investida`: 9 de dano `fisico`.
  - Roteiro: turno 1 usa `enlace` em A; depois sempre `investida`.

### Preparação

A equipa a Cota (vida_max 60, armadura 3), vida 60, mana 20. E entra no lago: **imune** à Cólera (`status.imune`); armadura de E cai para 1.

### Partida de vitória

| R | Turno | O que acontece | A vida/mana | E vida | Status de A |
|---|---|---|---|---|---|
| 1 | A | regen cura 0 (vida cheia). `lampejo` em E: 12 × 0,75 = 9; mana 12, recarga 2 | 60/12 | 21 | — |
| 1 | E | `enlace` → Raiz (2) | 60/12 | 21 | raiz 2 |
| 2 | A | recarga 1. **`mover` bloqueado pela Raiz**. **`lampejo` rejeitado (recarga)**. `golpe_lamina`: 8 − 1 = 7. Fim: raiz 1 | 60/12 | 14 | raiz 1 |
| 2 | E | `investida`: 9 − 3 = 6 | 54/12 | 14 | raiz 1 |
| 3 | A | recarga 0; regen +4 → 58. `lampejo`: 9; mana 4, recarga 2. Fim: Raiz expira | 58/4 | 5 | — |
| 3 | E | `investida` 6 | 52/4 | 5 | — |
| 4 | A | recarga 1; regen +4 → 56. **Entra no lago**: armadura 3 − 2 = 1; recebe **Cólera** | 56/4 | 5 | cólera |
| 4 | E | `investida`: 9 − 1 = 8 | 48/4 | 5 | cólera |
| 5 | A | recarga 0. **Sangra 5** (armadura não reduz veneno) → 43; regen não dispara (no lago). **`lampejo` rejeitado (mana 4 < 8)**. **Poção: cura bloqueada pela Cólera**, efetivo 0 | 43/4 | 5 | cólera |
| 5 | E | `investida` 8 | 35/4 | 5 | cólera |
| 6 | A | sangra 5 → 30. **Antídoto**: cura 10 → 40 e remove a Cólera (continua no lago, sem reaplicar) | 40/4 | 5 | — |
| 6 | E | `investida` 8 | 32/4 | 5 | — |
| 7 | A | sem gatilhos. `golpe_lamina` 7 → E 0 → **vitória de A** | 32/4 | 0 | — |

**Final:** vitória na rodada 7; A com 32/60 de vida, 4/20 de mana, armadura efetiva 1 (no lago), sem status, recarga do `lampejo` 0.

### Partida de derrota (igual até o fim da R4; depois A só passa)

| R | A após sangrar | A após investida |
|---|---|---|
| 5 | 43 | 35 |
| 6 | 30 | 22 |
| 7 | 17 | 9 |
| 8 | 4 | 0 → **derrota na R8**; E termina com 5 |

### Casos negativos isolados

1. Raiz: `mover` rejeitado (`bloqueada`), sem `area.entrou`, turno não gasto.
2. Cura comum sob Cólera: efetivo 0 e `cura.bloqueada`; mesma cura com tag `antidoto` passa.
3. Recarga: usado no turno N, rejeitado em N+1, aceito em N+2.
4. Mana insuficiente: rejeitado; mana e recarga intactas.
5. Imunidade: E no lago recebe `status.imune`; sem status.
6. Fonte sai, efeito some: desequipar a Cota tira 3 de armadura e 10 de vida_max (corta a vida se passar); sair do lago devolve +2 de armadura, mas a Cólera fica; remover o lago tira a aura de todos.
7. Empilhamento: `refresh`, `stack` com máximo e `replace`.
8. Raiz expira no fim do 2º turno do portador, não no turno de quem aplicou.

## Critério de pronto (F11a)

1. `typecheck:engine` limpo; guarda de imports e termos sem allowlist nova.
2. Testes de unidade: atributos, unidades, status, pipeline, habilidades, reator e um por kind novo.
3. Cenário YAML por kind e condição novos; o teste "kind sem cenário" continua valendo.
4. `tools/engine-test/rpg`: partidas de vitória e derrota batendo com as tabelas em todo turno (vida, mana, armadura efetiva, status, recarga, eventos); os 8 negativos; 40 partidas aleatórias sem erro e sem modificador sobrevivendo à fonte.
5. Cobertura da engine ≥ 85% de linhas.
6. Sem regressão: `npm test`, goldens idênticos, bot (só as 6 falhas conhecidas), coupling, e2e.

## F11b — Ascensão adota (depois, em fatias, cada uma com goldens idênticos)

| Fatia | Mudança |
|---|---|
| b1 | ECS do core espelhado nas unidades da engine; teste diferencial `attributeOf` × `statOf` |
| b2 | leitura de atributos e durações passa para a engine |
| b3 | passivas e gatilhos do core viram habilidades derivadas da engine (preservar a ordem) |
| b4 | dano/cura delegam ao pipeline; regra roxa e redução do primeiro dano viram hooks |
| b5 | dispel, remover status, modificador e gatilho viram açúcar sobre os primitivos |
| b6 | migração de save v6→v7 (`world` sai do jogo) |
| b7 | remover `src/core/ecs`, `damageSystem` e `healSystem` |
