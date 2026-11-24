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
| `--profile` | `power-player` | `power-player`, `casual` ou `explorer` |
| `--heroes` | 3 primeiros da tela | IDs ou aliases separados por vírgula; 1 a 4 heróis |
| `--difficulty` | `normal` | `very_easy`, `easy`, `normal`, `hard` ou `nightmare` |

**Ver o log da IA no terminal**, jogada a jogada, sem navegador:

```bash
npm run bot:watch -- --seed 3 --profile power-player --heroes barbarian,cleric,mage --difficulty normal --delay 500
```

**Rodar muitas partidas sem tela**, com Casual por padrão (mistura de heurísticas e escolhas aleatórias):

```bash
npm run bot -- --games 100 --seed 1
```

O perfil `casual` reúne decisões simplificadas com uma escolha aleatória ocasional (15% das decisões com mais de uma opção), reprodutível por seed. `random` deixou de ser perfil separado e não é mais aceito por `--profile`.

Para comparar perfis, use as mesmas seeds, heróis e dificuldade em cada execução:

```bash
npm run bot -- --games 100 --seed 1 --profile casual --heroes barbarian,cleric,mage --difficulty normal
npm run bot -- --games 100 --seed 1 --profile power-player --heroes barbarian,cleric,mage --difficulty normal
npm run bot -- --games 100 --seed 1 --profile explorer --heroes barbarian,cleric,mage --difficulty normal
```

**Medir o equilíbrio de todos os heróis habilitados** na dificuldade normal:

```bash
npm run bot:balance -- --solo-seeds 20 --team-seeds 5 --seed 1 --difficulty normal --profile power-player
```

O comando joga cada herói sozinho e todas as combinações possíveis de três heróis (com 12 heróis, 220 trios). Agora percorre todas as expansões habilitadas, escolhendo o chefe e os baralhos do respectivo módulo. Para comparar os **três perfis** nas cinco dificuldades, use `npm run bot:leveling-report`. Usa as mesmas seeds em cada composição e grava `report.md` e `report.json` em `tools/bot/runs/balance-<data>/`. A taxa de vitória mede o desempenho do bot nessas partidas; zero vitórias não prova que um herói não possa vencer. Impasses ficam separados das derrotas.

Use `--mode solo` ou `--mode team` para rodar só uma das modalidades e `--expansions fornalha-sombria` para limitar o módulo. Com `--mode solo --hero mage`, rode um herói específico. A auditoria atual e suas limitações estão em `docs/BALANCE_AUDIT_2026-11-03.md`.

Aliases: `barbarian`, `paladin`, `cleric`, `rogue`, `warrior`, `necromancer`, `mage`, `hunter`. O **Power Player** combina estratégia de vitórias com economia de ações; o **Casual** varia escolhas e às vezes escolhe aleatoriamente; o **Explorer** prioriza ações pouco utilizadas. O Power Player ainda compara sequências curtas de Runa, Fúria, Marca, Eco e ataque usando dano e chance de abate, com custos e risco. O plano aparece no `bot:watch` e no `bot:screen`. Não há busca completa de todos os turnos.

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
~~~

O ensaio descobre automaticamente todos os heróis e as expansões habilitadas **com chefe próprio**. Para cada herói solo, executa as cinco dificuldades e os **três perfis** com **10 seeds por padrão**. Com 16 heróis e 3 expansões, a matriz contém **16 × 3 × 3 × 5 × 10 = 7.200 partidas** (antes, cinco perfis geravam 12.000). Não foi aumentado `runs` nem `maxSteps`. Novas expansões e heróis aumentam a matriz automaticamente; não há `--heroes`, `--expansions`, `--profiles` ou `--difficulties` no relatório completo. Esse benchmark usa **um chefe por expansão**; campanha de seis fases e chefe final requerem outro plano futuro.

O resultado de cada execução individual fica em **`tools/bot/runs/dungeon-<data>/report.json`** (ignorado pelo Git). Já o comando **`npm run audit`** mantém os resultados da auditoria de habilidades (`skill-audit.json` e `skill-audit.html`) e, caso aprovada, a simulação (`report.json`, `config.json`, `manifest.json`, `trials.jsonl`) na mesma pasta `tools/bot/runs/audit-<data-hora>/`. Ele inclui percentuais por herói, dificuldade e expansão, todas as partidas, impasses e a auditoria das cartas. Os arquivos `config.json` e `trials.jsonl` são apenas checkpoints privados para retomar um relatório interrompido; não são enviados ao site.

A partir dos relatórios novos, cada partida também registra `progression`: XP recebido, XP gasto, compras por opção (`level_up`, `recover_dungeon`, `buy_item`, `buy_artifact`), saldo e pico de XP, índices de Ímpeto inicial/final/máximo, número de subidas de nível e decisões em que subir nível estava disponível. O painel **Economia de XP e evolução dos heróis** compara médias por herói, expansão, dificuldade e perfil. Os números de oportunidades contam decisões da IA, não turnos distintos; XP é acompanhado pelas mudanças do saldo coletivo e eventuais consumos automáticos fora de `SPEND_XP` aparecem em `xpOtherLoss`. Relatórios antigos continuam legíveis, sem o painel novo. A partir desta revisão, `levelUpPurchases` considera apenas mudanças reais do índice de Ímpeto; `levelUpAttempts` e `levelUpNoEffect` registram separadamente ações executadas sem evolução. As janelas `skillOpportunities` e `powerOpportunities` representam decisões nas quais essas ações estavam entre as opções do bot. `powerUses` agora inclui poderes executados por `USE_SKILL`, `USE_POWER` e interrupções voluntárias `APPLY_TRIGGER_INTERRUPT`; `skillUses` também inclui habilidades disparadas nas janelas de interrupção, sem contar habilidades inimigas. Gatilhos voluntários são acionados pela janela de interrupção do motor, não por um `USE_SKILL` artificial. O Power Player prioriza evolução, sobrevivência e eficiência, enquanto Casual e Explorer investigam escolhas por prioridades diferentes. Essas métricas exigem gerar um novo relatório; as regras e as cartas não foram alteradas.

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

### Leveling 2.0 — índice adicional por fase

A auditoria do catálogo e o relatório completo agora incorporam `catalog.levelingVersion`, `catalog.combatWeights` e `leveling` em heróis, criaturas, subchefes e salas. Os campos de score e faixas da auditoria original permanecem para compatibilidade com JSONs anteriores. Relatórios antigos ainda abrem, mas não apresentam o painel Leveling 2.0.

- **Pesos padrão configuráveis no código:** vida 20, dano efetivo 30, chance de acerto 20, quantidade de dados 15, defesa efetiva 15; consultar `tools/bot/levelingScore.ts`. Os cinco componentes são normalizados. Alterações nesses pesos exigem novo relatório JSON.
- **Combate:** probabilidades calculadas pela distribuição exata de dados d6 e bônus das cartas nas cinco cores. Empate causa 1 ponto de dano para cada lado. Dano e defesa são expectativas contra uma carta de referência da Fornalha, **não previsões universais** nem probabilidades de vitória.
- **Fases:** heróis apresentam notas de combate, descarte, sobrevivência, utilidade e progressão; habilidades são detalhadas por impacto, frequência, condições, limites, custos e consumo. Scripts e tipos de efeito desconhecidos geram alertas de estimativa incompleta. Habilidades de Despertar só são agregadas à cor roxa.
- **Salas:** notas de ameaça 0–100 por 1–4 jogadores e cinco cores; o modelo usa o conjunto médio de criaturas da expansão, não simula encontros reais. Criaturas especiais, invocações e sinergias devem ser revisadas por playtest.
- **Chefes finais:** não são pontuados. Subchefes são auditados em sua categoria própria.
- **Interpretação:** notas são heurísticas para diagnóstico comparativo. Não equivalem a porcentagens de vitória; resultados reais continuam no quadro de simulação. Um herói especializado pode ter pontuação zero em uma dimensão e ser viável na equipe.
- **Reprodutibilidade:** os índices dependem da versão declarada e das cartas de referência, preservando o histórico por JSON. A primeira criatura e o primeiro herói da base são a referência adversária fixa nesta versão; escolha de referência mais robusta é uma etapa de calibração futura.

Nada nesta funcionalidade altera valores das cartas, resolve combates no jogo, muda JSONs de produção ou executa testes automaticamente. Para validar localmente, execute sua suíte e gere `npm run bot:catalog-report` ou `npm run bot:leveling-report`, como preferir.

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

## Experimento de preços — P1 (bots apenas)

O comando `npm run bot:leveling-report` voltou a usar os **preços oficiais**: item **15 XP** e artefato **35 XP**. O campo `options.xpExperiment` só aparece em execuções com override explícito, nunca no audit padrão. A política dos bots prioriza subir de nível e recuperar o baralho da masmorra; itens e artefatos são compras excepcionais após o nivelamento, com reserva de XP. O Casual absorveu variações aleatórias e não há mais `random` separado no benchmark.

## Estatísticas de veneno (por PV real)

O relatório passa a registrar `trials[].poison.toHeroes` (dano sofrido por heróis), `toEnemies` (dano infligido aos inimigos) e `preventedByHeart` (PV evitados pelo Coração Corrompido na luta contra a Bruxa). Os agregados ficam em `diagnostics.poison` e `diagnostics.poisonByExpansion` para facilitar a comparação Fornalha × Bruxa. Aplicações de veneno sem tick ou reduzidas a zero **não contam como dano causado**. Os custos experimentais não devem ser confundidos com preços já aprovados para o jogo.

Nota: o Coração Corrompido é passivo e não aparece entre os artefatos com comando `USE_ARTIFACT`; seu efeito é aplicado pelos dois resolvedores de veneno e não aumenta o número de ações do bot.

## Auditoria de veneno e boss — pacote de observabilidade

Cada partida registra `poison.damageBySource` (carta/habilidade, PV em heróis e inimigos, ticks), `poison.applicationsBySource`, `poison.blockedBySource` e `poison.removalsBySource` (motivo | agente removedor | origem do veneno). Remoções por expiração, fim do combate, antídoto, limpeza de habilidade, dispel, morte e substituições não reconhecidas são distinguíveis. Os agregados ficam em `diagnostics.poisonDamageBySource`, `poisonRemovalBySource`, `poisonApplicationsBySource` e `poisonBlockedBySource`. Campos `witchBossPoisonTicks` e `heartHeldAtWitchBossTicks` distinguem falta de oportunidade de possível falha do Coração.

`trials[].bossEncounter` registra a primeira entrada real no chefe: sala, nível, PV/max PV, XP, número de artefatos e posse do Coração. `diagnostics.bossByExpansion` resume entrada e condição do grupo; `diagnostics.xpPolicy` contabiliza gastos em itens/artefatos quando havia level up disponível e recuperações da masmorra. Os campos são agregados de eventos reais, não previsões de vitória.

A telemetria também inclui a origem na linha de log de cada tick, bem como um alerta de integridade caso o total de dano de veneno não corresponda à soma das fontes identificadas. Valores em `unknown/poison` são destacados para investigação.

### Auditoria de salas, heróis e Pesadelo (14/11)

O `audit` agora diferencia **Difícil = Despertar 1** de **Pesadelo = Despertar 2**, conservando Ímpeto 0 nos dois. `report.json` inclui `trials[].initialDespertar`, `initialHeroLevel` e `rooms` com visitas, salas vencidas, criaturas difíceis de 3 XP, subchefes vistos/derrotados e XP observado ao vencer. Os campos agregados `diagnostics.roomsByExpansion`, `diagnostics.heroBalance` e `diagnostics.difficultyParity` também aparecem em tabelas no relatório Markdown e em detalhes expansíveis no painel HTML.

`heroBalance` separa vitórias, chegadas ao chefe e vitórias após chegar; assim fica visível se um herói sofre na exploração ou no combate final. Todos os indicadores descrevem o comportamento do bot (não uma taxa garantida para humanos). Relatórios antigos continuam legíveis; métricas novas são preenchidas apenas após nova execução. Para o impasse conhecido do Necromante, há teste determinístico em `tools/bot/ai.test.ts` (`casual`, Fácil, seed 1, Fornalha).

### Logs P2 — escolhas de habilidades por herói

Os relatórios registram `trials[].progression.abilityDecisions` com `offeredById` (decisões nas quais a habilidade podia ser usada), `chosenById` (ações realmente escolhidas), `offeredAtBossById` e `chosenAtBossById` (subconjunto no chefe). Inclui ações USE_SKILL, USE_POWER e interrupções voluntárias, mas não infere efeito de passivas nem confunde SKIP_TRIGGER_INTERRUPT com uso. As decisões podem se repetir na mesma sala; contá-las não significa usos únicos. O agregado fica em `diagnostics.heroBalance`, por expansão, herói e dificuldade. Essas métricas ajudam a separar uma habilidade indisponível de uma habilidade que a IA deixa de usar.


## O Desbravador P1

Execute localmente `npm run bot:discover -- --runs 2 --validate-runs 4`. Hipóteses de combos são mineradas por tipos de efeito e comparadas em partidas pareadas com seeds reservadas. Somente regras comprovadas, promovidas com `--promote`, entram em `src/data/discoveryKnowledge.json` e influenciam o bot. O Casual substitui a linha de base aleatória como perfil de referência. Veja `tools/bot/discovery/README.md`.

O registro `abilityTrace` é apenas telemetria e foi explicitamente excluído do fingerprint de progresso, para não transformar ações sem efeito em jogadas válidas nem inflar a verificação a cada passo. O código existente de combos especiais permanece disponível no bot tradicional durante a transição; a descoberta executa sem esse planejador.


### Modos cooperativos do Desbravador

`npm run bot:discover -- --dry-run` imprime apenas o plano, sem executar partidas.
`npm run bot:discover -- --party-size 2 --max-parties 8` minera combos entre dois heróis; altere o tamanho para 3 ou 4. Relatórios e conhecimento ficam separados da auditoria. Consulte `tools/bot/discovery/README.md` para critérios de confirmação, versionamento e revalidação.


## Power Player unificado e Explorer investigativo

O Instrutor Solo aprende **uma política para Power Player**, combinando vitória com economia de ações nas partidas ganhas. Casual e Explorer não consomem os pesos aprendidos. O Desbravador mantém mineração experimental de combos comprovados.

```bash
# Prévia/diagnóstico sem escrita da política publicada:
npm run bot:train-solo -- --dry-run
npm run bot:train-solo -- --focus all --max-heroes 4 --max-contexts 12 --max-features 6 --runs 2 --validate-runs 8

# Treino com promoção somente após a validação independente:
npm run bot:train-solo -- --focus all --max-heroes 4 --max-contexts 12 --max-features 9 --runs 3 --validate-runs 16 --epochs 2 --promote

# Explorer em modo aprofundado com memória de cobertura/replay:
npm run bot:explore -- --dry-run
npm run bot:explore -- --runs 3 --max-scenarios 24 --max-steps 750
```

`npm run bot:bug-hunt` permanece alias do `bot:explore` para compatibilidade. O `audit` chama a investigação **curta** depois de skills e leveling, salvo `AUDIT_BUG_HUNT=0`. A memória do Explorer fica em `tools/bot/runs/bug-hunter-corpus.json`; a pontuação de Explorer utilizada no headless/screen compartilha a mesma priorização adversarial. Não confundir suspeitas com violações confirmadas.

As políticas aprovadas do Power Player ficam em `src/data/soloPolicy.json`, separadas por herói e contexto. `--promote` não garante que haverá alteração; os ensaios A/B podem rejeitar políticas candidatas. A estatística de itens é observacional, não causal. Detalhes e limites em [Desbravador](discovery/README.md) e [Modo bot](../../docs/BOT_MODE.md).

O catálogo de futuras fases é descoberto dinamicamente. Não transformar o benchmark atual (expansão + chefe) em seis fases ou chefe final sem criar um contrato explícito de campanha.


## Pacote P0/P1 — 24/11/2026

- **P0 / Power Player:** mantém a pontuação da habilidade quando `USE_POWER` aparece também no fluxo de ações legais; usa `USE_POWER` real para poderes de herói. Prioridade de poderes é sensível a pressão, chefe e ferimentos; em curas limitadas não gasta carga por ferimento pequeno. Não muda atributos, cartas nem quantidade de seeds.
- **P0 / Explorer:** após três rodadas sem reduzir PV do inimigo, prioriza ataques sobre suportes repetidos. Investigações profundas agora registram `inconclusiveGames`, `exhaustionByReason`, `exhaustionReason` e suspeitas não bloqueantes para ciclos, teto de ações e combate sem dano. Não equiparar inconclusiva a bug comprovado.
- **P1 / expansões:** `diagnostics.expansionParity.comparisons` contém todos os pares distintos de expansões habilitadas, em todas as dificuldades, no JSON, HTML e Markdown. `byDifficulty` legado fica disponível para consumidores anteriores. A meta de 7 p.p. é apenas indicativa.
- **P1 / habilidades:** prova de preparação de grants voluntários com o reducer real; novas asserções de uso único de cura e cobertura do poder do Andarilho das Planícies. Uma sonda de preparação marca **PARTIAL**, não valida o efeito futuro nem todos os alvos.
- **Telemetria adicional:** `diagnostics.powerUsageByProfile` expõe média de poderes e derrotas sem poder usado; não infere disponibilidade do poder na derrota.

### Verificação local (nenhuma execução em CI)

```powershell
npm run typecheck:tools
npx vitest run tools/bot/ai.test.ts tools/bot/reportDiagnostics.test.ts tools/bot/skill-audit/autoContracts.test.ts tools/bot/skill-audit/heroRuntime.test.ts tools/bot/discovery/bugHunter.test.ts
npm run audit
```

> O Vitest cobre as novas verificações pontuais; a cobertura completa dos cenários de habilidades roda em `npm run bot:skills-audit` (primeira etapa de `npm run audit`).
