# O Desbravador — descoberta e treinamento (estado de `dev`)

> Revisão de documentação: 23/11/2026. Os comandos abaixo correspondem aos scripts de `package.json`. Implementação experimental: **nenhuma nova validação local de build, Vitest ou simulações foi executada nesta revisão**.

## Quais agentes existem

| Ferramenta | Objetivo | Escopo atual |
| --- | --- | --- |
| `bot:discover` | Encontrar sequências de efeitos executados (pares/triplas) e avaliá-las em A/B | Solo; suporte experimental a grupos 2–4, **não executar treino cooperativo nesta fase** |
| `bot:train-solo` — `power-player` | Aprender prioridades por herói para habilidade, cura, poder, item e fase | Solo; taxa de vitória |
| `bot:train-solo` — `speedrunner` | Aprender prioridade por herói, economia de ações em vitórias e observação de itens | Solo; vitória + velocidade |
| `bot:bug-hunt` | Explorar ações raras, detectar violações e registrar replay/cobertura | Solo; diagnóstico, não taxa de vitória |

Os cinco perfis jogáveis do benchmark são `casual`, `power-player`, `speedrunner`, `explorer` e `random`. **Casual, Explorer e Random não recebem os pesos aprendidos pelo Instrutor Solo.** O Caçador de Bugs é um executor separado, não um sexto perfil de vitória.

## Comandos recomendados — primeiro a prévia

```bash
npm run typecheck:tools
npm run bot:train-solo -- --profile both --dry-run
npm run bot:bug-hunt -- --dry-run
```

O modo `--dry-run` lista o planejamento da execução, não treina nem atesta sucesso.

### Treinamento dos dois perfis, separado internamente

```bash
npm run bot:train-solo -- --profile both --focus all --max-heroes 4 --max-contexts 12 --runs 2 --validate-runs 12 --promote
```

`--profile` aceita `power-player`, `speedrunner` ou `both` (padrão); `--focus` aceita `all`, `skills`, `items` ou `powers`. `--seed` desloca o conjunto de heróis; `--hero <id>` escolhe apenas um; `--all-heroes` expande a busca, sujeita a `--max-contexts`. `--max-features` limita a quantidade de pesos investigados; `--epochs` controla ciclos de pesquisa.

Os pesos são versionados em `src/data/soloPolicy.json` e isolados por perfil, herói e característica da decisão (padrão `profile:<perfil>|hero:<cardId>|<característica>`). Conhecimento sem `catalogFingerprint` compatível não é aplicado ao jogo. A compatibilidade com os pesos históricos de Power Player é preservada no interpretador.

A promoção com `--promote` **não é automática por execução**: exige melhora em validação pareada com seeds reservadas (`seed + 200000`), incluindo comparação com a política adaptativa sem novos pesos e com o bot publicado. Power Player exige no mínimo 40 pares, quatro vitórias de vantagem, McNemar corrigido >= 6,64 e nenhuma violação adicional. Speedrunner pode passar pelos mesmos critérios de vitória ou demonstrar pelo menos 5% de economia de ações **entre vitórias compartilhadas**, com no mínimo oito vitórias compartilhadas e sem perder vitórias nem aumentar violações. O ensaio verifica os controles separadamente; melhora num treinamento não garante promoção.

O Power Player encerra o ciclo de otimização se não encontra ganho. O Speedrunner pode prosseguir em outras seeds ao avançar `--epochs`, mesmo que uma época anterior não tenha produzido uma política melhor. Isso **não** significa processamento em background; cada execução termina no comando local.

### Observação de itens

`item-drop-observations.json` é criado dentro de `tools/bot/runs/solo-train-*/<perfil>/` e contém incidência de itens observados por herói/expansão/dificuldade, frequência por retirada e por partida e intervalo de confiança de Wilson de 95%. O campo `sampleSufficientForRanking` exige ao menos 30 retiradas observadas.

**Não inferir que escolher determinado herói altera a probabilidade real do deck**: as diferenças podem decorrer de duração das partidas, recompensas acessadas e caminho escolhido. A telemetria registra retiradas observadas durante as simulações; não é um cálculo teórico da composição do baralho. Frequência alta tampouco equivale a item melhor; a preferência aprendida só é aprovada via ensaio A/B.

### Caçador de Bugs

```bash
npm run bot:bug-hunt -- --runs 3 --max-scenarios 24 --max-steps 750
npm run bot:bug-hunt -- --hero hero_crimson_rune_mage --difficulty normal --runs 5
npm run bot:bug-hunt -- --reset-corpus --dry-run
```

A seleção adversarial favorece ações pouco exercitadas, habilidades, itens, decisões de dados/alvo e reações normalmente ignoradas pela política de vitória. O executor **não altera estado diretamente para fabricar um resultado impossível**: ele usa ações do motor e registra o que o reducer realmente aceitou. `bug-hunt-report.json` distingue `blocker` (invariantes e ações oficialmente legais rejeitadas) de `investigate` (anomalias suspeitas, inclusive custo de PV, replays divergentes ou falta de progresso não conclusiva).

O corpus `tools/bot/runs/bug-hunter-corpus.json` armazena frequência de ações/grants e casos anteriores com **seed + sequência de ações**. Cada nova execução tenta até oito casos de regressão, antes dos novos cenários. Mudança no fingerprint do catálogo invalida a memória antiga; `--reset-corpus` recomeça do zero. O corpus e os resultados ficam em `tools/bot/runs/`, excluídos do Git.

A versão atual é **solo**: o teste sistemático de combinações entre heróis, itens e habilidades fica para evolução posterior. O caçador aprende *cobertura*, nunca políticas de vitória.

## Descoberta de sequências — modo experimental separado

```bash
npm run bot:discover -- --dry-run
npm run bot:discover -- --runs 2 --validate-runs 12
```

O minerador observa execuções reais registradas com proveniência de grant e experimenta sequências de 2–3 sinais, em vez de contar uma mera preparação como habilidade executada. Valida resultados com pares de seeds e McNemar; estratégias aprovadas entram em `src/data/discoveryKnowledge.json` somente sob `--promote`. Mudanças de catálogo invalidam conhecimento antigo e mantêm o histórico da hipótese para revalidação.

Há parâmetros para `--party-size 2|3|4` e seleção de composições, mas **o treinamento cooperativo foi deliberadamente adiado**. A presença desses parâmetros não implica que houve validação de sinergias entre heróis.

### Gate P0 e audit

`tools/bot/skill-audit/coverageBaseline.json` contém o baseline histórico de 311 grants. Um **grant novo** ainda classificado `NOT_COVERED` entra como bloqueador do `npm run audit`; grants antigos sem cobertura permanecem visíveis, não viram falsa aprovação. Não altere o baseline só para suprimir um alerta.

`npm run audit` chama auditoria de skills, leveling e **varredura curta de bugs** (se as etapas anteriores passarem). O Caçador de Bugs não substitui a auditoria formal; uma suspeita isolada não deve reprovar a sessão.

## Arquivos e limites de confiança

| Arquivo | Conteúdo |
| --- | --- |
| `src/data/discoveryKnowledge.json` | Padrões de combos aprovados |
| `src/data/soloPolicy.json` | Pesos por perfil/herói/contexto que foram promovidos |
| `tools/bot/runs/solo-train-*/<perfil>/solo-training-report.json` | Evidência A/B do Instrutor |
| `tools/bot/runs/solo-train-*/<perfil>/item-drop-observations.json` | Frequências observadas de itens |
| `tools/bot/runs/bug-hunt-*/bug-hunt-report.json` | Ocorrências, contexto e replays |
| `tools/bot/runs/bug-hunter-corpus.json` | Memória de cobertura e regressão |

As ferramentas não formam rede neural, não alteram as regras nem o balanceamento automaticamente, não executam CI/CD e não garantem ausência de bugs. Promova políticas somente após os testes locais e revisão do diff.
