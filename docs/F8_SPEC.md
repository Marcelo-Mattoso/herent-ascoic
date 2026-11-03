# Revisão antes da F8 — estado genérico

Situação: conteúdo desacoplado (coupling 0/0), mas o estado ainda é do jogo. `GameState` (`src/core/state/gameState.ts`) mantém decks, despertar, heróis/inimigos, combate, ECS e 4 pendências próprias; `EngineState` (`src/engine/state.ts`) não é usado pelo core. ~75 usos de `.decks`, 66 de `despertar`, 17 de `.impeto`, 148 de `combat`; 7 pontos de dual-write via `ecs/sync.ts`. Persistência grava snapshot cru sem versão.

## F7.5 — Correções antes da F8

1. `src/core/skills/registry.ts` (continuations globais preenchidas por import em `src/data/scripts/power_deep_veil_echo.ts`, `skill_focus_deflection.ts`; lidas em `reducer/index.ts`) → parte de `createScriptRegistry(modules)` (`engine.scripts.continuationOf`). `resumeFrom` deve ser id, nunca closure.
2. `src/core/state/activation.ts`: `gameScopes` constante de módulo → usar `engine.scopes.registry` por parâmetro.
3. `src/core/rules/itemEffects.ts`: avaliador paralelo (`enemy.id === "boss"`, `boss_or_subboss`) → condições registradas (ex.: `is_boss` por tag/atributo) despachadas por `engine.kinds.test`.
4. Vocabulário roxo em `skills/dsl/schema.ts`, `skills/dsl/types.ts`, `skills/activationMode.ts`: stats e `damageType` vêm de registro do pacote, não `z.enum` fixo (pré-requisito do `StatRegistry`).
5. Duas pilhas (`effects/stack.ts` `effectStack` × pilha de `kinds.run`): decidir qual fica e registrar no plano.
6. `reducer/exploration.ts` (~670) recria `world` vazio e perde modificadores de escopo `game` (mascarado pelo sync): cobrir com teste/golden e documentar ou corrigir sem mudar goldens.
7. `npm run coupling`: nova métrica "acessos diretos a campos do GameState fora de `access.ts`".

## F8.0 — Acessores e versão

- `src/core/state/access.ts`: `deckOf`, `awakeningOf`, `impetoOf`, `statOf`, `combatOf`, `pendingOf` (e escritores correspondentes). Codemod trocando acessos diretos; representação não muda.
- `stateVersion` no snapshot e no `ReplayPackage`; envelope `{stateVersion, gameVersion, state}`; `persistence/migrations.ts` com cadeia `v0→v1…` de funções puras; snapshot sem envelope = v0; fixture congelada por migração.
- Guarda: falha se `state.decks|.despertar|.impeto|state.world` fora de `access.ts` e módulos donos.
- Pronto: guarda em 0; goldens idênticos.

## F8.1 — Zonas

- `GameState.engine: EngineState` (opcional no início). Zonas `dungeon.available/discarded/removed`, `enemy.*`, `item.*`, `artifact.*` com instâncias (`defId` = cardId). `deckOf()` lê zonas; escritores usam `moveCard/drawCards/shuffleZone`. Remover `GameDecks`/`DeckState`.
- Crítico: embaralhamento consome RNG na mesma ordem — provar equivalência (mesma seed → mesma permutação) ou injetar o shuffle do jogo.
- Diferencial em PR intermediário: `deckOf(z) === zoneIds(z)` em todo passo de goldens e bot.
- Riscos: topo = índice 0, `removed`, artefatos carregados por herói.
- Pronto: `GameDecks` removido; invariante "instância em exatamente uma zona" nos goldens e bot.

## F8.2 — Contadores

- `despertar` → contador `{scope: "game", key: "awakening"}` (0..4 validado pelo jogo). `impeto` → atributo da entidade-herói (decidir e registrar). Cor↔índice só na projeção/UI. `purple_damage_taken` → stat registrado pelo pacote (`StatName` = string com registro).
- Diferencial `awakeningOf/impetoOf` × campos antigos durante a transição. Eventos `contador.alterado` no log: filtrar dos goldens ou mudança aditiva documentada.
- Pronto: `rg "ColorIndex|\"impeto\"|purple_damage_taken" src/core/ecs` = 0; `GameState` sem `despertar`.

## F8.3 — ECS como fonte única (3 PRs)

1. Harness diferencial em `tools/golden`: a cada action de goldens e bot, stats pelo caminho antigo (campos + `CombatState`) = ECS (`getModifierTotal`); deve falhar se uma chamada de sync for removida.
2. Inverter: `HeroState`/`EnemyState` viram projeções do ECS; escritores só escrevem no world; `sync.ts` vira no-op e é apagado.
3. Flags por escopo de `CombatState` (`shieldsUsedThisCombat`, `powersUsedThisRoom`, `TemporaryEffect.roundsLeft`) viram componentes com duração de escopo ou contadores com escopo; `CombatState` fica só com fluxo (`phase`, `selectedHeroId`, `pairs`, `lastRoll`).
- Riscos: arredondamento/clamp de vida; derrotados/fugidos como entidades; `world` recriado em exploration.
- Pronto: `src/core/ecs/sync.ts` não existe; nenhum campo numérico de vida/atributo fora do ECS.

## F8.4 — Forma `{engine, game}`, pendências, persistência

- Raiz vira `GameState<TGame>` da engine com `engineOf/gameOf/withGame`.
- `pendingSkillTarget/Choice/TriggerInterrupt/Window` → `EngineState.pending` uma a uma (sub-PRs); actions de resposta traduzidas para `answerPending`; `paused`/`pendingChoicesOf` viram leitura direta.
- Diferencial `pendingChoicesOf(old) === engine.pending` durante a transição.
- Pronto: `TGame` sem `pending*`, `paused`, `decks`, `despertar`, world duplicado; save v1 carrega; replays antigos reproduzem goldens.

## ECS na engine (depois da F8)

- `src/engine/entities/`: `World`, `Entity`, `query`, `getModifierTotal`, durações por escopo (`escopo.encerrado`), `ComponentRegistry`/`StatRegistry` registrados pelo ruleset; world em `EngineState.entities`, ligado a `CardInstance`.
- Kinds `i_damage`, `i_heal`, `i_full_heal`, `p_modifier`, `i_dispel`, `i_remove_status`, `i_prevent_next_damage`, `add_trigger`, dados → `src/engine` com pontos de extensão (`damage.modify`/ref `modifier_stat`, `DamageType` registrável, stat de vida configurável). Ficam no jogo: `$lowest_life_hero`, `all_heroes`, `has_condition`, `$dungeon.*`. Critério: nano usa `i_damage` em entidades inventadas sem importar `src/core`.

## Persistência e replay

- Fonte de verdade = log de actions (seed + `LoggedAction[]`); snapshot só para retomada rápida; se migração falhar, recomputa pelo log.
- Goldens atuais guardados como fixtures v0; toda fatia deve reproduzi-los.
