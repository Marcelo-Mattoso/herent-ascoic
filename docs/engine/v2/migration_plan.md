# Plano de migração — arquitetura web

Plano de implementação da arquitetura descrita em [`card_game_architecture_web.html`](./card_game_architecture_web.html) sobre a base de código atual. Quatro fases, treze passos, cada um deployável sozinho.

> **Para quem vai implementar:** leia o passo inteiro antes de começar. Cada um tem _objetivo_, _arquivos tocados_, _contrato_ (com tipos TS quando relevante), _cuidados_, _testes_ e _critério de aceitação_. Ordem é dependency-aware: não pule, não inverta. Quando algo cheirar a "dá pra fazer mais simples", **veja a seção "Por que esse passo existe"** antes de cortar — geralmente esse atalho é o que quebra a contabilidade na fase 2.

---

## Propósito

Esta arquitetura existe pra fazer **a contabilidade do jogo fechar**. Skills, items, conditions, tokens, modifiers se combinam em centenas de configurações; hoje o motor erra a contabilidade porque cada efeito é aplicado por um handler isolado que não enxerga os outros. A arquitetura corrige isso via três escolhas estruturais que andam juntas:

1. **Data-driven** — toda regra é dado declarativo, não código espalhado.
2. **Event-driven** — efeitos reagem a eventos pelo barramento, não por chamadas diretas.
3. **Component-based (ECS)** — entidades são compostas por componentes plugáveis; sistemas processam queries sobre eles.

O passo que faz a contabilidade fechar é a **Fase 2** (ECS + sistemas + event bus + stack). As outras fases existem pra que a Fase 2 seja possível e que o resultado seja persistível, observável e portável.

---

## Princípios que valem para todos os passos

1. **Não quebrar `npm test`.** Se um teste passa a falhar, o problema é do passo, não do teste — investigue antes de mudar o teste.
2. **Não quebrar a interface.** A UI continua jogável ao final de cada passo. Isso significa que mudanças de shape no estado **devem entrar atrás de uma projeção ou de campos derivados** durante a transição.
3. **Estado, comandos e eventos serializáveis** — no `GameState` persistido e em payloads de action/evento: nada de `Date`, `Map`, `Set`, closures, classes com métodos. Em variáveis locais de helpers, qualquer coisa serve.
4. **Determinismo é invariante depois do passo 2.** Mesma seed + mesma sequência de ações = mesmo resultado. Sem `Math.random` solto, sem `crypto.randomUUID` no core.
5. **Direção única de fluxo.** UI emite comando → adapter → rules → effect resolver → sistemas → event bus → projeção → UI. Nunca o contrário. A UI nunca escreve no game state direto.
6. **PRs pequenos.** Cada passo é um PR. Se um passo está crescendo demais, ele está mal dividido — pare, divida, alinhe antes de continuar.
7. **Commit messages seguem o repo.** Sem `Co-Authored-By: Claude` (ver `CLAUDE.md`).

---

# Passo 0 — Baseline e instrumentação

**Objetivo.** Estabelecer o ponto de comparação antes de tocar em nada.

**Ações.**
- Rodar `npm test` e anotar a contagem de testes verdes (`N_baseline`).
- Rodar `npm run build` e confirmar build limpo.
- Criar branch `refactor/web-architecture` a partir de `main`.
- Anotar tamanho do `dist/` para comparação ao final.

**Critério de aceitação.** Branch criada, baseline registrada em mensagem do commit inicial.

---

# Fase 1 — Fundação (estado, determinismo, dados)

A Fase 1 prepara o terreno: o estado vira inspectionável (action log), o motor vira determinístico (RNG seedado), o conteúdo vira único e declarativo (data-driven + state machine), e a interface fica desacoplada do shape interno (projeção). Sem isso, a Fase 2 quebra a UI sem rede de segurança.

---

## Passo 1 — Formalizar o action log (Command Pattern)

**Por que esse passo existe.** Hoje as actions passam pelo reducer e desaparecem. O log explícito é pré-requisito de: replay, persistência robusta, bug repro, time-travel no devtools, e — mais importante pra Fase 2 — investigação de erro de contabilidade ("qual sequência de comandos levou a esse estado?").

**Arquivos tocados.**
- `src/core/state/gameState.ts` — adicionar `actionLog` ao `GameState`.
- `src/core/actions/types.ts` — adicionar tipo `LoggedAction`.
- `src/core/reducer/index.ts` — envelopar o reducer para apendar a action.

**Contrato.**

```ts
// src/core/actions/types.ts
export interface LoggedAction {
  readonly seq: number;        // 0, 1, 2, ... — índice na sequência
  readonly action: Action;     // a action original, intacta
  // SEM timestamp — depende de relógio, fere determinismo.
  // Se precisar de tempo, injetar via porta no passo 11.
}

// Em GameState:
readonly actionLog: readonly LoggedAction[];

// Reducer público vira:
function reducer(state: GameState, action: Action): GameState {
  const next = reducerCore(state, action);  // a lógica atual, renomeada
  return {
    ...next,
    actionLog: [
      ...next.actionLog,
      { seq: next.actionLog.length, action },
    ],
  };
}
```

**Cuidados.**
- `START_GAME` reinicia o jogo — o `actionLog` resultante deve ter exatamente uma entrada (o próprio `START_GAME`). Não preservar log entre partidas.
- Action que retorna `state` sem mudanças (ex: `APPLY_DAMAGE` no reducer atual, que é no-op) **ainda assim entra no log** — o log registra intenções, não efeitos.
- Não filtrar nenhuma action. Mesmo as "internas" que a UI nunca dispara entram.
- O `eventLog` atual (strings pra UI) é **diferente** do `actionLog`. Preserve os dois — o primeiro é para a UI, o segundo é autoritativo.

**Testes a adicionar.**
- `actionLog.length === N` após `N` dispatches.
- `actionLog[i].seq === i` para todo `i`.
- `actionLog[i].action` é exatamente a action passada (deep equal).

> **Nota:** o teste "re-aplicar o log produz o mesmo estado final" **não pode entrar aqui**. Hoje o reducer chama `Math.random`; duas execuções divergem. Esse teste entra no passo 2.

**Critério de aceitação.** Suíte verde + 3 testes estruturais novos passando.

---

## Passo 2 — Determinismo via seed (RNG no estado)

> **Estimativa real: 2 dias.** Este é o passo mais invasivo da Fase 1. O RNG precisa ser _threaded_ por ~19 call sites no reducer. Não tem atalho. Leia até o fim antes de começar.

**Por que esse passo existe.** Determinismo é pré-requisito de: replay funcional, bug repro com seed + log, testes confiáveis sem flakiness, e — crítico pra Fase 2 — auditoria do effect resolver ("processou X componentes, RNG estava no estado N, resultado deveria ser Y"). Sem isso, qualquer divergência de contabilidade vira "às vezes acontece".

**Fontes de não-determinismo a eliminar (lista exaustiva por grep):**
- `Math.random()` via default de `shuffle` e `rollDice`.
- `crypto.randomUUID()` em `createHeroFromCard`, `createEnemyFromCard`, `createInitialGameState`.
- Tempo (`Date.now()`, `new Date()`) — **não usado hoje**, manter assim. Se um dia entrar, tratar igual: injetar via porta.

**O que NÃO precisa refactor (conferido por grep, não invente trabalho).**
- `src/core/strategies/*` (`bossSelection`, `effectOrder`, `itemDistribution`, `targetSelection`, `tiebreak`) — puras sobre input.
- `src/core/rules/*` exceto `dice.ts` — puras.

**Arquivos tocados.**
- Novo: `src/core/ports/random.ts` (PRNG seedado, puro em dados).
- `src/core/state/gameState.ts` — adicionar `rng` ao state; substituir `crypto.randomUUID` em `gameId` por placeholder.
- `src/core/reducer/utils.ts` — `shuffle`, `createHeroFromCard`, `createEnemyFromCard` mudam de assinatura.
- `src/core/rules/dice.ts` — `rollDice` muda de assinatura.
- `src/core/actions/types.ts` — `START_GAME` recebe `seed` e `gameId` no payload.
- Todos os call sites listados em "Refactor obrigatório".

**Contrato.**

```ts
// src/core/ports/random.ts
// PRNG determinístico inteiramente em dados — sem closures, sem classes.
// Implementação sugerida: mulberry32 ou splitmix32. Pequeno, rápido,
// período suficiente para uma partida.

export interface RngState {
  readonly seed: number;     // imutável após START_GAME
  readonly counter: number;  // incrementa a cada chamada
}

export function createRng(seed: number): RngState;
export function nextFloat(rng: RngState): { value: number; next: RngState };
export function nextInt(rng: RngState, max: number): { value: number; next: RngState };
export function nextId(rng: RngState, prefix: string): { value: string; next: RngState };
// ^ nextId substitui crypto.randomUUID. Sugestão: prefixo curto ("h","e","r")
// + counter em base36. Único dentro da partida, determinístico pela seed.

// Em GameState:
readonly rng: RngState;
readonly gameId: string;  // deixa de ser crypto.randomUUID
```

**Estado pré-partida.** `createInitialGameState(EMPTY_CONFIG)` roda em module-load do store, antes de qualquer `START_GAME`. Não pode chamar `crypto`. Use placeholder estável: `gameId: "__PREGAME__"`, `rng: createRng(0)`. O `START_GAME` real substitui ambos pelo valor injetado.

**Seed e gameId vêm de fora do core.** `START_GAME.payload` carrega `{ seed, gameId, ...config }`. Quem chama (a UI hoje) é responsável por gerar — esse é o único ponto onde `Math.random()` / `crypto.randomUUID()` é aceitável, porque está fora do core. **`gameId` NÃO é derivado da seed** — duas partidas com mesma seed precisam ter `gameId` distintos pra não colidir no log persistido.

**Refactor obrigatório — lista exaustiva.**

Call sites de `shuffle` sem RNG (~14, viram chamadas com `withRng`):
- `src/core/reducer/setup.ts` (4×): linhas ~79, 84, 88, 90
- `src/core/reducer/exploration.ts` (5×): linhas ~319–322, 332
- `src/core/reducer/progression.ts` (1×): linha ~56
- `src/core/reducer/reward.ts` (1×): linha ~268
- `src/core/reducer/combat.ts` (1×): linha ~520 (flee → reshuffle enemy deck)
- `src/core/reducer/exploration.ts` `handleRestartDungeon` — múltiplos shuffles
- `src/core/skills/handlers/recoverDungeon.ts` (1×): handler de skill, **não esqueça**

Call sites de `rollDice` sem RNG (~5):
- `src/core/reducer/combat.ts` (3×): linhas ~204, 205, 719
- `src/core/reducer/boss.ts` (2×): linhas ~178, 179

Call sites de `crypto.randomUUID` (viram `nextId`):
- `src/core/reducer/utils.ts` em `createHeroFromCard` (linha ~25) e `createEnemyFromCard` (linha ~48)
- `src/core/state/gameState.ts` em `createInitialGameState` → vira `"__PREGAME__"` literal

**Helper de threading — use este, não invente padrão próprio.**

```ts
// src/core/reducer/utils.ts
export function withRng<T>(
  state: GameState,
  fn: (rng: RngState) => { value: T; next: RngState },
): { state: GameState; value: T } {
  const { value, next } = fn(state.rng);
  return { state: { ...state, rng: next }, value };
}
```

Padrão de uso uniforme:

```ts
// antes
const shuffled = shuffle(roomNames);

// depois
const { state: s1, value: shuffled } = withRng(state, r => shuffleRng(roomNames, r));
state = s1;
// segue usando `state` (com rng avançado) e `shuffled`
```

Quando há múltiplas operações de RNG no mesmo handler, encadeie:

```ts
const { state: s1, value: shuffled } = withRng(state, r => shuffleRng(arr, r));
const { state: s2, value: roll } = withRng(s1, r => rollDiceRng(3, 6, r));
return { ...s2, /* aplica shuffled e roll */ };
```

Tedioso mas **uniforme** — e é o que torna o passo auditável.

**Testes a adicionar.**
- **Replay determinístico (o teste que faltou no passo 1):** dado um log de N actions começando em `START_GAME` com seed S, aplicar `log.reduce(reducerCore, initialState)` produz o mesmo `GameState` final que dispatchar as N actions em sequência. Deep equal.
- Mesma seed + mesma sequência de actions → mesmo `GameState` final, executando 2× separadamente.
- Seeds diferentes → resultados diferentes em pelo menos uma rolagem.
- Reset do PRNG não acontece em meio de partida (counter monotonicamente crescente entre actions).

**Cuidados.**
- `src/core/rules/reward.test.ts` usa `crypto.randomUUID` diretamente — atualize pra usar os helpers determinísticos.
- O state pré-partida (`__PREGAME__`) é especial: dispatchar qualquer action exceto `START_GAME` sobre ele deve ser no-op ou erro explícito. Não invente comportamento.
- Cuidado com iteração sobre objetos no reducer — `Object.keys` em JS moderno respeita ordem de inserção pra chaves string, mas ordene explicitamente quando o resultado vira RNG ou shuffle.

**Critério de aceitação.**
- Suíte verde, incluindo os 4 testes novos.
- `grep -r "Math.random\|crypto\." src/core/` retorna **zero** ocorrências.
- Replay test passa com pelo menos uma partida sintética de 20+ actions construída no próprio teste.

---

## Passo 3 — Data-Driven + State Machine explícita

**Por que esse passo existe.** O princípio "toda regra é dado" só vale se realmente tudo de regra vive em dado. Hoje há lógica de jogo hardcoded em arquivos `.ts` (boss access condition, lista de skills não implementadas, presets de dificuldade). Também: a máquina de estados das fases existe **implícita** no reducer (`switch (state.status)`) mas sem validação central — qualquer handler pode escrever qualquer `status`. Esses dois pontos viram um passo só porque tocam o mesmo lugar (`src/data/` + `src/core/rules/`).

**Parte A — Consolidação data-driven.**

**Migrar pra `src/data/`:**
- `src/core/rules/conditions.ts` (`checkBossCondition`) → boss declara campo `accessCondition` em `cards.json`; rules engine interpreta.
- `src/core/skills/handlers/index.ts` array `noopTypes` → metadados em `skills.json`.
- `src/core/config/defaults.ts` — separar configuração de jogo (vai pra `src/data/balance.json`) de configuração de build (`FEATURE_FLAGS`, fica em `.ts`).

**Regra de ouro:** depois deste passo, `grep -r "cardName\|hero[A-Z]\|boss[A-Z]" src/core/` retorna referências apenas a tipos e a lookups por chave — nenhum nome literal de carta ou regra de balanceamento em código TS.

**Parte B — State machine explícita.**

Hoje `GameStatus` é um union type (`MAIN_MENU | SETUP | EXPLORATION | ... | VICTORY`) e cada handler escreve onde quer. Vira:

```ts
// src/data/transitions.json
// Tabela declarativa de transições permitidas.
{
  "MAIN_MENU":   ["SETUP"],
  "SETUP":       ["EXPLORATION", "MAIN_MENU"],
  "EXPLORATION": ["COMBAT", "BOSS_CHECK", "DUNGEON_EXHAUSTED"],
  "COMBAT":      ["EXPLORATION", "REWARD", "DEFEAT"],
  ...
}
```

```ts
// src/core/rules/stateMachine.ts
export function canTransition(from: GameStatus, to: GameStatus): boolean;
export function assertTransition(from: GameStatus, to: GameStatus): void;  // throw se inválido
```

**Cuidados.**
- Toda escrita em `state.status` no reducer passa por `assertTransition`. Onde houver violação, é bug real — investigue, não relaxe a tabela.
- Sub-fases de combate (`selecting_hero`, `targeting`, `rolling`, etc.) entram como sub-máquina separada por enquanto. Não tentar unificar agora.
- A tabela é dado; o validador é regra. Mantenha essa separação.

**Arquivos tocados.**
- `src/data/cards.json` — campo `accessCondition` em bosses.
- `src/data/skills.json` — metadados de `noopTypes` (ou retirar e tratar como sinal de "não implementado" via ausência no registry).
- Novo: `src/data/balance.json`.
- Novo: `src/data/transitions.json`.
- Novo: `src/core/rules/stateMachine.ts`.
- `src/core/rules/conditions.ts` — vira interpretador de `accessCondition`, não switch hardcoded.
- `src/core/reducer/*` — todos os pontos que escrevem `status` passam por `assertTransition`.
- `src/core/config/defaults.ts` — só feature flags e config de build.

**Testes a adicionar.**
- Cada transição válida do `transitions.json` é exercitada por um teste.
- Tentar transição inválida em ambiente de teste lança erro claro.
- `checkBossCondition` continua passando com o boss atual, lendo de `cards.json`.

**Critério de aceitação.**
- Suíte verde.
- Nenhum nome literal de carta em código (grep limpo).
- Toda escrita em `state.status` passa por `assertTransition`.
- `transitions.json` lista exatamente as transições que existem (sem mortas, sem faltando).

---

## Passo 4 — Projeção mínima (extração)

**Por que esse passo existe.** Este é um passo de _preparação_ pra Fase 2. Hoje a UI lê `hero.currentLife` direto. Na Fase 2 vamos mudar o shape interno (entidades viram compostas de componentes). Pra não quebrar a UI quando o shape muda, precisamos da projeção como camada de tradução **antes** de mexer no shape. A projeção completa (aiView, replayView com regras diferenciadas) é o passo 9 — aqui é só o esqueleto.

**Arquivos tocados.**
- Novo: `src/core/projection/playerView.ts`.
- `src/ui/store/selectors.ts` — passa a delegar à projeção.
- Não tocar componentes React.

**Contrato.**

```ts
// src/core/projection/playerView.ts
// Por enquanto retorna shape idêntico ao GameState atual (passthrough).
// Existe pra que, no passo 5, a UI continue lendo a mesma forma mesmo
// que o GameState interno mude.
export interface PlayerView {
  readonly status: GameStatus;
  readonly heroes: readonly HeroView[];
  readonly enemies: readonly EnemyView[];
  readonly currentRoom: RoomView | null;
  readonly availableActions: readonly AvailableAction[];
  // ... cobertura completa do que a UI hoje consome
}

export function playerView(state: GameState): PlayerView;
```

Por ora, `HeroView` é um alias estrutural de `HeroState`, `EnemyView` de `EnemyState`. **Isso muda na Fase 2** — quando entities viram component-shape, a projeção é o lugar que reconstrói `HeroView` com o shape estável que a UI espera.

**Cuidados.**
- Projeção é função pura `GameState → View`. Não muta nada.
- Não invente views que ninguém consome. Mantenha 1:1 com o que a UI precisa.
- Componentes React continuam consumindo via selectors do store. Os selectors agora chamam `playerView(state)`.

**Testes a adicionar.**
- `playerView` é referencialmente transparente: mesmo `state` → mesma referência (memoizar com `useMemo`-equivalente se necessário, mas comece sem).
- Spot-check: cada selector existente continua retornando o mesmo valor através da projeção.

**Critério de aceitação.** Suíte verde. UI inalterada. Nenhum import em `src/ui/` que toca `GameState` direto — tudo via `PlayerView`.

---

# Fase 2 — Núcleo do engine (ECS, sistemas, eventos, stack)

**Esta é a fase que faz a contabilidade fechar.** Antes daqui, o motor é uma máquina de estados com handlers monolíticos competindo. Depois daqui, é um motor onde cada cálculo tem um sistema, cada sistema enxerga todas as fontes via query, eventos abrem janelas de modificação, e cadeias resolvem pela stack.

Quatro passos. Em ordem: ECS world → sistemas que usam ele → event bus que coordena sistemas → stack que ordena cascatas.

---

## Passo 5 — ECS world: entities + components

**Por que esse passo existe.** Sem composição via componentes, cada tipo novo de capacidade vira um campo novo em `HeroState` ou um switch novo em handler. O resultado é o estado atual: lógica espalhada que não enxerga a si mesma. Componentes uniformes permitem que sistemas processem queries (`"todos os componentes de redução de dano nesta entidade"`) — é o que abre o caminho pros passos 6-8.

**Contrato — o modelo de componentes.**

```ts
// src/core/ecs/types.ts

export type EntityId = string;

export type EntityType = "hero" | "enemy" | "room" | "item_in_play" | "subboss";

export interface Entity {
  readonly id: EntityId;
  readonly type: EntityType;
  readonly components: readonly Component[];
}

// Union discriminada de todos os tipos de componente.
// Componentes são DADOS — sem métodos, sem referências vivas.
export type Component =
  // Core (intrínsecos a tipos de entidade)
  | HealthComponent
  | DamageStatComponent
  | DiceComponent
  | ImpetoComponent
  // Plugáveis (adicionados/removidos dinamicamente)
  | ConditionComponent
  | ItemEquippedComponent
  | ItemBackpackComponent
  | TokenComponent
  | ModifierComponent
  | TriggerComponent;

export interface HealthComponent {
  readonly type: "health";
  readonly current: number;
  readonly max: number;
  readonly healBlocked: boolean;
}

export interface ModifierComponent {
  readonly type: "modifier";
  readonly target: "damage_dealt" | "damage_taken" | "healing_received" | "dice_count" | "hit_bonus";
  readonly operation: "add" | "multiply" | "set" | "clamp";
  readonly value: number;
  readonly source: EntityId;             // quem criou
  readonly duration: Duration;
  readonly condition?: ComponentPredicate; // opcional: aplica só se predicado bate
}

export interface TriggerComponent {
  readonly type: "trigger";
  readonly on: EventType;            // nome do evento que escuta
  readonly condition?: ComponentPredicate;
  readonly effect: EffectDescriptor; // o que fazer quando dispara
  readonly source: EntityId;
  readonly duration: Duration;
}

export type Duration =
  | { kind: "permanent" }
  | { kind: "this_turn" }
  | { kind: "this_combat" }
  | { kind: "rounds"; remaining: number }
  | { kind: "once" };
```

**Contrato — o World.**

```ts
// src/core/ecs/world.ts

export interface World {
  readonly entities: Readonly<Record<EntityId, Entity>>;
}

// API uniforme — não importa se o componente é "core" ou "plugado".
export function getComponent<T extends Component>(
  world: World, entityId: EntityId, type: T["type"]
): T | undefined;

export function getComponents<T extends Component>(
  world: World, entityId: EntityId, type: T["type"]
): readonly T[];

export function hasComponent(world: World, entityId: EntityId, type: ComponentType): boolean;

export function addComponent(world: World, entityId: EntityId, component: Component): World;
export function removeComponent(world: World, entityId: EntityId, predicate: (c: Component) => boolean): World;
export function updateComponent<T extends Component>(
  world: World, entityId: EntityId, type: T["type"], updater: (c: T) => T
): World;

// Queries
export function query(
  world: World, predicate: (e: Entity) => boolean
): readonly Entity[];

export function queryWithComponent<T extends Component>(
  world: World, type: T["type"]
): readonly { entity: Entity; component: T }[];
```

**Integração com GameState.**

```ts
// Em GameState:
readonly world: World;

// Os campos antigos de heroes/enemies VIRAM PROJEÇÕES sobre o world,
// não fonte primária. Manter como helper enquanto a UI lê:
get heroes(): readonly HeroState[]   // computa de world.entities, filter type==="hero"
get enemies(): readonly EnemyState[] // idem
```

Mas getters em estado serializável são problema. Solução: **manter os campos como dados duplicados durante a transição** (`heroes: HeroState[]` continua existindo, sincronizado com `world` a cada operação) e **deletar na Fase 2.3 (passo 8) ou depois** quando todos os sistemas estiverem migrados. Não tente deletar de uma vez.

**Estratégia de migração.**
1. Criar `world` vazio em `createInitialGameState`.
2. `handleStartGame` constrói entidades pra heróis/inimigos/sala no `world` ao mesmo tempo que popula `heroes`/`enemies`.
3. Toda escrita em `heroes`/`enemies` é espelhada em `world`. Helper:

```ts
function syncEntityFromHero(world: World, hero: HeroState): World {
  // (re)cria a entidade-hero no world a partir do HeroState
}
```

4. Sistemas novos (passo 6) leem só do `world`.
5. Handlers antigos continuam lendo de `heroes`/`enemies` até serem migrados pra sistemas (passo 6).
6. Projeção (passo 4) reconstrói `HeroView` a partir do `world` quando o passo 6 começar a deletar campos de `HeroState`.

**Arquivos tocados.**
- Novo: `src/core/ecs/types.ts`, `src/core/ecs/world.ts`.
- Novo: `src/core/ecs/sync.ts` (helpers de sincronização durante transição).
- `src/core/state/gameState.ts` — adicionar `world`.
- `src/core/reducer/setup.ts` — popular `world` em `handleStartGame`.
- `src/core/reducer/utils.ts` — sincronizar `world` em `createHeroFromCard`, `createEnemyFromCard`.

**Testes a adicionar.**
- `getComponent` retorna o que `addComponent` colocou.
- `removeComponent` com predicado remove só o casado.
- `query` retorna entidades que satisfazem o predicate.
- Sincronização: após `handleStartGame`, `world.entities` tem 1 entry por herói + 1 por inimigo ativo, com componentes corretos.
- Imutabilidade: `addComponent(world, ...)` retorna novo `World`; o anterior intocado.

**Critério de aceitação.** Suíte verde. `world` populado paralelamente aos campos antigos. Nenhum sistema novo ainda — só a infra do ECS funcionando.

---

## Passo 6 — Sistemas com queries (substituindo handlers)

> **Estimativa real: 2.5 dias.** Este passo migra 35+ handlers e regras de combate pra sistemas que processam queries. É refactor mecânico mas extenso.

**Por que esse passo existe.** É **onde a contabilidade passa a fechar**. Sem sistemas, cada handler aplica seu efeito sozinho sem ver os outros. Com sistemas, há um único lugar onde cada tipo de cálculo acontece, e ele enumera todas as fontes via query antes de calcular.

**Princípio operacional.**

> **Um cálculo, um sistema, uma query.**
>
> Dano não é aplicado por uma skill nem por um item nem por uma condition — é aplicado pelo `damageSystem`, que recebe a intenção e enumera **todas** as fontes relevantes via query no ECS antes de calcular. Mesma ideia pra cura, draw, modificação de rolagem.

**Sistemas a criar (mínimo viável).**

```ts
// src/core/systems/damageSystem.ts
export function applyDamage(
  state: GameState,
  source: EntityId,
  target: EntityId,
  baseAmount: number,
  damageType: DamageType,
): GameState;
// Internamente:
//  1. emit DamageAboutToBeDealt (passo 7) com accumulator mutável (em payload)
//  2. listeners (armor, prevent, redirect) ajustam o accumulator
//  3. lê HealthComponent do target via query
//  4. escreve novo HealthComponent (clamped em [0, max])
//  5. emit DamageDealt
//  6. checa se target morreu → emit EntityDefeated

// src/core/systems/healSystem.ts
export function applyHeal(
  state: GameState,
  source: EntityId,
  target: EntityId,
  baseAmount: number,
): GameState;
// Similar — consulta heal-block, heal-modifier, etc.

// src/core/systems/drawSystem.ts
export function drawFromDeck(
  state: GameState,
  deck: DeckName,
  count: number,
): { state: GameState; cards: readonly string[] };
// Consulta modifiers que mexem com draw (recover, prevent, replace)

// src/core/systems/diceSystem.ts
export function rollAttack(
  state: GameState,
  attacker: EntityId,
  defender: EntityId,
): { state: GameState; result: AttackResult };
// Compõe: dice base + dice modifiers + hit bonuses + diceFix

// src/core/systems/conditionSystem.ts
export function applyCondition(
  state: GameState,
  target: EntityId,
  condition: ConditionInstance,
): GameState;

export function expireConditions(
  state: GameState,
  trigger: "turn_end" | "combat_end" | "rounds_tick",
): GameState;

// src/core/systems/modifierSystem.ts
export function queryActiveModifiers(
  world: World,
  target: EntityId,
  modifierTarget: ModifierComponent["target"],
): readonly ModifierComponent[];
// Lookup utilitário usado pelos outros sistemas
```

**Migração de handlers.**

Cada handler em `src/core/skills/handlers/*` que hoje aplica efeito direto vira **descritor de efeito** que um sistema interpreta. Exemplo:

```ts
// Antes (src/core/skills/handlers/heal.ts):
export function handleHeal(state, ctx, value): GameState {
  // mexe direto no currentLife
}

// Depois:
export function handleHeal(state, ctx, value): GameState {
  const amount = parseValueAsNumber(value);
  return applyHeal(state, ctx.sourceHeroId, ctx.targetHeroId, amount);
  // a lógica de cura está no healSystem, não aqui
}
```

Handlers viram **thin wrappers** que traduzem `(ctx, value)` em chamada de sistema. A lógica de cálculo migra inteira pros sistemas.

Mesmo tratamento para os reducers de combate e exploração: `reducer/combat.ts` que hoje aplica dano direto chama `applyDamage` do sistema.

**Ordem sugerida de migração.**
1. `damageSystem` + `healSystem` (cobre maior parte das skills + combat)
2. `diceSystem` (combat rolls)
3. `drawSystem` (deck operations)
4. `conditionSystem` (status effects)
5. `modifierSystem` (utility — já implementado quando os outros precisarem)

Cada sistema vira um sub-PR (~meio dia cada). Mantém PRs revisáveis.

**Arquivos tocados.**
- Novo: `src/core/systems/{damage,heal,draw,dice,condition,modifier}System.ts`.
- `src/core/skills/handlers/*` — refatorados pra delegar a sistemas.
- `src/core/reducer/{combat,exploration,reward}.ts` — chamam sistemas em vez de aplicar direto.

**Cuidados.**
- **Sistemas são funções puras sobre `GameState`.** Sem estado interno, sem side effects.
- **Não duplicar regras.** Se `damageSystem` consulta armor, então armor não pode ser aplicado por nenhum outro caminho — só via componente que o `damageSystem` enumera.
- Durante a migração, mantenha o campo `currentLife` em `HeroState` sincronizado com `HealthComponent`. Quando todos os sistemas estiverem migrados, o campo pode ser removido (mas isso é passo subsequente, não aqui).
- Aproveite pra mover regras puras que estão no reducer hoje (ex: `calculateTotal` já vive em `rules/combat.ts`) pra dentro dos sistemas onde fazem sentido.

**Testes a adicionar.**
- Cada sistema tem testes próprios em `src/core/systems/__tests__/`.
- Pelo menos um teste **integrado** por sistema: setup state com fontes diversas (skill + item + condition + modifier), aplicar sistema, verificar que a contabilidade fecha. Este é o teste que prova que o passo cumpriu o propósito.
- Testes existentes de combat/skills devem continuar verdes — a interface externa não muda.

**Critério de aceitação.**
- Suíte verde.
- Toda aplicação de dano/cura/draw passa por sistema. Grep: `currentLife =` em código fora de `damageSystem`/`healSystem` é zero (exceto sync helper do passo 5).
- Pelo menos um teste de contabilidade composta (skill + item + condition simultâneos) passando.

---

## Passo 7 — Event bus interno (síncrono, com janelas pré/pós)

**Por que esse passo existe.** Sistemas calculam corretamente, mas precisam abrir janelas pra outros sistemas modificarem. Sem bus, todo modificador teria que ser conhecido pelo sistema que aplica (ex: `damageSystem` precisaria saber sobre cada tipo de skill que reduz dano). Com bus, sistemas emitem eventos, listeners se inscrevem por nome — desacoplamento.

**Princípios operacionais.**

1. **Eventos são síncronos.** `bus.emit(event)` percorre listeners em ordem determinística e retorna. Sem fila assíncrona.
2. **Eventos têm janela pré e pós.** `DamageAboutToBeDealt` é a janela pré-aplicação (listeners modificam o valor); `DamageDealt` é a janela pós (listeners reagem ao fato).
3. **Listeners são `TriggerComponent`s no world.** Skills com trigger `on_damage_taken` adicionam um `TriggerComponent` à entidade do herói; o bus consulta `queryWithComponent("trigger")` pra achar quem reage.
4. **Eventos disparados dentro de listeners NÃO entram em recursão direta** — viram pending effects pra stack (passo 8). Aqui no passo 7, **eventos não disparam outros eventos**; isso é restrição temporária do passo 7, removida no passo 8.

**Contrato.**

```ts
// src/core/events/types.ts

export type EventType =
  | "DamageAboutToBeDealt"
  | "DamageDealt"
  | "HealAboutToBeApplied"
  | "HealApplied"
  | "EntityDefeated"
  | "RoomEntered"
  | "CombatStarted"
  | "CombatEnded"
  | "TurnStarted"
  | "TurnEnded"
  | "CardDrawn"
  | "SkillUsed";

export interface GameEvent {
  readonly type: EventType;
  readonly payload: Record<string, unknown>;  // tipado por tipo de evento (discriminado)
}

// Eventos com janela pré têm um accumulator no payload.
// Listeners modificam o accumulator; o sistema lê o resultado.
export interface DamageAboutToBeDealtEvent {
  readonly type: "DamageAboutToBeDealt";
  readonly payload: {
    readonly source: EntityId;
    readonly target: EntityId;
    readonly damageType: DamageType;
    readonly amount: number;  // mutável via accumulator pattern
  };
}
```

**Pattern do accumulator.**

JS é call-by-value pra primitives. Pra que listeners "modifiquem" o amount, o emit retorna o evento atualizado:

```ts
// src/core/events/bus.ts

export function emit(
  state: GameState,
  event: GameEvent,
): { state: GameState; event: GameEvent };

// Implementação: percorre listeners (TriggerComponents que escutam event.type),
// aplica cada um (que pode retornar novo state e novo event), retorna final.
```

Sistemas usam:

```ts
// Dentro do damageSystem:
const { state: s1, event: modified } = emit(state, {
  type: "DamageAboutToBeDealt",
  payload: { source, target, damageType, amount: baseAmount },
});
const finalAmount = (modified.payload as { amount: number }).amount;
// aplica finalAmount no HealthComponent
const s2 = updateComponent(s1, target, "health", h => ({
  ...h,
  current: Math.max(0, h.current - finalAmount),
}));
const { state: s3 } = emit(s2, {
  type: "DamageDealt",
  payload: { source, target, amount: finalAmount },
});
return s3;
```

**Ordem de listeners.**

Listeners do mesmo evento têm ordem **determinística** baseada em prioridade declarada no `TriggerComponent`:

```ts
export interface TriggerComponent {
  // ... resto
  readonly priority: number;  // menor = primeiro
}
```

Tiebreak por `(source EntityId, ordem de adição no world)`. Nunca por insertion order de `Object.keys` — perigo.

**Migração de triggers de skill.**

Hoje skill com trigger usa `fireOnUseSkill` direto. Agora:
1. Quando uma skill com trigger é "armada" (herói entra em jogo, item é equipado, condition é aplicada), adicionar um `TriggerComponent` à entidade.
2. Quando o evento dispara no bus, o listener executa o `effect` declarado no componente.

O `effect` é um `EffectDescriptor` — descritor declarativo que o effect resolver interpreta. Mesmo padrão do handler de skill atual, só que invocado via componente em vez de switch.

**Arquivos tocados.**
- Novo: `src/core/events/types.ts`, `src/core/events/bus.ts`.
- `src/core/systems/*` — sistemas emitem eventos antes/depois das operações.
- `src/core/skills/handlers/*` — handlers que hoje "armam" trigger agora adicionam `TriggerComponent`.

**Cuidados.**
- **Bus é síncrono.** Cuidado com loops: este passo ainda não tem stack; se um listener tentar emitir o mesmo tipo de evento, vai recursionar. Por isso a regra "eventos dentro de listeners viram pending pra stack" — mas a stack vem só no passo 8. Por ora, **proíba emit dentro de listener** (assert em dev, log em prod).
- Listeners idempotentes em caso de duplicação (não dispare duas vezes pela mesma causa — checar `seq` ou flag).
- `priority` é dado; sortar antes de emitir; nunca confiar em ordem de inserção.

**Testes a adicionar.**
- `emit` percorre listeners de `event.type` na ordem de prioridade.
- Listener que modifica accumulator afeta o resultado lido pelo sistema.
- Listener sem matching trigger não é chamado.
- Listener com `condition` falsa não dispara.
- Emit recursivo (dentro de listener) é proibido — testa o assert.

**Critério de aceitação.**
- Suíte verde.
- Todo `damageSystem`/`healSystem` emite eventos pré/pós.
- Pelo menos uma skill com trigger declarativa funcionando via `TriggerComponent`, testada ponta a ponta.

---

## Passo 8 — Effect stack (resolução ordenada de cadeias)

**Por que esse passo existe.** Sem stack, cascatas — efeito A dispara evento que aciona efeito B que dispara evento que aciona C — entram em recursão direta no JS call stack. Ordem fica acidental, profundidade vira limite, debug fica impossível. Stack explicita a fila de efeitos pendentes, define ordem (LIFO ou FIFO conforme a regra do evento) e abre pontos de pausa pra escolha do jogador entre passos.

**Contrato.**

```ts
// src/core/effects/stack.ts

export interface PendingEffect {
  readonly id: string;
  readonly seq: number;        // ordem de adição
  readonly cause: EventType;   // qual evento causou
  readonly effect: EffectDescriptor;
  readonly source: EntityId;
}

export interface EffectStack {
  readonly pending: readonly PendingEffect[];
  readonly resolving: PendingEffect | null;
}

// Em GameState:
readonly effectStack: EffectStack;
```

**Mudança no bus do passo 7.**

Listeners que produzem novos efeitos NÃO os aplicam imediatamente — eles **pushean** na stack:

```ts
// Dentro de um listener:
return pushPending(state, {
  cause: "EntityDefeated",
  effect: { type: "draw_card", count: 1 },
  source: triggerOwnerId,
});
```

Após o `emit` original retornar, o effect resolver **drena a stack** em loop:

```ts
function drainStack(state: GameState): GameState {
  while (state.effectStack.pending.length > 0) {
    const [next, ...rest] = orderStack(state.effectStack.pending);
    state = { ...state, effectStack: { pending: rest, resolving: next } };
    state = applyEffect(state, next.effect);
    // applyEffect pode causar emits que pushean novos pending — OK,
    // o loop os pega na próxima iteração
  }
  return state;
}
```

**Ordem.** A regra do evento define ordem. Padrão sugerido: **LIFO** para reações imediatas (estilo MTG stack), **FIFO** para eventos de "início de turno" simultâneos. A regra fica em `src/data/event_rules.json`.

**Pontos de pausa pra escolha.**

Alguns efeitos precisam de input do jogador no meio da resolução (já existe: `pendingSkillChoice`). Quando um efeito requer escolha, o resolver **pausa**, salva o estado da stack, e retorna controle. A próxima action `SKILL_CHOICE` retoma a drenagem.

```ts
export interface PausedState {
  readonly reason: "skill_choice" | "target_select" | ...;
  readonly options: readonly ChoiceOption[];
  readonly resumeFrom: PendingEffect;
}

// Em GameState:
readonly paused: PausedState | null;
```

Quando `paused !== null`, o reducer só aceita actions que resolvem a pausa.

**Mecânica completa.**
1. Player dispatcha action.
2. Reducer valida e chama sistema.
3. Sistema emite evento pré.
4. Listeners modificam accumulator e/ou pushean pending na stack.
5. Sistema aplica efeito primário.
6. Sistema emite evento pós.
7. Listeners pushean mais pending.
8. **Effect resolver drena a stack até esvaziar ou pausar.**
9. Reducer retorna novo state.

Toda essa sequência é uma **única action** do ponto de vista do log. Replay re-executa a sequência inteira deterministicamente.

**Arquivos tocados.**
- Novo: `src/core/effects/stack.ts`, `src/core/effects/resolver.ts`.
- Novo: `src/data/event_rules.json` (ordem de stack por evento).
- `src/core/state/gameState.ts` — adicionar `effectStack`, `paused`.
- `src/core/events/bus.ts` — listeners pushean em vez de aplicar.
- `src/core/skills/handlers/*` — `pendingSkillChoice` migra pra `paused` (mesma semântica, integrada à stack).

**Cuidados.**
- **Profundidade da stack tem limite.** Defina `MAX_STACK_DEPTH = 64`. Se atingir, é loop de carta — log + erro determinístico. Não silencie.
- **Ordem é determinística.** Se duas pendings têm mesma prioridade, tiebreak por `seq`. Nunca aleatório.
- Salve a stack inteira no `GameState` — replay precisa reconstruí-la.
- A regra LIFO/FIFO em `event_rules.json` é dado; o resolver é regra. Mantenha separação.

**Testes a adicionar.**
- Cadeia A→B→C resolve na ordem definida (LIFO ou FIFO conforme regra).
- Stack pausa em `skill_choice` e retoma exatamente onde parou ao receber action de escolha.
- Profundidade > 64 produz erro claro.
- Replay determinístico continua funcionando com stack (teste que aplica log inclui cadeias).

**Critério de aceitação.**
- Suíte verde.
- Cadeias de efeito funcionam sem recursão direta — todo encadeamento passa pela stack.
- Replay test passa para uma partida com pelo menos uma cadeia de profundidade 3+.

---

# Fase 3 — Fronteira e tecnologia

Sela o core atrás de contrato uniforme e troca o substrato do store por algo observável.

---

## Passo 9 — Projeção completa (player + ai + replay views)

**Por que esse passo existe.** O passo 4 entregou só o esqueleto. Agora a projeção é nomeada por consumidor, com regras de visibilidade diferenciadas — preparando IA local e replay viewer.

**Arquivos tocados.**
- Expandir `src/core/projection/playerView.ts` — view atualizada pro shape pós-ECS.
- Novo: `src/core/projection/aiView.ts` — view limitada (sem mão do humano, sem futuro do RNG).
- Novo: `src/core/projection/replayView.ts` — view completa (igual a playerView por enquanto; existe pra evoluir).

**Contrato.**

```ts
export interface AiView {
  readonly status: GameStatus;
  readonly visibleEntities: readonly EntityView[];  // sem entidades ocultas
  readonly availableActions: readonly AvailableAction[];
  // SEM acesso a: hand do humano, próxima carta do deck, rng counter
}

export function aiView(
  state: GameState,
  perspective: { playerIndex: number },
): AiView;
```

**Cuidados.**
- IA não vê `state.rng` nem `state.world.entities[*].components` que carreguem informação privada (cartas na mão antes de jogadas).
- Implementação real pode ficar como esqueleto que retorna "not implemented" — o que importa é o tipo, o nome e o lugar.

**Testes a adicionar.**
- `aiView` não inclui campos sensíveis (assert por chave).
- `playerView`, `replayView` cobrem o que a UI e o replay precisam.

**Critério de aceitação.** Suíte verde. UI continua intocada (lê via `playerView`). `aiView` e `replayView` existem como tipos e funções, mesmo que aiView seja esqueleto.

---

## Passo 10 — Engine adapter

**Por que esse passo existe.** Selar o core atrás de contrato uniforme abre as portas pra: troca de substrato do store (passo 11), Worker no futuro, multi-aba no futuro. Hoje a UI chama `reducer(...)` direto — depois, chama `adapter.dispatch(...)`.

**Contrato.**

```ts
// src/core/adapter/engineAdapter.ts
export interface EngineAdapter {
  // Promise mesmo na versão in-process — permite Worker depois sem mudar chamador.
  dispatch(action: Action): Promise<GameState>;
  getState(): GameState;
  subscribe(listener: (state: GameState) => void): () => void;
}

// src/core/adapter/inProcessAdapter.ts
export function createInProcessAdapter(initial: GameState): EngineAdapter;
```

**Cuidados.**
- Versão in-process resolve a Promise **sincronamente** — não use `setTimeout`/`queueMicrotask`.
- O adapter não conhece o store, não conhece a UI, não conhece persistência.
- Importar o reducer no entry-point do adapter garante que o side-effect import `import "../skills/handlers/index"` rode (registry populado). Documente como invariante no header do arquivo.

**Testes a adicionar.**
- Dispatch retorna o mesmo estado que o reducer puro retornaria.
- `subscribe` é chamado uma vez por dispatch, com o novo estado.
- `getState()` reflete o pós-último-dispatch.
- Unsubscribe funciona.

**Critério de aceitação.** Suíte verde. UI funcionando. Nenhum import de `reducer` fora de `src/core/` e `src/core/adapter/`.

---

## Passo 11 — Elf + Redux DevTools

**Por que esse passo existe.** Materializa o desejo "estado observável" da arquitetura. Substitui Zustand por Elf, conecta ao painel do Redux DevTools.

**Arquivos tocados.**
- `package.json` — adicionar Elf + módulo de devtools; remover Zustand ao final.
- Novo: `src/ui/store/elfStore.ts`.
- `src/ui/store/gameStore.ts` — adapta API pública (`useGameStore`, `dispatch`, `setFocusedHero`, `resolveSkillChoice`, `reset`) por baixo. **API exposta para a UI não muda** — assinaturas idênticas.
- `src/ui/store/selectors.ts` — lê do store Elf via `playerView`.

**Decisão arquitetural — reset.** `gameStore.reset()` no novo arch **descarta a instância do adapter e cria uma nova**. Justificativa: uma partida = um log = um `gameId`. Não misturar partidas no mesmo log. UI chama `useGameStore().reset()` igual.

**Invariante crítica.** O store de `GameState` **só é escrito pelo adapter, nunca pela UI**. Elf permite escrita direta — não permita. Encapsule o repository de `GameState` num módulo que expõe apenas leitura ao exterior; escrita acontece via dispatch.

**Cuidados.**
- **Gotcha do React + `useSyncExternalStore`:** o hook exige `getSnapshot` referencialmente estável. Elf integra via helper oficial — use-o, não `subscribe` cru.
- Redux DevTools precisa mostrar **cada `action.type` nomeado** no painel. Se mostrar só `[Elf] update`, integração está errada. Esse é o critério prático.
- O `actionLog` do passo 1 e o histórico do Redux DevTools devem ser consistentes 1-pra-1.

**Testes a adicionar.**
- Smoke test: criar store, dispatch START_GAME, ler estado, deep equal com resultado puro.
- `focusedHeroId` recomputado igual à versão anterior.

**Critério de aceitação.** Jogo roda sem regressão. Redux DevTools mostra sequência nomeada (`START_GAME`, `REVEAL_ROOM`, `ROLL_DICE`...). Time-travel funciona. Zustand removido do `package.json`.

---

# Fase 4 — Persistência e tooling

Fecha o ciclo provando que a arquitetura cumpre a promessa.

---

## Passo 12 — Persistência via porta abstrata

**Por que esse passo existe.** Concretiza o princípio "log é a verdade" no navegador. Snapshot pra retomada rápida, log persistido como histórico completo.

**Contrato.**

```ts
// src/core/ports/persistence.ts
export interface PersistencePort {
  loadSnapshot(): GameState | null;
  saveSnapshot(state: GameState): void;
  clearSnapshot(): void;

  appendAction(entry: LoggedAction): void;
  loadActionLog(): readonly LoggedAction[];
  clearActionLog(): void;
}
```

**Política de coerência — o log é a verdade, snapshot é otimização.**

1. **Boot:** carregar o action log persistido. Se íntegro, rebuildar `GameState` aplicando `log.reduce(reducerCore, initialState)`. Snapshot ignorado.
2. **Snapshot só é usado se:** log vazio ou corrompido, **e** `FEATURE_FLAGS.enableSave` permite.
3. **Gravação:** `appendAction` a cada dispatch (síncrono, barato). `saveSnapshot` a cada K=10 dispatches ou em transições de status (fim de combate, vitória).
4. **Replay viewer** (passo 13) reusa exatamente o caminho de boot.

Se você ler `loadSnapshot()` no boot e o log existir e estiver íntegro, **isso é bug**. Falhe rápido — não tente reconciliar.

**Integridade do log.** "Íntegro" significa: começa em `seq=0` com `START_GAME`, seqs contíguos, sem buracos. Se o primeiro elemento não é `START_GAME`, descarte e use snapshot ou estado inicial.

**Cuidados.**
- `FEATURE_FLAGS.enableSave` desligado → implementação vira no-op.
- Falha de I/O captura e ignora silenciosamente. Log no console em dev, silencioso em prod.
- Não persistir `actionLog` dentro do snapshot — fica duplicado. Snapshot exclui o log ao serializar.

**Arquivos tocados.**
- Novo: `src/core/ports/persistence.ts`.
- Novo: `src/core/persistence/localStoragePersistence.ts`.
- `src/ui/store/persistence.ts` — fina camada de boot/wiring.

**Testes a adicionar.**
- Mock da port: dispatch N actions → `appendAction` chamado N vezes com `seq` correto.
- Boot com log íntegro → state carregado equivale ao replay do log.
- Boot com log corrompido → cai pro snapshot.
- Boot com ambos vazios → estado inicial.

**Critério de aceitação.** Suíte verde. Toggle de `FEATURE_FLAGS.enableSave` muda comportamento conforme esperado. Implementação trocável sem tocar `src/core/`.

---

## Passo 13 — Replay viewer + export JSON

**Por que esse passo existe.** Prova de vida da arquitetura. Demonstra que replay determinístico funciona ponta a ponta e fecha o caso de uso "bug report".

**Funcionalidades mínimas.**
- Tela (rota oculta, atalho de teclado, ou botão dev) que carrega action log persistido.
- Botões: "passo a passo" (avança 1 action), "play" (avança contínuo), "ir pro fim".
- Mostra `GameState` resultante a cada passo (JSON pretty-print serve).
- Botão "exportar JSON" — baixa `{ seed, gameId, actionLog }` como arquivo `.json`.
- Botão "importar JSON" — carrega externo, replica.

**Arquivos tocados.**
- Novo: `src/ui/screens/Replay.tsx`.
- Possivelmente rota dev em `App.tsx` atrás de flag.

**Cuidados.**
- Replay usa adapter **separado**, não suja a partida em curso. Crie uma instância nova do `EngineAdapter` só pra replay.
- Replay extrai `seed` de `actionLog[0]` (que é `START_GAME` com seed no payload). Não puxe nova seed.

**Testes a adicionar.**
- Integração: gravar partida sintética de 30 actions com cadeia de efeitos, rodar replay completo, conferir state final.
- Export/import: round-trip preserva estado final.

**Critério de aceitação.** Replay roda partida real do início ao fim sem divergência. Export/import funciona. Tela usável.

---

## O que NÃO está neste plano (de propósito)

- **Engine em Worker** — adapter já abre a porta; só fazer se houver necessidade real.
- **Servidor autoritativo / delta sync** — incompatível com single-player. Fases 1-3 entregam o core portável quando entrar.
- **Multi-aba / espectador** — depende de canal entre abas; pós-Worker.
- **Content pipeline visual** — feature de produtividade, não engine.
- **Refactor de UI** — explicitamente fora. Componentes React permanecem como estão.

---

## Resumo da ordem

| Passo | Fase | Risco | Duração | Bloqueia... |
|---|---|---|---|---|
| 0. Baseline | — | nenhum | < 30 min | tudo |
| 1. Action log | 1 | baixo | meio dia | persistência, replay |
| 2. RNG seedado | 1 | **alto** | **2 dias** | replay funcional, Node, Fase 2 |
| 3. Data-driven + state machine | 1 | médio | 1.5 dias | Fase 2 |
| 4. Projeção mínima | 1 | baixo | meio dia | mudanças de shape na Fase 2 |
| 5. ECS world | 2 | médio | 2 dias | sistemas |
| 6. Sistemas com queries | 2 | **alto** | **2.5 dias** | event bus, stack, contabilidade fechar |
| 7. Event bus | 2 | médio | 1.5 dias | stack |
| 8. Effect stack | 2 | médio | 1 dia | cadeias funcionarem |
| 9. Projeção completa | 3 | baixo | meio dia | IA local futura |
| 10. Engine adapter | 3 | baixo | meio dia | Elf, Worker futuro |
| 11. Elf + Redux DevTools | 3 | médio | 1.5 dias | desejo "estado observável" |
| 12. Persistência | 4 | baixo | meio dia | replay persistido |
| 13. Replay viewer + export | 4 | baixo | meio dia | prova de vida |

**Total estimado:** ~14.5 dias de trabalho focado, em 13 PRs. A Fase 2 (passos 5-8) sozinha é ~7 dias — é o coração do refactor. Não subestime.

---

## Checklist para cada PR

Antes de mergear cada passo, verifique:

- [ ] `npm test` verde.
- [ ] `npm run build` verde.
- [ ] `npx tsc --noEmit` sem erros.
- [ ] Testes novos do passo passando.
- [ ] Suíte do baseline não regrediu (mesma contagem de verdes ou maior).
- [ ] UI manualmente jogável até pelo menos a primeira sala.
- [ ] Diff revisado: nada além do escopo do passo.
- [ ] Commit message sem `Co-Authored-By: Claude` (ver `CLAUDE.md`).
- [ ] Se algo "pareceu estranho" durante a implementação, anote em comentário no PR — não esconda.

## Greps de sanidade ao longo do caminho

Rode esses comandos após cada fase pra detectar regressão silenciosa:

```bash
# Pós-Fase 1: zero não-determinismo no core
grep -r "Math.random\|crypto\." src/core/
# esperado: nenhum match

# Pós-Fase 1: zero nomes de carta em código TS
grep -rE "\"[A-Z][a-zçãáéíóú]+[a-z], [A-Z]" src/core/ --include="*.ts"
# esperado: zero (nomes de carta vão pra JSON)

# Pós-Fase 2: lógica de dano centralizada
grep -rn "currentLife =" src/core/ --include="*.ts" | grep -v damageSystem | grep -v healSystem | grep -v sync
# esperado: nenhum match

# Pós-Fase 3: reducer não exportado direto
grep -rn "from .*core/reducer" src/ui/ src/core/ | grep -v adapter
# esperado: nenhum match

# Pós-Fase 4: persistence só via porta
grep -rn "localStorage" src/core/
# esperado: nenhum match (só implementação isolada usa)
```

Esses greps fazem parte do critério de aceitação — não são opcionais.
