# Patch 16 — Eliminar o handler legado de skills (migração total para DSL/script)

Brief de implementação auto-contido. Não depende de conversa prévia.

**Pré-requisitos:**
- **Patch-12** (DSL + script): `evaluate()` (`src/core/skills/dsl/evaluate.ts`), resolver de
  efeitos (`src/core/effects/resolver.ts`), `ScriptCtx` (`src/core/scripts/context.ts`). Bloqueante.
- **Base já aplicada** (NÃO refazer): `src/core/skills/useSkill.ts` agora ramifica
  `def.effect` (DSL) → `def.script` (script) → `getHandler(def.type)` (legado), espelhando
  `src/core/skills/dispatch.ts:270-286`. Era a causa de `[SKILL NÃO IMPLEMENTADA]` para skills
  `on_use` migradas para DSL. Testes de `src/core/skills` verdes (186/186).

**Objetivo:** zerar as **30 skills que ainda usam `type`** (handler legado), migrando cada uma
para `effect` (DSL) ou `script`, e então **remover toda a infra de handlers legados**
(`src/core/skills/handlers/`, o ramo `getHandler` em `useSkill.ts`/`dispatch.ts`, o campo `type`).

**Diretriz de arquitetura — DSL-first (decisão do dono do repo):**
> Comportamento que se repete em várias cartas é escrito **uma vez no core** como novo `kind` da
> DSL (`dsl/types.ts` + `evaluate.ts`) com suporte no `resolver.ts`/bus, e ativado por **JSON**
> (campo `effect`) na carta. **Script** (`src/data/scripts/<id>.ts`) só para lógica
> irredutivelmente única ou interativa. Antes de criar um script, pergunte: "esse efeito se
> repete?". Se sim → vira `kind` reutilizável.

**Fonte da verdade do comportamento:** `tools/skill-port/specs/<skill_id>.md`. Se o handler atual
divergir da spec, **siga a spec** (pode mudar comportamento de jogo). O handler legado serve só
como referência secundária de implementação.

---

## Protocolo de execução (economia de tokens)

Quem implementa trabalha **um lote por vez** e gasta o mínimo de tokens:

- **Não releia arquivos.** O harness rastreia o estado pós-edição; `Edit` falha se o trecho não
  bater. Não reabra "para conferir".
- **Leia em paralelo, leia uma vez.** Dispare os `Read` de um lote no mesmo turno. Por skill,
  leia **só** a spec citada (`tools/skill-port/specs/<id>.md`) e, se necessário, o handler citado.
- **Não leia `skills.json` inteiro** (1762 linhas). Use os números de linha desta tabela; edite
  por `Edit` (trecho), nunca `Write` no arquivo todo.
- **Adicione o `kind` reutilizável UMA vez** (types → evaluate → resolver), depois converta todas
  as cartas que o usam por JSON.
- **Valide uma vez por lote:** `npx tsc --noEmit` + `npx vitest run src/core`. Não valide por skill.
- **Greps de aceite são comandos exatos.** Rode-os como escritos.
- **Relate em uma linha por lote.** Sem diffs grandes nem narração.
- **Não carregue contexto dos lotes seguintes** até chegar neles.
- **Commits:** um por lote. Mensagem **sem** linha de autoria do Claude (regra do `CLAUDE.md`).

---

## Diagnóstico

As 30 skills abaixo ainda têm `"type": "<handler>"` em `src/data/skills.json` e dependem de
`src/core/skills/handlers/*` via `getHandler`. Enquanto existir uma só, a infra de handlers não
pode ser removida.

⚠️ **Armadilhas de fidelidade já identificadas** (a conversão "óbvia" está errada):
- **`discardDungeon_prevention`** (`handlers/discardDungeon_prevention.ts`): o handler **não**
  bloqueia o descarte — `flags.discardDungeonLocked` é o que **bloqueia a prevenção** (Corrupção
  de Caminho). Portanto **NÃO** use `block_action: dungeon_discard` (que seta esse flag → semântica
  invertida). Precisa de um `kind` dedicado de *prevenção*. Verifique a lógica no momento do
  descarte em `src/core/reducer/exploration.ts` (`discardFromDungeonDeck`) e na spec.
- **`drawItem`** (`handlers/drawItem.ts`): é "revele N, jogador escolhe K, resto descartado"
  (interativo, com `registerContinuation`). **Não** é `draw_from` simples → precisa de um `kind`
  com escolha (`draw_and_choose`) ou script.
- **`resolver.ts` não tem `case "draw_from"`** — `draw_from` é empurrado mas ignorado hoje.

---

## Tabela-mestra — classificação das 30 skills

Coluna "Via": **DSL-trivial** (kinds que já têm resolver) · **DSL-novo-kind** (precisa de kind+resolver
reutilizável) · **DSL-compose** (combina kinds existentes, sem engine nova) · **script**.

| # | skill (linha em skills.json) | type atual | Via | Alvo |
|---|---|---|---|---|
| 1 | skill_life_drain (762) | heal | DSL-trivial | `apply_heal to:$source` (trigger já é on_deal_damage) |
| 2 | item_skill_deadly_edge (1400) | tohit_damage | DSL-compose | `add_modifier tohit_bonus` + `add_modifier damage_bonus` |
| 3 | item_skill_drain_life_and_deadly_edge (1664) | tohit_damage_heal | DSL-compose | deadly_edge + `apply_heal to:$source` |
| 4 | dungeon_skill_dead_torches (1506) | item_or_tohit_penalty | DSL-compose | `choose_one` [discard_from item · add_modifier tohit_penalty] |
| 5 | power_mighty_crimson_fury (958) | damage_bonus_duration | DSL-compose | `add_modifier damage_bonus` `duration: until_end_of_combat` |
| 6 | item_skill_crimson_fury_mighty (1715) | self_damage_for_damage… | DSL-compose/script | `apply_damage to:$source` + damage_bonus until_end_of_combat (ver spec) |
| 7 | purple_crimson_plate (1111) | armor | DSL-novo-kind | `prevent_next_damage` (stat first_damage_prevented) |
| 8 | boss_skill_living_ash_throne (1597) | armor | DSL-novo-kind | `prevent_next_damage` |
| 9 | skill_last_light_shield (134) | prevent_damage | DSL-novo-kind | `prevent_next_damage` / `add_modifier damage_reduction once` |
| 10 | skill_protective_veil (812) | targetProtection | DSL-novo-kind | `ignore_next_targeting` (stat) |
| 11 | skill_return_rite (282) | recoverDungeon | DSL-novo-kind | `recover_dungeon count:N` |
| 12 | power_restored_path (932) | recoverDungeon | DSL-novo-kind | `recover_dungeon` |
| 13 | skill_prey_mark (269) | mark_and_tohit | DSL-novo-kind | `mark_target to:$target` + add_modifier tohit |
| 14 | item_skill_mystic_draw (1437) | drawArtifact | DSL-novo-kind | `draw_from pile:artifact_deck` (+ case no resolver) |
| 15 | skill_preserved_path (147) | discardDungeon_prevention | DSL-novo-kind ⚠️ | `prevent_dungeon_discard` (ver armadilha) |
| 16 | skill_path_safeguard (749) | discardDungeon_prevention | DSL-novo-kind ⚠️ | `prevent_dungeon_discard` |
| 17 | skill_rift_light_step (825) | discardDungeon_prevention | DSL-novo-kind ⚠️ | `prevent_dungeon_discard` |
| 18 | skill_forge_spoils (256) | drawItem | DSL-novo-kind ⚠️ | `draw_and_choose pile:item reveal:N keep:1` |
| 19 | dungeon_skill_forge_spoils (1557) | drawItem | DSL-novo-kind ⚠️ | `draw_and_choose` |
| 20 | skill_illuminate_path (736) | dungeon | DSL-novo-kind/script | `reveal_dungeon count:N` (ver spec — interativo?) |
| 21 | skill_rift_rune (76) | dice_modification | script | `action.openDiceSelection` (interativo) |
| 22 | power_supreme_rift_rune (945) | diceFix | script | `action.fixDie` |
| 23 | power_hunter_execution (1035) | diceFix_damage | script | `action.fixDie` + apply_damage |
| 24 | skill_focus_deflection (838) | targetRedirect_or_tohit | script | `action.redirectCombatTarget` |
| 25 | skill_opportunity_shot (775) | directDamage | script | `action.cancelAction` + apply_damage |
| 26 | skill_rekindled_forge (160) | recover_item | script | recuperar+equipar item (interativo) |
| 27 | dungeon_skill_rekindled_forge (1570) | drawSpecificItem | script | draw item filtrado |
| 28 | skill_rift_evasion (537) | itemControl | script | controle de item bespoke |
| 29 | dungeon_skill_summon_guardian (1583) | roomSpecial | script | `action.spawnEnemy` |
| 30 | power_deep_veil_echo (1022) | token | script | sistema de token |

---

## Lote A — DSL-trivial + DSL-compose (sem engine nova)

Skills #1–#6. Só editar `skills.json` (trocar `"type": "..."` pelo array `"effect": [...]`,
mantendo `id/name/category/trigger/target/templates`) + teste por skill. Nenhum `kind` novo.

**#1 skill_life_drain (linha 762)** — modelo exato (a única conversão 100% verificada):
```json
"effect": [
  { "kind": "apply_heal", "to": "$source", "amount": "$value" }
]
```
(remove a linha `"type": "heal"`; o `trigger: on_deal_damage` já existe → `dispatch.ts` dispara).

**#2–#6:** ler a spec citada e compor com kinds existentes
(`add_modifier` stats `tohit_bonus`/`damage_bonus`/`tohit_penalty` já suportados no
`resolver.ts:149-193`; `apply_heal`, `apply_damage`, `discard_from`, `choose_one` já existem).
Specs: `tools/skill-port/specs/{item_skill_deadly_edge,item_skill_drain_life_and_deadly_edge,
dungeon_skill_dead_torches,power_mighty_crimson_fury,item_skill_crimson_fury_mighty}.md`.

**Teste:** `src/core/skills/dsl/__tests__/patch16-loteA.test.ts` — para cada skill, `evaluate(def.effect, ctx)`
e asseverar o efeito da spec (ver modelo em `dsl/__tests__/lote1.test.ts`).

**Handlers a deletar ao fim do Lote A:** `heal`. (os demais só saem quando ninguém mais usa o type)
- Remover `src/core/skills/handlers/heal.ts` + `import`/`register("heal", ...)` em `handlers/index.ts`.
**Gate:** `grep -n '"type": "heal"' src/data/skills.json` → vazio.

---

## Lote B — Novos `kind`s reutilizáveis (DSL-first)

Skills #7–#20. Para **cada** novo `kind`: (a) adicionar à união `EffectNode` em
`src/core/skills/dsl/types.ts`; (b) branch em `src/core/skills/dsl/evaluate.ts` (use
`ctx.action.pushEffect({ kind, ... })`, padrão das linhas 37-134); (c) `case` em
`src/core/effects/resolver.ts` implementando o comportamento da spec/handler citado;
(d) converter as cartas por JSON; (e) teste.

Novos kinds e referência de comportamento (ler o handler citado como spec de implementação):

| kind | resolver: comportamento (ler) | cobre skills |
|---|---|---|
| `prevent_next_damage { to }` | `handlers/prevent_damage.ts` + `handlers/armor.ts`; previne/reduz o **próximo** dano ao alvo (stat `first_damage_prevented` ou via `combat.damageReduction` com flag de 1ª vez) | #7,#8,#9 |
| `ignore_next_targeting { to }` | `handlers/targetProtection.ts`; ignora o 1º efeito que mira o alvo na sala | #10 |
| `recover_dungeon { count }` | `handlers/recoverDungeon.ts`; devolve N cartas do descarte da dungeon ao topo | #11,#12 |
| `mark_target { to }` | `handlers/mark_and_tohit.ts`; marca a criatura como presa (+ compor `add_modifier tohit_bonus` no JSON) | #13 |
| `draw_from` (case **faltante**) | `handlers/drawItem.ts` (parte não-interativa) — adicionar `case "draw_from"` que move N cartas de `state.decks.<pile>.available` para `pendingRewards`; suporta `pile: item_deck \| artifact_deck` | #14 |
| `prevent_dungeon_discard {}` ⚠️ | **NÃO** reusar `block_action`. Ler `handlers/discardDungeon_prevention.ts` + `reducer/exploration.ts`; implementar o flag de *prevenção* correto (distinto de `discardDungeonLocked`, que é o bloqueio da prevenção) | #15,#16,#17 |
| `draw_and_choose { pile, reveal, keep }` | `handlers/drawItem.ts` (com `registerContinuation`): revela `reveal`, abre `pendingSkillChoice`, continuation põe escolhido em `pendingRewards` | #18,#19 |
| `reveal_dungeon { count }` | `handlers/dungeon.ts` + spec `skill_illuminate_path.md` — pode ser interativo; se a spec exigir escolha, vira script (mover p/ Lote C) | #20 |

**Teste:** `src/core/skills/dsl/__tests__/patch16-loteB.test.ts` — um `describe` por kind.

**Handlers a deletar ao fim do Lote B:** `prevent_damage`, `armor`, `targetProtection`,
`recoverDungeon`, `mark_and_tohit`, `drawItem`, `discardDungeon_prevention`, `dungeon` (se #20 ficou
em DSL), `tohit_damage`, `damage_bonus_duration`.
**Gate (rodar para cada type):** `grep -n '"type": "<type>"' src/data/skills.json` → vazio antes de
remover o handler e seu `register(...)`.

---

## Lote C — Scripts (lógica única/interativa)

Skills #21–#30. Cada uma: criar `src/data/scripts/<id>.ts` (modelo:
`src/data/scripts/skill_living_ember_oil.ts`; registro via `src/core/scripts/registry.ts`),
trocar para `"script": "<id>"` em `skills.json`, teste em `src/core/scripts/__tests__/`.
Adicionar a primitiva mínima em `src/core/scripts/{context.ts,types.ts}` **uma vez** quando a
primeira skill do grupo precisar. Ler a spec citada por skill.

Grupos e primitivas novas em `ScriptCtx.action`:
- **Dado** — `fixDie(side, index, value)`, `openDiceSelection(opts)`: #21 rift_rune,
  #22 power_supreme_rift_rune, #23 power_hunter_execution. Estado: `state.combat` (dados rolados).
- **Alvo/combate** — `redirectCombatTarget(heroId, enemyId)` (#24 focus_deflection),
  `cancelAction(type)` + `apply_damage` (#25 opportunity_shot).
- **Itens/dungeon bespoke** — recuperar+equipar item (#26 rekindled_forge),
  `drawSpecificItem(filter)` (#27 dungeon_skill_rekindled_forge), controle de item (#28 rift_evasion).
- **Spawn/token** — `spawnEnemy(cardId)` (#29 summon_guardian); sistema de token
  `grantToken/spendToken` (#30 deep_veil_echo).

**Handlers a deletar ao fim do Lote C (todos os restantes):** `dice_modification`, `diceFix`,
`diceFix_damage`, `targetRedirect_or_tohit`, `directDamage` (já removido — ver nota em index.ts),
`recover_item`, `drawSpecificItem`, `itemControl`, `roomSpecial`, `token`, `splash_damage`,
`reroll`, e qualquer `register(...)` órfão.

---

## Lote D — Remoção da infra legada

**Gate bloqueante:** `grep -nE '"type": "' src/data/skills.json` → **vazio**. Só então:

1. `src/core/skills/useSkill.ts`: remover o ramo final `getHandler(def.type ?? "noop")` +
   o `return log(... [SKILL NÃO IMPLEMENTADA] ...)`. Remover import `getHandler`.
2. `src/core/skills/dispatch.ts`: remover o `else` legado (linhas ~281-286) e o import `getHandler`.
3. Deletar a pasta `src/core/skills/handlers/` inteira (incl. `index.ts`, `noop.ts`).
4. Remover o import que popula o registry (busque `handlers/index` / `import "./handlers"`).
5. `src/core/skills/registry.ts`: remover `register`/`getHandler`/`_registry`/`_warnedMissing`;
   manter apenas `registerContinuation`/`getContinuation` **se** ainda houver continuations em uso
   (grep `getContinuation`), senão remover o arquivo.
6. `src/core/data/skillTypes.ts`: remover o campo `type` de `SkillDefinition` e ajustar o que
   referenciar; atualizar o schema da DSL (`src/core/skills/dsl/schema.ts`) se ele permitir `type`.
7. Atualizar `tools/skill-port/expansion-plan.md` / docs que citam `[SKILL NÃO IMPLEMENTADA]` por
   handler ausente (`patch-7.md`, `patch-8.md`) com nota de que a era de handlers acabou.

**Aceite final:** `npx tsc --noEmit` limpo · `npx vitest run` 100% verde ·
`grep -rn "getHandler" src/core` → vazio · `grep -rn "SKILL NÃO IMPLEMENTADA" src/core` → vazio.

---

## Verificação (por lote)

1. Teste por skill validando a **spec** (DSL → `src/core/skills/dsl/__tests__/`; script →
   `src/core/scripts/__tests__/`).
2. `npx tsc --noEmit` limpo.
3. `npx vitest run src/core` verde.
4. Smoke manual via UI: partida usando cada skill migrada; **zero** `[SKILL NÃO IMPLEMENTADA]`
   no console para skills em jogo (critério herdado de `patch-8.md`).
5. Gate de grep do lote antes de deletar qualquer handler.

## Ordem
Lote A → (aprovação) → Lote B → (aprovação) → Lote C → (aprovação) → Lote D.
