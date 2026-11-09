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

O comando joga cada herói sozinho e todas as combinações possíveis de três heróis (com 12 heróis, 220 trios). Ele usa o chefe padrão da Fornalha; para comparar módulos isolados, prefira `bot:dungeon-report`. Usa as mesmas seeds em cada composição e grava `report.md` e `report.json` em `tools/bot/runs/balance-<data>/`. A taxa de vitória mede o desempenho do bot nessas partidas; zero vitórias não prova que um herói não possa vencer. Impasses ficam separados das derrotas.

Use `--mode solo` ou `--mode team` para rodar só uma das modalidades. Com `--mode solo --hero mage`, rode um herói específico. A auditoria atual e suas limitações estão em `docs/BALANCE_AUDIT_2026-11-03.md`.

Aliases: `barbarian`, `paladin`, `cleric`, `rogue`, `warrior`, `necromancer`, `mage`, `hunter`. `explorer` prioriza experimentar habilidades; `casual` varia escolhas; `speedrunner` acelera ataques e progressão. `power-player` compara sequências curtas de Runa, Fúria, Marca, Eco e ataque usando a distribuição dos dados, o dano médio e a chance de abate. Ele desconta o custo da ação do mago e o dano sofrido pelo bárbaro. O plano escolhido aparece no `bot:watch` e no `bot:screen`. Ainda não há busca completa de todos os turnos ou otimização de equipamento.

## Ensaio de masmorras: todos os heróis, perfis e dificuldades (somente desenvolvimento)

O experimento descobre **todos os heróis e expansões habilitados** diretamente nos pacotes em `assets/expansions`. A cada seed joga **cada herói em cada expansão isoladamente**, selecionando o boss da própria expansão, com baralhos exclusivamente daquele módulo. São 10 seeds × 12 heróis × 2 expansões × 5 perfis × 5 dificuldades = **3.000 partidas** no catálogo atual. Novos heróis e módulos entram automaticamente, sem editar listas no bot. A mesma seed produz decks iniciais equivalentes **dentro de cada expansão**, não entre expansões distintas.

```bash
# Ver quantas partidas serão executadas, sem começar:
npm run bot:dungeon-report -- --dry-run

# Gerar o ensaio completo:
npm run bot:dungeon-report -- --runs 10 --seed 1 --max-steps 1000
```

O resultado é gravado numa pasta datada em `tools/bot/runs/dungeon-<data>/`, **ignoradas pelo Git, fora de `public/` e do build Vite**. Abra `index.html` no navegador para ver um painel escuro, com matriz de taxas de vitória, filtros por expansão/herói/perfil/dificuldade, comparativo das taxas de vitória entre expansões e detalhamento das partidas. Também gera `report.json`, `report.csv` (Excel), `report.md`, `config.json` e `trials.jsonl` (checkpoint). Uma segunda página, **`catalog.html`**, apresenta os atributos brancos de todos os heróis e criaturas, o número de inimigos por sala para grupos de 1 a 4 heróis, a dificuldade estimada de cada sala e a lista de itens/equipamentos/habilidades. Os mesmos dados saem em `catalog.json`, `catalog.csv` e `catalog.md`.

Para um ensaio curto de validação, ou selecionar heróis, expansões, perfis e dificuldades:

```bash
npm run bot:dungeon-report -- --runs 1 --heroes mage --profiles power-player --difficulties normal --max-steps 100
# Apenas a Bruxa (chefe, salas, monstros e loot da própria expansão):
npm run bot:dungeon-report -- --runs 3 --expansions torre-grande-bruxa-caldeirao --heroes hero_oak_guardian --profiles casual --difficulties normal
npm run bot:dungeon-report -- --runs 10 --heroes cleric,rogue,mage --profiles casual,power-player --difficulties easy,normal
```

Se interromper um ensaio grande, retome **com os mesmos parâmetros** e a pasta original; as partidas concluídas não são repetidas:

```bash
npm run bot:dungeon-report -- --runs 10 --seed 1 --max-steps 1000 --output tools/bot/runs/dungeon-PASTA-EXISTENTE --resume
```

As opções disponíveis são `--runs N`, `--seed N`, `--max-steps N`, `--heroes a,b`, `--expansions id1,id2`, `--profiles a,b`, `--difficulties a,b`, `--output pasta`, `--resume` e `--dry-run`. Por padrão, **nenhum relatório aparece no site de produção**: é uma ferramenta de desenvolvimento, executada via npm, e os resultados locais não são versionados nem publicados automaticamente. Uma seed controla as cartas **iniciais**, não força todas as decisões futuras a seguirem o mesmo caminho. As taxas medem a política do bot nas seeds observadas — não garantem a força real dos heróis.

## Auditoria rápida de cartas (sem jogar partidas)

Para gerar imediatamente as tabelas dos módulos habilitados, sem executar o simulador:

```bash
npm run bot:catalog-report

# Inspecionar somente a expansão da Bruxa:
npm run bot:catalog-report -- --expansions torre-grande-bruxa-caldeirao
```

Abra `tools/bot/runs/catalog-<data>/catalog.html`. O comando também gera CSV, JSON e Markdown com todos os heróis, criaturas, salas e itens descobertos. É a forma mais rápida de localizar salas subdimensionadas e comparar o nível branco antes de gastar tempo com milhares de simulações.

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
| `balance.ts` | Amostra pareada de jogos solo e todas as equipes de três com heróis descobertos no catálogo |
| `dungeonBenchmark.ts`, `dungeonReport.ts` | Ensaio independente por boss/expansão, com todos os heróis |
| `catalogBalance.ts` | Inventário e classificação comparativa de criaturas, salas, heróis e equipamentos |

## Limites

- O planejamento de combos cobre a rodada e o ataque seguinte; ainda não prevê várias rodadas, mudanças de equipamento ou todas as habilidades.
- Pela tela, recuperar a masmorra esgotada e comprar com XP ainda podem falhar no clique.
- Seeds com bugs conhecidos do jogo estão em `KNOWN_BUGS`, em `bot.test.ts`.
