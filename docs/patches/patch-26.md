# Patch 26 — Mover `notes` pt-BR para o arquivo de locale

Brief auto-contido. Não depende de conversa prévia.

**Pré-requisitos:** nenhum (mudança isolada de dados e schema).

**Objetivo:** `src/data/skills.yaml` é a fonte de verdade estrutural, idealmente língua-neutra (ids, kinds, durations). Hoje carrega duas entradas com texto pt-BR no campo `notes`:

- [skills.yaml:565](../../src/data/skills.yaml:565) `skill_treacherous_attack`: "No texto original, o nome possui variável, mas o efeito-base cita 1 dano. Use {value} quando quiser escalar."
- [skills.yaml:1411](../../src/data/skills.yaml:1411) `dungeon_skill_summon_guardian`: "Use {value} como o nome da criatura especial/subchefe revelado pela sala."

Os dois são notas de **autoria** sobre como o `label`/`text` pt-BR usa o placeholder `{value}`. Pertencem ao arquivo de locale, junto com o texto que descrevem, não ao schema estrutural.

**Princípio:** `skills.yaml` define mecânica e contrato; `skills.locale.pt-BR.yaml` define texto exibido e qualquer comentário sobre esse texto.

**Fora de escopo:**
- Criar i18n para outras línguas.
- Auditar `name`/`label`/`text` por consistência (separado).

---

## Lote A — Estender schema do locale com `notes`

**Escopo:** adicionar campo opcional `notes` no schema do `skills.locale.*.yaml`, ao lado de `name`/`label`/`text`.

**Mudanças:**
- `src/core/data/skillLocale.ts` (ou onde o schema do locale viver — grep `skills.locale`): adicionar `readonly notes?: string`.
- Validar com Zod se houver validação ativa.

**Critério de aceite:**
- Schema aceita `notes` opcional sem quebrar entries existentes.
- `tsc` limpo.

**Risco:** trivial.

---

## Lote B — Migrar as 2 entradas

**Escopo:** mover o conteúdo dos `notes` do `skills.yaml` para `skills.locale.pt-BR.yaml`.

**Mudanças:**

`src/data/skills.locale.pt-BR.yaml`:
```yaml
skill_treacherous_attack:
  name: ...
  label: ...
  text: ...
  notes: "No texto original, o nome possui variável, mas o efeito-base cita 1 dano. Use {value} quando quiser escalar."

dungeon_skill_summon_guardian:
  name: ...
  label: ...
  text: ...
  notes: "Use {value} como o nome da criatura especial/subchefe revelado pela sala."
```

`src/data/skills.yaml`: remover as linhas `notes: ...` das duas entries.

**Critério de aceite:**
- `grep -n "notes:" src/data/skills.yaml` → 0 resultados.
- `grep -n "notes:" src/data/skills.locale.pt-BR.yaml` → 2 resultados, conteúdo idêntico ao original.
- Testes existentes passam.

**Risco:** zero.

---

## Lote C — Remover `notes` do schema mecânico

**Escopo:** depois do Lote B, `notes` não tem mais nenhum uso em `SkillDefinition`. Remover do tipo para evitar que volte como vetor de poluição.

**Mudanças:**
- `src/core/data/skillTypes.ts:40`: remover `readonly notes?: string;`.
- `grep -rn "\.notes" src/` para garantir que ninguém lia o campo em runtime (esperado: nada — é metadata morta).
- Se houver Zod do schema de `skills.yaml`, remover a entrada `notes` lá também.

**Critério de aceite:**
- `tsc` limpo.
- `npm test` sem regressão.
- Schema do `skills.yaml` rejeita `notes` (validação positiva, evita reincidência).

**Risco:** baixíssimo. Campo declaradamente opcional e sem leitores.

---

## Critério de aceite global

- [ ] `skills.yaml` zero conteúdo pt-BR.
- [ ] `skills.locale.pt-BR.yaml` carrega as 2 notas, sem perda de informação.
- [ ] Schema mecânico não permite mais o campo.
- [ ] Suite passa.

## Ordem sugerida

1. Lote A (aceita campo no locale).
2. Lote B (migra dados).
3. Lote C (remove do schema mecânico).

Sequencial — A→B→C — para evitar janela em que o campo some antes de migrar.

---

## Riscos / abertos

- Confirmar que o schema do locale (`skills.locale.*.yaml`) tem validação própria; se não tiver, Lote A vira só edição de tipo TS sem Zod.
- Se outra ferramenta (gerador de README, doc de cartas) já consome `notes` do `skills.yaml`, redirecioná-la para o locale antes do Lote C. `grep -rn "notes" docs/ scripts/` antes de remover.
