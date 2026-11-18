# O Desbravador — P1

`npm run bot:discover -- --runs 2 --validate-runs 4`

Descobre sequências de **tipos de efeito** de habilidades e ataques, sem codificar
IDs de heróis. Compara políticas em partidas solo, em seeds de validação
reservadas (`seed + 200000`) e registra evidências locais no diretório
`tools/bot/runs/discover-*/`.

Saídas: `discovery-report.json` e `validated-knowledge.json`.
A promoção é opcional: `npm run bot:discover -- --runs 3 --validate-runs 12 --promote`.
Só promove regras com >=40 pares de partidas, pelo menos quatro vitórias adicionais
e nenhuma violação extra. Após promoção, revisar e versionar
`src/data/discoveryKnowledge.json`; o bot lê exclusivamente esse catálogo.

A descoberta treina nas dificuldades Muito Fácil, Fácil e Normal. O benchmark
principal `npm run audit` permanece separado e inclui as cinco dificuldades,
os cinco perfis, todos os heróis solo e todas as expansões habilitadas.

Esta primeira versão é mineração observacional + experimento A/B. Não é rede
neural, não tem otimização de grupos, não cobre combos de 3+ ações e não
comprova que uma habilidade nova esteja correta; isso é atribuição do auditor.
O treino não usa o planejador legado de combos, para que novos padrões não
dependam de IDs específicos. Não altera cartas, atributos nem regras.
Nunca executa no CI.

**Cobertura P0:** a auditoria automática também exercita grants manuais de heróis quando a fixture genérica permite. Não afirma cobertura integral de efeitos, duração, grupos e exceções. Casos que precisam de estado especial permanecem NOT_COVERED.
