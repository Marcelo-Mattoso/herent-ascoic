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
