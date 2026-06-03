# Patch 27 — Migrar `cards.json` para `cards.yaml`

Brief auto-contido. Não depende de conversa prévia.

**Pré-requisitos:** nenhum. Mudança isolada de formato; semântica e schema dos cards permanecem idênticos.

**Objetivo:** alinhar o formato dos dados do catálogo ao já adotado para skills (`skills.yaml`). Hoje o repositório mistura dois formatos de fonte:

- `src/data/skills.yaml` — YAML, com anchors/aliases, comentários inline, IDs nus.
- `src/data/cards.json` — JSON, sem anchors, sem comentários, com aspas em toda chave.

Padronizar em YAML reduz ruído visual nos diffs (sem aspas/vírgulas), permite comentar entradas e abre espaço para anchors no patch-28 (separação pt-BR). É só mudança de **container**, não de **conteúdo**.

**Princípio:** `cards.yaml` é a fonte de composição (`card → skill refs` + stats). Idêntico ao papel atual do `cards.json`.

**Fora de escopo:**
- Separar pt-BR para locale → patch-28.
- Alterar `cardTypes.ts` ou semântica de qualquer campo.
- Trocar `cardName` por `cardId` no estado → patch-28.

---

## Lote A — Adicionar loader YAML

**Escopo:** trocar o import estático de JSON por leitura/parse YAML, mantendo a mesma assinatura externa.

**Mudanças:**
- [src/core/data/cards.ts:4](../../src/core/data/cards.ts:4): substituir `import rawCards from "../../data/cards.json"` por leitura de `cards.yaml` via `js-yaml` (já é dependência usada em `skills.yaml` — confirmar com `grep "from \"js-yaml\"" src/`).
- Padrão a copiar: o loader atual de `skills.yaml`. Localizar com `grep -rn "skills.yaml" src/core/data/`.
- `validateRaw` permanece como está — só mudou a origem.
- Se Vite/bundler exigir, adicionar plugin `?raw` ou `vite-plugin-yaml` (verificar config existente — provável que já esteja configurado pelo `skills.yaml`).

**Critério de aceite:**
- `getAllCards()` retorna conteúdo idêntico ao do `cards.json` antes da migração (snapshot test pode comparar `JSON.stringify(getAllCards())` antes/depois).
- `tsc` limpo.
- Suite de testes passa sem mudança nos testes.

**Risco:** baixo. Possíveis pegadinhas:
- Encoding (LF/CRLF) — garantir UTF-8.
- Tipos numéricos: YAML pode interpretar `1` como int e `1.0` como float; todos os números atuais são int — sem problema.
- `null` vs ausência: hoje não há `null` no JSON; manter sem.

---

## Lote B — Converter `cards.json` → `cards.yaml`

**Escopo:** gerar `src/data/cards.yaml` equivalente bit-a-bit em conteúdo (sem perda de dados).

**Mudanças:**
- Script de conversão (pode ser one-off em `scripts/convert-cards.mjs`):
  ```js
  import yaml from "js-yaml";
  import fs from "node:fs";
  const cards = JSON.parse(fs.readFileSync("src/data/cards.json", "utf8"));
  fs.writeFileSync("src/data/cards.yaml", yaml.dump(cards, { lineWidth: 120, noRefs: true }));
  ```
- Conferir manualmente as primeiras 3-5 entradas e a última: chaves preservadas, arrays preservados, sem mudança de ordem dos campos relevantes.
- Reformatar opcionalmente para estilo idiomático (chaves não-aspeadas) — mas `js-yaml` já produz isso por padrão.

**Critério de aceite:**
- `node -e "console.log(JSON.stringify(require('js-yaml').load(require('fs').readFileSync('src/data/cards.yaml','utf8'))) === JSON.stringify(require('./src/data/cards.json')))"` → `true`.
- Diff visual amostral em ~10 cartas (heroes, creatures, items, rooms, boss) confirma equivalência.
- Suite continua passando (loader já aponta para YAML após Lote A).

**Risco:** baixo. Conversão automática é segura para JSON 100% válido; o único risco é estilo de saída (ordem de chaves). Como o consumo é via `getAllCards()`/`getCardById()`, ordem não importa.

---

## Lote C — Remover `cards.json`

**Escopo:** depois que `cards.yaml` está vivo e testado, remover o JSON para evitar fonte dupla.

**Mudanças:**
- `git rm src/data/cards.json`.
- `grep -rn "cards.json" src/ docs/ scripts/` → atualizar comentários remanescentes (`cards.ts`, `cardTypes.ts`, `lookup.ts`, README de docs/patches que cite o arquivo).
- Remover script `scripts/convert-cards.mjs` se foi criado.

**Critério de aceite:**
- `find src -name cards.json` → vazio.
- `grep -rn "cards.json" src/` → 0 (comentários atualizados ou removidos).
- Suite passa.
- Preview do app carrega 80 cartas sem console error (`mcp__Claude_Preview__preview_console_logs level:error`).

**Risco:** zero — Lote A já mudou o consumidor.

---

## Critério de aceite global

- [ ] `src/data/cards.yaml` é a única fonte de catálogo.
- [ ] Loader em `cards.ts` lê YAML.
- [ ] `cards.json` removido.
- [ ] Conteúdo de cartas inalterado (snapshot bit-a-bit do `getAllCards()`).
- [ ] Toda a suite passa.

## Ordem sugerida

1. Lote A (loader aceita YAML — mas ainda usa JSON até o Lote B).
2. Lote B (gera YAML e troca o import).
3. Lote C (remove JSON).

Sequencial. Lote A pode ser feito carregando o JSON via `js-yaml` (que aceita JSON como subset de YAML) para validar o pipeline antes de gerar o `.yaml` propriamente dito — opcional.

---

## Riscos / abertos

- Bundler Vite: confirmar plugin de YAML antes do Lote A; se não houver, decidir entre `vite-plugin-yaml` ou import de string `?raw` + `yaml.load()` no loader.
- Tooling externo (gerador de README de cartas, exportador para print-and-play, scripts em `scripts/`): se algum lê `cards.json` direto, atualizar para YAML ou ler via `getAllCards()`.
- Editores: confirmar que `.yaml` no diretório `src/data/` está incluído nos lints/format do projeto (já deve estar por causa de `skills.yaml`).
