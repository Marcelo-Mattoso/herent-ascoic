# Bot

Joga partidas do Ascensão Heróica para encontrar o que está quebrado. Plano completo em `docs/BOT_MODE.md`.

## Como ativar

**Assistir jogando na tela** (precisa do jogo rodando em outro terminal com `npm run dev`):

```bash
npm run bot:screen -- --profile power-player --heroes barbarian,cleric,mage --difficulty normal --pause 800
```

Abre uma janela do Chromium: o bot lê o estado do jogo pela store e age com o mouse, arrastando e clicando.

| Opção | Padrão | Efeito |
|---|---|---|
| `--games N` | 1 | Quantas partidas jogar |
| `--pause MS` | 500 | Pausa entre jogadas |
| `--output screen\|store` | `screen` | Executa pela tela ou despachando na store |
| `--stuck MS` | 25000 | Tempo sem progresso até registrar travamento |
| `--url URL` | `http://localhost:5173` | Endereço do jogo |
| `--headless` | desligado | Roda sem janela |
| `--profile` | `power-player` | `casual`, `power-player`, `speedrunner`, `explorer` ou `random` |
| `--heroes` | 3 primeiros da tela | IDs ou aliases separados por vírgula; 1 a 4 heróis |
| `--difficulty` | `normal` | `very_easy`, `easy`, `normal`, `hard` ou `nightmare` |

**Ver o log da IA no terminal**, jogada a jogada, sem navegador:

```bash
npm run bot:watch -- --seed 3 --profile power-player --heroes barbarian,cleric,mage --difficulty normal --delay 500
```

**Rodar muitas partidas sem tela**, com escolhas aleatórias por padrão:

```bash
npm run bot -- --games 100 --seed 1
```

`random` sorteia, com seed reproduzível, entre as ações disponíveis e as habilidades manuais. Não usa notas de dano, cura ou estratégia. O mesmo perfil funciona em `bot:watch` e `bot:screen` com `--profile random`.

Para comparar perfis, use as mesmas seeds, heróis e dificuldade em cada execução:

```bash
npm run bot -- --games 100 --seed 1 --profile casual --heroes barbarian,cleric,mage --difficulty normal
npm run bot -- --games 100 --seed 1 --profile power-player --heroes barbarian,cleric,mage --difficulty normal
npm run bot -- --games 100 --seed 1 --profile speedrunner --heroes barbarian,cleric,mage --difficulty normal
npm run bot -- --games 100 --seed 1 --profile random --heroes barbarian,cleric,mage --difficulty normal
```

**Medir o equilíbrio de todos os heróis habilitados** na dificuldade normal:

```bash
npm run bot:balance -- --solo-seeds 20 --team-seeds 5 --seed 1 --difficulty normal --profile power-player
```

O comando joga cada herói sozinho e todas as combinações possíveis de três heróis (com 12 heróis, 220 trios). Agora percorre todas as expansões habilitadas, escolhendo o chefe e os baralhos do respectivo módulo. Para comparar também os cinco perfis e dificuldades, use `bot:dungeon-report`. Usa as mesmas seeds em cada composição e grava `report.md` e `report.json` em `tools/bot/runs/balance-<data>/`. A taxa de vitória mede o desempenho do bot nessas partidas; zero vitórias não prova que um herói não possa vencer. Impasses ficam separados das derrotas.

Use `--mode solo` ou `--mode team` para rodar só uma das modalidades e `--expansions fornalha-sombria` para limitar o módulo. Com `--mode solo --hero mage`, rode um herói específico. A auditoria atual e suas limitações estão em `docs/BALANCE_AUDIT_2026-11-03.md`.

Aliases: `barbarian`, `paladin`, `cleric`, `rogue`, `warrior`, `necromancer`, `mage`, `hunter`. `explorer` prioriza experimentar habilidades; `casual` varia escolhas; `speedrunner` acelera ataques e progressão. `power-player` compara sequências curtas de Runa, Fúria, Marca, Eco e ataque usando a distribuição dos dados, o dano médio e a chance de abate. Ele desconta o custo da ação do mago e o dano sofrido pelo bárbaro. O plano escolhido aparece no `bot:watch` e no `bot:screen`. Ainda não há busca completa de todos os turnos ou otimização de equipamento.

## Leveling Report (somente no seu computador)

O relatório de leveling **não é executado pelo GitHub Actions**, não integra o build de produção e **só aparece em localhost com npm run dev**. A geração recusa ambientes com CI/GITHUB_ACTIONS. O servidor Vite registra a rota somente em modo desenvolvimento, aceitando conexões de loopback.

**No primeiro terminal:**

~~~bash
npm run dev
~~~

Acesse **http://localhost:5173/leveling-report**.

**No segundo terminal — relatório completo, sem filtros parciais:**

~~~bash
npm run bot:leveling-report
# Equivalente: npm run bot:dungeon-report
~~~

O ensaio descobre automaticamente todos os heróis e todas as expansões habilitadas. Para cada herói solo, executa as cinco dificuldades, os cinco perfis do bot e todas as expansões, com 10 seeds por padrão: **12 × 2 × 5 × 5 × 10 = 3.000 partidas** no catálogo atual. Novas expansões e heróis aumentam a matriz automaticamente, sem alterar o bot. Não há `--heroes`, `--expansions`, `--profiles` ou `--difficulties` nesse comando: o relatório é sempre completo.

O resultado de cada execução fica em **`tools/bot/runs/dungeon-<data>/report.json`** (ignorado pelo Git). Ele inclui percentuais por herói, dificuldade e expansão, todas as partidas, impasses e a auditoria das cartas. Os arquivos `config.json` e `trials.jsonl` são apenas checkpoints privados para retomar um relatório interrompido; não são enviados ao site.

A página exibe **um relatório por vez**, selecionado no histórico ordenado por data, com opção de importar um JSON do disco. A primeira tabela tem todos os heróis nas linhas e, nas colunas, cada expansão agrupando todas as dificuldades. Não há seletor de expansão; um seletor opcional de perfil permite inspecionar o efeito da estratégia. O histórico atualiza pelo botão **Atualizar histórico**, sem reiniciar o Vite.

**Ver quantas partidas serão jogadas, sem executar:**

~~~bash
npm run bot:leveling-report -- --dry-run
~~~

**Retomar uma execução interrompida (sempre com os mesmos parâmetros):**

~~~bash
npm run bot:leveling-report -- --output tools/bot/runs/dungeon-PASTA-EXISTENTE --resume
~~~

Os parâmetros aceitos são `--runs N`, `--seed N`, `--max-steps N`, `--output pasta`, `--resume` e `--dry-run`. `--runs` altera somente a quantidade de seeds; **nunca reduz a quantidade de heróis, expansões, perfis ou dificuldades**.

### Auditoria estática rápida, também em JSON

~~~bash
npm run bot:catalog-report
~~~

O comando lê **todas as expansões habilitadas**, sem jogar partidas, e salva `tools/bot/runs/catalog-<data>/report.json`. Esse JSON também aparece no histórico do viewer; por não ter simulações, exibe traços nas células de vitórias. Para popular as porcentagens, rode **`npm run bot:leveling-report`**.

## Como funciona o leveling preliminar

- **Criaturas**: índice usa apenas vida, dano, acerto e dados **brancos (índice 0)**, somados ao impacto indicativo das habilidades normais. As habilidades `requiresAwakening: true` (roxas) não entram na nota. O critério é exploratório: habilidades e efeitos complexos não equivalem a dano direto.
- **Faixas fácil / média / difícil**: calculadas com os tercis de ameaça das criaturas da **Fornalha Sombria**, congelando a régua entre expansões.
- **Salas**: nota separada para 1, 2, 3 e 4 heróis, usando quantidade declarada de inimigos × ameaça média das criaturas da expansão e impacto das habilidades da sala. O relatório destaca quantas salas têm menos de quatro criaturas quando jogadas por quatro heróis e lista criatura especial, se declarada.
- **Itens**: todas as cartas de item do pacote, com classe, slot e habilidades; os scores de efeitos são descritivos, não preços nem uma ordem automática de balanceamento.
- **Resultados empíricos**: vitórias, derrotas, impasses e salas vencidas pelo bot são apresentados por expansão, com os **mesmos heróis, perfil, dificuldade e seeds**. Campanha, escala de cores, imunidades especiais propostas e rebalanceamento automático de JSON ficam fora desta primeira fase.

## O que ele gera

Tudo fica em `tools/bot/runs/`, fora do git:

- `screen-<data>/jogoN-fim.png`: tela final da partida.
- `screen-<data>/jogoN-erroM.png` e `.txt`: erro no console do navegador, com o motivo.
- `screen-<data>/jogoN-travou.png` e `.txt`: partida sem progresso.
- `watch-seed-N.jsonl`: decisões de `bot:watch`, uma por linha.
- `<data>/summary.json`: resultado de cada partida sem tela, equipe, salas, criaturas, usos de habilidades e ações de combo planejadas.
- Falhas como `boss_stalemate` salvam um replay, o estado e a visão do jogador para investigar impasses de balanceamento.

## Como está organizado

| Arquivo | Papel |
|---|---|
| `observe.ts` | Leitura: monta a tela, as jogadas e as habilidades a partir do estado |
| `brain.ts` | Decisão: dá nota às jogadas; não sabe como executá-las |
| `combo.ts` | Projeta sequências curtas e estima a chance de acerto e abate |
| `outputs.ts` | Saída: executa a decisão pela tela ou pela store |
| `screen.ts` | Laço da partida no navegador e captura de falhas |
| `port.ts`, `ai.ts`, `watch.ts` | IA sem navegador e log ao vivo |
| `profiles.ts` | Perfis, aliases de heróis e configuração fixa |
| `play.ts`, `run.ts`, `invariants.ts` | Lote de partidas e checagem de invariantes |
| `balance.ts` | Amostra pareada de jogos solo e todas as equipes de três, separadas por expansão |
| `dungeonBenchmark.ts`, `dungeonReport.ts` | Ensaio independente por boss/expansão, com todos os heróis |
| `catalogBalance.ts` | Inventário e classificação comparativa de criaturas, salas, heróis e equipamentos |
| `localLevelingReports.ts` | Histórico JSON local, leitura segura e bloqueio de CI |
| `levelingViewer.html` | Visualizador dev-only com matriz de heróis, expansões e dificuldades |
| `catalogReport.ts` | Exportação rápida do catálogo em JSON sem partidas |

## Limites

- O planejamento de combos cobre a rodada e o ataque seguinte; ainda não prevê várias rodadas, mudanças de equipamento ou todas as habilidades.
- Pela tela, recuperar a masmorra esgotada e comprar com XP ainda podem falhar no clique.
- Seeds com bugs conhecidos do jogo estão em `KNOWN_BUGS`, em `bot.test.ts`.
