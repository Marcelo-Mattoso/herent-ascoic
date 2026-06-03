# Patch 24 — Atualizar todos os READMEs

Brief auto-contido. Não depende de conversa prévia.

**Pré-requisitos:** nenhum (só leitura + escrita de documentação).

**Objetivo:** trazer os READMEs do projeto para a realidade do código atual. Hoje há defasagens conhecidas — caminhos antigos, formatos abandonados, padrões já migrados — e nenhum manda o leitor para a documentação viva (`docs/patches/`, `docs/issues/`, `docs/engine/`).

**Princípio inegociável — README = mapa fiel.**
> README descreve o que existe, não o que existia. Toda afirmação verificável precisa bater com o estado atual da árvore. Toda afirmação sobre futuro vai para `docs/issues/`, não para README.

**Fora de escopo:**
- Criar READMEs novos em subpastas que não têm hoje (proposto em patch separado se necessário).
- Reescrever `CLAUDE.md` (regras de comportamento, vive separado).
- Documentação de API exportada (typedoc ou similar).

---

## Inventário dos READMEs

| Caminho | Atualizar? | Notas |
|---|---|---|
| `README.md` (raiz) | sim | Visão geral do projeto, requisitos, como rodar. |
| `src/core/README.md` | sim | Motor de jogo. Tem defasagens em arquitetura ECS, eventos, durações. |
| `src/data/README.md` | sim | Fala de `skills.json` e `cards.json` — hoje é `skills.yaml` + `cards.*` + `skills.locale.pt-BR.yaml`. |

Verificar com `git ls-files '*/README.md'` se nenhum foi esquecido na lista acima antes de começar.

---

## Lote A — README raiz (`README.md`)

**Escopo:** revisão de exatidão técnica e de pitch.

**Checklist do conteúdo:**
- [ ] Nome/versão atual do MVP (cruzar com `package.json`).
- [ ] Resumo de gameplay em 1-2 parágrafos (não vender, descrever).
- [ ] Requisitos de runtime (Node, pnpm/npm) — checar versões reais em `package.json`/`engines`.
- [ ] Como rodar localmente (`dev`, `build`, `test`).
- [ ] Estrutura de pastas em alto nível com link para os READMEs internos.
- [ ] Link para `docs/arquitetura-mvp1.md`, `docs/spec-telas-mvp1.md`, `docs/patches/` (índice por padrão de organização do projeto).
- [ ] Tabela ou bullet curto de "onde estão as regras" → `src/core`.

**Critério de aceite:**
- Cada comando documentado roda limpo num clone do zero (testar `pnpm install && pnpm dev`).
- Nenhum link quebrado (rodar checador simples ou validar manualmente).
- Nada inventado: se a feature não existe ou está em refactor, marcar como tal.

---

## Lote B — `src/core/README.md`

**Escopo:** sincronizar com a arquitetura efetivamente implementada após patches 18–23.

**Itens a auditar:**
- [ ] Modelo ECS (`World`, `Entity`, `Component`) — descrição vs `src/core/ecs/types.ts` e `world.ts`.
- [ ] Reducers (`src/core/reducer/*`) — listar handlers principais e seus statuses (cruzar com `src/core/state/status.ts`).
- [ ] Event bus (`src/core/events/bus.ts`) — nome dos eventos, regras de ordem (FIFO/LIFO em `src/data/event_rules.json`).
- [ ] Sistema de skills DSL — vocabulário v2 (`i_/p_/op_/nat_/tgt_/scp_/obj_/evt_`), efeitos suportados, mapeamento de duração (apontar para o patch-23 para detalhes do duration system).
- [ ] Tabela de Duration kinds (DSL → ECS) com link para `tickModifierDurations`.
- [ ] Status discriminado (`GameStatus`) — citar lista atual ou linkar.
- [ ] Projeção (`src/core/projection/`) — explicar contrato UI ↔ core.
- [ ] Triggers ECS — install paths (`installSkillTriggers`, futuramente `installPassive` se Lote C do patch-23 entrar).
- [ ] Referência rápida para `docs/engine/v2/` (arquitetura), `docs/patches/`, `docs/issues/`.

**Critério de aceite:**
- Cada arquivo ou conceito citado existe no caminho indicado.
- Onde há sistema parcialmente implementado, README diz isso explicitamente e linka issue/patch.
- Sem afirmação sobre comportamento que conflite com patch-23 (durations).

---

## Lote C — `src/data/README.md`

**Escopo:** refletir formato YAML, locale split, vocabulário v2.

**Itens a auditar:**
- [ ] Substituir referência a `skills.json` por `skills.yaml`.
- [ ] Documentar `skills.locale.pt-BR.yaml` — papel, formato, como acrescentar idioma.
- [ ] Listar formatos de cartas (`cards.*` — confirmar quais arquivos existem hoje).
- [ ] Vocabulário v2 com tabela ou link para `src/core/skills/dsl/types.ts`.
- [ ] Explicar `script:` legado e quando ainda é necessário (até a migração concluir).
- [ ] `event_rules.json` — onde vive, o que controla.
- [ ] Link para a auditoria de skills produzida em patch-23 Lote 0 (`docs/issues/audit-skills-duracao.md`) quando existir.

**Critério de aceite:**
- Nenhuma menção a `skills.json` como fonte ativa.
- Exemplo mínimo de YAML de skill, validado contra schema atual.
- Caminhos referenciados existem.

---

## Critério de aceite global

- [ ] Todos os READMEs listados foram revisados linha a linha.
- [ ] Nenhum link interno quebrado.
- [ ] Build do projeto continua passando (sanity: READMEs não devem afetar build, mas algumas pipelines validam markdown).
- [ ] Pull request descreve o que mudou em cada arquivo (resumo + diff direto).

## Riscos / abertos

- Risco de "documentar o desejado" em vez do real. Mitigação: cada afirmação técnica precisa de referência a arquivo/linha ou ser eliminada.
- Possível overlap com `docs/arquitetura-mvp1.md`: decidir se `src/core/README.md` resume e linka, ou se duplica. Recomendação: README resume em altura de zoom maior, linka para o doc detalhado.
- `docs/engine/v2/*.html` são documentos longos de design — não mexer aqui, apenas referenciar.
