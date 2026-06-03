# Patch 25 — Fechar B5 (dedup) e PD (semântica de p_block)

Brief auto-contido. Não depende de conversa prévia.

**Pré-requisitos:**
- Patch-23 fechado: B1, B2, B3, B4, B6, B7 já corrigidos no commit `41fc573`.
- Auditoria base: [docs/issues/audit-skills-duracao.md](../issues/audit-skills-duracao.md).

**Objetivo:** fechar o que sobrou da auditoria de durações:

1. **B5 — modifier stacking.** Triggers reativos `evt_damage_taken + p_modifier while_in_play` adicionam um modifier novo por evento. A redução vira `value × N` em vez de `value`.
2. **PD — `p_block` sem ciclo de vida.** Hoje `p_block` escreve flags booleanas em `state.flags`/`hero.healBlocked` sem nenhuma duration. Cartas cujo texto diz "até fim da rodada", "neste combate", "1×/sala", "próxima cura" ficam permanentes (ou nunca expiram corretamente).

**Princípio inegociável** — descrição da carta = comportamento. Mesma régua do patch-23.

**Fora de escopo:**
- Reescrita de skills de `script:` para DSL.
- Mecanismo `pre_damage_hook` (modificar evento na janela do bus em vez de instalar modifier). Discutir em patch separado se Lote A não bastar.

---

## Diagnóstico de referência

Pós-patch-23, restam:

| Id | Buraco | Skills afetadas |
|---|---|---|
| B5 | trigger reativo empilha `p_modifier while_in_play` a cada evento | `skill_charred_plate`, `skill_last_light_ward`, `purple_ash_protection`, `item_skill_block`, `item_skill_block_and_last_light_ward`, `skill_gelatinous_body` |
| PD-1 | `p_block` sem `duration` declarada | `skill_crimson_chains` (flee), `skill_forge_smoke` (heal) |
| PD-2 | `p_block` com escopo "sala" / "1º combate" sem mecanismo de reset | `skill_sealed_door`, `skill_path_corruption`, `dungeon_skill_confinement` |
| PD-3 | `p_block` atrelado à presença da criatura | `purple_forge_chains`, `purple_deep_veil_seal` |
| PD-4 | `p_block` com semântica "próxima X" / "1×/jogo" | `purple_healing_rupture` (next heal), `purple_depths_seal` (1×/jogo) |
| PD-5 | trigger sem cooldown declarado mas label promete "1×" | `skill_path_safeguard` |
| PD-6 | `duration: passive` ambíguo (texto = permanente) | `boss_skill_azhakar_ascension` |

---

## Lote A — Dedup de modifier para triggers reativos (B5)

**Escopo:** quando um `TriggerComponent` reativo instala `p_modifier ... while_in_play` em alvo X, se já existir um modifier no X com **mesmo `source` + mesmo `target` + mesmo `sourceEntityId` + mesmo `duration.kind`**, substituir em vez de empilhar.

**Decisão fechada:** opção 1 do Lote E original do patch-23 (dedup no resolver/addComponent). É a mudança mínima que zera o sintoma para os 6 casos sem mexer em YAML.

**Mudanças:**
- `src/core/effects/resolver.ts` (caso `p_modifier`): antes de `addComponent`, varrer modifiers existentes do `target` com mesmo `(source, target stat, sourceEntityId, duration.kind)`; se houver, **trocar** (`removeComponent` + `addComponent`) em vez de empilhar.
  - Alternativa: helper `upsertModifier(world, entityId, mod, dedupKey)` em `world.ts`.
- A dedup só vale para modifiers vindos de trigger reativo (`source = skill.id` + `sourceEntityId` setado). Skills `op_active` que aplicam buffs sucessivos com mesma origem não devem ser deduplicadas — usar a presença de `sourceEntityId` como discriminador.

**Critério de aceite:**
- Teste em `src/core/ecs/__tests__/modifier-dedup.test.ts` (novo): aplicar `p_modifier while_source_in_play` duas vezes do mesmo source — entidade fica com 1 modifier, valor = `value` (não `value × 2`).
- Teste de integração: criatura com `purple_ash_protection` sofre 3 ataques; `getModifierTotal(world, enemy, "s_damage_reduction")` retorna `value` constante.
- Suite atual sem regressão.

**Risco:** baixo-médio. Mudança localizada no resolver, mas mexe na semântica de modifiers — escrever testes antes da edição.

---

## Lote B — DSL: `p_block` aceita `duration` (PD-1, PD-3, PD-4)

**Escopo:** estender `p_block` para o mesmo eixo de `duration` que `p_modifier` já tem. Sem `duration` continua válido (mantém flag global por compatibilidade), mas vira **deprecated**.

**Modelo:** em vez de `state.flags.fleeBlocked: boolean`, virar `state.flags.fleeBlocked: { source, duration, sourceEntityId? }[]`. A checagem de "fuga bloqueada?" passa a ser "lista não vazia".

**Mudanças:**
- `src/core/skills/dsl/types.ts`: `p_block` ganha `duration?: Duration` e (opcional) `sourceEntityId?: EntityId`.
- `src/core/state/gameState.ts`: campos `flags.fleeBlocked`, `flags.discardDungeonLocked`, etc. e `hero.healBlocked` viram arrays de `BlockEntry`.
- `src/core/effects/resolver.ts` (caso `p_block`): empurra `BlockEntry` em vez de setar boolean.
- Locais que **lêem** as flags (grep `fleeBlocked`, `healBlocked`, `discardDungeonLocked`, etc.): passar a checar `array.length > 0`.
- Tick: estender `tickModifierDurations` (ou criar `tickBlockEntries`) para limpar entries cuja `duration` expirou, e `removeBlocksForSource` análogo a `removeModifiersForSource`.

**Critério de aceite:**
- Teste: `p_block flee duration: until_end_of_round` — fuga bloqueada na rodada 1, liberada após `RoundEnded`.
- Teste: `p_block heal duration: once` — primeira tentativa de cura bloqueada, segunda passa.
- Teste: `p_block flee duration: while_source_in_play` com criatura X — bloqueio cai ao remover X do world.

**Risco:** médio-alto. Mexe em vários reads de flags. Migração defensiva: tratar o array vazio como "sem bloqueio" e manter o setter legado funcionando durante um lote, ou substituir tudo de uma vez (preferido — sem flag legada).

---

## Lote C — Corrigir YAMLs das skills PD (PD-1 a PD-5)

**Escopo:** ajustar `src/data/skills.yaml` para refletir a descrição da carta. Depende dos Lotes A e B prontos.

**Mudanças por skill:**

| Skill | Edição |
|---|---|
| `skill_crimson_chains` | `p_block flee` → adicionar `duration: { kind: until_end_of_round }` |
| `skill_forge_smoke` | `p_block heal` → adicionar `duration: { kind: until_end_of_round }`; manter `condition` rodada=1 |
| `skill_sealed_door` | `p_block flee` → `duration: { kind: while_source_in_play }` com source = item-fonte; ou converter para `op_triggered` com `cooldown { scope: combat }` no 1º combate da sala |
| `skill_path_corruption` | `p_block dungeon_discard` → `duration: { kind: while_source_in_play }` |
| `dungeon_skill_confinement` | `p_block flee` → `duration: { kind: while_source_in_play }` (escopo sala = vida da carta de sala) |
| `purple_forge_chains` | `p_block flee` → `duration: { kind: while_source_in_play }` |
| `purple_deep_veil_seal` | `p_block dungeon_level_reduction` → `duration: { kind: while_source_in_play }` |
| `purple_depths_seal` | `p_block power_use` → adicionar `cooldown: { scope: game }` no trigger |
| `purple_healing_rupture` | `p_block heal` → `duration: { kind: once }` |
| `skill_path_safeguard` | trigger ganha `cooldown: { scope: round }` |

**Critério de aceite:**
- Cada skill acima, manualmente, comporta como o texto pt-BR diz.
- `npm test` sem regressão.

**Risco:** baixo (mudança de dados). Audit é o checklist.

---

## Lote D — Renomear `duration: passive` para `permanent` (PD-6)

**Escopo:** o kind `passive` em `boss_skill_azhakar_ascension` é ambíguo. Texto da carta diz "+2 acerto permanente". Renomear para `permanent` no YAML e validar que o resolver já trata.

**Mudanças:**
- `src/data/skills.yaml`: trocar `duration: { kind: passive }` por `duration: { kind: permanent }` na skill (único uso).
- `src/core/skills/dsl/types.ts`: remover `passive` da união se não estiver mais em uso.
- `src/core/skills/dsl/evaluate.ts`: remover qualquer mapping de `passive`.

**Critério de aceite:**
- Carta continua dando o bônus de forma permanente.
- Schema válido (Zod/tsc).

**Risco:** trivial.

---

## Lote E — Atualizar audit como log histórico

**Escopo:** o documento `docs/issues/audit-skills-duracao.md` lista skills como "afetadas" mas não diz que B1-B7 já foram fechados.

**Mudanças:**
- Adicionar banner no topo: "snapshot pré-patch-23; status pós-patch-23 e pós-patch-25 abaixo".
- Adicionar coluna `status` ou tachar linhas resolvidas.
- Recolocar B5 e PD como "ainda abertos até patch-25 fechar".
- Ao final do Lote D deste patch, marcar tudo como resolvido (ou apagar o doc e abrir um novo `audit-skills-2026-Q3.md` caso outra rodada apareça).

**Critério de aceite:** doc reflete o estado real do código no momento do merge.

**Risco:** zero (documento).

---

## Critério de aceite global

- [ ] Todos os testes existentes passam.
- [ ] Testes novos cobrem B5 (dedup), `p_block` com `duration` (Lote B), e pelo menos 3 das skills PD do Lote C.
- [ ] Painel de Influências em runtime não mostra mais redução de dano cumulativa quando criatura sofre múltiplos ataques.
- [ ] Skills PD passam um teste manual contra o texto pt-BR (5 skills sampladas).
- [ ] `docs/issues/audit-skills-duracao.md` reflete estado pós-patch.

## Ordem sugerida de execução

1. **Lote A** primeiro — fecha B5, baixo risco, destrava UX visível.
2. **Lote B** — fundação para C.
3. **Lote C** — depende de B.
4. **Lote D** — independente, pode ir em paralelo.
5. **Lote E** — último, registra resultado.

---

## Riscos / abertos

- **Lote B é o mais arriscado.** Trocar boolean por array em flags lidas em N lugares pode regredir UI/regras silenciosamente. Recomenda-se grep exaustivo de cada flag antes da reescrita e tipar com `BlockEntry[]` para o compilador apontar todos os reads.
- **Dedup do Lote A pode esconder bug legítimo.** Se alguma skill futura quiser empilhar buffs com mesmo `source` (improvável, mas), o discriminador `sourceEntityId` precisa ser estável. Documentar a regra.
- **`while_source_in_play` para sala (`dungeon_skill_confinement`)** assume que a carta de sala existe como entidade no world. Confirmar antes; senão, escopo `room` precisa virar um kind próprio de duration (mais churn, sai do escopo deste patch).
