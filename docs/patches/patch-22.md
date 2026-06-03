# Patch 22 — Limpeza de inglês/duplicação no schema de skills

Brief auto-contido. Não depende de conversa prévia.

**Pré-requisitos:**
- Patch-20 completo (locale split em `src/data/skills.locale.pt-BR.yaml` existe e funciona).
- Patch-21 completo (vocabulário v2 adotado: prefixos `i_/p_/op_/nat_/tgt_/scp_/obj_/evt_`).

**Objetivo:** padronizar dados de skill em inglês e remover artefato morto. Três frentes ortogonais reunidas porque são pequenas e relacionadas — todas atacam "dados não conformam ao padrão do projeto".

**Por quê:**
- `category` é o último campo com valores em PT-BR no `skills.yaml` (`habilidade`, `poder_heroi`, `efeito_roxo_monstro`, etc.). Padrão do projeto é dados em inglês, tradução resolvida em locale.
- `i_choose_one.options[].label` ainda carrega strings PT-BR cravadas no efeito (`"Curar 2"`, `"+2 dano"`). Além de violar o padrão, o `label` vira `id` da opção em [evaluate.ts:200](../../src/core/skills/dsl/evaluate.ts:200) — renomear quebra estado pendente.
- `src/data/skills.json` virou cópia stale após migração pra YAML. Runtime carrega só YAML ([core/data/skills.ts:2](../../src/core/data/skills.ts:2)); JSON polui buscas e confunde leitores.

**Princípio inegociável — comportamento de jogo intacto.**
> Vocabulário e organização. Nenhum teste de motor muda assert.

**Fora de escopo:**
- Remover `category` em si (mover slot pra `SkillRef.slot` no card). Tratado em [pendencias-skills.md](../issues/pendencias-skills.md), patch separado.
- i18n para outros idiomas além de PT-BR. Estrutura prepara, conteúdo só PT-BR por enquanto.

---

## Lote A — Traduzir valores de `category` para inglês

**Escopo:** renomear os 6 valores de `category` para inglês, sem mudar o significado.

**Mapeamento:**

| Atual (PT) | Novo (EN) |
|---|---|
| `habilidade` | `hero_skill` |
| `poder_heroi` | `hero_power` |
| `efeito_roxo_monstro` | `monster_purple` |
| `habilidade_item` | `item_skill` |
| `habilidade_dungeon` | `dungeon_skill` |
| `habilidade_chefe` | `boss_skill` |

**Passos:**
1. Atualizar `SkillCategory` em [skillTypes.ts:28](../../src/core/data/skillTypes.ts:28) — enum dos 6 valores novos.
2. Atualizar Zod enum em [dsl/schema.ts:317](../../src/core/skills/dsl/schema.ts:317).
3. Substituir os 6 valores em `src/data/skills.yaml` (replace global, ~90 ocorrências).
4. Substituir os 6 valores em `src/data/skills.json` (se ainda existir após Lote C). Em paralelo ao Lote C — se C remover o arquivo, pular aqui.
5. Atualizar comparações em código:
   - [selectors.ts:227](../../src/ui/store/selectors.ts:227) `=== "habilidade"` → `=== "hero_skill"`
   - [HeroFocusPanel.tsx:163,166](../../src/ui/components/HeroFocusPanel.tsx:163) → idem
   - [CardDetailModal.tsx:43,46](../../src/ui/components/modals/CardDetailModal.tsx:43) → idem
   - [combat.ts:816](../../src/core/reducer/combat.ts:816) `=== "poder_heroi"` → `=== "hero_power"`
6. Atualizar fixtures de teste:
   - [lookup.test.ts:10,21,35](../../src/core/skills/__tests__/lookup.test.ts:10)
   - [schema-guard.test.ts:50,58](../../src/core/skills/dsl/__tests__/schema-guard.test.ts:50)
7. Atualizar tabela em [src/data/README.md:178,194](../../src/data/README.md:178).

**Critério de aceite:**
- `grep -n "habilidade\|poder_heroi\|efeito_roxo_monstro\|habilidade_item\|habilidade_dungeon\|habilidade_chefe"` em `src/` retorna 0 hits.
- `npx vitest run` verde.
- Compilação TypeScript sem erro de enum.

**Risco:** baixo. Mecânico. Erro mais provável é esquecer uma comparação string em código — `grep` final cobre.

---

## Lote B — Mover labels de `i_choose_one` para locale + estabilizar ID

**Escopo:** seguir o padrão já estabelecido pelo patch-20 (regra em `skills.yaml`, copy em `skills.locale.pt-BR.yaml`). Aplicar às opções de escolha.

**Estado atual (problema duplo):**
```yaml
- kind: i_choose_one
  options:
    - label: Curar 2          # PT-BR cravado
      effect: [...]
```
E em [evaluate.ts:200](../../src/core/skills/dsl/evaluate.ts:200):
```ts
const options = node.options.map((opt) => ({
  id: opt.label,              # ID = string PT-BR (frágil)
  label: opt.label,
  effect: opt.effect,
}));
```

**Estado-alvo:**
```yaml
# skills.yaml — id conceitual, valor em params, effect usa $value
- kind: i_choose_one
  options:
    - id: heal
      params: { value: 2 }
      effect:
        - kind: i_heal
          to: $target
          amount: $value
    - id: damage_bonus
      params: { value: 2 }
      effect:
        - kind: p_modifier
          to: $source
          stat: s_damage_dealt
          operation: add
          value: $value
          duration: { kind: once }
```
```yaml
# skills.locale.pt-BR.yaml — options aninhado, label é template com placeholders
skill_last_light_miracle:
  name: Milagre da Última Luz
  label: "..."
  text: "..."
  options:
    heal: "Curar {value}"
    damage_bonus: "+{value} dano"
```

**Princípios de design da option:**
- **ID é conceitual** (`heal`, `damage_bonus`, `discard_item`), não cravado no número. Mudar `value: 2` pra `value: 3` não muda ID nem locale.
- **`params` na option** carrega os valores que entram tanto no effect (`$value`) quanto no template de label (`{value}`). Mesma fonte → consistência garantida.
- **Locale aninhado por skill** (`locale[skillId].options[optionId]`) — espelha estrutura atual (`name`/`label`/`text` já são indexados por `skill_id`). IDs de option vivem no namespace da skill: `discard_item` em skills diferentes não colide e pode ter label idêntico em cada uma (custo: duplicação aceitável pela independência).
- **Catálogo pequeno e reusável:** `heal`, `damage_bonus`, `discard_item`, `discard_dungeon`, `take_damage`, `full_heal`, `survive`, `hit_penalty`. Reapareceram em várias skills com `params.value` diferentes.

**Passos:**
1. **Schema Zod** em [dsl/schema.ts:180](../../src/core/skills/dsl/schema.ts:180) (`i_choose_one`):
   - `id: z.string().regex(/^[a-z_][a-z0-9_]*$/)` obrigatório.
   - `params?: z.record(z.union([z.number(), z.string()]))` opcional. Resolução de `$value` / `$xxx` dentro do effect da option lê desse `params` primeiro, depois cai no `params` da skill top-level.
   - `label` proibido (`.strict()` no objeto da option, ou refinement explícito).
2. **Estrutura locale** em `skills.locale.pt-BR.yaml` (nova seção `options`):
   - Chaves: o `id` definido no YAML de regra.
   - Conferir mecanismo de lookup do patch-20 — provavelmente já existe um helper `localize(key)`; reusar.
3. **`evaluate.ts:198-205`** — passa `id` adiante; label é resolvido na UI via `locale[skillId].options[optionId]`. O `id` da skill já está no contexto do evaluate (skill em execução), então o consumidor consegue compor a chave. Forma exata depende do helper de locale do patch-20 — reusar o mesmo padrão usado para `name` / `label` / `text`.
4. **Modal** em [SkillChoiceModal.tsx:33](../../src/ui/components/modals/SkillChoiceModal.tsx:33) — consumir `labelKey` (ou aplicar lookup no momento de renderizar). Seguir o padrão usado em `name` de skill (patch-20).
5. **Migração das 7 ocorrências** em `skills.yaml` (IDs conceituais + `params.value`; locale com template `{value}`):
   - linha 210 (`skill_last_light_miracle`):
     - `heal` (params: `{value:2}`), label `"Curar {value}"`
     - `damage_bonus` (params: `{value:2}`), label `"+{value} dano"`
   - linha 460 (`skill_dark_tribute`):
     - `discard_item` (params: `{value:1}`), label `"Descartar {value} item"`
     - `discard_dungeon` (params: `{value:1}`), label `"Descartar {value} carta de dungeon"`
   - linha 780 (`power_greater_last_light_miracle`):
     - `full_heal` (sem params), label `"Curar totalmente"`
     - `survive` (params: `{value:1}`), label `"Sobreviver com {value} vida"`
   - linha 880 (`power_last_light_oath`):
     - `heal_all` (params: `{value:5}`), label `"Curar todos ({value})"`
     - `damage_bonus_holy` (params: `{value:5}`), label `"+{value} dano sagrado"`
   - linha 1085 (`purple_dark_tribute`): mesmas options de `skill_dark_tribute` — repetir no locale dessa skill (namespace separado).
   - linha 1108 (`purple_blood_tribute`):
     - `discard_item` (params: `{value:1}`), label `"Descartar {value} item"`
     - `take_damage` (params: `{value:3}`), label `"Sofrer {value} de dano"`
   - linha 1317 (`dungeon_skill_dead_torches`):
     - `discard_item` (params: `{value:1}`), label `"Descartar {value} item"`
     - `hit_penalty` (params: `{value:1}`), label `"Sofrer -{value} no acerto"`
6. **Locale** `skills.locale.pt-BR.yaml`: adicionar todas as chaves novas com texto PT-BR atual.
7. **Estado pendente em jogo**: revisar `pendingSkillChoice` — se persistir entre saves usando `id`, garantir que o `id` novo seja estável (não muda mais ao traduzir).

**Critério de aceite:**
- `grep -n "label:" src/data/skills.yaml` retorna 0 ocorrências dentro de `options:` (só sobra `label_template` ou similares fora do escopo).
- Modal mostra mesmo texto PT-BR de antes.
- Schema rejeita option sem `id` ou com `label`.
- `npx vitest run` verde, incluindo teste do `i_choose_one` em [evaluate.test.ts:266](../../src/core/skills/dsl/__tests__/evaluate.test.ts:266) (adaptar fixture).

**Risco:** baixo-médio. IDs conceituais duplicados entre skills (ex.: `discard_item` em 4 skills) **não colidem** porque ficam no namespace de cada skill (`locale[skillId].options.discard_item`). Custo: o template PT-BR é repetido no locale; aceitável pela independência que ganha. Cuidado extra com a resolução de `$value` na option — garantir que `params` da option tem precedência sobre `params` da skill top-level, e que o evaluator passa o contexto certo pro effect aninhado.

---

## Lote C — Deletar `src/data/skills.json`

**Escopo:** remover o JSON stale e suas referências.

**Passos:**
1. **Verificar** se `tools/card-port/migrate-cards.mjs` ainda roda em algum fluxo (CI, package.json scripts, README, instruções de onboarding). Se sim, portar pra ler YAML ou deletar script junto.
2. **`git rm src/data/skills.json`**.
3. **Atualizar docs:**
   - `docs/arquitetura-mvp1.md:518` — trocar "skills.json é a fonte única" por "skills.yaml é a fonte única".
   - `docs/engine/v2/card_game_architecture.html:205` — trocar `skills.json` por `skills.yaml`.
4. **Buscar referências residuais:** `grep -rn "skills\.json" --exclude-dir=node_modules` em todo o repo. Tratar cada hit.

**Critério de aceite:**
- `src/data/skills.json` não existe.
- `grep -rn "skills\.json" src/ tools/ docs/` retorna 0 (ou só HTML histórico claramente datado).
- `npm run build` e `npx vitest run` verdes.

**Risco:** trivial. Único cuidado é o migrate script — se for usado, planejar substituição antes de remover.

---

## Ordem sugerida

C → A → B.

- **C primeiro** elimina o JSON, então Lote A não precisa atualizar 90 hits redundantes no JSON.
- **A depois** é mecânico e abre espaço cognitivo para B.
- **B por último** é o lote com mais design real (estrutura de locale, ID stability) — melhor encarar com A/C fora do caminho.

Podem ir em commits separados (preferível: 3 commits, um por lote).

---

## Pós-patch — atualizar pendências

Marcar como **resolvido** em [docs/issues/pendencias-skills.md](../issues/pendencias-skills.md):
- "Strings de UI cravadas em `i_choose_one.options[].label`" (Lote B).
- "Deletar `src/data/skills.json`" (Lote C).

Manter a pendência de **remover `category` completamente** (mover slot pra card) — Lote A só traduziu, não removeu.
