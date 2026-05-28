# Patch-6 — Migração das regras v2 → v3 (dungeon-1 atualizada + novo catálogo de habilidades)

## Contexto

A spec foi atualizada de v2 → v3 (`docs/spec/v2` → `docs/spec/v3`). Dois arquivos novos:

- [docs/spec/v3/dungeon-1-atualizado.json](docs/spec/v3/dungeon-1-atualizado.json) — substitui `dungeon-1.json` (80 cartas, mesma estrutura `Ability` da v2).
- [docs/spec/v3/habilidades_1.json](docs/spec/v3/habilidades_1.json) — substitui `habilidades-jogo-digital.json`. Schema diferente do anterior: agora tem `categories`, `placeholder`, `textTemplate`/`labelTemplate` (com `{value}`), `usesVariable`, `defaultValue` e `usedBy[]` estruturado (objeto com `card`, `cardType`, `field`, `value`) em vez de strings tipo `"58:item:Alaúde"`.

O MVP atual implementa a v2 (patch-5). O contrato `Ability` em [src/data/cardTypes.ts:13](src/data/cardTypes.ts:13) **não muda** — `{ name, value, type, trigger, target, text, label }` continua valendo. A migração é majoritariamente troca de dados.

## 1. Diff observado (v2 → v3)

### 1.1 Cartas (nomes top-level inalterados)

Os 80 nomes de cartas (heroes, creatures, subbosses, items, artifacts, rooms, boss) são **idênticos** entre v2 e v3 — a identidade das cartas foi preservada. O que muda dentro de cada carta:

- **Nomes de habilidades renomeados** com tematização "Última Luz / Fendas / Véu / Brasa". Exemplos:
  - Clérigo: `Curar`/`Curar Poderoso` → `Cura da Última Luz`/`Milagre Maior da Última Luz`
  - Guerreiro: `Golpe Poderoso`/`Trespassar` → `Guarda do Bastião`/`Guarda Inquebrável do Bastião`
  - Ladino: `Visão das Fendas`/`Segunda Chance` → `Caminho Preservado`/`Caminho Restaurado`
  - Mago: `Preservar Caminho`/`Runa Perfeita` → `Runa das Fendas`/`Runa Suprema das Fendas`
  - Paladino: `Luz Sagrada`/`Milagre de Batalha` → `Luz da Aurora Final`/`Juramento da Última Luz`
  - Caçador: `Presa`/`Golpe do Caçador` → `Marca da Presa`/`Execução do Caçador`

- **Reajustes numéricos** em `value` e em `damage`/efeitos. Ex.: Clérigo skill cura `1` → `3`; Guerreiro skill agora é armadura `3` (era `tohit +2`); Bárbaro `damage` 3 → 4.

- **Stats base (`life`, `hitBonus`, `diceByColor`) inalterados** vs v2 nas 8 fichas de herói amostradas — só efeitos mudam.

- **Novos `type` strings** aparecem (não branchamos por eles em runtime, mas vale catalogar): `self_damage_for_damage`, `self_damage_for_damage_until_end_of_combat`, `skillEnhancement`, `dice_adjust`, `diceFix_damage`, `tohit_damage_heal`, `tohit_damage_penalty`, `heal_or_survive`, `armor_purple_damage_reduction`, `fleeLock`, `recoverItem`, `discardDungeonLock` (2x), `tohit_penalty` (2x). Sumiram: `extraDie`, `damage_combo`, `damage_xp_bonus`, `drawSpecificItem_or_xp`, `bossBonus`, `damageCap`, `survive`, `survive_dungeonLevel`, `roomControl`, `Sala Vazia`.

### 1.2 Catálogo de habilidades (schema novo)

`habilidades_1.json` mudou de formato. v2 era lista plana de `{ name, value, type, trigger, target, text, label, usedBy: string[] }`. v3 é:

```jsonc
{
  "version": "1.0",
  "name": "habilidades_1",
  "game": "Dungeon Deck - A Fornalha Sombria",
  "placeholder": { "symbol": "*", "jsonToken": "{value}", "description": "..." },
  "categories": ["habilidade", "poder_heroi", "efeito_roxo_monstro", "habilidade_item", "habilidade_dungeon", "habilidade_chefe"],
  "abilities": [
    {
      "id": "habilidade-furia-rubra",
      "name": "Fúria Rubra",
      "category": "habilidade",
      "sourceSection": "Habilidades",
      "usesVariable": true,
      "defaultValue": null,
      "type": "damage_bonus",
      "trigger": "before_attack",
      "target": "self",
      "textTemplate": "este personagem sofre {value} de dano para causar dano adicional igual a 3 vezes o valor sofrido no próximo ataque.",
      "labelTemplate": "Fúria Rubra ({value}): ...",
      "usedBy": [
        { "card": "Bárbaro Rubro", "cardType": "hero", "field": "skill", "value": 2 },
        { "card": "Poção de Fúria", "cardType": "item", "field": "effect", "value": 2 }
      ]
    }
  ]
}
```

O app **não consome** esse arquivo hoje (lê só de `cards.json`). Vale guardar no repo pra futura execução estruturada de habilidades, mas não bloqueia o patch.

### 1.3 Heads-up: divergência de `type` entre dungeon e catálogo

Os mesmos efeitos aparecem com `type` diferentes nos dois arquivos. Ex.: `Brasa Viva` na dungeon é `type: "damage"` (no items) e no catálogo é `type: "direct_damage"`. Mesma coisa pra `Runa das Fendas` (`dice_adjust` na dungeon, `dice_modification` no catálogo). Decisão sugerida: **a dungeon é a fonte de verdade pro runtime; o catálogo é referência editorial**. Documentar isso na Fase 5.

## 2. Plano de implementação

### Fase 1 — Swap de dados (essencial)

1. Sobrescrever `docs/dungeon-1.json` com [docs/spec/v3/dungeon-1-atualizado.json](docs/spec/v3/dungeon-1-atualizado.json).
2. Sobrescrever [src/data/cards.json](src/data/cards.json) com o mesmo conteúdo (o app importa direto de `src/data/cards.json`, conforme [src/data/cards.ts:4](src/data/cards.ts:4)).
3. Rodar `npm run test`. Espera-se que `src/data/cards.test.ts` continue passando — ele só verifica que `label`/`text` são strings não-vazias ([src/data/cards.test.ts:72](src/data/cards.test.ts:72)).
4. Rodar `npm run build` (`tsc -b && vite build`) pra pegar qualquer drift de tipo.

### Fase 2 — Auditoria de uso por nome de habilidade (verificação)

Confirmar que nenhum código branchea por nome literal de habilidade. Grep alvo:

```bash
grep -rn 'Curar\|Visão das Fendas\|Golpe Poderoso\|Trespassar\|Segunda Chance\|Presa\|Luz Sagrada\|Milagre de Batalha\|Preservar Caminho\|Runa Perfeita\|Eco\|Sacrifício Rubro' src/
```

Resultado esperado: zero matches em `src/core/**` e `src/ui/**` (UI consome `.label`, não `.name`). Se aparecer, atualizar para o nome novo.

Também conferir os 3 arquivos que tocam `ability.type`/`effect.type` ([src/data/cardTypes.ts](src/data/cardTypes.ts), [src/data/cards.json](src/data/cards.json), [src/ui/components/modals/CardDetailModal.tsx](src/ui/components/modals/CardDetailModal.tsx)) — nenhum branchea por valor de `type`; só leem `.label`.

Bug latente já existente (não é regressão do patch, mas vale anotar): [src/core/reducer/reward.ts:67](src/core/reducer/reward.ts:67) faz `artCard.effect.toLowerCase()` assumindo `effect` é string, mas em v2 já é objeto `Ability`. Confirmar se isso quebra em runtime — se sim, trocar pra `artCard.effect.label.toLowerCase()` ou `artCard.effect.text.toLowerCase()`. **Tratar como achado paralelo, não escopo deste patch** — abrir issue separada.

### Fase 3 — Copiar catálogo de habilidades (opcional, não-bloqueante)

1. Copiar [docs/spec/v3/habilidades_1.json](docs/spec/v3/habilidades_1.json) → `docs/habilidades.json` (substituindo o anterior, se existir).
2. **Não** importar do `src/` ainda. O catálogo só vira fonte runtime quando habilidades passarem a ser executadas por engine baseada em `type`+`trigger` — fora do escopo do MVP1.

### Fase 4 — Bump de versão e commit

1. `package.json`: `0.5.4` → `0.6.0` (minor — conteúdo de cartas mudou substancialmente, sem breaking de API).
2. Commit único, mensagem sugerida:
   ```
   feat(patch-6): migrar dados de cartas para spec v3

   - src/data/cards.json e docs/dungeon-1.json: nova lista da Fornalha Sombria
   - docs/habilidades.json: novo catálogo com templates {value} (não-runtime)
   - bump 0.5.4 → 0.6.0
   ```

### Fase 5 — Documentação (curtinho)

Atualizar [README.md](README.md) ou [docs/arquitetura-mvp1.md](docs/arquitetura-mvp1.md) com nota: "Dados de cartas seguem `docs/spec/v3`. Catálogo `habilidades_1.json` é referência editorial; runtime lê de `src/data/cards.json`. Em caso de divergência de `type` entre os dois, dungeon vence."

## 3. Critérios de aceitação

- `npm run test` verde (sem nenhuma mudança em arquivos de teste).
- `npm run build` verde.
- UI mostra os nomes novos de habilidades nas telas de herói, modal de carta e inventário (smoke test no dev server).
- Nenhum import quebrado por nome de habilidade hardcoded.
- Bug do `reward.ts:67` documentado em issue separada, **não** corrigido neste patch.

## 4. Fora de escopo

- Implementar engine que interpreta `type`/`trigger`/`target` das habilidades.
- Reconciliar divergência de `type` entre dungeon e catálogo.
- Corrigir `artCard.effect.toLowerCase()` em [reward.ts:67](src/core/reducer/reward.ts:67).
- Atualizar `wireframe-*.html` (são wireframes históricos).
