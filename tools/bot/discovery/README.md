# O Desbravador — P1 / descoberta cooperativa experimental

O Desbravador lê efeitos declarativos, observa **execuções reais registradas no motor**,
aprende padrões temporais de 2 ou 3 sinais e compara o uso desses padrões em
partidas A/B com as mesmas seeds e contextos. A validação ocorre em seeds
reservadas (`seed + 200000`), fora do conjunto usado para formular hipóteses.

## Comandos locais

```bash
npm run bot:discover -- --dry-run
npm run bot:discover -- --runs 2 --validate-runs 12
npm run bot:discover -- --party-size 2 --max-parties 8 --runs 2 --validate-runs 12
npm run bot:discover -- --party-size 3 --max-parties 8 --runs 2 --validate-runs 12
npm run bot:discover -- --party-size 4 --max-parties 8 --runs 2 --validate-runs 12
```

O relatório inclui um `catalogFingerprint` das regras e cartas atualmente
habilitadas. Quando cartas, habilidades ou expansões mudam, o bot deixa
de usar estratégias associadas ao catálogo antigo; elas aparecem como
hipóteses históricas e são novamente testadas antes da promoção.
A promoção de novo catálogo arquiva a biblioteca anterior em
`historical-knowledge.json` dentro da execução local.

Saídas em `tools/bot/runs/discover-*/`:
`discovery-report.json`, contendo hipóteses, quantidade de partidas,
contextos, discordâncias pareadas e estatística de McNemar;
`validated-knowledge.json`, com apenas regras que passaram pela validação.

Para habilitar a promoção **explicitamente**:

```bash
npm run bot:discover -- --party-size 2 --max-parties 8 --runs 4 --validate-runs 12 --promote
```

A promoção atualiza `src/data/discoveryKnowledge.json` apenas com padrões
validados. Revise o diff e versiona-o em commit separado.

O bônus tático é ajustado exclusivamente em seeds de treino distintas
(`seed + 100000`, opções 40/90/140). Apenas uma variante chega à
validação reservada. As sementes de treino nunca participam da decisão final.

Critérios de validação: no mínimo 40 pares A/B e dois contextos,
pelo menos quatro vitórias de vantagem, estatística conservadora de McNemar
(qui-quadrado corrigido >= 6,64) e nenhuma violação adicional. Esses
critérios são sinais de robustez, **não** garantias de generalização universal.

A execução experimental usa apenas Muito Fácil, Fácil e Normal; o benchmark
oficial continua medindo todos os heróis, cinco perfis, cinco dificuldades
e todas as expansões via `npm run audit`. O modo `random` permanece controle.

## Limites conhecidos

- Seleção cooperativa cobre um número configurável de composições com
  diversidade de efeitos DSL, não todas as combinações.
- Um efeito declarado como ramo condicional pode não ter realmente produzido
  alteração, mesmo quando a habilidade foi executada. O auditor mantém
  responsabilidade de demonstrar valor, alvo, duração, limites e custo.
- Ações que apenas preparam habilidades não alimentam o aprendizado.
- Scripts opacos sem um efeito declarativo equivalente não são automaticamente
  interpretados como combos.
- Biblioteca cooperativa é sensível ao tamanho da equipe; aprendizado de um
  grupo não entra automaticamente no bot solo.
- Não há rede neural, autoalteração de balanceamento, treinamento no CI,
  nem implementação completa de planejamento multiagente.

## Gate incremental P0

A auditoria tem um baseline versionado de 311 grants em
`tools/bot/skill-audit/coverageBaseline.json`. Concessões já existentes
mantêm suas lacunas visíveis, mas um grant **novo** que continuar
`NOT_COVERED` bloqueia `npm run audit` até receber um cenário de execução
parcial ou completo. Não atualize o baseline para ocultar novas lacunas;
resolva o cenário e mantenha a trilha de evidências.
