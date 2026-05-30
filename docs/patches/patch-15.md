# Patch 15 — Alinhar o front à nova arquitetura (UI consome só PlayerView)

Brief de implementação auto-contido. Não depende de conversa prévia.

**Branch de trabalho:** `refactor/web-architecture` (NÃO `main`). Pré-requisito: patch-14 aplicado (tsc 0 erros, build verde).

---

## Contrato deste patch (regra inegociável)

**Core é a fonte da verdade. Este patch NÃO altera regra/comportamento de jogo.**

- ❌ **Não** mexer em reducer, handlers, `dispatch.ts` (lógica de `fireTrigger`), máquina de estados, DSL, scripts ou systems. O miolo do core fica intocado.
- ✅ **Expandir a projeção** (`src/core/projection/playerView.ts`) — função **pura, read-only**, que deriva `GameState` num shape estável. Revelar estado que já existe; não inventar regra.
- ✅ **A UI consome exclusivamente `PlayerView`.** Componentes deixam de importar `GameState` e de re-derivar `status`/`combat.phase`.
- ✅ Onde a UI hoje **re-deriva regra** (botão habilita? skill ativável?), a projeção/seletor **consome predicados que já existem no core** (`isManuallyActivatable`, `isSkillGuardConsumed`, a fase de combate). Se o predicado não estiver exportado, só **exportar** — sem mudar o que ele decide.
- ❌ **Nunca duplicar regra na view.** Se uma decisão de regra só existe hoje dentro de um componente, ela está no lugar errado: mover para a projeção (que consome o core), não deixar na UI.

**Exceções permitidas a continuar lendo `GameState` cru:** `src/ui/store/*` (store/adapter) e `src/ui/screens/Replay.tsx` (viewer de replay mostra o estado bruto por design). Todo o resto de `src/ui/` passa por `PlayerView`.

---

## Protocolo de execução (economia de tokens)

- **Não releia arquivos.** `Edit` falha se o trecho não bater; não reabra "para conferir".
- **Leia em paralelo, uma vez.** Dispare os `Read` de uma fase no mesmo turno.
- **`Edit` (diff), nunca `Write` o arquivo todo** quando só um trecho muda.
- **Valide uma vez por fase** (`npx vitest run <path>` para iterar; suíte inteira só ao fechar a fase).
- **Greps de aceite são exatos.** Rode como escritos.
- **Relate em uma linha por fase.** Sem diffs grandes.
- **Commits:** PT-BR, **sem** `Co-Authored-By: Claude`. Um commit por fase.

---

## Diagnóstico

A projeção foi criada (passos 4/9) mas a UI **a ignora**:
- `playerView` e `selectAvailableActions` (`src/ui/store/selectors.ts`) só são referenciados pelo próprio `selectors.ts` — nenhum componente usa.
- `Board.tsx`, `CombatActionPanel.tsx`, `HeroFocusPanel.tsx`, `BoardFooter.tsx` importam `GameState` e leem `state.status`/`state.combat?.phase`/`state.activeEnemies` direto.
- `CombatActionPanel` e `HeroFocusPanel` **re-derivam** habilitação de botão a partir de `phase`/`status` — exatamente a classe de bug corrigida nos patches 14 (boss travado, botão de skill fantasma).
- `PlayerView` está incompleto: não expõe `combat.phase`, `combat.selectedHeroId`, `combat.round`, `combat.lastRoll`.

Resultado: a regra de "o que dá pra fazer agora" vive **duplicada** na UI. Este patch a centraliza na projeção e faz a UI só renderizar.

---

## Fase 1 — Expandir `PlayerView` (read-only, sem tocar UI)

**Arquivo:** `src/core/projection/playerView.ts`.

Adicionar ao `PlayerView` e preencher em `playerView(state)` (derivação pura de `state.combat`):

```ts
combat: {
  readonly phase: CombatPhase;
  readonly selectedHeroId: string | null;
  readonly round: number;
  readonly heroesActed: readonly string[];
  readonly powersUsedThisRoom: Readonly<Record<string, boolean>>;
  readonly lastRoll: CombatRollResult | null;
} | null;
```

(importar `CombatPhase`/`CombatRollResult` de `../state/combatState`). Manter os campos já existentes. Não remover nada.

**Aceite:** `npx tsc -b` 0 erros. Teste em `src/core/projection/playerView.test.ts` cobrindo que os novos campos refletem `state.combat`. Suíte verde.

---

## Fase 2 — Descritores de ação na projeção (a regra sai da UI)

**Arquivo:** `src/ui/store/selectors.ts` (ou novo `src/core/projection/actions.ts` — preferir manter junto da projeção; decidir no commit). Estes seletores são **puros** e **consomem predicados do core**, nunca reimplementam regra.

1. **Habilitação de combate por herói.** Criar:

```ts
export interface HeroCombatActions {
  readonly canAttack: boolean;
  readonly canPass: boolean;
  readonly canCancel: boolean;
  readonly canUsePower: boolean;
  readonly canFlee: boolean;
  readonly skill: { readonly skillId: string; readonly activatable: boolean; readonly alreadyUsed: boolean } | null;
}
export function selectHeroCombatActions(state: GameState, heroId: string): HeroCombatActions;
```

Mover para cá a lógica que hoje está espalhada em `HeroFocusPanel.ActionSection` e `CombatActionPanel`:
- `canAttack/canPass/canCancel/canUsePower`: derivados de `combat.phase === "selecting_target"`, `combat.selectedHeroId === heroId`, `!powersUsedThisRoom[heroId]`, e há inimigo ativo.
- `canFlee`: `hero.currentLife === 1 && !state.flags?.fleeBlocked`.
- `skill`: resolver via `cardSkills(hero.cardId).find(({def}) => def.category === "habilidade")`; `activatable = isManuallyActivatable(def)` (de `@/core/skills/useSkill`); `alreadyUsed = isSkillGuardConsumed(state, def, heroId)` (de `@/core/skills/dispatch`). **Não** reescrever esses predicados — importar.

2. **Ações de grupo / fluxo.** Manter/ajustar `selectAvailableActions` como a fonte única do que o `Board` mostra na "linha de combate" (revelar sala, iniciar combate, rolar dados, revelar chefe, resolver, etc.), já derivado de `view.status`.

**Aceite:** testes em `selectors.test.ts` (ou `actions.test.ts`): para um estado em `selecting_target` com herói X selecionado, `selectHeroCombatActions(state, X)` retorna `canAttack=true` etc.; Ladino das Fendas → `skill.activatable=false`; após guard consumido → `alreadyUsed=true`. Suíte verde.

---

## Fase 3 — Store expõe `view: PlayerView`

**Arquivo:** `src/ui/store/gameStore.ts` (+ `elfStore.ts` se necessário).

- No snapshot do `useGameStore`, adicionar `view: PlayerView` computado via `playerView(getElfGameState())` (memoizar junto com o snapshot atual — recomputar só quando `gameState` mudar).
- Manter `state: GameState` por enquanto, marcado `@deprecated` no tipo `GameStore` ("usar `view`; será removido na Fase 7"). Isso permite migração incremental.

**Aceite:** `npx tsc -b` 0 erros. Smoke: `useGameStore()` retorna `view` coerente com `state`. Suíte verde.

---

## Fase 4 — Migrar `CombatActionPanel`

**Arquivo:** `src/ui/components/CombatActionPanel.tsx`.

- Trocar a prop `state: GameState` por `view: PlayerView` + `heroActions: HeroCombatActions` (vindos da Fase 2/3) + os callbacks existentes.
- Remover toda leitura de `state.status`/`state.combat?.phase`; a renderização passa a olhar `view.combat?.phase`/`view.status` para layout, e a **habilitação** vem dos descritores (`heroActions.canAttack`, etc.).
- Atualizar `Exploration.tsx` para passar os novos props (computa `selectHeroCombatActions` para o herói selecionado/foco).

**Aceite:** `grep -n "GameState\|state\.status\|combat?\.phase" src/ui/components/CombatActionPanel.tsx` vazio. Suíte verde.

---

## Fase 5 — Migrar `HeroFocusPanel`

**Arquivo:** `src/ui/components/HeroFocusPanel.tsx`.

- Trocar `state: GameState` por `view: PlayerView` + `heroActions: HeroCombatActions`.
- `ActionSection` deixa de calcular `canAttack/canPass/.../skillIsActivatable/skillAlreadyUsed` — passa a ler de `heroActions`. A lógica que o patch-14 colocou aqui (`isManuallyActivatable`/`isSkillGuardConsumed`) já foi centralizada na Fase 2; aqui só **consome**.
- Stats/itens/mochila do herói: ler de `view.heroes`/`hero` (que continuam estruturalmente iguais).

**Aceite:** `grep -nE "GameState|state\.status|combat\?\.phase|isManuallyActivatable|isSkillGuardConsumed" src/ui/components/HeroFocusPanel.tsx` vazio (os predicados agora só aparecem na camada de projeção). Suíte verde. Smoke manual: botão "Usar habilidade" do Ladino não aparece; demais heróis funcionam.

---

## Fase 6 — Migrar `Board.tsx`, `BoardFooter.tsx` e o container

**Arquivos:** `src/ui/components/Board.tsx`, `src/ui/components/BoardFooter.tsx`, `src/ui/screens/Exploration.tsx`.

- `Board`/`BoardFooter`: prop `view: PlayerView` no lugar de `state`. `isInCombat`/`isSelectingTarget` derivam de `view.combat?.phase`+`view.status`; "linha de combate" usa `selectAvailableActions(view)`.
- `Exploration.tsx`: consumir `view` do store (em vez de `state`) para tudo que é leitura; `state` cru só onde inevitável para montar payloads de action (idealmente nada — payloads usam ids já presentes na view). Os `handle*` que disparam actions permanecem.

**Aceite:** `grep -rn "props.state\|: GameState\|state\.combat\|state\.status" src/ui/components/Board.tsx src/ui/components/BoardFooter.tsx` vazio. Suíte verde. App jogável (smoke no dev server até a 1ª sala + combate).

---

## Fase 7 — Remover `state` cru do contrato e sanidade final

- Remover `state: GameState` do tipo `GameStore` e do snapshot (manter só `view` + `ui` + ações). Ajustar quaisquer leitores restantes.
- Exceções confirmadas que ainda importam `GameState`: só `src/ui/store/*` e `src/ui/screens/Replay.tsx`.

**Greps de aceite (todos devem retornar vazio):**

```bash
# Nenhum componente/SCREEN (exceto store e Replay) importa GameState
grep -rln "state/gameState\|: GameState\|GameState>" src/ui --include="*.tsx" --include="*.ts" | grep -v "store/" | grep -v "Replay.tsx"

# Nenhuma re-derivação de regra de status/phase fora da projeção
grep -rn "combat?\.phase\|combat\.phase\|\.status ===" src/ui/components src/ui/screens | grep -v "Replay.tsx"
```

**Aceite final:** `npx tsc -b` 0 erros · `npm run build` verde · `npm run lint` verde · `npx vitest run` verde · app jogável.

---

## Restrições

1. **Core intocado.** Zero mudanças em reducer/handlers/dispatch/DSL/systems/state machine. Se precisar de um predicado de regra, **exporte** o existente — não crie regra nova nem mude a existente.
2. **Sem regra duplicada na view.** Decisão de habilitação vem da projeção.
3. **Sem `@ts-ignore`/`any`.** Tipar de verdade.
4. **`cardName` continua sendo display** (rótulo PT-BR); a view o expõe. Identidade/lookup é por `cardId`/`skillId`.
5. **UI continua jogável ao fim de cada fase** (projeção dual durante a transição — `state` deprecated até a Fase 7).
6. **Não mesclar em `main`.**

---

## Definição de pronto

- [ ] Fase 1: `PlayerView` expõe `combat.{phase,selectedHeroId,round,lastRoll,...}`; teste da projeção verde.
- [ ] Fase 2: `selectHeroCombatActions` + `selectAvailableActions` centralizam a habilitação, consumindo predicados do core; testes verdes.
- [ ] Fase 3: store expõe `view`; `state` marcado `@deprecated`.
- [ ] Fase 4: `CombatActionPanel` consome `view`/descritores; grep limpo.
- [ ] Fase 5: `HeroFocusPanel` consome `view`/descritores; grep limpo.
- [ ] Fase 6: `Board`/`BoardFooter`/`Exploration` consomem `view`; grep limpo.
- [ ] Fase 7: `state` removido do contrato; greps de sanidade vazios (exceto store + Replay).
- [ ] `tsc -b`, `build`, `lint`, `vitest` verdes; app jogável.

## Convenção de commit (sugestão)

- `feat(projection): expor fase/seleção/round/roll de combate em PlayerView`
- `feat(projection): descritores de ação por herói consumindo predicados do core`
- `feat(store): expor view (PlayerView) no useGameStore`
- `refactor(ui): CombatActionPanel consome view e descritores`
- `refactor(ui): HeroFocusPanel consome view e descritores`
- `refactor(ui): Board/BoardFooter/Exploration consomem view`
- `refactor(ui): remover GameState cru do contrato do store`
