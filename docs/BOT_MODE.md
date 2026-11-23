# Bots de playtest — estado atual

> Documento operacional da branch `dev`, revisado em 23/11/2026. O plano original do bot visual foi executado em fases e não deve ser confundido com trabalho ainda pendente. A fonte dos comandos é o `package.json`; veja também [o guia técnico](../tools/bot/README.md).

## Ferramentas disponíveis

| Comando | Papel | Saída |
| --- | --- | --- |
| `npm run bot -- --games N --seed S --max-steps M` | Jogador headless, simulações e invariantes | `tools/bot/runs/` |
| `npm run bot:screen -- --profile power-player --heroes barbarian,cleric,mage --difficulty normal --pause 800` | Bot visual via Chromium e interação com a página | Evidência do percurso na interface |
| `npm run bot:skills-audit` | Inventário, cobertura e contratos das habilidades | `skill-audit.json` e `skill-audit.html` |
| `npm run bot:leveling-report` | Benchmark de heróis/dificuldades/expansões/perfis | `report.json` e checkpoints |
| `npm run bot:discover -- --dry-run` | Desbravador: descoberta experimental de sequências | Plano; treinamento com flags adicionais |
| `npm run bot:train-solo -- --profile both --dry-run` | Instrutor Solo: Power Player e Speedrunner em políticas separadas | Prévia sem partidas |
| `npm run bot:bug-hunt -- --dry-run` | Caçador de Bugs: cobertura adversarial solo | Prévia sem partidas |
| `npm run audit` | Auditoria unificada local | Auditoria de habilidades, leveling e amostragem curta de bugs |

**Os cinco perfis jogáveis** são `casual`, `power-player`, `speedrunner`, `explorer` e `random` (definidos em `tools/bot/profiles.ts`). O **Caçador de Bugs não é sexto perfil jogável**: é um executor independente para descobrir falhas. `random` serve de controle, sem aprendizado; `casual` e `explorer` não consomem a política solo treinada.

## Bot headless e bot visual

O bot headless decide com uma observação projetada em `tools/bot/observe.ts` e usa ações legais do core; o motor continua sendo fonte de verdade. O bot visual pode ser acompanhado por `bot:screen` enquanto o servidor Vite estiver rodando. Portanto, a interface **não está apenas planejada**, ao contrário das primeiras versões deste documento.

Invariantes do headless incluem serialização, estados ECS, vida, zonas, duplicação de cartas, progresso e limites de execução. Replays e diagnósticos devem preservar a seed e o contexto; uma partida sintética não equivale a comprovação visual de todo fluxo.

## Perfis que aprendem

O [Instrutor Solo](../tools/bot/discovery/README.md) ensaia pesos interpretáveis por **perfil + herói + contexto da ação**, sem alterar habilidades, regras ou atributos. O foco pode ser `all`, `skills`, `items` ou `powers`.

- **Power Player:** prioriza melhora de taxa de vitória com validação pareada fora das seeds de treinamento. Pode encerrar épocas quando não encontra ganho.
- **Speedrunner:** além de vitórias, busca menos ações **nas partidas vencidas**; pode continuar por outras seeds em novas épocas mesmo sem ganho anterior. Não considera morrer mais depressa uma melhora.
- **Casual, Explorer e Random:** não participam desse treino. O benchmark de leveling continua incluindo os cinco perfis.

```bash
npm run bot:train-solo -- --profile both --focus all --max-heroes 4 --max-contexts 12 --runs 2 --validate-runs 12 --promote
npm run bot:train-solo -- --profile speedrunner --focus items --max-heroes 8 --max-contexts 24 --runs 3 --validate-runs 16 --epochs 3 --promote
```

O `--promote` autoriza gravar `src/data/soloPolicy.json` **somente se** a política candidata superar os controles A/B de validação. Relatórios individuais ficam em `tools/bot/runs/solo-train-*/power-player/` e `.../speedrunner/`. O `item-drop-observations.json` registra **frequência observada** por herói/expansão/dificuldade, com intervalos Wilson de 95%; não prova causalidade entre personagem e chance de drop.

## Caçador de Bugs

O executor `tools/bot/discovery/bugHunter.ts` usa escolhas adversariais entre ações disponíveis, priorizando ações pouco exercitadas e combinações não habituais. Ele registra casos reproduzíveis, violações, rejeições e suspeitas de custo de PV; não maximiza vitórias e não publica políticas de jogo.

```bash
npm run bot:bug-hunt -- --runs 3 --max-scenarios 24 --max-steps 750
npm run bot:bug-hunt -- --dry-run
```

A cobertura e seeds anteriores ficam no corpus local `tools/bot/runs/bug-hunter-corpus.json`. Replays guardam a sequência de ações. `--reset-corpus` reinicia essa memória. **Suspeitas não equivalem a bugs confirmados**; relatórios distinguem `investigate` de `blocker`.

## Fluxo do audit

`scripts/run-audit.mjs` chama, nessa ordem: `bot:skills-audit`, `bot:leveling-report` e `bot:bug-hunt --max-scenarios 6 --runs 1 --max-steps 500`, prosseguindo somente quando cada etapa anterior retorna sucesso. Para executar apenas habilidades + leveling, configure `AUDIT_BUG_HUNT=0` no ambiente.

```bash
npm run audit
# PowerShell, desativar apenas a etapa curta de caça a bugs:
$env:AUDIT_BUG_HUNT='0'; npm run audit; Remove-Item Env:AUDIT_BUG_HUNT
```

A execução longa **não deve ser adicionada ao CI**. Não monitore CI/CD, deploy ou publicação após commits; o responsável roda os comandos de validação localmente.

## Limitações e próximos passos

- A estratégia aprendida é de **jogo solo**; não há aprovação do treinamento de equipes nesta etapa.
- O Speedrunner observa ocorrência de itens nas trajetórias jogadas; a amostragem depende das oportunidades realmente encontradas. Não inferir distribuição probabilística universal a partir de poucas partidas.
- O Caçador de Bugs ainda testa solo; priorizar futuramente cobertura combinatória entre heróis, habilidades, itens e condições, com oráculos específicos por efeito.
- Simulações de vitória, observações do executor e contratos de habilidades são evidências complementares: nenhum deles isoladamente prova ausência de bugs.
