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


## Instrutor Solo (treinamento das decisões, distinto da mineração de combos)

```bash
npm run bot:train-solo -- --dry-run
npm run bot:train-solo -- --focus all --max-heroes 4 --max-contexts 12 --runs 2 --validate-runs 12 --promote
npm run bot:train-solo -- --focus items --max-heroes 4 --max-contexts 12 --runs 2 --validate-runs 12 --promote
npm run bot:train-solo -- --focus powers --max-heroes 4 --max-contexts 12 --runs 2 --validate-runs 12 --promote
npm run bot:train-solo -- --focus skills --max-heroes 4 --max-contexts 12 --runs 2 --validate-runs 12 --promote
```

O Instrutor testa em partidas **SOLO** prioridades aprendíveis sobre itens, poderes, momentos de cura,
efeitos, vida, custo de oportunidade, fases de chefe, saque e preparação. A biblioteca
`src/data/soloPolicy.json` só muda com `--promote` e melhora independente:
>=40 partidas pareadas, >=4 vitórias adicionais, qui-quadrado de McNemar corrigido
>=6,64 e nenhuma violação adicional. Ausência de aprovação significa
que os pesos anteriores permanecem em vigor. O perfil `random` não recebe
pesos e os grupos de heróis não são modificados.

Por padrão, --max-heroes 4 percorre até quatro heróis por sessão. Alterar
`--seed` desloca o conjunto escolhido; `--all-heroes --max-contexts 48`
aumenta a cobertura, mas custa muito mais tempo de simulação.
`--hero hero_crimson_rune_mage` restringe a um único herói.
`--max-features 9` controla quantos contextos (efeito, item, poder, cura,
urgência, carta) são ajustados; `--epochs 1` controla a iteração.

O treinador gera `solo-training-report.json` e `solo-policy-candidate.json`,
com ganhos, oportunidades de item e decisão de validação. Frequência de uso
de item é apenas observação, não classificação causal; preferências precisam
passar pela comparação de vitórias. Partidas de treino e validação usam seeds
separadas (`seed + 200000`). Nenhuma execução em CI, nenhuma modificação
de atributos de cartas. Após promoção, revise e commite `src/data/soloPolicy.json`.

O ajuste contextual usa chaves separadas por decisão (exemplo:
`item@health:critical`, `power@power:boss`, `skill@effect:boost`).
Portanto treinar `--focus items` não altera as prioridades das habilidades.

Na última validação, o Instrutor compara a política candidata com dois
controles: uma política adaptativa sem os novos pesos e o bot atualmente
publicado (incluindo as heurísticas legadas quando ainda ativas). Só há
promoção se superar **ambos**; o campo `versusCurrentBot` registra a prova.

Primeira versão: treinamento e promoção restritos ao perfil
`power-player` em partidas solo. Os demais perfis não consomem esta
política aprendida até terem suas próprias validações; `npm run audit`
continua cobrindo os cinco perfis.

Os pesos promovidos usam namespace por herói (ex.: `hero:<cardId>|item@item:boss`).
Uma sessão com `--max-heroes 4` não altera o comportamento dos outros heróis.
Para treinar toda a coleção, rode sessões em seeds diferentes ou
`--all-heroes` com cobertura maior. O perfil power-player é o único
beneficiário dessa política nesta versão.


## Treinamento de dois perfis + Caçador de Bugs

```bash
# Power Player e Speedrunner, separados e com promoção individual somente após validação
npm run bot:train-solo -- --profile both --focus all --max-heroes 4 --max-contexts 12 --runs 2 --validate-runs 12 --promote
# Treino exclusivo do Speedrunner: busca velocidade e também observa drops
npm run bot:train-solo -- --profile speedrunner --focus items --seed 5 --max-contexts 18 --runs 4 --validate-runs 16 --promote
# Execução independente do caçador de bugs
npm run bot:bug-hunt -- --runs 3 --max-scenarios 24 --max-steps 750
# Somente inventário do plano
npm run bot:bug-hunt -- --dry-run
```

Cada perfil tem pesos isolados com prefixo `profile:power-player|` ou
`profile:speedrunner|` mais o herói. Casual, Explorer e Random não são
alterados. Speedrunner pode promover políticas que vencem com menos ações
quando a taxa de vitória não cai e a melhora supera 5% entre vitórias
pareadas, com ao menos oito vitórias conjuntas, 40 pares e nenhuma
violação adicional. Melhoras de vitória seguem a prova estatística
original. Power Player exige melhora estatística de vitórias.

O relatório do treino fica em `solo-train-*/<perfil>/`.
`item-drop-observations.json` separa herói, expansão e dificuldade,
com incidência de cada item nas retiradas observadas e por partida.
Isso NÃO demonstra que determinado herói altera a probabilidade do
baralho: o percurso da partida e o número de oportunidades influenciam
o resultado. `perDraw` e `perGame` incluem intervalos Wilson de 95%
para a FREQUÊNCIA OBSERVADA. Amostras com menos de 30 retiradas
ficam explicitamente marcadas como insuficientes para ranking.

Em `--profile speedrunner --epochs 3`, uma época sem ganho não
encerra a busca: o treinador tenta novas seeds. A validação final
permanece independente e pode rejeitar todas as mudanças.


O agente `bug-hunter` não é um sexto jogador do benchmark: ele explora
combinações pouco frequentes, repete testes determinísticos e procura
violações do motor, exceções de ações legais e suspeitas de custo de PV
não aplicado. Suspeitas NÃO bloqueiam o audit; violações confirmadas
bloqueiam e trazem replay. Ele é **somente solo** nesta fase.
O `npm run audit` executa uma varredura curta após habilidades e
leveling; `AUDIT_BUG_HUNT=0 npm run audit` a desativa. A execução
`npm run bot:bug-hunt` separada cobre mais cenários e seeds.

O Caçador de Bugs não altera pesos, regras de cartas, atributos ou
bibliotecas aprovadas. Seus objetivos são cobertura e diagnóstico,
**nunca taxa de vitória**.
