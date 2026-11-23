# Bots de playtest — três perfis especializados

> Estado da branch `codex/bots-aprendizado-perfis-20261123`, 23/11/2026. A revisão implementa **três perfis** e mantém as execuções extensas exclusivamente locais. Nenhum teste, build ou treino completo foi executado como parte desta alteração.

## Visão geral

| Perfil | Missão | Aprendizado |
| --- | --- | --- |
| **Power Player** (`power-player`) | Vencer, sobreviver e, entre vitórias, reduzir ações e desperdícios | Pesos por herói/contexto e combos validados por A/B |
| **Casual** (`casual`) | Simular jogador comum com heurísticas limitadas e decisões aleatórias eventuais | Não aprende; decisões com seed reproduzível |
| **Explorer** (`explorer`) | Priorizar ações incomuns, ampliar cobertura e encontrar defeitos | Contadores durante a sessão; corpus persistente no modo de investigação |

**Speedrunner e Random foram absorvidos**, não são mais valores aceitos de `--profile`. A intenção de velocidade integra o Power Player e a seleção aleatória eventual integra o Casual. O **Caçador de Bugs não é perfil adicional**: ele usa o ranking adversarial do Explorer em modo de investigação com corpus, invariantes e replays.

`BOT_PROFILES` em `tools/bot/profiles.ts` determina a lista do benchmark; `src/data/soloPolicy.json` guarda apenas treinamento relevante ao Power Player. O motor de regras continua a única autoridade para ações válidas e alterações de estado.

## Comandos locais

```bash
npm run bot -- --games 100 --seed 1 --profile casual
npm run bot -- --games 100 --seed 1 --profile power-player
npm run bot -- --games 100 --seed 1 --profile explorer

# Bot visual: iniciar npm run dev em outro terminal
npm run bot:screen -- --profile power-player --heroes barbarian,cleric,mage --difficulty normal --pause 800

# Prévia sem partidas
npm run bot:train-solo -- --dry-run
npm run bot:explore -- --dry-run
```

O comando `bot:explore` executa `tools/bot/discovery/bugHunter.ts`. `bot:bug-hunt` é mantido como **alias de compatibilidade** para rotinas antigas. A saída continua `bug-hunt-report.json` e o corpus `tools/bot/runs/bug-hunter-corpus.json`; manter essas rotas preserva histórico e procedimentos existentes.

## Treinar o Power Player unificado

```bash
# Primeiro, prévia e diagnóstico SEM alterar a política publicada
npm run bot:train-solo -- --dry-run
npm run bot:train-solo -- --focus all --max-heroes 4 --max-contexts 12 --max-features 6 --runs 2 --validate-runs 8 --epochs 1

# Treino com promoção OPT-IN, apenas se validação A/B comprovar melhora
npm run bot:train-solo -- --focus all --max-heroes 4 --max-contexts 12 --max-features 9 --runs 3 --validate-runs 16 --epochs 2 --promote
```

O `--profile` do treinador aceita apenas `power-player` e pode ser omitido. Focos: `all`, `skills`, `items` ou `powers`. A lista de heróis é rotacionada por `--seed`; `--hero` restringe a um ID e `--all-heroes` amplia a cobertura. O algoritmo distribui características entre heróis. `--epochs` investiga seeds de treino diferentes e nunca usa as seeds de validação reservadas.

**Gate de promoção:** pelo menos 40 pares A/B, nenhuma violação adicional, ganho estatisticamente suficiente de vitórias (>=4 e McNemar corrigido >=6,64) **ou** economia >=5% de passos entre pelo menos oito vitórias compartilhadas, sem redução de vitórias. Precisa superar tanto a política adaptativa anterior quanto a publicada. `validationByHero` e `perHeroSafe` impedem promover uma mudança que piore claramente um único herói. **Uma derrota mais rápida não vale como ganho.**

Arquivos em `tools/bot/runs/solo-train-*/power-player/`: `solo-training-report.json`, `solo-policy-candidate.json`, `item-drop-observations.json`. A contagem de itens é **frequência observada**, não evidência causal de chance de drop; intervalos Wilson alertam para amostras pequenas. O catálogo versionado só muda quando `--promote` passar por todos os gates.

## Explorer: investigar profundamente

```bash
npm run bot:explore -- --runs 3 --max-scenarios 24 --max-steps 750
npm run bot:explore -- --hero hero_crimson_rune_mage --difficulty normal --runs 5
npm run bot:explore -- --reset-corpus --dry-run
```

`scoreMoves(..., "explorer")` agora utiliza a mesma priorização adversarial do Caçador de Bugs: ações raras, habilidades, itens, reações, escolhas e dados competem com ações usuais; o ranking é reprodutível por seed. No bot headless normal, a memória de uso é por sessão. Em `bot:explore`, as execuções compartilham e preservam o corpus de cobertura e seeds de regressão **entre chamadas**, invalidando-o quando o fingerprint do catálogo muda.

A investigação não altera regras, atributos nem estratégias de vitória. `blocker` representa invariantes ou ações ofertadas pelo core rejeitadas; `investigate` identifica suspeitas que precisam de reprodução. As sequências exatas de ações e as seeds são preservadas para replay.

## Benchmark e audit: volume controlado

`tools/bot/dungeonBenchmark.ts` conserva `runs: 10`, `maxSteps: 1000` e as cinco dificuldades. Os perfis passam de **5 para 3**, sem compensar com mais seeds. A quantidade é calculada dinamicamente:

```text
partidas = heróis habilitados × expansões com chefe × 3 perfis × 5 dificuldades × 10 seeds
```

Portanto o benchmark que antes gerava aproximadamente **12.000** partidas passa a gerar aproximadamente **7.200** com o mesmo catálogo; não houve aumento de volume nem mudança de regras. É uma redução natural da matriz. Relatórios antigos com cinco perfis continuam sendo *históricos*, e não devem ser comparados diretamente aos atuais sem considerar a mudança de políticas.

`npm run audit` continua rodando habilidades, leveling completo e uma amostra **curta** do Explorer investigativo (`bot:explore`). `AUDIT_BUG_HUNT=0` desativa somente a última fase. O treinamento de pesos não ocorre dentro do audit e continua fora do CI/CD.

## Preparação para futuras fases

A ideia de produto é chegar a **seis fases e um chefe final**. Hoje o jogo possui três pacotes habilitados, cada um com chefe próprio. A campanha de seis fases e seu chefe final **ainda não foram implementados aqui**.

Não fixar o número de expansões nem de heróis nos bots: o benchmark descobre pacotes via `getEnabledExpansions()` e chefes por `getBoss(expansionId)`. Ao introduzir fases de campanha sem chefes individuais e um chefe final compartilhado, será preciso criar um plano de execução diferente do benchmark atual de **uma expansão + seu chefe**, em vez de improvisar novos casos ou multiplicar seeds silenciosamente. Preservar proveniência, seeds reprodutíveis e separação entre playtest de fase e campanha integral.

Veja [guia do Desbravador](../tools/bot/discovery/README.md) e [guia do bot](../tools/bot/README.md).
