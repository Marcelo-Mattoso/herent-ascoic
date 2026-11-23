# O Desbravador — três perfis e aprendizado orientado

Atualizado na branch `codex/bots-aprendizado-perfis-20261123`, em 23/11/2026.

O jogo possui **Power Player**, **Casual** e **Explorer**. O Speedrunner e o Random não existem mais como perfis independentes. O motor continua decidindo ações legais; os bots classificam escolhas a partir da projeção do estado.

## Responsabilidade de cada perfil

| Perfil | Decisão | Memória |
| --- | --- | --- |
| **Power Player** | Maximizar vitórias; em trajetórias vitoriosas, reduzir passos e desperdícios | `src/data/soloPolicy.json` e `src/data/discoveryKnowledge.json` |
| **Casual** | Heurísticas imperfeitas, com 15% de decisões escolhidas aleatoriamente entre candidatos | Não aprende; sorteio determinístico por seed |
| **Explorer** | Descobrir opções pouco exercitadas, reações, efeitos e bugs | Contagem por sessão; `bug-hunter-corpus.json` no modo de investigação |

O algoritmo de exploração adversarial vive em `tools/bot/exploration.ts` e é compartilhado por `scoreMoves` e `tools/bot/discovery/bugHunter.ts`. O antigo Caçador de Bugs virou o **modo aprofundado do Explorer**, não outro jogador do benchmark.

## Primeiro ensaio do Power Player

```bash
npm run typecheck:tools
npx vitest run tools/bot/profileLearning.test.ts tools/bot/exploration.test.ts tools/bot/discovery/soloTrainer.test.ts tools/bot/discovery/bugHunter.test.ts
npm run bot:train-solo -- --dry-run
npm run bot:train-solo -- --focus all --max-heroes 4 --max-contexts 12 --max-features 6 --runs 2 --validate-runs 8 --epochs 1
```

O `--profile` aceita `power-player` e é opcional. `--focus` aceita `all`, `skills`, `items`, `powers`. O treinador usa somente solo e três dificuldades (Muito Fácil/Fácil/Normal). O benchmark oficial continua com todas as cinco dificuldades. `--seed` rotaciona os heróis; `--hero <id>` testa um herói; `--all-heroes` percorre os habilitados até `--max-contexts` e `--max-features`. Nenhum comando acima modifica a política.

No treino, a função objetivo favorece **vitória** e, dentro de vitórias, menos ações. Se perder, morrer depressa não ganha pontuação. O processo procura pesos por herói/contexto, incluindo decisões de item, habilidade, poder, cura, fase e risco. As características de treino são intercaladas entre heróis para não otimizar só o primeiro da lista.

Relatórios em `tools/bot/runs/solo-train-*/power-player/`:
- `solo-training-report.json`: `learning`, `validation`, `versusCurrentBot`, `validationByHero`, `perHeroSafe`, `verified`;
- `solo-policy-candidate.json`: política proposta, não obrigatoriamente aprovada;
- `item-drop-observations.json`: frequência observada por herói/expansão/dificuldade e intervalo de Wilson de 95%.

No caso de itens, **frequência observada não é chance causal atribuível ao herói**, nem demonstra que item frequente é útil. A qualidade da escolha precisa passar pelo ensaio de vitórias.

## Promover uma política que realmente melhorou

```bash
npm run bot:train-solo -- --focus all --max-heroes 4 --max-contexts 12 --max-features 9 --runs 3 --validate-runs 16 --epochs 2 --promote
```

O `--promote` apenas **autoriza** escrever `src/data/soloPolicy.json`; o treinador exige 40 pares de validação reservada (offset `seed + 200000`), ausência de novas violações e melhora contra **dois controles**: política adaptativa anterior e bot publicado. Basta um dos critérios: pelo menos quatro vitórias adicionais com McNemar corrigido >=6,64; ou redução de passos >=5% entre ao menos oito vitórias compartilhadas, sem perder vitórias. `perHeroSafe` evita piorar claramente qualquer herói.

Os pesos são por `profile:power-player|hero:<cardId>|<característica>`. Arquivos de aprendizado antigos com namespace `speedrunner` não são aplicados ao Power Player automaticamente; não misturar pesos contraditórios. O fingerprint protege contra treinar com catálogo diferente. A política inicial do repositório ainda não tem pesos; esta revisão não rodou treino.

## Explorer investigativo

```bash
npm run bot:explore -- --dry-run
npm run bot:explore -- --runs 3 --max-scenarios 24 --max-steps 750
npm run bot:explore -- --hero hero_crimson_rune_mage --difficulty normal --runs 5
```

`bot:explore` substitui o nome operacional `bot:bug-hunt`, que permanece como alias para compatibilidade com comandos antigos. O executor experimenta ações menos vistas e combinações pouco frequentes, valida invariantes, guarda sequências e seeds de replay e mantém o corpus em `tools/bot/runs/bug-hunter-corpus.json`. Uma mudança no fingerprint invalida a memória de cobertura antiga. `--reset-corpus` força reinício.

Os resultados ficam em `tools/bot/runs/bug-hunt-*/bug-hunt-report.json`. **Suspeitas** (`investigate`) não são defeitos confirmados; violações reproduzíveis (`blocker`) merecem correção. O bot Explorer normal usa memória por sessão; o modo investigativo é que persiste o corpus entre execuções.

## Combos e auditoria

`npm run bot:discover -- --dry-run` exibe o plano de mineração de sequências; `--promote` guarda somente padrões validados em `src/data/discoveryKnowledge.json`. A investigação por equipes 2–4 é experimental e foi adiada. `random` não existe mais como perfil jogável independente.

`npm run audit` continua executando **skills → leveling → investigação curta do Explorer**, sem aumentar `runs = 10` do benchmark. `AUDIT_BUG_HUNT=0` continua desativando apenas a última etapa. O controle de orçamento é por catálogo habilitado: futuras expansões aumentam a quantidade de cenários, e não alteramos a quantidade de seeds neste pacote.

**Não rodar treinos extensos no CI/CD.** Os comandos de treino, cobertura, builds e testes são locais; execute-os e revise os relatórios antes de promover uma política.
