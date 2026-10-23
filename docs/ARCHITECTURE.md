# Arquitetura da Alpha Web

Esta página descreve o código atual. `src/core/README.md` e `src/data/README.md` detalham as interfaces de cada módulo; o histórico anterior continua no Git.

## Caminho de uma ação

`src/ui/` apresenta o jogo em React e despacha `Action` por `src/ui/store/gameStore.ts`. A store Elf fica encapsulada em `elfStore.ts`. `createInProcessAdapter` entrega a ação ao reducer síncrono em `src/core/reducer/`. O reducer valida a fase, aplica regras, dispara habilidades, drena a pilha de efeitos e valida a transição contra `src/data/transitions.json`. Ele devolve um novo `GameState`, sem mutar o anterior. `playerView(state)` projeta o estado para a UI; componentes não devem implementar regras lendo o estado bruto.

O core não depende de React, DOM ou rede. Dados aleatórios passam pelo gerador com seed, para que `actionLog` possa ser reproduzido em `src/core/replay/`. `FEATURE_FLAGS.enableSave` permanece desligada: replay e portas de persistência existem, mas a sessão web não é retomada após recarregar.

## Regras e efeitos

- `state/` define estado e limites; `rules/` contém cálculos puros e máquina de estados.
- `reducer/` trata preparação, exploração, combate, recompensas, progressão e chefe. `systems/` aplica dano, cura e condições.
- `skills/` resolve habilidades por `skillId`, tipo de operação, alvo, escopo e evento. Efeitos reutilizáveis são nós da DSL em `skills/dsl/`; lógica singular pode usar um script em `src/data/scripts/`. Uma definição possui `effect` **ou** `script`.
- A DSL produz descritores para `effects/stack.ts`; `effects/resolver.ts` materializa os efeitos. O barramento `events/` e `event_rules.json` ordenam gatilhos. Escolhas que precisam do jogador ficam pendentes até uma nova ação.
- `ecs/` mantém entidades, modificadores, passivos e gatilhos. Durante a migração, parte dos modificadores também é projetada em `CombatState`. Ao remover uma fonte, seus modificadores dependentes devem ser limpos; durações e bloqueios devem expirar no escopo declarado. `ActivationTracker` controla disponibilidade por rodada, combate, sala ou jogo.

O combate escolhe herói e alvo, aplica usos manuais ou eventos reativos, rola dados pela fonte determinística, resolve defesa/dano e avança para recompensas ou próxima rodada. Guardas de alvo, custo e uso pertencem ao core. A UI apenas apresenta ações disponíveis e escolhas projetadas. O limite de profundidade da pilha de efeitos protege contra ciclos.

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
