# Auditoria de habilidades — P0

Verifica a estrutura de habilidades de todas as cartas habilitadas e executa cenários determinísticos pelo reducer real. **Não altera as regras de jogo.**

## Comandos

```bash
npm run bot:skills-audit      # Auditoria rápida, sem simulação longa
npm run audit                 # Auditoria de habilidades; se passar, executa leveling
npm run bot:leveling-report  # Apenas leveling, sem auditoria prévia
```

Ambos os comandos agora usam `tools/bot/runs/` (ignorado pelo Git). `npm run audit` cria **uma pasta por execução com data/hora**, contendo `skill-audit.json` e `skill-audit.html`. Se a auditoria passar, grava na **mesma pasta** `report.json`, `config.json`, `manifest.json` e `trials.jsonl`. Se reprovar, preserva os dois arquivos de auditoria e **não inicia** a simulação longa.

`npm run bot:skills-audit` isolado cria `tools/bot/runs/skill-audit-<data-hora>/`, com apenas os dois arquivos de auditoria. Também aceita `-- --output tools/bot/runs/minha-pasta` para uma pasta específica. Os relatórios possuem nomes diferentes para evitar a sobrescrita de `report.json`.

## Cobertura atual

- Descoberta dinâmica dos grants de todas as cartas e suas fontes, expansões, gatilhos, custos, limites e implementação declarada.
- Verificações estruturais de referências, emissores e limites.
- **32 cenários funcionais de heróis:** dez do pacote inicial e 22 novos em `heroRuntime.ts`, inclusive cura, runas, veneno, Eco, ações, modificadores, escolhas e dados.
- **48 projeções de grupo** de um a quatro heróis e **três combates cooperativos** com Marca da Presa + Fúria (grupos de dois, três e quatro).

## Interpretação correta

Os resultados `PASS` em `runtimeScenarios` indicam apenas que o **cenário específico** passou. O inventário continua marcado `PARTIAL` quando há alguma cobertura e `NOT_COVERED` quando não há cenário. `runtimePass` integral fica em zero enquanto não existir cobertura exaustiva de efeito, custo, cooldown, recuperação e contextos alternativos.

Alguns dos novos cenários comprovam somente **preparação**, não o disparo da reação (Bastião, Carvalho e preservação de descarte). Interações com equipamentos, criaturas, salas e bosses ainda não possuem cobertura funcional geral. Nenhuma ausência de cenário é tratada como aprovação integral.

Arquivos: `catalog.ts` (descoberta e relatório), `runtime.ts` e `heroRuntime.ts` (heróis), `groupRuntime.ts` (grupos), `health.ts` e `run.ts` (bloqueadores e CLI). Para validar os cenários isoladamente: `npx vitest run tools/bot/skill-audit/`.

## Interrupções simultâneas na rolagem

O cenário `hero-green-eclipse-roll` usa duas rolagens determinísticas:
dados com **2** para verificar o Eclipse Verde diretamente, sem elegibilidade
da Centelha da Lua Verde, e dados com **1** para verificar a convivência dos
dois gatilhos. Se a Centelha aparecer primeiro, a auditoria a recusa e
confirma que o Eclipse ainda pode ser oferecido e alterar o dado para 6.
Uma falha no encadeamento continua bloqueando `npm run audit`.

Auditoria e relatórios de leveling são **locais**, sem execução automática no CI/CD. Não rodar nem monitorar CI/CD após commits.
