# Patch 23 — Corrigir sistema de duração de skills (expiry e ciclo de vida)

Brief auto-contido. Não depende de conversa prévia.

**Pré-requisitos:**
- Patch-18 completo (ECS world + ModifierComponent + `tickModifierDurations`).
- Patch-22 completo (vocabulário v2 estável).

**Objetivo:** consolidar o sistema de durações para que a expressão semântica do schema (`until_end_of_round`, `until_end_of_combat`, `while_in_play`, `once_per_round`, `passive`) corresponda ao comportamento em runtime. Hoje há proxies admitidos e caminhos sem tick que fazem buffs/debuffs persistirem além do prometido pela carta — em especial:

- Buffs `until_end_of_round` aplicados na rodada que limpa a sala não expiravam (pulava `RoundEnded`). **Mitigação já no main** (patch hot-fix em `reward.ts`).
- Modificadores `until_end_of_combat` não tinham tick em `CombatEnded`. **Idem.**
- Inimigos derrotados não saíam do `world.entities`, mantendo `while_in_play → permanent` pendurado. **Idem** (em `damageSystem.ts`).

Este patch trata os buracos estruturais restantes.

**Princípio inegociável — descrição da carta = comportamento.**
> Para cada skill com `duration:`, a leitura humana do texto da carta deve casar com o que o motor executa. Onde não bate, ou o schema/efeito está errado, ou o motor está errado.

**Fora de escopo:**
- Reescrita do modelo ECS de modifiers (slots, stacking rules tipo `abnormal_type` do L2). Discutir em patch separado.
- Migrar tudo que ainda usa `script:` para DSL puro.

---

## Diagnóstico de referência

Buracos numerados (B1–B10) e descrição completa: ver mensagem do relatório que originou este patch (Auditoria do sistema de duração).

Resumo:

| Id | Buraco | Estado |
|---|---|---|
| B1 | `once_per_round` mapeia para `rounds {remaining: 1}` sem nenhum tick que decremente `remaining` | aberto |
| B2 | `while_in_play`/`passive` → `permanent` sem expiry atrelado a saída de jogo | parcialmente aberto |
| B3 | `op_passive` skills nunca são instaladas (installPassive não é chamado) | aberto |
| B4 | Triggers com cooldown são removidos por `consumeAfterFire` e nunca reinstalados ao reset do scope | aberto |
| B5 | Skills `op_triggered` com `evt_damage_taken` + `p_modifier ... while_in_play` empilham modificadores sem dedup | aberto |
| B6 | `evt_room_leave` mapeia para `CombatEnded` (semanticamente errado) | aberto |
| B7 | `evt_enter_play` mapeia para `CombatStarted` (não cobre criatura especial mid-combat) | aberto |
| B8 | Sala limpa pulava `RoundEnded` | fechado (hot-fix) |
| B9 | `CombatEnded` sem tick `end_of_combat` | fechado (hot-fix) |
| B10 | Inimigos derrotados não removidos do world | fechado (hot-fix) |

---

## Lote 0 — Auditoria completa das 88 skills (pré-requisito de E)

**Escopo:** varrer todas as 88 entries de `src/data/skills.yaml` cruzando com `src/data/skills.locale.pt-BR.yaml`, produzindo uma tabela única (Markdown ou CSV) com:

- `id`
- `category` (hero_skill, hero_power, monster_purple, item_skill, dungeon_skill, boss_skill)
- `operate_type`
- texto do `label` em pt-BR
- `duration` declarada no efeito (se houver)
- evento de trigger (se `op_triggered`)
- buraco detectado (B1–B7 ou "ok")
- recomendação de reescrita (mudar operate_type, mudar duration, etc.)

**Cobertura obrigatória:** todas as categorias — hero, monster, dungeon, item, boss.

**Saída:** `docs/issues/audit-skills-duracao.md` (uma tabela). Não muda código.

**Critério de aceite:**
- As 88 skills aparecem na tabela.
- Cada uma com classificação explícita (ok / B-id / precisa-decisao).
- Tabela é a fonte da verdade para o Lote E (e ajustes em A/B/C).

**Risco:** zero (documento).

---

## Lote A — Fechar o ciclo `once_per_round` (B1)

**Escopo:** introduzir tick de fim de rodada para `kind: "rounds"`, decrementando `remaining` e removendo quando zera.

**Mudanças:**
- `src/core/ecs/world.ts`: estender `tickModifierDurations(world, "end_of_round")` para também tratar `rounds`: decrementa `remaining`, remove se `remaining <= 0`. Função separada `decrementRoundsModifiers` se ajudar a manter coesão.
- Documentar em `src/core/README.md` o contrato de `rounds.remaining`.

**Critério de aceite:**
- Teste em `src/core/ecs/__tests__/modifier-durations.test.ts`: modifier `rounds {remaining: 2}` continua após 1 tick de `end_of_round`, com `remaining: 1`; some no segundo tick.
- Nenhuma skill em `skills.yaml` quebra (rodar suite).

**Risco:** baixo. Mudança aditiva no tick.

---

## Lote B — Definir comportamento real de `while_in_play` (B2)

**Escopo:** parar de mapear `while_in_play` para `permanent`. Introduzir scope `entity_removed` (ou nomear `entity_left_play`) e fazer tick quando a entidade que originou o modifier (campo `source` da skill) sai de jogo.

**Decisões a tomar antes:**
- O modifier rastreia entidade-fonte? Hoje `ModifierComponent.source` é o `skill.id` (string), não a entidade. Adicionar `sourceEntityId?: EntityId` ao componente, preenchido pelo resolver com `pending.source` ou similar.
- Remoção do escopo `permanent` para `while_in_play`: o ECS Duration ganha `{ kind: "while_source_in_play" }`.

**Mudanças:**
- `src/core/ecs/types.ts`: novo kind `while_source_in_play`. `ModifierComponent.sourceEntityId` opcional.
- `src/core/skills/dsl/evaluate.ts`, `src/core/effects/resolver.ts`: mapear `while_in_play` → novo kind, preencher `sourceEntityId`.
- `src/core/ecs/world.ts`: `tickModifierDurations` com novo scope `"source_removed"` percorre todos modifiers, remove os cujo `sourceEntityId` não está mais em `world.entities`.
- Chamar esse tick após `removeEntity` no `damageSystem` (defeat) e em qualquer outro ponto que remova entidade do world (verificar com grep).

**Critério de aceite:**
- Teste: inimigo X aplica modifier `while_in_play` em herói Y; remover X do world → modifier no Y some.
- O bug do chip duplicado "Proteção das Cinzas" sumir entre salas é o teste manual.

**Risco:** médio. Mexe em tipo do componente. Migração defensiva: tratar ausência de `sourceEntityId` como modifier órfão (loga warning, mantém comportamento atual).

---

## Lote C — Resgatar `op_passive` (B3)

**Escopo:** decidir se `op_passive` skills devem ser instaladas como modifiers permanentes no spawn da entidade ou removidas do schema (porque na prática, hoje, não fazem nada via DSL — só funcionam via `script:`).

**Opções:**
1. **Manter conceito** e chamar `installPassive(world, entityId, def, ref, state)` em [setup.ts:93](../../src/core/reducer/setup.ts:93) e [exploration.ts:225](../../src/core/reducer/exploration.ts:225), no mesmo loop de `installSkillTriggers`.
2. **Eliminar `op_passive`** do schema e converter skills atuais para `op_triggered` com gatilho `evt_enter_play` + `p_modifier ... while_in_play` (depende do Lote B).

**Recomendação:** opção 1 (menos churn de dados, e `installPassive` já existe).

**Mudanças (opção 1):**
- Adicionar chamada a `installPassive` nos dois pontos de instalação de skills.
- Confirmar que `installPassive` cobre os mesmos targets que o resolver de `p_modifier` (compare com `ecsTargetMap` em [resolver.ts:162](../../src/core/effects/resolver.ts:162)).
- Documentar em `src/core/skills/README.md` qual operate_type instala o quê.

**Critério de aceite:**
- Teste: herói com skill `op_passive` que dá `+1 hit_bonus` (criar fixture mínima) tem o modifier no world após `STARTED_GAME`.
- `skill_hunter_focus` e similares passam a refletir o esperado pela descrição (verificar caso a caso).

**Risco:** médio. Pode reintroduzir efeitos que estavam "silenciosamente desligados". Auditar lista de skills `op_passive` antes:

```
src/data/skills.yaml: linhas 91, 418, 527, 602, 981, 1083, 1194, 1319, 1576, 1585
```

---

## Lote D — Reinstalar triggers com cooldown ao reset do scope (B4)

**Escopo:** corrigir `consumeAfterFire` para que triggers com `cooldown: { scope: round|combat|room }` voltem a estar disponíveis quando o scope reseta.

**Opções:**
1. Em vez de remover o `TriggerComponent`, marcar como `consumed: true` e checar isso no firing. Resetar `consumed` em `RoundEnded`/`CombatEnded`/etc.
2. Usar o `oncePer` registry já existente em `state.combat.oncePer` (que já reseta por round/combat) como guard, sem mexer no componente.

**Recomendação:** opção 2 — alinha com como `useSkill` já marca cooldown ([dispatch.ts:66](../../src/core/skills/dispatch.ts:66)). O `consumeAfterFire` vira: "marca no `oncePer.<scope>[skillId::entityId]` em vez de remover o componente". A janela do bus consulta esse guard antes de disparar.

**Mudanças:**
- `src/core/events/bus.ts`: trocar `removeComponent` por escrita em `state.combat.oncePer.<scope>`.
- Adicionar checagem de guard antes de chamar `trigger.effect`.
- Manter `consumeAfterFire.scope === "game"` como remoção definitiva (sem reset).

**Critério de aceite:**
- Teste: trigger com `cooldown round` dispara na rodada 1, não dispara na 1 de novo, dispara na 2.

**Risco:** médio. Mexe na fundação de triggers reativos.

---

## Lote E — Dedup / non-stacking para modifiers triggered (B5)

**Escopo:** quando um trigger pré-dano (`evt_damage_taken`) escreve um `p_modifier ... while_in_play`, não empilhar — substituir ou ignorar se já existe modifier idêntico por `source`.

**Opções:**
1. **Resolver dedup no `addComponent`**: se já existe modifier com mesmo `source` + `target` + `sourceEntityId`, substitui em vez de pushar.
2. **Mudar o padrão das skills**: skills tipo `purple_ash_protection` deveriam ser `op_passive` (instalado no spawn), não `op_triggered` por dano. O trigger sobra para casos "uma vez no primeiro dano sofrido".
3. **Pre-damage hook one-shot**: o trigger NÃO escreve modifier; ele modifica direto o `amount` do evento `DamageAboutToBeDealt` na janela do bus.

**Recomendação:** opção 2 para os casos "reduz sempre" + opção 3 para casos "ao tomar dano, faça X que afeta este dano". Tabular skills atuais e classificar:

```
purple_ash_protection: deveria ser passive (sempre reduz)
skill_charred_plate: idem
purple_dark_brand: triggered (uma vez por X)
...
```

**Mudanças:**
- Auditoria do `skills.yaml` para classificar.
- Reescrever as que são "sempre reduz" como `op_passive` + `add_modifier ... while_in_play` (depende de Lote B + Lote C).
- Para as one-shot, deixar `op_triggered` com a semântica corrigida (precisa do mecanismo de "modificar evento" via `pre_damage_hook` — pode virar lote separado).

**Critério de aceite:**
- Teste de jogo (integration): criatura com Proteção das Cinzas sofre 3 ataques, redução é sempre `value`, nunca `value × n`.

**Risco:** alto. Mexe em vários YAMLs.

---

## Lote F — Mapeamentos semânticos de eventos (B6, B7)

**Escopo:** corrigir os mapeamentos errados em [installTriggers.ts:38-44](../../src/core/ecs/installTriggers.ts:38).

**Mudanças:**
- `evt_room_leave`: introduzir evento `RoomLeft` emitido em [exploration.ts](../../src/core/reducer/exploration.ts) ao trocar `currentRoom`. Mapear `evt_room_leave` para esse evento.
- `evt_enter_play`: introduzir evento `EntityEnteredPlay` emitido tanto em `handleStartCombat` (para criaturas iniciais) quanto em [spawn de specialCreature](../../src/core/reducer/exploration.ts:202) (para criaturas mid-room).

**Critério de aceite:**
- Triggers `evt_room_leave` não disparam em `CombatEnded` se o herói continua na mesma sala.
- Triggers `evt_enter_play` em criatura especial disparam quando ela aparece.

**Risco:** baixo-médio. Aditivo (novos eventos), mas requer revisão dos lugares onde já se usa o evento mal mapeado.

---

## Critério de aceite global

- [ ] Todos os testes existentes passam.
- [ ] Testes novos cobrem B1, B2, B3, B4 (B5 fica para Lote E, possivelmente patch separado).
- [ ] Auditoria manual de uma sample de 10 skills (5 passive, 5 triggered) confirma descrição vs comportamento.
- [ ] Painel de Influências Ativas em runtime não mostra mais buffs "órfãos" entre salas.

## Ordem sugerida de execução

1. **Lote 0 (auditoria) — primeiro de tudo.** Sem isso, E é cego.
2. Lote A (rápido, isolado).
3. Lote B (fundação para C e E).
4. Lote C (depende de B se opção 2; independente se opção 1).
5. Lote D (independente).
6. Lote F (independente).
7. Lote E por último (requer Lote 0 + A + B + C completos).

---

## Riscos / abertos

- Decidir antes de B: ECS Duration ganha kind novo, ou guardamos `sourceEntityId` separado?
- Decidir antes de D: o registry de `oncePer` mistura cooldown manual (de `useSkill`) com cooldown automático de trigger; convém namespacear?
- A reescrita do Lote E pode revelar skills cujo texto da carta já estava errado em relação à intenção do designer. Marcar e separar.
