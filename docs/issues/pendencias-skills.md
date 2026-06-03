# Pendências de refactor

Itens identificados em discussão mas adiados. Sem prazo; revisitar quando houver janela.

---

## Remover `category` do schema de skill

**Status:** adiado. Discutido em 2026-06-02.

**Problema.** Toda skill em [src/data/skills.yaml](../../src/data/skills.yaml) carrega um campo `category` (`habilidade`, `poder_heroi`, `efeito_roxo_monstro`, `habilidade_item`, `habilidade_dungeon`, `habilidade_chefe`). Esse campo é **metadata de UI** (em qual slot da carta a skill aparece), mas mora dentro da definição de comportamento da skill — acoplando "o que a skill faz" com "onde ela é usada".

**Sintomas concretos.**
- Skills duplicadas só pra trocar `category`: `skill_forge_spoils` / `dungeon_skill_forge_spoils` e `skill_rekindled_forge` / `dungeon_skill_rekindled_forge` (mesmo efeito, mesmo trigger, IDs diferentes).
- Prefixo do ID (`skill_`, `power_`, `purple_`, `item_skill_`, `dungeon_skill_`, `boss_skill_`) já codifica a mesma informação.
- O core de regras não consulta `category` — só a UI ([HeroFocusPanel.tsx:163](../../src/ui/components/HeroFocusPanel.tsx:163), [CardDetailModal.tsx:43](../../src/ui/components/modals/CardDetailModal.tsx:43), [selectors.ts:227](../../src/ui/store/selectors.ts:227)) e [combat.ts:816](../../src/core/reducer/combat.ts:816) (busca do poder do herói). Os outros consumidores fazem `cardSkills(card.id)[0]`.
- Categoria é inferível do `card.type` do dono em todos os casos **exceto herói**, que tem 2 slots (`habilidade` vs `poder_heroi`).

**Validação externa (L2OFF).** O `skilldata.txt` de Lineage 2 não tem campo equivalente a `category` — comportamento (effect / operate_type / target_type / affect_scope / affect_object) fica na skill; contexto (quem é o dono, em que slot vai) fica fora. Mesma conclusão. Ver [docs/engine/v2/skill/l2off_skill_data.md](../engine/v2/skill/l2off_skill_data.md).

**Direção proposta.**
1. Tirar `category` de `SkillDefinition` ([skillTypes.ts:28](../../src/core/data/skillTypes.ts:28)) e do Zod schema ([dsl/schema.ts:317](../../src/core/skills/dsl/schema.ts:317)).
2. Adicionar `SkillRef.slot?: "habilidade" | "poder"` em [cardTypes.ts](../../src/core/data/cardTypes.ts) — só herói preenche; outros cards inferem o slot pelo `card.type`.
3. Marcar slot em cada `HeroCard` no `cards.json`.
4. Atualizar os 4 sites de UI/reducer pra filtrar por `ref.slot` em vez de `def.category`.
5. Consolidar skills duplicadas (`*_forge_spoils`, `*_rekindled_forge`, possivelmente outras).
6. Atualizar testes ([lookup.test.ts:10](../../src/core/skills/__tests__/lookup.test.ts:10), [schema-guard.test.ts:50](../../src/core/skills/dsl/__tests__/schema-guard.test.ts:50)) e [data/README.md:178](../../src/data/README.md:178).

**Cuidado.** `i_dispel` tem um arg chamado `category` ([resolver.ts:571](../../src/core/effects/resolver.ts:571), [evaluate.ts:268](../../src/core/skills/dsl/evaluate.ts:268)) — **é outro campo** (categoria de condição/status a remover, não slot de UI). Quando fizer o refactor, renomear um dos dois pra evitar confusão futura.

**Custo.** Pequeno-médio. Código é trivial (4 sites + tipos + testes). Esforço real está em (a) migrar `cards.json` marcando slot em cada herói sem trocar habilidade por poder, (b) varrer duplicatas pra consolidar refs.

**Quando voltar.** Antes do próximo lote de novas skills, ou quando aparecer demanda real de reutilizar uma mesma skill em contextos diferentes.

---

## Strings de UI cravadas em `i_choose_one.options[].label`

**Status:** ~~adiado~~ **resolvido em patch-22 lote B (2026-06-03)**.

**Problema.** Opções de escolha do jogador (`i_choose_one`) carregam o `label` como string PT-BR direto no efeito, violando o padrão do projeto (dados em inglês, tradução resolvida na UI):

```yaml
- kind: i_choose_one
  options:
    - label: Curar 2
      effect: [...]
    - label: +2 dano
      effect: [...]
```

Ocorrências em [src/data/skills.yaml](../../src/data/skills.yaml) linhas 210, 460, 780, 880, 1085, 1108, 1317 (e equivalentes no `skills.json`).

**Dois vícios.**

1. **i18n acoplada ao core, em idioma errado.** Padrão do projeto é dados em inglês com tradução resolvida na UI. Hoje o label está em PT-BR cravado no efeito, então: (a) o core fala português, (b) trocar o idioma da UI exige mexer em dados de jogo, (c) qualquer rename de label quebra a tradução.
2. **`label` vira `id` da opção** em [evaluate.ts:200](../../src/core/skills/dsl/evaluate.ts:200) (`id: opt.label`). Mudar a string PT-BR muda a identidade da opção e quebra `pendingSkillChoice` em jogo. Duas opções com `label` igual em skills diferentes colidem.

**Direção proposta.**
1. Cada `option` ganha `id` explícito e estável: `{ id: "heal_2", labelKey: "skill.opt.heal_2", effect: [...] }`.
2. UI resolve `labelKey` via tabela de strings (PT-BR hoje, outros idiomas depois).
3. `evaluate.ts` passa o `id` adiante, nunca o label.
4. Schema Zod ([dsl/schema.ts:180](../../src/core/skills/dsl/schema.ts:180)) força `id` obrigatório, `labelKey` obrigatório, `label` proibido.

**Custo.** Baixo. ~7 ocorrências no YAML, 1 ponto de evaluate, 1 modal ([SkillChoiceModal.tsx:33](../../src/ui/components/modals/SkillChoiceModal.tsx:33)), 1 schema, 1 teste.

**Quando voltar.** Junto com qualquer trabalho de i18n, ou antes se aparecer bug de colisão de label.

---

## Deletar `src/data/skills.json`

**Status:** ~~adiado~~ **resolvido em patch-22 lote C (2026-06-03)**.

**Problema.** Após a migração pra YAML, [src/data/skills.json](../../src/data/skills.json) virou cópia derivada/stale. O runtime carrega exclusivamente o YAML ([core/data/skills.ts:2](../../src/core/data/skills.ts:2) — `import yamlText from "../../data/skills.yaml?raw"`). Manter o JSON no repo:

- Confunde leitores sobre qual é a fonte da verdade.
- Cria risco de alguém editar o JSON achando que vale (não vale).
- Polui buscas (`grep category` retorna ~90 hits duplicados).

**Referências remanescentes.**
- `tools/card-port/migrate-cards.mjs` — script de migração antigo (linhas 11, 111, 119, 144). Provavelmente também obsoleto; verificar se ainda roda em algum fluxo antes de descartar.
- `docs/arquitetura-mvp1.md:518` — afirma que `skills.json` é fonte da verdade. Desatualizado.
- `docs/engine/v2/card_game_architecture.html:205` — diagrama menciona `skills.json`. Desatualizado.

**Direção.**
1. Confirmar que `tools/card-port/migrate-cards.mjs` não é mais usado (ou portar pra ler YAML).
2. `git rm src/data/skills.json`.
3. Atualizar docs pra apontar pra `skills.yaml`.

**Custo.** Trivial. Cuidado só com a verificação do migrate script.

**Quando voltar.** Próxima passada de limpeza, ou antes se causar confusão real.
