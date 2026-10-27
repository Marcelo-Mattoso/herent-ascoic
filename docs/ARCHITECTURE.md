# Arquitetura da Alpha Web

Esta página descreve o código atual. `src/core/README.md` e `src/data/README.md` detalham as interfaces de cada módulo; o histórico anterior continua no Git.

## Caminho de uma ação

`src/ui/` apresenta o jogo em React e despacha `Action` por `src/ui/store/gameStore.ts`. A store Elf fica encapsulada em `elfStore.ts`. `createInProcessAdapter` entrega a ação ao reducer síncrono em `src/core/reducer/`. O reducer valida a fase, aplica regras, dispara habilidades, drena a pilha de efeitos e valida a transição contra `src/data/transitions.json`. Ele devolve um novo `GameState`, sem mutar o anterior. `playerView(state)` projeta o estado para a UI; componentes não devem implementar regras lendo o estado bruto.

O core não depende de React, DOM ou rede. Dados aleatórios passam pelo gerador com seed, para que `actionLog` possa ser reproduzido em `src/core/replay/`. `FEATURE_FLAGS.enableSave` permanece desligada: replay e portas de persistência existem, mas a sessão web não é retomada após recarregar.

## Tutoriais interativos

`src/ui/tutorials/registry.ts` declara os quatro arquivos e suas etapas: narrativa, instrução, âncora semântica, condição de avanço e permissão para pular. `session.ts` é o controlador puro da sessão, com identificador, etapa, ponto destacado, heróis escolhidos, observações de combate e eventos de interface. `TutorialHub` permite entrar diretamente em qualquer arquivo. `TutorialOverlay` mede os elementos reais por `data-tutorial-anchor` e `getBoundingClientRect()`, reposiciona a máscara em resize/scroll e mantém o alvo acessível por clique, toque e teclado. O destaque pode abrir várias áreas para controles de inventário e arrasto entre cartas. A caixa do Arquivista separa a narração das instruções.

`App` observa `playerView` para confirmar início de partida e revelação. A seleção de heróis é confirmada pelo estado da tela de preparação. O controlador não modifica `GameState`. O Arquivo I usa seed `2` e `START_GAME` com `deferInitialRoomReveal: true`: o motor prepara o estado válido `REVEAL_ROOM` sem sortear a sala; o comando guiado despacha a action existente `REVEAL_ROOM`. O fluxo normal de `START_GAME` continua revelando a sala imediatamente. A exploração automática resolve efeito e surgimento da criatura, mas pausa antes de `START_COMBAT` na sessão de treinamento. A seed gera uma sala e uma criatura para os oito heróis disponíveis.

Ao repetir, sair ou iniciar JOGAR após o tutorial, a store é reiniciada; a sessão não é persistida como partida normal. O painel oferece um registro separado com eventos de interface e observações do jogo, além de exportação JSON junto com o diário do motor. O registro de abandono permanece disponível no seletor de arquivos. O contrato `entry` do catálogo aceita preparação por tela de heróis ou por actions válidas do motor; `canReuseBoard` permite ao arquivo seguinte aceitar o tabuleiro atual, e `prepareActions` prepara uma entrada independente quando necessário. Os heróis escolhidos são passados ao módulo seguinte.

O Arquivo II usa `combatScenario.ts` para preparar encontros somente com actions do core. A seed `2` inicia uma sala com criatura para seleção, alvo e primeiro ataque. Ao chegar à prática de arrastar, um novo checkpoint com seed `1` e o mesmo herói cria uma oportunidade legítima de ataque contra uma criatura de dois pontos de vida. O primeiro resultado fica preservado na sessão e na exportação; o Diário da partida passa a registrar o novo checkpoint. No desktop, a segunda declaração exige o arrasto existente do tabuleiro; em dispositivos de toque, a seleção das cartas cumpre a etapa. O tutorial observa `CHOOSE_HERO_FOR_ROUND`, `CHOOSE_TARGET`, `RESOLVE_ATTACK` e `CHECK_COMBAT_END` no Diário e no `playerView`, correlacionando a segunda declaração com a sequência do registro. A exploração pausa somente as transições automáticas `DIRECT_DAMAGE` e `CHECK_COMBAT_END` durante esse arquivo, para que o jogador examine o resultado antes do checkpoint e confirme o encerramento. O reducer, RNG, cálculo de dano e regras de consumo da ação permanecem os mesmos da partida normal.

O Arquivo III usa `inventoryScenario.ts`: a seed `1` resolve um combate pelo reducer até `REWARD_PHASE`; o inicializador separa cinco cartas reais do baralho e as coloca como recompensa. As operações puras de `moveInventoryItem` deixam Adaga Enferrujada, Machado do Salão Arruinado e Armadura de Couro Reforçado na mochila, Poção de Precisão na mão 1 e Poção de Vigor Menor na mesa. O estado inicial conserva as três vagas da mochila e uma recompensa pendente, para que a tela normal não sorteie outra recompensa ao montar. `loadTrainingState` instala o checkpoint com adapter e Diário novos. A entrada direta ou após o Arquivo II usa o herói anterior quando a fixture é válida; se não for, usa o Guerreiro do Bastião Partido. A troca de arquivo mantém o componente do tabuleiro e não recarrega a página.

Na etapa de abertura o tabuleiro continua visível. Após o jogador selecionar a carta do herói, o controle guiado monta o próprio `InventarioGrupo`. Âncoras semânticas destacam espaços, mochila, popover e uso; o overlay acompanha mudanças de tamanho e rolagem interna. A inspeção usa `CardDetailModal` e só conclui após abrir e fechar uma carta válida da mochila. As etapas seguintes observam `INV_MOVE` no Diário: a adaga sai da mochila para uma mão, o machado substitui itens e ocupa as duas mãos por `sharedWith: hand1` na projeção, e a armadura entra em uma vestimenta. A Poção de Precisão é trocada para a mão e usada por `USE_ITEM`; o controlador exige o modificador `ability_hit_bonus_once` no estado projetado, o descarte da carta e `heroesActed` inalterado. Os efeitos exibidos vêm do catálogo e das diferenças do Diário.

Na etapa 9, `prepareExhaustedInventoryTraining` cria outro estado por ações reais: equipa o Encanto do Sangue Quente no amuleto, passa à sala seguinte, prepara a reação antes do dano, resolve o ataque e começa a rodada seguinte. O encanto permanece equipado e `itemIsExhausted` confirma seu limite por combate; `heroesActed` fica vazio na nova rodada. O botão destacado abre o Diário real, que mostra a carta exaurida. A sessão exportada conserva também o JSON do Diário anterior, onde estão as trocas e o consumo da poção. A troca de checkpoint não recarrega a página nem altera regras de ativação.

O Arquivo IV usa `abilitiesScenario.ts` para montar três encontros válidos. O Caçador do Véu Partido entra em uma sala com duas criaturas e sem escolha pendente (seed `26`); o jogador abre a carta, usa `skill_prey_mark`, escolhe um alvo e resolve um ataque ainda disponível. O Bárbaro Rubro inicia outro encontro, prepara `skill_crimson_fury` e ataca; a sessão só avança quando o Diário confirma a preparação, o consumo dela em `ROLL_DICE` e `RESOLVE_ATTACK`. O Guerreiro do Bastião Partido recebe a Armadura de Couro Reforçado e o Encanto da Chama Baixa pelas operações de inventário, prossegue por actions do reducer a outra sala e ativa `power_unbreakable_bastion_guard`. O passivo `ability_hit_bonus_while_equipped` do encanto é mostrado por `activeInfluences`, com carta de origem e duração; a disponibilidade do poder vem de `abilityActionsByHero`. Checkpoints trocam adapter e Diário, sem transportar decisões ou alvos pendentes. O botão **Jogar agora** encerra a sessão, reinicia a store e abre a preparação normal de expedição.

## Regras e efeitos

- `state/` define estado e limites; `rules/` contém cálculos puros e máquina de estados.
- `reducer/` trata preparação, exploração, combate, recompensas, progressão e chefe. `systems/` aplica dano, cura e condições.
- `skills/` resolve alvo e condições; `abilities/` executa a concessão (`AbilityGrant`) com origem, custo, limite de uso e efeito. `data/abilities.ts` adapta as referências `SkillRef` das cartas antigas ao mesmo contrato dos grants declarativos. Efeitos reutilizáveis são nós da DSL em `skills/dsl/`; lógica singular pode usar um script em `src/data/scripts/`. Uma definição possui `effect` **ou** `script`.
- A DSL produz descritores para `effects/stack.ts`; `effects/resolver.ts` materializa os efeitos. O barramento `events/` e `event_rules.json` ordenam gatilhos. Escolhas que precisam do jogador ficam pendentes até uma nova ação.
- `ecs/` mantém entidades, modificadores, passivos e gatilhos. Durante a migração, parte dos modificadores também é projetada em `CombatState`. Ao remover uma fonte, seus modificadores dependentes devem ser limpos; durações e bloqueios devem expirar no escopo declarado. `ActivationTracker` controla disponibilidade por rodada, combate, sala ou jogo.

O combate escolhe herói e alvo, aplica usos manuais ou eventos reativos, rola dados pela fonte determinística, resolve defesa/dano e avança para recompensas ou próxima rodada. Guardas de alvo, custo e uso pertencem ao core. A UI apenas apresenta ações disponíveis e escolhas projetadas. O limite de profundidade da pilha de efeitos protege contra ciclos.

`resolveSkillWindow` reúne grants declarativos e referências legadas normalizadas das cartas presentes, valida origem, contexto, condição e limite, e passa a execução por `executeAbilityGrant`. Habilidades manuais entram por `USE_SKILL`, `USE_POWER` ou `USE_ITEM`, sem consumir o ataque do herói. Passivas e gatilhos automáticos seguem o evento declarado. Uma reação opcional precisa ser preparada antes do evento; quando ele ocorre, executa sem pedir confirmação. A preparação fica em `GameState.preparedAbilities` e é descartada quando a origem, o alvo ou a oportunidade deixam de existir. Escolhas necessárias ao efeito, como alvo ou dado, continuam pendentes. `TRIGGER_EVENT_EMITTERS` relaciona os eventos `evt_*` aos fluxos emissores.

Ao abrir uma escolha necessária, `pendingSkillWindow.resume` guarda o ponto de continuação. Para dano, a continuação registra a etapa pós-dano ainda não executada: acerto de ataque, destruição, eliminação e limpeza de componentes ECS. Uma escolha dentro do efeito mantém a janela pendente até a resposta; `parent` preserva a janela externa e a pilha de efeitos aguarda a decisão. O reducer retoma a resolução sem aplicar o dano novamente; no ataque, também conclui o dano da outra parte e encerra a ação. `pendingTriggerInterrupt` continua aceito para estados antigos em replay, mas o fluxo normal não abre uma confirmação opcional. O diário registra grants preparados e as decisões a partir do estado real.

## Catálogos e assets

Os catálogos executados ficam em `src/data/`:

| Arquivo | Função |
|---|---|
| `cards.yaml` | Composição de cartas e referências `skillId` com parâmetros. |
| `skills.yaml` e `abilities.yaml` | Definições de comportamento. |
| `cards.locale.pt-BR.yaml` e `skills.locale.pt-BR.yaml` | Nomes e textos de apresentação. |
| `balance.json`, `event_rules.json`, `transitions.json` | Balanceamento, ordem de eventos e transições válidas. |

`docs/dungeon-1.json` e `docs/habilidades.json` são catálogos editoriais da especificação v3, preservados como fonte do autor. **Não são importados pelo runtime**: uma alteração neles não muda a Alpha. Imagens originais ficam em `imagedata/`; o plugin de Vite gera manifestos e cópias em `public/generated/`. A UI resolve as URLs dos manifestos com `import.meta.env.BASE_URL`, necessário no subdiretório do GitHub Pages.

## Adicionar carta ou habilidade

1. Defina ou atualize a habilidade em `src/data/skills.yaml`, com ID estável, categoria, `operate_type`, alvo, escopo e `effect` ou `script`. Prefira uma primitiva DSL quando o efeito for reutilizável.
2. Escreva o texto visível no arquivo locale. Faça a carta referenciar o `skillId` em `cards.yaml`; não duplique lógica na carta ou na UI.
3. Se houver evento novo, defina o emissor, a ordem e o teste de contrato correspondente. Se houver status novo, atualize `transitions.json` antes de usá-lo no reducer.
4. Adicione testes de catálogo e de comportamento para alvo, janela, duração e custo; confira o fluxo apresentado na UI quando pertinente.

IDs canônicos, formato dos parâmetros, nós DSL e convenções de escopo estão em [`src/data/README.md`](../src/data/README.md) e [`src/core/README.md`](../src/core/README.md). As regras digitais deliberadas estão em [GAME_RULES.md](GAME_RULES.md).
