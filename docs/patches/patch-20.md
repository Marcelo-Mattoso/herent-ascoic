# Patch 20 — Internacionalização das labels + migração para YAML

Brief de implementação auto-contido. Não depende de conversa prévia.

**Pré-requisitos:**
- **Patch-19 completo.** ECS é fonte da verdade de modificadores e triggers; UI consome via projeção. Se algum campo legacy de `combat` ainda for lido por componente UI, pare e volte pro patch-18/19.

**Objetivo:** separar **regra de skill** (mecânica) de **apresentação** (copy: nome, label, texto). Em paralelo, trocar o formato dos arquivos de dados de **JSON para YAML** numa única passada. Zero mudança de comportamento de jogo.

**Por quê:**
- O arquivo `src/data/skills.json` mistura regra (trigger, target, effect, script) com strings de copy (`name`, `labelTemplate`, `textTemplate`). Isso bloqueia i18n, polui PRs de mecânica com churn de texto, e torna a leitura humana de uma skill com 5+ effects inviável.
- YAML reduz o ruído sintático (chaves, aspas, vírgulas) em ~30% e permite comentários ao lado da regra — o que `defaultValue` slash-pair tentava simular de forma errada.

**Princípio inegociável — regra ↔ copy.**
> A partir deste patch, **nenhum campo de copy** vive em `skills.yaml`. Nome de skill, label e texto saem **apenas** do locale via `getSkillName(id)` / `renderSkillLabel(ref)` / `renderSkillText(ref)`. Acesso direto a `skill.name` / `skill.labelTemplate` / `skill.textTemplate` deixa de existir — esses campos não estão mais no `SkillDefinition`.

**Princípio inegociável — comportamento de jogo intacto.**
> Mesma label, mesmo texto, mesmo trigger, mesmo effect. Patch-20 é refator de armazenamento e camada de leitura. Se um teste do motor mudou de comportamento, rejeite o lote.

---

## Lote A — Loader YAML

**Escopo:** trocar o formato de `skills.json` para `skills.yaml` sem mudar uma vírgula de conteúdo. Zero alteração observável.

**Passos:**
1. Adicionar dep `yaml` (Eemeli Aro): `npm install yaml`.
2. Gerar `src/data/skills.yaml` a partir do `skills.json` atual via script one-shot. Conversão 1:1 — mesma estrutura, mesmas chaves, mesmos valores.
3. Atualizar `src/core/data/skills.ts` para ler o YAML via `?raw` import + `yaml.parse`:
   ```ts
   import { parse } from "yaml";
   import yamlText from "../../data/skills.yaml?raw";
   import type { SkillCatalog } from "./skillTypes";
   export const SKILLS: SkillCatalog = parse(yamlText) as SkillCatalog;
   ```
4. Atualizar consumidores que liam `skills.json` direto via `fs.readFileSync` (em testes) para ler `skills.yaml` com `yaml.parse`. Arquivos: `src/data/scripts/__tests__/parity.test.ts`, `src/core/skills/dsl/__tests__/schema-guard.test.ts`.
5. Manter `skills.json` no disco como artefato (não removido neste lote — limpeza opcional posterior).

**Critério de aceite:**
- `npx vitest run` passa sem alterar nenhum assert de comportamento.
- `npx vite build` passa.
- `skills.yaml` existe e é a fonte runtime do `SKILLS`.

**Risco:** baixíssimo. Refator de formato em ponto único de leitura.

---

## Lote B — Extração da copy para locale

**Escopo:** remover `name`, `labelTemplate`, `textTemplate` de `skills.yaml` e movê-los para um arquivo de locale por idioma.

**Passos:**
1. Criar `src/data/skills.locale.pt-BR.yaml` no formato:
   ```yaml
   skill_last_light_healing:
     name: Cura da Última Luz
     label: "Cura da Última Luz ({value}): cure {value} de vida..."
     text: cure {value} de vida de um herói ou criatura aliada.
   ```
   Gerar via script one-shot que lê `skills.yaml`, extrai os 3 campos por `skill.id` e escreve o locale.
2. Apagar `name`, `labelTemplate`, `textTemplate` de cada entrada em `skills.yaml`.
3. Atualizar `SkillDefinition` em `src/core/data/skillTypes.ts` — remover os 3 campos.
4. Atualizar `SkillDefinitionV2Schema` em `src/core/skills/dsl/schema.ts` — remover o campo `name`.
5. Criar `src/core/data/skillLocale.ts`:
   ```ts
   import { parse } from "yaml";
   import localeText from "../../data/skills.locale.pt-BR.yaml?raw";
   export interface SkillLocaleEntry { name?: string; label?: string; text?: string; }
   export const SKILL_LOCALE: Readonly<Record<string, SkillLocaleEntry>> = parse(localeText) as Record<string, SkillLocaleEntry>;
   export function getSkillLocale(skillId: string): SkillLocaleEntry { return SKILL_LOCALE[skillId] ?? {}; }
   export function getSkillName(skillId: string): string { return SKILL_LOCALE[skillId]?.name ?? skillId; }
   ```
6. Substituir todos os acessos `def.name` por `getSkillName(def.id)` ou `getSkillName(skillId)`. Arquivos afetados: `src/core/projection/playerView.ts`, `src/ui/components/modals/CardDetailModal.tsx`. Buscar com `grep -rn "\.name\b" src --include="*.ts" --include="*.tsx" | grep -i skill` para garantir cobertura.
7. Atualizar `src/core/data/skills.test.ts` — remover o assert `expect(typeof ability.name).toBe("string")`.

**Critério de aceite:**
- `skills.yaml` não contém mais `name`, `labelTemplate`, `textTemplate`.
- `SkillDefinition` e schema Zod não declaram esses campos.
- `npx vitest run` verde.
- Jogo continua mostrando os mesmos nomes em UI (verificável manualmente abrindo o modal de detalhe de qualquer carta).

**Risco:** médio. Falha de cobertura no grep pode deixar `def.name` órfão num componente UI; runtime TS captura via tipo (campo deixou de existir em `SkillDefinition`).

---

## Lote C — Render do locale

**Escopo:** `renderSkillLabel` / `renderSkillText` passam a ler do locale; `interpolate` aceita qualquer chave de `params`, não só `{value}`.

**Passos:**
1. Refatorar `src/core/skills/renderLabel.ts`:
   - Ler `label` / `text` de `getSkillLocale(ref.skillId)` em vez de `def.labelTemplate` / `def.textTemplate`.
   - Fallback: se faltar entrada no locale, retornar `ref.skillId` (não quebra, mostra o id cru).
   - Ampliar `interpolate(template, params)` para casar qualquer `{(\w+)}` e plugar `params[key]`. Mantém `{value}` como caso particular (lê de `params.value`).
2. Adicionar `src/core/data/__tests__/skillLocale.test.ts` como guard de cobertura:
   - Teste 1: toda `skill.id` em `SKILLS.abilities` tem entrada em `SKILL_LOCALE`.
   - Teste 2: toda entrada em `SKILL_LOCALE` tem ao menos `name` ou `label`.

**Critério de aceite:**
- `npx vitest run` verde com o novo teste de cobertura passando.
- Modal de detalhe da carta mostra nome + label corretos para todas as cartas testadas manualmente.
- Se uma skill nova for adicionada sem entrada no locale, o teste de cobertura falha — guard funcionando.

**Risco:** baixo. Refator pontual em 1 arquivo + 1 teste novo.

---

## Ordem dos lotes

1. **20-A** primeiro (loader YAML). Sem isso, B/C não fazem sentido — o locale também é YAML.
2. **20-B** em seguida (extração da copy). Depende de A porque opera sobre `skills.yaml`.
3. **20-C** por último (render + guard). Depende de B porque o locale precisa existir antes de ler dele.

Cada lote em PR próprio com testes verdes. Não juntar.

---

## Fora de escopo

- **Migração de slash-pairs** (`defaultValue: "3/2"` → valores inline). Vai no patch-21.
- **`operate_type`, `evt_*`, targeting de 4 eixos, prefixos `i_/p_/t_/c_`, `nature[]`**. Patch-21.
- **Limpeza de `skills.json` do disco.** Mantém como artefato. Limpeza opcional separada.
- **Migração de docs/specs históricos** (`docs/habilidades.json`, `docs/spec/v3/habilidades_1.json`, `tools/skill-port/specs/*.md`). São snapshots históricos, não-runtime — intocados.
- **Locale em outro idioma** (`skills.locale.en-US.yaml`). Estrutura permite, mas patch-20 entrega só pt-BR.

---

## Consumidores conhecidos de label/text/name

Para conferência durante 20-B / 20-C:

| Arquivo | Uso | Substituir por |
|---|---|---|
| `src/core/projection/playerView.ts:352` | `skillDef?.name ?? skillId` | `getSkillName(skillId)` |
| `src/core/projection/playerView.ts:544` | `label: def.name` | `label: getSkillName(def.id)` |
| `src/ui/components/modals/CardDetailModal.tsx:195` | `{def.name}` | `{getSkillName(def.id)}` |
| `src/core/skills/renderLabel.ts:22` | `def.labelTemplate` | `getSkillLocale(ref.skillId).label` |
| `src/core/skills/renderLabel.ts:35` | `def.textTemplate` | `getSkillLocale(ref.skillId).text` |

Resto da UI já passa por `renderSkillLabel` / `renderSkillText` (`HeroFocusPanel`, `InventarioGrupo`, `reward.ts`, `exploration.ts`) — não muda.
