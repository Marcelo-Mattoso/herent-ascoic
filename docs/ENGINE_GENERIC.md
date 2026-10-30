# Engine genérica — plano

Status: Fases 1–3 em andamento (1 e 2 feitas; 3 parcial); demais planejadas.

## Objetivo

`src/core` é a engine. O que é do Ascensão Heróica e hoje mora no core sai para a parte do game (`src/game/`):

- **Engine (`src/core`)** — a calculadora. Dados e RNG, entidades com atributos, modificadores e durações, pilha de efeitos, gatilhos, escolhas pendentes, máquina de estados e a **DSL de skills**. Não conhece nenhum conceito do Ascensão Heróica.
- **Game (`src/game/`)** — o Ascensão Heróica em cima da engine: masmorra, salas e caminhos, Despertar e Ímpeto, loja de XP, mochila e encaixes, recompensas, chefe, vocabulário próprio da DSL, conteúdo (cartas, skills, textos, balanceamento, scripts) e UI.

Outro tema escreve outro módulo e outro conteúdo; a engine não muda. O `engine-test` prova isso com um jogo inventado, sem nada do Ascensão Heróica.

### Critério de pronto

- `src/core` não importa nada de `src/game/` nem de `src/data/`.
- Guarda automática: nenhum id de carta/skill do jogo e nenhum termo do jogo (lista: `despertar`, `impeto`, `dungeon`, `purple`, `boss`, `room`, `artifact`, `backpack`, …) em `src/core`.
- `engine-test`: uma partida completa de um jogo inventado (módulo + conteúdo próprios) passa com resultado pré-calculado.
- O Ascensão Heróica continua idêntico: `npm test`, `alphaCatalogAudit`, e2e e replays gravados antes de cada fase.

## O que é de cada camada hoje

| Área atual em `src/core` | Fica no core (engine) | Vai para `src/game/` |
|---|---|---|
| `ports/random`, `rules/dice` | RNG, rolagem, faces do dado vindas de config | — |
| `ecs/`, `systems/` | entidades, modificadores, durações, dano, cura, condições | nomes de atributo do jogo |
| `effects/`, `events/`, `triggers/` | pilha, resolver, barramento, ordem de eventos | eventos do jogo (`evt_room_*`, `evt_dungeon_discard`) |
| `skills/dsl` | kinds genéricos: `i_damage`, `i_heal`, `i_full_heal`, `i_if`, `i_choose_one`, `i_for_each`, `i_noop`, `p_modifier`, `p_block`, `add_trigger`, `i_prevent_destroy`, `i_prevent_next_damage`, `i_dispel`, `i_remove_status`, `i_mark_target`, `i_modify_die`, `i_reroll`, `i_set_die`, `i_draw`, `i_draw_and_choose`, `i_discard`, `i_ignore_next_targeting`; condições `compare/and/or/not/has_skill/has_condition`; refs `$source/$target/$targets/$self/$each` | kinds `i_advance_dungeon`, `i_recover_dungeon`, `i_reveal_dungeon`, `i_prevent_dungeon_discard`, `i_grant_reward`, `i_set_no_reward`; refs `$dungeon.level`, `$lowest_life_hero`; stats `s_purple_*`, `s_dungeon_discard_*`, `s_flee_blocked`; `p_block` de `dungeon_discard`, `dungeon_level_reduction`, `power_use`, `flee` |
| vocabulário fixo da DSL | mecanismo de validação | listas de `category`, `nat_*`, `tgt_*/scp_*/obj_*`, stats, eventos, piles |
| `abilities/`, `skills/` (janela, ativação) | concessão, custo, limite, preparação de reação | casos por id (hunter focus, deadly edge, mystic draw, prey mark, lista de itens) |
| `state/` | estado genérico: entidades, zonas/pilhas, contadores, rng, pilha, pendências, log | `despertar`, `paths`, `subbosses`, `groupArtifacts`, `bossCardId`, decks nomeados, `impeto`, slots, mochila |
| `reducer/` | actions genéricas: usar skill/poder/item, escolher, selecionar dado, resolver confronto | `setup`, `exploration`, `reward`, `progression`, `boss`, fluxo de combate por rodada/herói |
| `rules/` | `combat` (confronto), `diceSelection`, `stateMachine` | `colorScale`, `awakening`, `equipment`, `inventoryMoves`, `itemEffects`, `conditions` (acesso ao chefe), `shield` |
| `config/`, `strategies/`, `src/data/*.json` | feature flags | balanceamento, dificuldades, chefe padrão, `transitions.json` |
| `projection/`, `journal/` | vista genérica de entidades/escolhas | `PlayerView` do jogo, Diário com textos do jogo |

## Fases

Cada fase é um PR, mantém o Ascensão Heróica idêntico e amplia o `engine-test`.

### Fase 1 — Bootstrap — feito

`createEngine(pack?)` recebe o conteúdo; com pacote ele substitui o padrão inteiro. Leitura de cartas, skills, locale e scripts vem do pacote em execução.

### Fase 2 — Vocabulário da DSL declarado pelo pacote — feito

- `pack.vocabulary` (`bootstrap/vocabulary.ts`) declara categorias, naturezas, eventos, janelas, stats, alvos de `p_block`, pilhas, escopos de limite e alvos/escopos/objetos. `validatePack` confere skills, abilities e grants contra ele.
- O schema da DSL ficou estrutural: esses campos são texto, sem listas fechadas.
- `src/game/` criado: `pack.ts` (conteúdo de `src/data/` + `vocabulary.ts` do jogo) e `index.ts`, que registra o pacote padrão. O core não tem mais pacote embutido; app (`main.tsx`), testes do jogo (`setupFiles`) e scripts importam `src/game`. O `engine-test` roda sem o jogo, com vocabulário próprio (`tools/engine-test/vocabulary.yaml`).
- `rewardType` saiu com `i_grant_reward` para o game (Fase 3). Ainda fixos no core: `over` (`all_heroes`) de `i_for_each` e `die_side` dos kinds de dado.

### Fase 3 — DSL por interface — parcial

Feito:

- Contrato `DslKind` (`skills/dsl/kind.ts`): `schema`, `children`, `vocabulary`, `evaluate` (nó → pilha), `resolve` (descritor → estado), `aliases` (nomes legados de descritor).
- **Todos** os kinds são implementações desse contrato; `evaluate.ts` e `effects/resolver.ts` só despacham pelo registro. Kind sem implementação: `[ERRO]` no evaluate, ignorado no resolver, recusado na validação do pacote.
- Engine (`skills/dsl/builtinKinds.ts`): `i_damage`, `i_heal`, `i_full_heal`, `i_prevent_destroy`, `p_modifier`, `add_trigger`, `i_prevent_next_damage`, `i_ignore_next_targeting`, `i_mark_target`, `i_if`, `i_choose_one`, `i_for_each`, `i_noop`, `i_modify_die`, `i_reroll`, `i_set_die`, `i_dispel`, `i_remove_status`.
- Game (`src/game/dslKinds.ts`, via `pack.dslKinds`): `i_advance_dungeon`, `i_recover_dungeon`, `i_reveal_dungeon`, `i_prevent_dungeon_discard`, `i_grant_reward`, `i_set_no_reward`, e também `i_discard`, `i_draw`, `i_draw_and_choose` e `p_block`, que hoje mexem em baralhos e flags do jogo (voltam genéricos com as zonas da Fase 4).
- Schema da DSL: nó de efeito só estrutural; cada kind valida o seu nó na validação do pacote, recursivamente via `children`.

Falta:

- Refs `$dungeon.level`, `$lowest_life_hero` e condições também por contrato (`resolveExpr`/`resolveCondition` ainda fixos).
- Tipos TS: a união `EffectNode` em `dsl/types.ts` ainda lista os kinds do jogo.
- Kinds genéricos ainda com regra do jogo dentro: `i_damage` (dano "roxo" pela categoria `monster_purple`), `p_modifier` (stat `s_purple_damage_reduction`).
- Outros pontos do core que olham kinds por nome (`activationMode.ts`, `itemEffects.ts`).
- Casos por id viram DSL (kind genérico ou do game): hunter focus, deadly edge/drain life, mystic draw, prey mark, lista `ITEM_STATS_HANDLED_BY_EQUIPMENT`.

### Fase 4 — Estado genérico + estado do jogo

- `GameState` da engine: entidades (lado, atributos, recursos, condições), zonas/pilhas nomeadas, contadores nomeados, rng, pilha de efeitos, pendências, log.
- Campo de estado do módulo (`game`), opaco para a engine: `despertar`, `impeto`, caminhos, subchefes, artefatos, chefe, mochila e encaixes.
- Projeção do jogo (`PlayerView`) passa a ser do módulo; a engine projeta entidades e escolhas.

### Fase 5 — Fluxo pelo módulo

- A engine executa fases e transições fornecidas pelo módulo (handlers + tabela de transições do jogo, hoje `transitions.json`).
- `setup`, `exploration`, `reward`, `progression`, `boss` e o laço de rodada/herói vão para o módulo do jogo.
- Regras fixas do chefe (Trono Vivo, Ascensão Final, Pressão da Forja, 3 dados, escala de vida) viram skills/config do chefe do Ascensão Heróica.
- Balanceamento (`balance.json`), dificuldades, cópias de sala, descarte de caminhos, níveis de cor, máximo de heróis e chefe padrão passam a ser config do módulo.

### Fase 6 — Textos e guarda

- `src/core` fica só com a engine; tudo do jogo está em `src/game/` (regras, fluxo, extensões da DSL, pacote padrão). Conteúdo continua em `src/data/` e UI em `src/ui/`, ambos ligados ao game.
- Logs da engine sem texto do jogo; textos do jogo vêm do módulo/locale.
- Remover código morto (`rules/shield.ts`).
- Guarda automática do critério de pronto no `npm test`.

### Fase 7 — `engine-test` com jogo inventado

- `tools/engine-test` define um mini-módulo próprio (fluxo simples inventado) + conteúdo, e cria a engine com ele.
- Partida completa com resultado pré-calculado passa; cenários cobrem cada kind genérico da DSL e o registro de extensões.

## Riscos

| Fase | Risco | Motivo |
|---|---|---|
| 2 | baixo | validação muda de enum fixo para lista do pacote |
| 3 | médio | kinds e casos por id mudam de lugar; cálculo de combate envolvido |
| 4 | alto | forma do estado muda; UI, replay, persistência e Diário dependem dela |
| 5 | alto | reducer inteiro reorganizado; máquina de estados vira dado do módulo |
| 6 | médio | imports entre core e game |
| 7 | baixo | consome as fases anteriores |

Replays: gravar partidas reais antes da Fase 4 e exigir o mesmo final depois de cada fase; se a forma do estado mudar, comparar pela vista do jogo.
