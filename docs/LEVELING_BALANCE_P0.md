# Leveling — P0: proveniência e telemetria de habilidades

Escopo: somente ferramentas de auditoria e simulação; nenhum atributo de personagem, regra, XP ou dificuldade foi alterado.

## O que é medido

- `progression.abilityActivity.preparationsById`: ações de preparação aceitas pelo motor.
- `manualActionsById`: ações manuais aceitas pelo motor; não prova aplicação do efeito.
- `triggersAcceptedById`: interrupções aceitas pelo bot.
- `triggersSkippedById`: interrupções recusadas pelo bot.
- `skillUses` e `powerUses`: indicadores legados, preservados por compatibilidade. Não interpretar uma preparação como disparo.
- `provenance`: commit, branch, estado de limpeza da árvore Git e hash SHA-256 do catálogo. O relatório deixa claro que o ensaio padrão é **solo**, não cooperativo.

O relatório nunca deve afirmar que um efeito funcionou só porque a ação foi aceita. A auditoria estrutural de skills continua distinguindo cobertura real de cobertura ausente.

## Como executar localmente

```bash
npm run audit
npm run bot:leveling-report -- --runs 2 --seed 1
```

Para retomar uma execução interrompida, use `--resume --output tools/bot/runs/<diretorio>` no **mesmo commit**, com árvore Git limpa e mesmo catálogo. Checkpoints antigos sem `manifest.json` não são retomados, para evitar misturar versões.

Recomendação de validação: primeiro conferir no JSON a diferença entre `preparationsById` e `triggersAcceptedById` do Bárbaro Rubro; em seguida revisar as habilidades cujas preparações nunca se convertem em efeitos. Um uso contabilizado no relatório ainda requer cenário determinístico para comprovar o efeito real.

**Não executar CI/CD ou monitorar deploy automaticamente.** A auditoria e os relatórios são locais.

## Primeiros cenários executáveis

O `bot:skills-audit` agora registra resultados determinísticos para
`skill_crimson_fury`, `skill_prey_mark` e `witch_skill_lunar_spark`.
Um cenário bem-sucedido produz status `PARTIAL`, não `PASS` integral.
Nenhuma habilidade sem cenário é considerada coberta. Os resultados são
apresentados em `reports/skill-audit/report.json` e `.html`.
