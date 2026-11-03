# Teste da engine

Ferramenta de desenvolvimento em `tools/engine-test/`. Prova que `src/engine` serve a jogos de cartas diferentes do Ascensão Heróica: tudo é conteúdo inventado, dados roteirizados e resultado pré-calculado. Nada de `src/core`, `src/data` ou do catálogo do jogo é importado. Não roda no `npm test`.

```bash
npm run engine-test            # vitest com tools/engine-test/vitest.config.ts
npm run engine-test:coverage   # idem + cobertura v8 só de src/engine (limiar de 85% de linhas)
npm run typecheck:engine       # tsc só de src/engine
npm run typecheck:tools        # tsc de golden, bot e engine-test
```

Os testes unitários da engine (`src/engine/*.test.ts`) e as guardas de arquitetura rodam no `npm test`. A cobertura de `engine-test:coverage` vem só de `tools/engine-test` (a config inclui apenas esses testes).

## Estrutura

```
tools/engine-test/
  vitest.config.ts           # include só de tools/engine-test; coverage de src/engine
  nano/                      # jogo nano (F2): 1 zona, 1 contador, kinds próprios, dados roteirizados
  deckbuilder/               # deckbuilder solo (F10)
    game.ts  deckbuilder.test.ts
  tcg/                       # TCG 1x1 (F7/F9/F10)
    game.ts                  # cartas, kinds, montagem da mesa (funções de estado)
    fluxo.ts                 # PhaseHandler + tabela de transições + janela de resposta
    roteiro.ts               # partida completa como lista de actions
    tcg.test.ts  janela.test.ts  partida.test.ts  projecao.test.ts
  rpg/                       # "Margem do Lago Turvo" (F11a): unidades, atributos, status, áreas
    conteudo.ts  jogo.ts  roteiro.ts
    rpg.test.ts  negativos.test.ts  aleatorio.test.ts
  scenarios/                 # cenários Given/When/Then em YAML
    runner.ts  scenarios.test.ts  cases/*.yaml
  contratos.test.ts          # contratos da engine com conteúdo inventado (erros, bordas)
```

## Deckbuilder solo (`deckbuilder/`)

Montado por `createEngine({ kinds, content, flow, ... })`; o fluxo é `createPhaseFlow` com três `PhaseHandler` (`preparo`, `acao`, `compra`) e a tabela de transições `preparo → acao → compra → acao | fim` (as duas saídas de `compra` têm `guard` sobre pontos e turno).

- Zonas: `baralho` (contagem), `mao` (só o dono), `jogadas`, `descarte` (públicas), `mercado` (pública) e `reserva` (contagem), de onde o mercado é reposto.
- Recursos: contadores com escopo `turn` (`moedas`, `acoes`, `compras`), pagos por `Cost` (`checkCosts`/`payCosts`) e zerados pela engine ao fim do turno.
- Comprar mão: `drawCards` com política `reshuffle-from` o descarte (embaralha com os dados).
- Kinds próprios: `moedas`, `comprar_cartas`, `moedas_por_zona`, `queimar` (`removeCard`), `criar_na_mao` (`addCard`), `reordenar_topo` (`reorderZone`); as cartas também usam os genéricos `change_counter`, `if_counter`, `repeat`.
- Fim: vitória com 10 pontos de cartas (derivados das zonas); derrota ao fim do turno 6.
- Partidas pré-calculadas (`ScriptedDice`, shuffles conferidos com Fisher-Yates independente):
  - vitória em 3 turnos: compra Ducado (T1), Tapete (T2), reembaralha (11 rolagens `1` -> mão de 5 cobres) e compra o Ducado do T3: 10 pontos, resultado `vitoria`;
  - derrota por limite: Feira, dois reembaralhamentos (10 rolagens `2`, depois 12 rolagens `1`), 7 pontos no turno 6, resultado `derrota`.
- Jogo aleatório com dados semeados (40 sementes): toda ação de `legalActions` aplica sem erro e as instâncias nunca se duplicam nem somem.

## TCG 1x1 (`tcg/`)

Dois jogadores (`a`, `b`), vida e mana por jogador (pool), baralho oculto, mão visível só ao dono, campo e descarte públicos. Fluxo por `PhaseHandler` (`escolha` exclusivo, `preparo`, `principal`, `janela`) e tabela `preparo → principal → janela → principal | fim`.

- Alvo: `Raio` declara `TargetSelector` e falha ("fizzle") se o alvo ficou ilegal na resolução.
- Choice: `Visão` abre `choose_one`; a resposta é a action `ESCOLHER`, e o handler `escolha` bloqueia qualquer outra action enquanto houver escolha pendente.
- Janela de resposta: todo feitiço abre uma janela (`openWindow`, prioridade a partir de quem lançou); o oponente pode `RESPONDER` com carta rápida (`Sorte`, `Bênção`) ou `PASSAR`. A política (`criarFluxoTcg("lifo" | "fifo")`) decide a ordem de resolução.
- Vitória: a vida de um jogador chega a 0 (o primeiro a chegar perde, mesmo que seja curado depois na mesma janela).
- Partida pré-calculada (`roteiro.ts`, vida 6, dado `[5]`): no turno 3, `a` ataca e lança duas Centelhas; `b` responde com `Sorte` (dado 5) e `Bênção`. Em LIFO a cura resolve antes do dano e `b` fica com 3; com a política FIFO a mesma sequência derrota `b` no turno 3. A partida segue até `b` vencer no turno 8 (vida de `a` = 0, vida de `b` = 1).
- Projeção por jogador (`projecao.test.ts`): a cada passo da partida, o JSON de `project(estado.engine, viewer)` não contém nenhum id de carta na mão do oponente; os eventos `compra_privada` (`visibleTo: [dono]`) só chegam ao dono; os `carta.movida` de compras do oponente saem com `card: "?"`; as opções da escolha pendente só aparecem a quem decide.

## RPG: Margem do Lago Turvo (`rpg/`)

Prova as unidades da engine (F11a) com o cenário original de `docs/F11_SPEC.md`. `conteudo.ts` declara atributos (`constituicao`, `vida_max` = constituição × 10, `vida`, `mana_max`, `mana`, `armadura`), regras (recurso de vida e mitigação do tipo `fisico` pela armadura), habilidades, status (`colera`, `raiz` e três de apoio ao empilhamento: `bruma` refresh, `fervor` stack até 3, `marca` replace) e unidades (Aria, Espreitador do Junco, Cota de Escamas, Lago Turvo). `jogo.ts` monta a mesa (Aria equipa a Cota e fica com vida 60; o espreitador entra no lago e fica imune) e expõe `jogarTurno`, `fecharTurno` e `abrirTurno`; `roteiro.ts` tem as duas partidas como tentativas por turno.

- `rpg.test.ts`: vitória (rodada 7: Aria com 32/60 de vida, 4/20 de mana, armadura efetiva 1, sem status, recarga 0) e derrota (rodada 8, espreitador com 5). Em todo turno confere vida, mana, armadura efetiva, status (com duração restante), recarga do `lampejo`, as recusas esperadas (`bloqueada`, `cooldown`, `custo`) e a sequência de tipos de evento do turno. Cada linha é lida depois do fim do turno e antes do começo do seguinte.
- `negativos.test.ts`: os 8 casos da spec (Raiz bloqueia `mover`; cura sob Cólera; recarga N/N+1/N+2; mana insuficiente; imunidade; fonte sai e o efeito some; empilhamento `refresh`/`stack`/`replace`/`ignore`; Raiz expira no fim do 2º turno do portador).
- `aleatorio.test.ts`: 40 sementes jogam ações legais e mudam fontes (equipar, desequipar, sair do lago, remover o lago). A cada passo todo modificador ativo tem fonte viva, os recursos ficam dentro do máximo e o estado serializa sem a chave `modifiers` e volta igual de JSON.

## Cenários YAML por kind (`scenarios/`)

Um arquivo em `scenarios/cases/*.yaml` por comportamento. O runner (`runner.ts`) valida o formato com zod, monta o estado inicial, aplica os passos e compara. Há ao menos um cenário por kind genérico de `src/engine/builtinKinds.ts` (`noop`, `move_card`, `draw_cards`, `discard_cards`, `change_counter`, `roll_die`, `repeat`, `if_counter`, `choose_one`) e por kind de unidade de `src/engine/unitKinds.ts` (`damage`, `heal`, `apply_status`, `remove_status`, `modify_attribute`, `block_action`, `move_to_area` e as condições `in_area`, `has_status`, `attr_compare`), além de recusa de kind não registrado e de payload inválido. `scenarios.test.ts` falha se algum kind do registro ficar sem cenário.

```yaml
name: roll_die consome o dado roteirizado e soma ao contador
kind: roll_die                      # kind coberto (ou nao_registrado / payload_invalido)
given:                              # estado inicial (tudo opcional)
  players: [p, q]
  cards: [{ id: a, def: carta, owner: p }]
  zones: [{ id: pilha, owner: p, visibility: owner, ordered: true, cards: [a] }]
  counters: [{ scope: jogo, id: "-", name: pontos, value: 1 }]
  units:                            # unidades do catálogo do RPG (spawn + ajustes)
    - { id: aria, def: aria, controller: a, pools: { vida: 20 }, statuses: [{ status: raiz, remaining: 2 }], presentIn: [lago] }
  dice: [4, 6]                      # ScriptedDice
  turn: { order: [p, q], phases: [principal] }
when:                               # passos, em ordem
  - run: [{ kind: roll_die, faces: 6, counter: { scope: jogo, id: "-", name: pontos } }]
    cause: 7                        # opcional, vai para o ctx e para os eventos
  - answer: { choice: choose_one, player: p, picks: [x] }   # responde a escolha pendente
  - validate: [{ kind: repeat, times: 1, do: [] }]          # validação de conteúdo (sem executar)
  - test: { subject: aria, node: { kind: in_area, area: lago }, expect: true }   # avalia uma condição
then:                               # tudo opcional; comparação parcial
  events: [{ type: dado.rolado, payload: { value: 4 } }]    # só os emitidos durante o `when`, lista exata
  zones: { pilha: [a] }                                      # conteúdo exato
  counters: { "jogo:-:pontos": 5 }                           # chave escopo:id:nome
  units: { aria: { attributes: { vida: 20 } } }              # unitView, comparação parcial
  dice_left: 0
  pending: null                                              # ou { id, player, options, min, max }
  error: "trecho da mensagem"                                # o `when` deve falhar com esta mensagem
```

Regras: objetos comparam só as chaves escritas; listas comparam tamanho e itens; `error` exige que algum passo falhe e que a mensagem contenha o trecho; sem `error`, qualquer falha é erro do cenário. O runner é testado (`scenarios.test.ts`): ele falha quando estado, eventos, zonas, dados ou escolha divergem.

## Contratos (`contratos.test.ts`)

Testes de bordas e mensagens de erro da engine com conteúdo inventado (registro de kinds com aliases, referências e condições, estado e instâncias, pilha, escopos, turnos, alvos, custos, escolhas, `createEngine`, dados, janelas, projeção). Elevam a cobertura de `src/engine` para ~99%; sem eles, só os jogos e cenários chegam a ~85%.

## Cobertura

`npm run engine-test:coverage` mede `src/engine/**` (exceto `*.test.ts` e `index.ts`) apenas com `tools/engine-test`. Limiar: 85% de linhas. Resultado atual (com o RPG da F11a): 93,5% de linhas, 83,0% de ramos. Os testes de unidade de `src/engine/*.test.ts` rodam no `npm test` e não entram nesta medida.

## Limitações conhecidas

- `choose_one` não carrega o jogador que lançou o efeito: a escolha vai ao jogador ativo (ou ao primeiro jogador). O TCG só abre escolha para o jogador do turno.
- A resposta em janela é uma lista de nós; contra-feitiço (efeito que remove item da janela) não existe na engine.
- Os jogos não validam o fluxo de UI nem persistência: são conteúdo para provar a engine, não produtos.
