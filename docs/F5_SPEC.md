# Revisão antes da F5 — ajustes de contrato e especificação

## Ajustes nos contratos de `src/engine` (fazer antes da F5)

- **P1 RNG único.** `src/engine/dice.ts` copia o hash de `src/core/ports/random.ts` mas deriva valores de outro jeito. `Dice` continua dado serializável; operações puras `roll(d, faces)`, `int(d, max)`, `id(d, prefix)` na engine; `ports/random.ts` vira adaptador fino sobre a engine com teste de equivalência bit a bit (`roll(seeded, n) == nextInt(rng, n).value + 1`, `nextId` idêntico). Goldens idênticos.
- **P1 Zonas com metadados e instâncias.** `Zone { id; owner?; visibility: "public"|"owner"|"hidden"|"count"; ordered; cards: CardInstanceId[] }` e `CardInstance { id; defId; owner?; controller? }`. `moveCard` opera por instância (duas cópias da mesma definição funcionam).
- **P1 Envelope de evento.** `EngineEvent<TMap> { seq; type; payload; cause?: number; actor?; visibleTo?: "all" | PlayerId[] }`. Um único emissor tipado (remover `emit` sem tipo). `EngineEventMap` com os eventos da própria engine (`carta.movida`, `dado.rolado`, `zona.embaralhada`, `contador.alterado`); jogo estende por interseção.
- **P1 `DslKind` em duas fases.** `DslKind<S, C, N> { kind; schema; category: "effect"|"condition"|"ref"; targets?(s, n, c); resolve(s, n, c): Step<S> }` com `Step<S> = {state} | {state; pending: Choice} | {state; push: KindNode[]}`. `runAll` vira laço sobre pilha que pode pausar. Validação zod no carregamento do conteúdo (`parse` uma vez), não a cada execução.
- **P2 Acessores.** `engineOf(state)`, `withEngine(state, fn)`, `gameOf`, `withGame`; nano usa só acessores.
- **P2 Contadores com escopo** (`{scope, id, name}`) e `players` mínimos no estado da engine.
- **P3 `drawCards` com política** `onEmpty: "error" | "reshuffle-from" | "stop"`.

## Correções das fases feitas

1. `GameState.events` do core: zerar por action (log da action) em vez de acumular sem limite; teste de arquitetura: `src/core/reducer|rules|skills` não lê `state.events`.
2. `PRE_WINDOW_EVENTS` (`src/core/events/bus.ts`) vira metadado derivado do mapa de eventos, não strings soltas.
3. Ordem causal: `RollResolved` gravado antes dos eventos pós-rolagem; usar `seq`/`cause`.
4. Guarda de arquitetura mais forte (`src/engine/architecture.test.ts`): termos `hero`, `monster`, `xp`, `reward`, `skill`, `exploration`, `combat` (por palavra, sem falso positivo de substring), detecção de `export … from` multilinha.
5. Métrica de acoplamento (`tools/golden/coupling.ts`): composition root = arquivo único; regex inclui `skillLocale`, `cardLocale`, `package.json`; **fechamento transitivo** — nenhum módulo fora do root alcança `src/data`/catálogos por import de valor (`import type` liberado). Nova baseline.

## Especificação da F5

Tipos genéricos em `src/engine/compose.ts`:

```ts
export interface ContentPort<TCard, TAbility> {
  card(id: string): TCard;
  cards(): readonly TCard[];
  abilitiesOf(cardId: string): readonly { def: TAbility; ref: unknown }[];
  ability(id: string): TAbility;
  text(key: string, params?: Record<string, unknown>): string;
}
export interface RequirementPort<S> { met(state: S, req: { kind: string; [k: string]: unknown }, src: SourceRef): boolean }
export interface ScopePort<S> { scopes: readonly string[]; key(state: S, scope: string, src: SourceRef): string }
export interface Ruleset<TBalance, TTransitions> { id: string; version: string; balance: TBalance; transitions: TTransitions; eventRules: unknown }
export interface EngineConfig<S, TCard, TAbility, TBal, TTr> {
  ruleset: Ruleset<TBal, TTr>; content: ContentPort<TCard, TAbility>;
  dice: (seed: number) => Dice; requirements: RequirementPort<S>; scopes: ScopePort<S>;
}
export function createEngine<...>(cfg: EngineConfig<...>): Engine<...>; // valida, congela, pré-indexa
```

- Composition root do jogo: **um arquivo** em `src/core` (ex.: `src/core/composition.ts`), único que importa `data/cards`, `data/skills`, `data/abilities`, `config/defaults`, os JSON, locales e `package.json`. Exporta `createAscensaoEngine()`.
- Módulos do core recebem a engine por parâmetro explícito no ponto de entrada (`createReducer(engine)`) e por contexto por chamada (`ctx.engine`) junto de `EvalCtx`/`SkillContext`. **Sem singleton/global.** UI (`gameStore`), golden, bot e testes obtêm a engine pelo composition root (ou montam uma com conteúdo falso).
- Ordem de migração (golden idênticos a cada grupo):
  1. Leitura de catálogo: `skills/lookup.ts` → `content.abilitiesOf` (conserta `triggers/engine.ts`, `events/bus.ts`); `skills/useSkill.ts`, `skills/resolveSkillWindow.ts`, `events/effectResolver.ts`, `abilities/prepared.ts`, `abilities/executor.ts`.
  2. Regras puras: `rules/conditions.ts`, `rules/equipment.ts`, `rules/inventoryMoves.ts`, `rules/itemEffects.ts`.
  3. Ruleset: `rules/stateMachine.ts` (`transitions.json`), `effects/resolver.ts` (`event_rules.json`), `config/defaults` em `actions/creators.ts`, `actions/types.ts` (se só tipo, troca por tipo do ruleset), `reducer/exploration.ts`, `reducer/reward.ts`, `reducer/setup.ts`.
  4. Reducers: `reducer/boss.ts`, `combat.ts`, `progression.ts`, `reward.ts`, `createReducer(engine)` em `reducer/index.ts`.
  5. Projeção/saída: `projection/playerView.ts`, `projection/abilityActions.ts`, `journal/gameJournal.ts` (versão do `ruleset.version`), `persistence/localStoragePersistence.ts`.
  6. Locale: `skills/dsl/evaluate.ts` → `content.text`.

### Critério de pronto da F5

- `coupling.ts` endurecido; `catalogImports === 0` e `transitiveCatalogReach === 0`; teste falha se subir.
- Golden idênticos; bot sem falhas novas.
- Nano montado via `createEngine({ content: nanoContent, ruleset: nanoRuleset, dice: () => scriptedDice([...]), … })`, sem import de `src/core`.
- Teste do core rodando uma action com `ContentPort` falso (carta inventada com uma skill inventada).
- `grep` por acesso a catálogo global fora do composition root = 0.
