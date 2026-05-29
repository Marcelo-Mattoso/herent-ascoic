# Patch 13 — Refazer `cards.json`: o card referencia skills, a skill se autoclassifica

Brief de implementação auto-contido. Não depende de conversa prévia.

**Pré-requisitos:**
- **Patch-11** (ids canônicos) — `skill_xxx` / `power_xxx` / `purple_xxx` / `item_skill_xxx` / `dungeon_skill_xxx` / `boss_skill_xxx` como identificadores estáveis. Bloqueante.
- **Patch-12** (refazer `skills.json`: DSL ou script) — cada skill já declara comportamento (`effect` XOR `script`) e trigger no formato objeto `{ on, when?, limit? }`. Bloqueante: o card só pode virar referência pura depois que a skill é a fonte única de comportamento.

**Escopo deliberado:**
- Toca `src/data/cards.json`, `src/core/data/cardTypes.ts`, `src/core/skills/lookup.ts`, `src/core/skills/dispatch.ts` e os componentes de UI que leem slots.
- **Não renomeia** `cards.json` nem `skills.json`. Mantém os ids canônicos do patch-11.
- **Não altera comportamento de skill.** Comportamento é problema fechado no patch-12. Aqui só muda *quem aponta para quem* e *como o engine percorre*.

---

## Protocolo de execução (economia de tokens)

Quem implementa este patch trabalha **uma fase por vez** e gasta o mínimo de tokens:

- **Não releia arquivos.** O harness rastreia o estado pós-edição; `Edit` falha se o trecho não bater. Não reabra "para conferir".
- **Leia em paralelo, leia uma vez.** Dispare os `Read` de uma fase no mesmo turno.
- **Não leia `cards.json` inteiro.** É grande. A migração (Fase 2) é feita por **script** (`tools/card-port/migrate-cards.ts`) que processa o arquivo no disco — não por leitura+edição manual carta a carta. Revisão pós-migração é por amostragem + validação automática, não lendo o diff inteiro no contexto.
- **`Edit` (diff), nunca `Write` o arquivo todo** quando só um trecho muda.
- **Valide uma vez por fase.** `npm test` / `build` / `lint` ao fechar a fase — não após cada componente de UI. Lembrar: Fase 1+2 compartilham PR (o build só volta a compilar no fim da Fase 2), então não rode build entre elas.
- **Greps de aceite são comandos exatos.** Rode-os como escritos.
- **Relate em uma linha por fase.** Sem diffs grandes nem narração.
- **Não carregue contexto das fases seguintes** até chegar nelas.

---

## Diagnóstico

Hoje cada habilidade existe **duplicada** em dois lugares que precisam ser mantidos em sincronia à mão:

**No card** (`cards.json`), cada slot é um `Ability` completo:

```json
"skill": {
  "skillId": "skill_last_light_healing",
  "name": "Cura da Última Luz",
  "value": 3,
  "type": "heal",
  "trigger": "on_use",
  "target": "hero_or_ally_creature",
  "text": "cure 3 de vida de um herói ou criatura aliada.",
  "label": "Cura da Última Luz (3): cure 3 de vida de um herói ou criatura aliada."
}
```

**Na skill** (`skills.json`), a mesma habilidade tem `type`, `trigger`, `target`, `labelTemplate`, `textTemplate` — e um array `usedBy: [{ cardId, field, value }]` apontando de volta para os cards.

Resultado:
- `type`, `trigger`, `target` aparecem **dos dois lados**. Quando divergem, ninguém sabe quem vence (na prática `lookup.ts` diz "catálogo vence", mas o card continua carregando o valor velho que ninguém lê).
- `label` no card é texto livre que **deveria** descrever o que a skill faz, mas não tem compilador — é a dor original (`docs/issues/labels-em-cards-json.html`).
- `usedBy` é um índice reverso mantido à mão. Adicionar uma carta que usa a skill exige editar **os dois arquivos**. Esquecer um lado = bug silencioso.
- O slot (`skill` / `power` / `effect` / `purpleEffect`) carrega **três informações fundidas**: (a) que a carta usa aquela skill, (b) a classificação ativa/passiva, (c) a posição de layout na UI. O dispatcher desembrulha isso em **5 branches hardcoded por tipo de carta** (`src/core/skills/dispatch.ts`, `collectActiveSkills`).

Depois do patch-12, `skills.json` é a fonte única de **comportamento**. Falta fazer `cards.json` ser a fonte única de **composição** (que carta usa que skill), e parar de duplicar o resto.

---

## Objetivo

Fazer o card **só referenciar** as skills que usa. A skill se autoclassifica (ativa/passiva, slot de UI) a partir de dados que ela já tem (`category`, `trigger`). O índice `usedBy` passa a ser **derivado** de `cards.json`, não mantido à mão.

Ao final:
- Cada carta tem `skills: SkillRef[]` no lugar dos slots tipados (`skill`/`power`/`effect`/`purpleEffect`).
- `SkillRef` carrega só o que é específico **daquela carta**: o `skillId`, `params` opcionais (override de valores), e `requiresAwakening?` para o efeito roxo.
- `type`, `trigger`, `target` **somem do card** — vivem só na skill.
- `label`/`text` exibidos pela UI são **derivados** de `labelTemplate`/`textTemplate` da skill + `params` da carta. Fim do texto livre duplicado.
- `usedBy` em `skills.json` é gerado (ou removido — vira derivação em runtime).
- `dispatch.ts` colapsa os 5 branches em **um loop** sobre as cartas em jogo.
- `SkillField` (`"skill"|"power"|"effect"|"purpleEffect"`) morre como conceito de runtime.

---

## Forma das entradas pós-patch

### Card (herói)

Antes — dois slots, cada um um `Ability` duplicado:

```json
{
  "id": "hero_eternal_rest_cleric",
  "type": "hero",
  "name": "Clérigo do Descanso Eterno",
  "diceByColor": [1, 1, 2, 2, 3],
  "life": [9, 11, 13, 15, 17],
  "hitBonus": [4, 5, 7, 10, 14],
  "damage": 2,
  "skill": { "skillId": "skill_last_light_healing", "value": 3, "type": "heal", "trigger": "on_use", ... },
  "power": { "skillId": "power_greater_last_light_miracle", "value": "full/1", "type": "heal_or_survive", ... },
  "style": "suporte, cura, sobrevivência, Última Luz."
}
```

Depois — referência pura:

```json
{
  "id": "hero_eternal_rest_cleric",
  "type": "hero",
  "name": "Clérigo do Descanso Eterno",
  "diceByColor": [1, 1, 2, 2, 3],
  "life": [9, 11, 13, 15, 17],
  "hitBonus": [4, 5, 7, 10, 14],
  "damage": 2,
  "skills": [
    { "skillId": "skill_last_light_healing", "params": { "amount": 3 } },
    { "skillId": "power_greater_last_light_miracle" }
  ],
  "style": "suporte, cura, sobrevivência, Última Luz."
}
```

A UI sabe que `skill_last_light_healing` vai no slot "habilidade" e `power_greater_last_light_miracle` no slot "poder" porque a **skill** declara `category: "habilidade"` vs `category: "poder_heroi"` (já existe em `skills.json`). O card não repete isso.

### Card (criatura com efeito roxo)

```json
{
  "id": "creature_xxx",
  "type": "creature",
  "skills": [
    { "skillId": "skill_creature_passive" },
    { "skillId": "purple_creature_awakened", "requiresAwakening": true }
  ]
}
```

`requiresAwakening: true` substitui a regra hardcoded `if (field === "purpleEffect" && state.despertar !== 4) continue` de `dispatch.ts`. O gate fica declarado no card.

### `SkillRef` — schema

```ts
export interface SkillRef {
  readonly skillId: string;
  // Override dos params default da skill (patch-12). Específico desta carta.
  readonly params?: Readonly<Record<string, number | string>>;
  // Só dispara com Despertar = 4. Substitui o slot "purpleEffect".
  readonly requiresAwakening?: boolean;
}
```

Regras:
- **`skillId` é obrigatório e tem que existir em `skills.json`.** Schema valida no load (guard rail).
- **`params` sobrescreve os defaults da skill.** É o sucessor do `value`/`usedBy[].value` legado. Carta que usa a skill com número diferente declara aqui. Carta que usa o default omite.
- **Sem `type`/`trigger`/`target`/`label`/`text` no card.** Quem quer saber o que a skill faz lê `skills.json[id].effect`/`.script` (patch-12). Quem quer exibir lê `labelTemplate` + `params`.

---

## Classificação ativa/passiva: derivada, não declarada

O usuário quer que **a skill saiba** se é ativa ou passiva, e o card só diga que a usa. Isso já é derivável do que a skill tem:

- **Ativa** (jogador escolhe usar): `trigger.on === "on_use"` (e variantes de uso explícito). É o que a UI mostra como botão clicável.
- **Passiva/reativa** (dispara sozinha): qualquer outro `trigger.on` (`before_attack`, `on_damage_taken`, `while_in_play`, `on_destroyed`, ...).

E o slot de UI (onde renderizar) deriva de `category`:

| `category` (skills.json)  | Slot de UI / origem                      |
| ------------------------- | ---------------------------------------- |
| `habilidade`              | slot "habilidade" do herói               |
| `poder_heroi`             | slot "poder" do herói                    |
| `efeito_roxo_monstro`     | efeito roxo (requer `requiresAwakening`) |
| `habilidade_item`         | efeito do item                           |
| `habilidade_dungeon`      | efeito da carta de masmorra              |
| `habilidade_chefe`        | habilidade do chefe                      |

Nenhuma dessas classificações precisa de campo novo: `trigger.on` + `category` já carregam tudo. O card só lista `skillId`s.

---

## `usedBy` derivado

Hoje `lookup.ts` constrói o índice a partir de `SKILLS.abilities[].usedBy[]` (skill → cards). Depois do patch-13, a verdade está em `cards.json` (cards → skills), então o índice se inverte:

```ts
// Constrói cardId → SkillRef[] e skillId → cards que a usam, varrendo cards.json.
for (const card of CARDS) {
  for (const ref of cardSkillRefs(card)) {
    bySkillId.get(ref.skillId)?.push(card.id) ?? bySkillId.set(ref.skillId, [card.id]);
    byCardId.get(card.id)?.push(ref) ?? byCardId.set(card.id, [ref]);
  }
}
```

`usedBy` em `skills.json` vira **redundante**. Duas saídas possíveis (decidir na Fase 0):
- **(a) Remover** `usedBy` de `skills.json`. Quem precisa de "quem usa a skill X" pergunta ao índice derivado (`skillUsedBy(skillId)`).
- **(b) Gerar** `usedBy` como artefato derivado num script de build (`tools/skill-port/gen-usedby.ts`) e um teste no CI que falha se `skills.json` divergir de `cards.json`. Útil só se algum consumidor externo (doc, ferramenta) ler `usedBy` estaticamente.

Recomendação: **(a)**. Menos coisa para sincronizar é o ponto do patch. Resgatar (b) só se aparecer consumidor externo.

---

## Plano em fases

### Fase 0 — Inventário e mapa card → skills

1. Varrer `cards.json` e produzir `tools/card-port/card-skill-map.md`: para cada carta, listar os slots atuais (`skill`/`power`/`effect`/`purpleEffect`), o `skillId` de cada um, e o `value` atual (vira `params`).
2. Cruzar com `skills.json`: confirmar que todo `skillId` referenciado existe e que todo `value` do card mapeia para um `params` nomeado da skill (patch-12 nomeou os params; aqui mapeamos `value` → `{ <param>: value }`).
3. Listar divergências `type`/`trigger`/`target` card-vs-skill descobertas (devem ser todas "card está velho, skill vence" — registrar para confirmar que nada se perde).
4. Decidir (a) vs (b) para `usedBy`.

**Aceite:** mapa completo, todo `skillId` resolve, todo `value` tem `param` destino. Lista de divergências revisada.

---

### Fase 1 — Tipos e schema

1. `src/core/data/cardTypes.ts`: adicionar `SkillRef`. Trocar os campos `skill`/`power` (herói), `effect`/`purpleEffect` (criatura/subboss), `effect` (room/item/artifact), e o `effect` dentro de `BossAbility` por `skills: readonly SkillRef[]`.
2. Remover a interface `Ability` (ou esvaziar para só o que sobrar, se algo sobrar — provavelmente nada).
3. Schema Zod do loader de `cards.json` (`src/core/data/cards.ts`): exigir `skills: SkillRef[]`, rejeitar slots antigos (`skill`/`power`/`effect`/`purpleEffect`), validar que cada `skillId` existe em `skills.json`.
4. `src/core/data/skillTypes.ts`: remover `SkillField` e `SkillUsage.field`. `SkillUsage` inteiro provavelmente morre (era o `usedBy`).

**Aceite:** tipos compilam contra um `cards.json` ainda não migrado? Não — esta fase quebra o build de propósito até a Fase 2 migrar os dados. Fazer Fase 1 + 2 no mesmo PR.

---

### Fase 2 — Migrar `cards.json`

1. Script de migração `tools/card-port/migrate-cards.ts` que, guiado pelo mapa da Fase 0, reescreve cada carta: coleta os slots, emite `skills: [{ skillId, params?, requiresAwakening? }]`, dropa `type`/`trigger`/`target`/`label`/`text`/`name`/`value` dos slots.
   - `purpleEffect` → entrada com `requiresAwakening: true`.
   - `value` do slot → `params` (usando o mapa `value → param` da Fase 0).
2. Rodar, revisar diff carta a carta (é grande — revisar por amostragem + validação automática).
3. Validação: todo `skillId` no `cards.json` migrado existe em `skills.json`; contagem de skills por carta bate com a contagem de slots não-vazios antes.

**Aceite:** `cards.json` migrado, schema Zod aceita, build volta a compilar.

---

### Fase 3 — `lookup.ts` invertido

1. Reescrever `lookup.ts` para construir o índice a partir de `CARDS` (cards → skills), não de `SKILLS.abilities[].usedBy`.
2. Substituir a API:
   - `resolveSkillForById(cardId, field)` → `cardSkills(cardId): { def: SkillDefinition; ref: SkillRef }[]` (sem `field`).
   - `resolveSkillValueById(cardId, field)` → some; o valor vem de `ref.params` + defaults da skill (patch-12).
   - `lookupSkillById(id)` permanece.
   - Adicionar `skillUsedBy(skillId): string[]` se a decisão da Fase 0 foi (a).
3. Remover os caches por `cardName` (`_byCardName`) e os helpers `resolveSkillFor`/`resolveSkillValue` (path deprecated por nome). Confirmar zero callers primeiro.

**Aceite:** `lookup.ts` não referencia mais `usedBy` nem `field`. Testes de resolução verdes.

---

### Fase 4 — Colapso do `dispatch.ts`

`collectActiveSkills` deixa de ter 5 branches por tipo de carta. Vira um loop sobre as **fontes em jogo** (heróis ativos + itens equipados + inimigos ativos + sala + artefatos), e para cada fonte percorre `card.skills`:

```ts
function collectActiveSkills(state, eventName) {
  const out = [];
  for (const { card, sourceHeroId, sourceEnemyId } of inPlaySources(state, eventName)) {
    for (const ref of cardSkills(card.cardId)) {
      const def = ref.def;
      if (ref.requiresAwakening && state.despertar !== 4) continue;
      if (def.trigger.on !== eventName) continue;          // patch-12: trigger é objeto
      out.push({ definition: def, ref, sourceHeroId, sourceEnemyId });
    }
  }
  return out;
}
```

- `inPlaySources` centraliza a ordem de resolução documentada no topo do arquivo (heróis → itens → inimigos → sala → artefatos). A ordem **se preserva**.
- O gate de `purpleEffect` vira `ref.requiresAwakening` — não há mais menção a "field".
- A filtragem por trigger usa `def.trigger.on` (patch-12). `parseTrigger` e os aliases compostos já morreram no patch-12; aqui só se consome o objeto.
- `guardPassed`/`markGuardUsed` (once_per_X) → já são `trigger.limit` no patch-12; `dispatch` chama o `resolveTrigger`/checagem de limit do patch-12 em vez da lógica local. Remover a cópia local de guards daqui.
- `fireTrigger` chama o dispatcher do patch-12 (`evaluate(effect)` ou `getScript(skillId).run`) — `getHandler(skill.definition.type)` já não existe (patch-12, Fase 7).

**Aceite:** `dispatch.ts` tem um loop, não cinco. Smoke test e testes de trigger (`skills_new_triggers.test.ts`) verdes. Ordem de resolução inalterada (teste que cubra herói→item→inimigo).

---

### Fase 5 — UI lê do catálogo, não do slot

Os três componentes que leem `card.<slot>.label` passam a resolver via skill + render do template.

1. Helper `renderSkillLabel(ref): string` — pega `skills.json[ref.skillId].labelTemplate`, interpola `ref.params` (com defaults da skill), retorna a string. Idem `renderSkillText`.
2. `src/ui/components/HeroFocusPanel.tsx` (`heroCard.skill.label`, `heroCard.power.label`) → iterar `heroCard.skills`, agrupar por `category` (`habilidade` vs `poder_heroi`), renderizar via helper.
3. `src/ui/components/modals/CardDetailModal.tsx` (lê `skill`/`power`/`effect`/`purpleEffect`.label em vários ramos por `card.type`) → iterar `card.skills`, agrupar/rotular por `category` + `requiresAwakening` (efeito roxo).
4. `src/ui/components/InventarioGrupo.tsx` — `card.effect.label.includes("portador")` (linha ~58) e `const effect = card.effect.label` (linha ~1104) → resolver via `card.skills[0]` + helper, ou via flag declarada na skill se a detecção de "portador" merecer deixar de ser match de string.
5. `src/ui/screens/Setup.tsx` — checar uso de `Ability`/slots e migrar.

**Aceite:** UI renderiza labels idênticas (ou melhores) às de antes. Nenhum componente referencia `Ability` nem slots tipados.

---

### Fase 6 — Limpeza e guard rails

1. `grep` por `\.skill\b`, `\.power\b`, `\.purpleEffect\b`, `card.effect`, `Ability`, `SkillField`, `usedBy` em `src/` → zero (fora de comentários/CHANGELOG).
2. Guard rail de schema: `cards.json` com slot antigo = build red.
3. Guard rail de integridade referencial: todo `skillId` em `cards.json` existe em `skills.json`, e (se decisão (a)) toda skill em `skills.json` é referenciada por ≥1 carta **ou** marcada como órfã intencional. Teste no CI.
4. Se decisão (b) para `usedBy`: teste que regenera e compara.

**Aceite:** `npm test`, `npm run build`, `npm run lint` passam. Greps zerados.

---

## Restrições e regras

1. **Comportamento não muda aqui.** Patch-13 é refactor de composição/referência. Qualquer mudança de comportamento é bug — investigar, não normalizar.
2. **A skill é a fonte única de comportamento e display-template; o card é a fonte única de composição.** Sem duplicação de `type`/`trigger`/`target`/`label` no card.
3. **`SkillRef` carrega só o que é específico da carta:** `skillId`, `params`, `requiresAwakening`. Nada que pertença à skill.
4. **Ativa/passiva e slot de UI são derivados** de `trigger.on` e `category`. Não criar campo novo para isso.
5. **`usedBy` deixa de ser mantido à mão.** Derivar de `cards.json` (preferido) ou gerar com teste de paridade.
6. **Ordem de resolução do dispatcher preservada** (heróis → itens → inimigos → sala → artefatos). O colapso muda a estrutura, não a ordem.
7. **Integridade referencial validada no load.** `skillId` órfão = erro de schema, não warning silencioso.

---

## Decisões explícitas

- **Por que `skills: SkillRef[]` flat, e não manter slots nomeados.** O slot fundia três coisas (uso, classificação, layout). Classificação e layout derivam de `category`/`trigger`; uso é o array. Slot nomeado seria repetir no card uma informação que a skill já tem.
- **Por que `requiresAwakening` no card, e não na skill.** O efeito roxo é uma propriedade de *como aquela carta usa* a skill (gate de Despertar = 4), não da skill em si. Fica no `SkillRef`.
- **Por que label derivado de template, e não string no card.** É o fim da dor original (`labels-em-cards-json.html`): label como texto livre divergente. Template + params = uma fonte, renderizada. Resolve a divergência sem reintroduzir comportamento no display.
- **Por que `usedBy` derivado.** Índice reverso mantido à mão é sincronização redundante e fonte de bug silencioso. A verdade (cards → skills) está em `cards.json`; o reverso se calcula.
- **Por que Fase 1+2 no mesmo PR.** A troca de tipos quebra o build até os dados migrarem. Não há meio-termo compilável que valha um PR separado.

---

## Definição de pronto

- [ ] Fase 0: mapa card→skill completo, todo `skillId` resolve, todo `value` mapeia para `param`, decisão (a)/(b) tomada.
- [ ] Fase 1: `SkillRef` em `cardTypes.ts`, slots removidos, `Ability`/`SkillField`/`SkillUsage` mortos, schema Zod novo.
- [ ] Fase 2: `cards.json` migrado, schema aceita, build compila.
- [ ] Fase 3: `lookup.ts` invertido (cards → skills), sem `field`/`usedBy`, sem caches por nome.
- [ ] Fase 4: `dispatch.ts` colapsado em um loop, ordem preservada, gate de Despertar via `requiresAwakening`.
- [ ] Fase 5: HeroFocusPanel, CardDetailModal, InventarioGrupo, Setup renderizam via catálogo.
- [ ] Fase 6: greps zerados, guard rails de schema/integridade no CI.
- [ ] `npm test`, `npm run build`, `npm run lint` passam.

---

## Convenção de commit

Conforme `CLAUDE.md`: mensagens em PT-BR, **sem** linha `Co-Authored-By: Claude`. Um commit por fase. Sugestão:

- `docs(card-port): mapa card→skill e decisão usedBy (Fase 0)`
- `refactor(cards): SkillRef e schema, remover slots tipados (Fase 1)`
- `refactor(cards): migrar cards.json para skills[] (Fase 2)`
- `refactor(skills): lookup invertido cards→skills (Fase 3)`
- `refactor(skills): colapsar dispatch em loop único (Fase 4)`
- `refactor(ui): renderizar labels do catálogo de skills (Fase 5)`
- `feat(lint): integridade referencial card↔skill (Fase 6)`
