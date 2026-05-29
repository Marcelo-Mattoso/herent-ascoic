# Refator de dados: do `label` ao AST de habilidade

Relatório consolidado das conclusões da conversa que partiu de [`labels-em-cards-json.html`](./labels-em-cards-json.html) e passou pelo [comparativo de prior art](./labels-em-cards-json-prior-art.md). Aqui o foco é prescritivo: o que precisa mudar, em qual ordem, com qual escopo.

Não é um patch — é o material para escrever um. Toda mudança proposta tem que ser confirmada em PR/decisão própria.

---

## 1. As três conclusões que destrancam o resto

Tudo que vem abaixo deriva de três acordos a que a conversa chegou. Vale checá-los antes de ler o resto:

**a) A `label` em `cards.json` é uma função sem compilador.** O jogador a lê como contrato; o designer a escreve como contrato; só o engine não a lê como contrato. Por isso ela pode mentir (Frasco) ou virar snapshot congelado (Fúria Rubra) sem nenhum alarme. Toda solução que mantenha texto livre como fonte de comportamento deixa esse problema vivo.

**b) A solução não é "derivar a label do código" — é eliminar a fronteira.** A descrição precisa virar **valor estruturado** que o core *avalia* e o renderizador *imprime*. Mesma árvore, duas projeções. Convergência por construção, não por disciplina. (Equivalente do modelo Forge/MTG, com o escape hatch já presente em [`handlers/script.ts`](../../src/core/skills/handlers/script.ts) cobrindo o que o AST não expressa.)

**c) "Skill" hoje significa quatro coisas diferentes.** O conceito-pai (`abilities.json` deveria se chamar assim), o slot passivo do herói (`card.skill`), o tipo TypeScript (`SkillDefinition`), e o termo informal para "qualquer habilidade ativa" colidem. O AST não pode entrar sem essa léxico estar limpo primeiro — senão a confusão é cristalizada no subsistema novo.

---

## 2. Quatro mudanças, três patches

A separação em patches é proposta de mitigação de risco — cada um tem critério de aceitação independente, pode ser mergeado isolado, e nenhum bloqueia o seguinte se o anterior parou no meio.

### Patch-11 — Rename léxico (ability vs skill)

Trabalho mecânico, sem mudança de comportamento. Objetivo: liberar a palavra "skill" para significar exatamente **uma** coisa (habilidade passiva de herói, no estilo L2).

**Arquivo de dados:**
- `src/data/skills.json` → `src/data/abilities.json`
- A key `abilities[]` dentro do JSON já existe — nada muda no schema interno.

**Tipos:**
- `SkillDefinition` → `AbilityDefinition`
- `SkillContext` → `AbilityContext` (manter `skillId` como nome do ID *opcional* dentro do context, ou renomear para `abilityId`; decisão estética)
- `SkillHandler` → `AbilityHandler`
- `SkillContinuation` → `AbilityContinuation`
- `TriggerName` fica como está (já é genérico)

**Diretórios e módulos:**
- `src/core/skills/` → `src/core/abilities/`
- `src/core/scripts/` fica (já é nome neutro)
- Imports em ~60 arquivos (grep confirmou — ver §4)

**O que NÃO renomeia neste patch:**
- Campos em `cards.json` (`skill`, `power`, `effect`, `purpleEffect`) — patch seguinte.
- Diretório `src/core/effects/` (esse é o effect stack, outro conceito — explicado em §5).
- `skill_xxx` IDs em `abilities.json` — manter por enquanto, são chaves estáveis usadas em outros lugares (`creatureHasSkill("skill_gelatinous_body")` em scripts). Renomear IDs é trabalho de migração de dados, não rename léxico, e fica fora do escopo deste patch.

**Critério de aceitação:** `npm test` verde, `tsc` verde, busca por `import.*Skill` em `src/` (exceto IDs `skill_xxx`) zerada. Comportamento idêntico em jogo.

**Tamanho estimado:** 1 PR grande mas mecânico. Horas, não dias.

---

### Patch-12 — Reorganização de slots por intenção

Aqui muda comportamento *de leitura* (e por consequência a UI), mas não muda regras de jogo. Objetivo: o slot de uma habilidade na carta deixar de depender do *tipo da carta* e passar a depender da *intenção/trigger* daquela habilidade.

**Esquema atual** (acoplado ao tipo da carta):

| Tipo de carta | Slots |
|---|---|
| `hero` | `skill` (passiva), `power` (ativa) |
| `creature` | `effect`, `purpleEffect` (só com despertar=4) |
| `item` | `effect` (mistura de passiva e ativa, depende do trigger) |
| `artifact` | `effect` (geralmente passiva) |
| `room` | `effect` (mistura) |
| `subboss` | `effect`, `purpleEffect` |

**Esquema proposto** (por intenção, igual em todas as cartas):

| Slot | Quando dispara | Hoje vem de |
|---|---|---|
| `passive` | sempre ativo enquanto em jogo (`while_in_play`, modificadores constantes) | `skill` (herói), `effect` (armadura, criatura passiva, artefato aura, sala passiva) |
| `active` | jogador escolhe usar — trigger `on_use` com guard (`once_per_game`, etc.) | `power` (herói), `effect` (poção, sala ativável) |
| `triggered` | dispara em evento — `before_attack`, `on_damage_taken`, `on_destroyed`, etc. | `effect` (criatura reativa, item de combate) |
| `awakened` | mesma coisa que os de cima, mas só vale em `despertar === 4` | `purpleEffect` |

A escolha entre `passive`/`active`/`triggered` é **determinada** pelo `trigger` da `AbilityDefinition` — não é informação nova, é classificação existente promovida a slot. `awakened` pode virar uma **flag** (`requiresAwakening: true`) em vez de um quarto slot, deixando o gate de despertar=4 em um único ponto no dispatcher em vez de espalhado.

**Migração de `cards.json`:**
- Toda carta passa a ter `passive?`, `active?`, `triggered?: AbilityRef[]` (array porque uma criatura pode ter mais de uma reação).
- Cada `AbilityRef` carrega `{ id: "ability_xxx", value?: number | string, requiresAwakening?: true }`. Sem texto, sem `name`, sem `label`. (Veja §3 sobre matar `label` — pré-requisito do patch-13.)
- Script de migração lê o `cards.json` atual e mapeia para o novo schema usando o `trigger` de cada ability referenciada. Determinístico, lintado, com diff revisável.

**O que muda na UI:**
- Os 4 componentes que leem ability (`HeroFocusPanel`, `CardDetailModal`, `InventarioGrupo`, e indireto via selectors) passam a iterar `card.passive ?? []`, `card.active ?? []`, `card.triggered ?? []` em vez de adivinhar entre `skill`/`power`/`effect`.
- Texto mostrado continua vindo do template renderizado (ou da `label` snapshot, se patch-13 ainda não entrou — convivem por uma janela).

**O que muda no dispatcher (`abilities/dispatch.ts`):**
- `collectActiveSkills` deixa de ter 5 ramos (hero+items / enemies / room / artifacts) e passa a iterar `passive[]`/`active[]`/`triggered[]` de cada entidade em jogo. Mais simples.
- Filtro de `awakened` vira um único `if (ref.requiresAwakening && state.despertar !== 4) continue` em vez de estar embutido na coleta de cada tipo de carta.

**Critério de aceitação:** todas as cartas migradas, dispatcher passa nos testes existentes, UI exibe as mesmas habilidades nos mesmos lugares. Comportamento de jogo idêntico.

**Tamanho estimado:** 1-2 PRs. O script de migração de `cards.json` é o ponto delicado — precisa de revisão humana carta a carta porque há ambiguidades reais (alguns `effect` de item são `passive`, outros são `triggered`, e o `trigger` da ability nem sempre desambígua).

---

### Patch-13 — AST de efeito (a substituição do `label`)

Esse é o coração do refator — onde a label deixa de existir como string e vira árvore avaliável + imprimível.

**Schema do AST.** Cada `AbilityDefinition` em `abilities.json` ganha um campo novo:

```json
"effectAst": {
  "kind": "deal_damage",
  "amount": 2,
  "target": { "kind": "enemy_creature" },
  "overrides": [
    { "when": { "kind": "target_has_ability", "id": "ability_gelatinous_body" },
      "set": { "amount": 3 } }
  ]
}
```

**Nome do campo:** não pode ser `effect` porque colide com `src/core/effects/` (stack de efeitos pendentes — explicado em §5). Sugestões: `effectAst`, `program`, `spec`, `recipe`. Decisão de naming a fechar antes do patch.

**`kind` iniciais** (cobrem o catálogo atual; estimativa baseada nos 37 handlers existentes):

| Categoria | Kinds | Handlers que substitui |
|---|---|---|
| Dano | `deal_damage`, `splash_damage` | `direct_damage`, `splash_damage`, `damage_bonus`, `damage_bonus_duration`, `prevent_damage`, `purple_damage_reduction` |
| Cura | `heal` | `heal`, `heal_block` |
| Dado | `dice_modify` | `dice_modification`, `diceFix`, `diceFix_damage`, `reroll`, `tohit`, `tohit_damage`, `tohit_penalty`, `mark_and_tohit` |
| Redirecionamento | `target_redirect` | `targetProtection`, `targetRedirect_or_tohit` |
| Armadura | `armor` | `armor`, `flee_block` |
| Masmorra | `dungeon_draw`, `dungeon_discard`, `dungeon_recover` | `dungeon`, `dungeonLevel`, `discardDungeon`, `discardDungeonLock`, `discardDungeon_prevention`, `recoverDungeon`, `item_or_discardDungeon` |
| Inventário | `draw_item`, `item_control` | `drawItem`, `itemControl`, `reward`, `token` |
| Composição | `choose_one`, `if`, `sequence` | `heal_or_damage_bonus`, `heal_or_survive` |
| Expressão | `mul`, `add`, `ref` | (usado dentro de `amount`/`value` em outros kinds — ex. Fúria Rubra: `mul(value, 3)`) |
| Escape | `script` | já existe ([`handlers/script.ts`](../../src/core/skills/handlers/script.ts)) |

Total: ~15 kinds + 3 nós de expressão. Cabe na cabeça e na manutenção.

**Componentes novos:**

1. **Tipos** — `src/core/abilities/ast/types.ts`: `EffectNode`, `ExprNode`, `ConditionNode`, união discriminada por `kind`.
2. **Evaluator** — `src/core/abilities/ast/evaluate.ts`: `evaluate(node, ctx) → GameState`. Função pura. Cada `kind` é um case do switch; cada case faz exatamente uma coisa e reusa primitivas existentes (`applyDamage`, `applyHeal`, etc.).
3. **Printer** — `src/core/abilities/ast/print.ts`: `print(node, ctx?) → string`. Caminha a mesma árvore produzindo PT. Determinístico (lintado igual aos scripts em `src/data/scripts`). Sem `Math.random`/`Date`. Quando `ctx` é fornecido, pode pré-resolver overrides para mostrar números reais ("causa 3 de dano" em vez de "causa 2-3"); quando não é, mostra a forma genérica.
4. **Catálogo de strings** — `src/data/abilities-text.json`: por `kind`, templates PT com slots (`"{amount} de dano direto a {target}"`). Mantido perto do printer, não dos dados de carta.

**Convivência durante a migração:**
- `AbilityDefinition` tem `effectAst?` opcional + `type` (antigo) obrigatório por uma janela.
- Dispatcher: se `effectAst` presente, chama `evaluate`; senão, chama handler antigo por `type`. Caminho duplo controlado.
- Cada `kind` migrado libera N handlers de uma vez. Quando o último handler antigo morre, o campo `type` morre junto, e `effectAst` vira obrigatório.

**Quando `label` de `cards.json` morre:** quando UI 100% consome `print(effectAst, ctx?)` ou `print(template)` (para abilities ainda não migradas) via `resolveAbilityText(...)`. A partir desse momento, o campo `label` em `cards.json` é removido por script. Lint impede ressurreição (a regra está descrita em §6).

**Critério de aceitação por kind migrado:** para cada `kind` adicionado:
1. Existe `evaluate` que produz o mesmo `GameState` que o handler antigo produziria, para todas as cartas que migraram para esse kind. Teste de paridade.
2. Existe `print` que produz string testável. Teste contra a label congelada (com tolerância de espaços/pontuação).
3. Frasco e Fúria Rubra existem como testes integrados: `expect(evaluate(...).enemy.hp)` e `expect(print(...))` no mesmo `it`. Se um passa e o outro não, falha.

**Tamanho estimado:** N PRs incrementais, um por `kind` ou grupo de `kind`. Patch-13 não é um PR — é o nome do esforço que entrega kind a kind.

---

## 3. O que acontece com `cards.json.label` em cada fase

| Fase | Status do campo `label` em `cards.json` |
|---|---|
| Hoje | fonte de leitura da UI; texto livre escrito por humano |
| Pós-11 (rename) | inalterado; só mudou nome de arquivo/tipo no lado da skill |
| Pós-12 (slots) | UI passa a usar `resolveAbilityText` que ainda pode cair em `label` como último recurso |
| Durante-13 (por kind) | abilities migradas exibem via `print(effectAst)`; não-migradas via `labelTemplate`; `label` snapshot deixa de ser consultado para abilities migradas |
| Pós-13 (completo) | campo removido de `cards.json`; lint bloqueia retorno; UI sempre exibe valor computado agora |

---

## 4. Pontos de leitura confirmados (verificação no código)

Grep em `src/` confirmou os pontos de impacto:

**Leem `.label` operacional** (precisam ir para `resolveAbilityText`):
- `src/ui/components/HeroFocusPanel.tsx`
- `src/ui/components/modals/CardDetailModal.tsx`
- `src/ui/components/InventarioGrupo.tsx`
- `src/ui/screens/Setup.tsx`
- `src/core/reducer/exploration.ts` (2 pontos)

**Consomem tipos `Skill*`** (renomeiam no patch-11): 60+ arquivos, dominados por `src/core/skills/` (37 handlers + dispatch + lookup + registry + targeting + useSkill + valueParsers + testes), 4 componentes UI, e referências dispersas em `src/core/data/`, `src/core/reducer/`, `src/core/state/`, `src/ui/store/`.

**Handlers (37 arquivos em `src/core/skills/handlers/`)** — listagem em §2/patch-13 mostra qual kind absorve qual handler.

**Schemas Zod / TS** — `src/core/data/skillTypes.ts`, `src/core/data/cardTypes.ts`, `src/core/data/skills.ts`: precisam ser editados em todos os três patches.

---

## 5. Colisão importante: `src/core/effects/` já existe

Durante a verificação detectei que `src/core/effects/` (com `stack.ts` e `resolver.ts`) **já é um subsistema do projeto** — implementa o effect stack para resolução ordenada de efeitos encadeados (cabeçalho do `stack.ts` cita "Passo 8: efeitos encadeados são enfileirados aqui em vez de aplicados imediatamente"). Há `EffectDescriptor` em `src/core/ecs/types.ts` e `PendingEffect` em `stack.ts`.

Implicação:

- O AST do patch-13 **não pode** se chamar `Effect` / morar em `src/core/effects/` — colide.
- Nome de campo na ability **não pode** ser `effect` puro — também colide com slot da carta (no schema atual) e com o conceito de runtime effect.
- Sugestões compatíveis: `effectAst` ou `program` ou `spec` para o campo; `src/core/abilities/ast/` para os módulos; `EffectNode` / `AbilityProgram` para o tipo (cabe na cabeça e não bate com nada).

Decisão de naming fica para o início do patch-13 mas precisa ser tomada antes de qualquer código novo.

---

## 6. Defesas que o refator precisa instalar

Sem as três regras abaixo, o sistema lentamente reabsorve a confusão antiga:

**a) Lint contra string operacional em `cards.json`.** Após patch-13, regra que recusa string em `cards.json` contendo dígito ou tokens de uma lista pequena (`causa|cure|ganha|se |sofre|dano|HP|alvo|...`). Falha de build. Mesmo espírito do lint atual que bloqueia `Math.random`/`Date` em `src/data/scripts`.

**b) Lint contra não-determinismo no printer.** O printer (`src/core/abilities/ast/print.ts`) é incluído nas mesmas regras de `src/data/scripts`: sem `Math.random`, `Date`, leituras externas. Texto exibido é função pura do AST + ctx.

**c) Teste de paridade evaluator ↔ printer.** Para cada `kind`, pelo menos um teste que avalia *e* imprime com o mesmo ctx, e cruza ambos. Esse é o teste que mata o Frasco — não como teste de regressão, mas como contrato estrutural: o que o jogador lê é exatamente o que aconteceu.

---

## 7. O que fica fora do escopo destes patches

Decisões que apareceram na conversa mas que não cabem aqui:

- **Localização para EN.** O `print` retorna PT-BR hoje. Se EN entrar, vira `print(node, ctx, locale)` com catálogo por idioma. Não bloqueia patch-13 — é fase posterior, e o desenho do catálogo de strings (§ patch-13) já facilita.
- **IDs `skill_xxx` virarem `ability_xxx`.** Migração de dados massiva, requer atualização em todos os scripts (`query.creatureHasSkill("skill_gelatinous_body")` vira `creatureHasAbility(...)`), em testes e em fixtures. Vale fazer um dia, não vale fazer junto com patch-11.
- **Refator de `purpleEffect` para flag `requiresAwakening`.** Mencionado como opção no patch-12; pode ficar como slot separado `awakened` se a migração com flag virar complicada. Decisão dentro do patch-12.
- **Catálogo de "verbos" do printer.** O tom/registro PT do texto exibido é decisão de game design, não de engenharia. O printer entrega a *forma*; o catálogo entrega a *voz*. Designer revisa o catálogo, não o código do printer.

---

## 8. Ordem recomendada e por quê

```
patch-11  (rename léxico)         →  patch-12  (slots por intenção)  →  patch-13  (AST por kind)
   1 PR mecânico                      1-2 PRs com revisão humana         N PRs incrementais
```

**Por que rename primeiro:** porque o AST vai introduzir conceitos novos (kind, evaluator, printer, AbilityProgram). Quanto mais limpa a base léxica antes, menos chance de o `skill`/`ability` ambíguo contaminar o subsistema novo. E porque rename é o patch que tem o menor risco e a maior pegada — fazê-lo cedo descomprime o resto.

**Por que slots antes do AST:** porque o AST vai ler `ability.effectAst` em um momento em que o dispatcher itera *quais* abilities de uma carta participam de um trigger. Se nesse momento o dispatcher ainda tem 5 ramos hardcoded por tipo de carta, qualquer mudança no AST se refrata em 5 lugares. Slots por intenção colapsa para um único caminho.

**Por que AST por último, e incremental:** porque é o único dos três que mexe em regras de jogo (mesmo que com paridade testada). O risco real está concentrado aqui, e a migração kind-a-kind permite reverter um kind sem reverter o subsistema inteiro.

---

## 9. Resumo executivo

| | Patch-11 | Patch-12 | Patch-13 |
|---|---|---|---|
| **O quê** | Rename `skill` → `ability` no léxico genérico | Slots por intenção (`passive`/`active`/`triggered`/`awakened`) em todas as cartas | AST de efeito (`effectAst`) substitui handler + label |
| **Comportamento muda?** | Não | Não (UI mostra o mesmo conteúdo) | Sim (mas com testes de paridade por kind) |
| **Dados mudam?** | Nome de arquivo (`skills.json` → `abilities.json`) | Schema de `cards.json` (slots) | Schema de `abilities.json` (campo `effectAst`); `label` morre |
| **Tamanho** | 1 PR grande mecânico | 1-2 PRs com revisão de migração | N PRs (~15 kinds) |
| **Resolve quê da issue original** | Confusão de nomes | Confusão de slots | Tudo o resto (label fantasma, divergências, especificação não-testável) |

O Frasco de Óleo Incendiário — o gatilho desta análise — só fica de fato consertado no patch-13, no kind `deal_damage` com nó `overrides`. Mas o caminho até lá passa por dois patches preparatórios que valem por si: o rename desentula nomes, e os slots desentulham estrutura. Sem eles, o patch-13 vira refator sobre fundação confusa.
