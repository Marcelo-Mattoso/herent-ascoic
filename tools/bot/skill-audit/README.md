# Auditoria de habilidades — fase inicial

Esta ferramenta é **independente** do bot de balanceamento em `tools/bot`.

## Execução local

```bash
npx vite-node tools/bot/skill-audit/run.ts
npx vitest run tools/bot/skill-audit/
```

A execução do primeiro comando gera `reports/skill-audit/report.json` e
`reports/skill-audit/report.html` (fora de `public/` e `dist/`).

## Cobertura e limites atuais

- Descoberta dinâmica dos `AbilityGrant` de todas as cartas de expansões habilitadas, incluindo skills legadas adaptadas.
- Inventário de fonte, expansão, tipo, gatilho, custo de ação, limite e implementação do efeito.
- Verificações de referência de efeito, existência de emissores e consistência básica de limites.
- Testes de descoberta e cenários de inicialização/projeção para grupos de 1–4 heróis pelo reducer real.
- Matriz de grupos **candidatos**, ainda sem verificação de efeitos em combate.

**Importante:** testes estruturais não comprovam execução. Todos os grants começam com
`runtimeStatus: NOT_COVERED`. Os campos `runtimePass` e `runtimeFail` são zero até que
cenários de efeito determinísticos sejam instrumentados. Nenhum caso é marcado `PASS`
apenas porque uma ação foi aceita.

## Ainda não implementado

- Driver de combate com dados controlados e asserções de efeitos antes/depois.
- Verificação do consumo de ação, cooldown e recuperação após rodada/sala/partida.
- Interações entre habilidades simultâneas em grupos.
- Associação de resultados da suíte aos respectivos grants e reprodução por seed.
- Correção dos eventuais bugs encontrados.

Não foram alterados arquivos de balanceamento, catálogos nem o motor nesta fase.
Não executar nem monitorar CI/CD automaticamente.

## Cenários determinísticos (P0 de leveling)

A auditoria também executa três cenários controlados sobre o reducer de produção:
`skill_crimson_fury` (preparo e custo de vida), `skill_prey_mark` (alvo e bônus)
e `witch_skill_lunar_spark` (interrupção pós-rolagem). Cada resultado é
`PASS` ou `FAIL` **do cenário específico**. Grants com cenário passando
recebem `runtimeStatus: PARTIAL`, nunca `PASS` integral. As demais
habilidades continuam `NOT_COVERED`. Falhas são reportadas sem esconder o
inventário e sem modificar o jogo. Novos cenários devem ser adicionados
gradualmente, com asserções de estado antes/depois.

O JSON e o HTML mostram a proveniência do commit, quando disponível.

## Cobertura de grupos no próprio audit (P0)

O `bot:skills-audit` agora roda cenários de projeção para os 12 heróis em
composições rotativas de 1–4 jogadores (12 × 4 = 48 grupos) e exercícios
combinados de Marca da Presa + Fúria em grupos de 2, 3 e 4. Cenário aprovado
do grupo recebe `PARTIAL` (ainda não cobre todas as combinações).
Também registra ativação de sete poderes existentes, sem atribuir PASS aos
efeitos posteriores sem asserção. O resultado entra no JSON e no HTML.

## Gate do audit: evita perder tempo em 6.000 simulações

O `npm run audit` mantém os dois comandos originais, na mesma ordem.
`bot:skills-audit` sempre grava JSON/HTML; se detectar falha estrutural,
cenário funcional ou grupo, termina com código 1 e **não** dispara a etapa
`bot:leveling-report`. `PARTIAL`/`NOT_COVERED` permanecem visíveis, mas
não são tratados como bugs confirmados. O comando continua apenas local.

## Correção de inicialização do CLI (P0)

`npm run bot:skills-audit` executa `npx vite-node tools/bot/skill-audit/run.ts`.
A auditoria agora usa o mesmo critério CLI dos demais bots
(`process.env.VITEST === undefined`), pois `vite-node` não garante
que `process.argv[1]` termine com `run.ts`. Antes o comando podia sair
sem executar nada, inclusive permitindo que `npm run audit` seguisse direto
para as 6.000 partidas. Na execução manual, o terminal deve mostrar
`Iniciando auditoria de habilidades (P0)...` e depois os **caminhos
absolutos** de `report.json` e `report.html`.

## Seleção de alvo — correção dos falsos positivos do P0

O cenário `hunter-prey-mark` verifica **duas regras diferentes** do motor:
com apenas um inimigo a Marca da Presa deve marcar automaticamente, sem
modal; com dois inimigos deve abrir seleção explícita, preservar o ataque
e aplicar o bônus +1 apenas ao alvo marcado. Os três cenários cooperativos
usam dois inimigos para verificar a seleção real nos grupos de 2, 3 e 4.
O teste anterior exigia modal com um único inimigo e gerava quatro falsos
bloqueadores no `npm run audit`.

## Pacote P0 — ampliação funcional dos 12 heróis

Arquivo: `tools/bot/skill-audit/heroRuntime.ts`. O audit executa **22 novos cenários**
com reducer real, somados aos 10 anteriores. Cada cenário é registrado na mesma
lista `runtimeScenarios` do JSON, sem criar outro formato de relatório. Eles
alcançam as 15 concessões de heróis ainda `NOT_COVERED` e aprofundam a verificação
dos sete poderes anteriormente testados apenas quanto à ativação.

Validação direta: vida e cura, remoção de veneno, modificadores ECS,
custo de ação, recuperação de cartas, aquisição/gasto de Eco, efeito de passiva
condicional, escolha de poder e alteração de resultados de dado. Cenários
marcados **preparation** verificam somente o preparo da reação e a preservação
da ação, não o efeito posterior ao evento (Bastião, Carvalho e preservação do
descarte). Por isso todos seguem com status `PARTIAL`, mesmo quando passam.
Cada falha tem mensagem própria e bloqueia `npm run audit`.

Não altera atributos, balanceamento ou conteúdo das cartas. Execute
`npm run bot:skills-audit` para revisar os 32 cenários antes de iniciar
as simulações longas; o relatório inclui os bloqueadores e a proveniência.
