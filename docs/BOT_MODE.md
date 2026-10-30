# Modo bot — plano

Status: F1 implementada em modo headless (`tools/bot/`); o modo com interface gráfica descrito abaixo continua planejado.

## F1 — bot headless (implementado)

`npm run bot -- --games N --seed S --max-steps M` joga partidas direto no reducer, reutilizando a política de `tools/golden/lib.ts`. Seeds derivadas (`S + i`) definem heróis, dificuldade e escolhas. Invariantes por action em `tools/bot/invariants.ts`: exceção no dispatch, serialização JSON, vida em [0, máx], pilha de efeitos drenada, duplicação de cartas, ação legal existente, repetição sem progresso e limite de passos. Falhas vão para `tools/bot/runs/<timestamp>/falha-seed-N/` (`replay.json`, `violation.json`, `state.json`, `view.json`, `eventLog.json`); reexecute com `npm run bot -- --replay <replay.json>`.

## Objetivo

`npm run bot` abre a tela normal do jogo num navegador visível e um bot joga sozinho, em loop, como um jogador humano que escolhe ao acaso. O objetivo dele é vencer. Cada partida gera um replay; qualquer quebra gera screenshot e diagnóstico numa pasta da execução.

Não substitui os testes de cenário (calculado × esperado). O bot encontra quebras; os cenários provam cálculos.

## Comportamento

1. Abre o jogo, clica **JOGAR**.
2. Escolhe de 1 a 4 heróis aleatórios e clica **Iniciar partida**.
3. Em cada momento, lê as ações legais do core, sorteia uma (seed do bot) e a executa **pela interface**: clique, arrasto, popover de inventário.
4. Ao vencer ou perder: exporta o replay, volta ao menu, começa outra partida.
5. Repete até Ctrl+C, fechar a janela ou atingir `--games N`.

Política inicial: aleatória com leve preferência por progredir (atacar, avançar sala, usar skill disponível), para chegar ao chefe com frequência razoável.

## Saída

```
bot-runs/<AAAA-MM-DD_HHMMSS>/
  summary.json                  # partidas, vitórias, derrotas, falhas, seed do bot
  game-0001/replay.json
  game-0002/replay.json
  game-0003-FAIL/
    replay.json
    journal.json                # Diário do motor
    state.json                  # GameState interno no momento da falha
    screenshot.png
    reason.txt                  # motivo legível + ação tentada + passo
    console.log
```

`bot-runs/` entra no `.gitignore`.

## Falhas detectadas

| Falha | Critério |
|---|---|
| Travou | Partida não terminou e não há ação legal |
| Ação sem interface | Ação legal no core sem elemento visível/habilitado na tela |
| Ação rejeitada | Interface executou a ação e o estado não mudou / log de rejeição |
| Erro | Exceção ou `console.error` no navegador |
| Transição inválida | Erro de `assertTransition` |
| Invariante | Vida fora de 0..máx, pilha de efeitos não vazia ao fim da ação, modificador órfão |
| Sem progresso | N ações seguidas sem mudança relevante, ou limite de passos por partida |

Na falha, a partida é abandonada e o loop segue com a próxima.

## Peças

### 1. Core — ações legais

Preencher `availableActions` em `src/core/projection/aiView.ts` (hoje esqueleto) com ações concretas e parâmetros: escolher herói/alvo, atacar, usar skill/poder/item, escolhas pendentes (alvo, dado, `i_choose_one`), recompensa, inventário, fluxo de sala e chefe. Fonte: as mesmas regras que o reducer usa e `abilityActionsByHero` já projetado. Sem lógica duplicada na UI ou no bot.

Teste de contrato: para estados variados, toda ação listada é aceita pelo reducer sem erro.

### 2. Ponte dev na página

Em `import.meta.env.DEV`, junto ao `__dispatch` já existente em `src/ui/store/gameStore.ts`, expor somente leitura:

- `__botView()` → `aiView(state)` (ações legais) + status;
- `__debugState()` → `GameState` para diagnóstico;
- `__exportReplay()` → JSON de `buildReplayPackage`;
- `__exportJournal()` → JSON do Diário.

O bot nunca usa `__dispatch`: decide pela ponte, age pela interface.

### 3. Mapa ação → interface

`tools/bot/uiActions.ts`: para cada tipo de ação, como executá-la na tela, usando `data-tutorial-anchor` existentes e `data-testid` novos onde faltar (cartas de inimigo/herói por id, botões de skill/poder/item, opções de escolha, recompensa). Se o elemento não existe ou está desabilitado → falha "ação sem interface".

### 4. Runner

`tools/bot/run.ts` com Playwright (já instalado), fora da suíte `e2e/`:

- sobe o Vite como o `playwright.config.ts` faz (porta própria);
- loop de partidas, loop de passos, checagens, gravação da pasta;
- `package.json`: `"bot": "vite-node tools/bot/run.ts"` (ou `node` + tsx, conforme funcionar com Playwright).

Opções:

| Opção | Padrão | Efeito |
|---|---|---|
| `--games N` | infinito | Para após N partidas |
| `--seed S` | aleatória | Seed das decisões do bot (registrada no summary) |
| `--speed slow\|normal\|fast` | normal | Pausa entre ações |
| `--headless` | não | Sem janela |
| `--max-steps N` | 2000 | Limite de passos por partida |

### 5. Revalidar replays

`npm run bot -- --check bot-runs/<pasta>`: reexecuta cada `replay.json` pelo core sem interface e confere que o estado final bate com o salvo. Detecta perda de determinismo.

## Ordem de entrega

1. Ações legais no core + teste de contrato.
2. Ponte dev + `data-testid` faltantes.
3. Runner com uma partida até o fim, sem gravação.
4. Loop, pasta de execução, replays, detecção de falhas e screenshot.
5. `--check` dos replays.

## Fora do escopo agora

- Política "inteligente" (heurística forte, busca).
- Estatísticas de balanceamento (taxa de vitória por herói etc.) — o `summary.json` pode crescer depois.
- Botão de modo bot dentro do jogo.
