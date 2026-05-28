# Patch-5 — Migração das regras v1 → v2

## Contexto

A spec do jogo foi atualizada de v1 para v2 (`docs/spec/v1` e `docs/spec/v2`). O MVP atual implementa a v1. Este patch lista o que muda no manual e nos dados, com paths e patches concretos.

Frentes:

1. **Regras do manual** (PDF) — 3 mudanças, sendo uma estrutural (§8.8 combate).
2. **Formato dos dados de carta** — `skill`/`power`/`effect`/`purpleEffect` viraram objetos estruturados (ver §2 abaixo).
3. **Rebalanceamento numérico** dos heróis (puxado de graça com a Fase 1).
4. **Modo pesadelo** já está alinhado com v2 no código atual — só auditar (ver Fase 4).

## 1. Diff do manual (v1 → v2)

### 1.1 §8.8 Combate múltiplo (ESTRUTURAL)

**v1:** "cada herói pode enfrentar apenas 1 criatura por rodada. Uma mesma criatura não pode ser escolhida por mais de 1 herói na mesma rodada."

**v2:** "cada herói pode escolher livremente qual inimigo irá enfrentar. A ordem dos combates fica a critério da mesa. Primeiro, todos os heróis devem realizar seus combates normalmente."

Mais: "O dano de uma mesma criatura deve ser aplicado por completo e não pode ser dividido entre vários heróis."

**O que isso implica no código:** o engajamento 1-para-1 (`enemiesEngaged`) precisa ser removido como restrição. Detalhes na Fase 3.

### 1.2 §4.1 Modo pesadelo

- v1: Ímpeto Amarelo + Despertar Laranja.
- v2: Ímpeto Branco + Despertar Laranja.

Em [src/core/config/defaults.ts:24](src/core/config/defaults.ts:24) o preset já está `{ heroOffset: 0, despertarOffset: 2 }` (Branco + Laranja), ou seja, **já bate com v2**. Só confirmar e seguir.

### 1.3 §4 Terminologia

"8 personagens" → "8 heróis". Cosmético; verificar copy em [src/ui/screens/Setup.tsx](src/ui/screens/Setup.tsx) e textos auxiliares.

### 1.4 Resto

§1–§7, §8.1–§8.7, §8.9, §9, §10, §11, §12, §13, §14, §15, §16, §17, §18, §19, §20 (FAQ inteiro) e §21–§22 não mudam.

## 2. Novo formato dos dados de carta

O `docs/spec/v2/dungeon-1.json` reorganiza todos os campos descritivos como **objetos `Ability`**. Schema:

```ts
interface Ability {
  name: string;
  value: number | string | null;   // ex: 1, "+1/+1", "6/1", null
  type: string;                    // "heal" | "damage" | "tohit" | "armor" | "tohit_damage" | "dungeon" | ...
  trigger: string;                 // "end_of_combat" | "once_per_combat" | "on_enter_play" | ...
  target: string;                  // "self" | "hero" | "lowest_life_hero" | "creature" | ...
  text: string;                    // narrativo (era o que vinha como string no v1)
  label: string;                   // "Nome (valor): texto" — pronto pra UI
}
```

Mapeamento por tipo de carta:

| Carta | Campo v1 (string) | Campo v2 (Ability) |
|-------|-------------------|--------------------|
| `hero` | `skill`, `power` | `skill`, `power` |
| `creature` | `effect`, `purpleEffect` | `effect`, `purpleEffect` |
| `subboss` | `effect`, `purpleEffect` | `effect`, `purpleEffect` |
| `item` | `effect` | `effect` |
| `artifact` | `effect` | `effect` |
| `room` | `effect` | `effect` |
| `boss.abilities[N]` | `{ name, effect: string }` | `{ name, effect: Ability }` (wrapper continua existindo) |

Os campos numéricos (`life`, `hitBonus`, `damage`, `xp`, etc.) **mantêm o mesmo tipo**, mas alguns heróis tiveram valores reajustados. Exemplo: Clérigo `hitBonus` v1 `[2,3,5,7,10]` → v2 `[4,5,7,10,14]`.

Há também o catálogo `docs/spec/v2/habilidades-jogo-digital.json` (lista global de habilidades únicas com `usedBy: string[]` cruzando em qual carta cada uma aparece). Não é estritamente necessário copiar pro `src/` agora — o app consome direto do `dungeon-1.json`. Vale guardar pra futura execução estruturada (ver Fase 5).

## 3. Plano de implementação

### Fase 1 — Migrar dados e tipos

Arquivos a editar:

1. **Copiar** `docs/spec/v2/dungeon-1.json` por cima de `docs/dungeon-1.json`.
2. Confirmar se `src/data/cards.json` é gerado de `docs/dungeon-1.json` ou se é cópia manual:
   ```
   diff docs/dungeon-1.json src/data/cards.json
   ```
   Se forem iguais hoje, **substituir `src/data/cards.json` pelo conteúdo de `docs/spec/v2/dungeon-1.json`**.

3. Reescrever **[src/data/cardTypes.ts](src/data/cardTypes.ts)**:

   - Adicionar interface `Ability` (schema na §2 acima).
   - Em `HeroCard`: `skill: string` → `skill: Ability`; idem `power`.
   - Em `CreatureCard`: `effect: string` → `effect: Ability`; idem `purpleEffect`.
   - Em `SubbossCard`: idem `CreatureCard`.
   - Em `RoomCard`: `effect: string` → `effect: Ability`.
   - Em `ItemCard`: `effect: string` → `effect: Ability`.
   - Em `ArtifactCard`: `effect: string` → `effect: Ability`.
   - Em `BossAbility`: `effect: string` → `effect: Ability` (o wrapper `{ name, effect }` continua).

4. Rodar `npx tsc --noEmit` (ou `npm run build`) e seguir os erros — vai apontar **todos** os lugares onde o código lê esses campos como string. Pra cada um, trocar `card.skill` por `card.skill.text` (ou `.label`, se a UI quiser o formato "Nome (valor): texto").

5. Atualizar [src/data/cards.test.ts](src/data/cards.test.ts) pro novo schema. Se houver fixtures inline com strings, transformar em objetos `Ability` mínimos (`{ name: "x", value: null, type: "noop", trigger: "noop", target: "self", text: "x", label: "x" }`).

**Critério de aceite:** `npm test` verde, app inicia sem warning de tipo.

### Fase 2 — UI lê `.text`/`.label` em vez de string

Após a Fase 1, o TS já vai ter apontado os locais. Locais mais prováveis (confirmar):

- [src/ui/components/HeroCard.tsx](src/ui/components/HeroCard.tsx) — exibe skill/power do herói.
- [src/ui/components/HeroFocusPanel.tsx](src/ui/components/HeroFocusPanel.tsx)
- [src/ui/components/EnemyCard.tsx](src/ui/components/EnemyCard.tsx) — exibe effect/purpleEffect da criatura.
- [src/ui/components/RoomCard.tsx](src/ui/components/RoomCard.tsx) — efeito da sala.
- [src/ui/components/ItemTile.tsx](src/ui/components/ItemTile.tsx), [src/ui/components/ItemChip.tsx](src/ui/components/ItemChip.tsx) — efeito de item.

**Regra: usar `.label`** (já vem pré-formatado como "Nome (valor): texto"). Se o componente quiser separar nome e descrição, usar `.name` + `.text` separados.

**Critério de aceite:** abrir o app, navegar pela exploração, confirmar que textos de habilidade aparecem como antes (ou melhor, com o nome em destaque).

### Fase 3 — Remover engajamento 1-para-1 (§8.8 v2)

Hoje o engajamento é controlado por `enemiesEngaged: readonly string[]` em [src/core/state/combatState.ts:46](src/core/state/combatState.ts:46), preenchido a cada `SELECT_TARGET` e checado em [src/core/reducer/combat.ts:104-109](src/core/reducer/combat.ts:104).

Passos:

1. **Em [src/core/reducer/combat.ts](src/core/reducer/combat.ts):**
   - Remover o bloco `if (state.combat.enemiesEngaged.includes(enemyId))` em ~linha 104. Manter o check de `heroesActed` (regra que não muda).
   - Remover o append `enemiesEngaged: [...state.combat.enemiesEngaged, enemyId]` em ~linha 120. Deixar o campo intacto no `CombatState` por ora (ainda é lido por outras telas — desligar suas leituras na próxima etapa).
   - Idem nas resets em linhas 369 e 386 — manter (são reset, não restrição).

2. **Em [src/core/state/combatState.ts:46](src/core/state/combatState.ts:46):** decidir se manter o campo `enemiesEngaged` ou removê-lo. Recomendação: **remover** depois que todos os leitores forem ajustados, pra não criar lixo. Os leitores são:
   - [src/ui/store/selectors.ts:169](src/ui/store/selectors.ts:169)
   - [src/ui/screens/Exploration.tsx:111](src/ui/screens/Exploration.tsx:111) e :131 (filtro de inimigos selecionáveis)
   - [src/ui/components/CombatActionPanel.tsx:58](src/ui/components/CombatActionPanel.tsx:58)
   - [src/ui/components/Board.tsx:58](src/ui/components/Board.tsx:58), :180 (visual `isEngaged`)
   - [src/ui/components/HeroFocusPanel.tsx:50](src/ui/components/HeroFocusPanel.tsx:50)
   - [src/core/reducer/boss.ts:150](src/core/reducer/boss.ts:150)

   Em todos os filtros tipo `e.status === "active" && !enemiesEngaged.has(e.id)`, **remover o `!enemiesEngaged.has(e.id)`**. No `Board.tsx` o efeito visual `isEngaged` perde sentido — apagar a indicação.

3. **Dano direto não dividido** ([src/core/strategies/targetSelection.ts](src/core/strategies/targetSelection.ts)): a estratégia atual já escolhe **um** herói (menor vida) — alinha com v2. Adicionar um teste em `src/core/rules/combat.test.ts` que valida: criatura sem oponente aplica o `damage` inteiro num único herói, nunca particionado.

4. **Novo teste de regra v2** em `src/core/rules/combat.test.ts`:
   - Setup: 2 heróis ativos, 1 criatura viva.
   - Hero A seleciona criatura → resolve.
   - Hero B seleciona **a mesma** criatura → deve ser aceito (antes era rejeitado).

**Critério de aceite:** novo teste verde; testes antigos que dependiam do engajamento 1-para-1 atualizados pra refletir v2; jogabilidade manual com 2+ heróis permite focar uma criatura.

### Fase 4 — Auditoria do modo pesadelo

Em [src/core/config/defaults.ts:24](src/core/config/defaults.ts:24) `nightmare` já está `{ heroOffset: 0, despertarOffset: 2 }` = Branco + Laranja. Confirmar:

```bash
grep -n "nightmare\|pesadelo" src/
```

Se houver alguma fixture ou texto descrevendo "Ímpeto Amarelo + Despertar Laranja" como pesadelo, atualizar pra "Ímpeto Branco + Despertar Laranja".

**Critério de aceite:** tela de Setup descreve pesadelo como Branco/Laranja.

### Fase 5 — (FORA DESTE PATCH) Executor estruturado de habilidades

O ganho de virar `Ability` em objeto é poder despachar pelo `type`/`trigger`:

```ts
function applyAbility(ability: Ability, ctx: GameContext): GameContext { ... }
```

Hoje habilidades específicas (Bárbaro +1 dado, Escudo Rachado, etc.) estão hardcoded no reducer. Centralizar isso é refactor independente — virar **patch-6**. Não misturar com este patch.

## 4. Ordem de execução

1. Fase 1 (dados + tipos) — checkpoint: `npm test` + `tsc --noEmit` verdes.
2. Fase 2 (UI lê `.label`/`.text`) — checkpoint: app roda visualmente, textos aparecem.
3. Fase 3 (regra de combate múltiplo) — checkpoint: novo teste verde + jogabilidade manual com 2 heróis.
4. Fase 4 (auditoria pesadelo) — checkpoint: copy correto na tela.

Cada fase deve virar **um commit isolado** pra facilitar rollback. Em particular, Fase 1 vai tocar muitos arquivos por causa do `tsc` apontando lugares — mas isso é mecânico (`.skill` → `.skill.text`).

## 5. O que NÃO está no escopo

- Executor estruturado de habilidades (patch-6 candidato).
- Habilidades novas que dependem de triggers que o engine não conhece (`on_enter_play`, `first_damage_each_round`, etc.). Se uma carta v2 trouxer um trigger que o reducer não processa hoje, **manter o comportamento atual e abrir uma nota** — não inventar comportamento novo no escopo deste patch.
- Mobile / touch (continua fora desde patch-3).
- Migrar `habilidades-jogo-digital.json` pra dentro de `src/` (só será útil quando Fase 5 acontecer).
