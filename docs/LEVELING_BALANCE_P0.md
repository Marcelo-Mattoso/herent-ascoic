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
apresentados em `tools/bot/runs/<execucao>/skill-audit.json` e `.html`.

## P0 adicional: gate rápido, coop e IA

- O audit executa 48 composições de 1 a 4 heróis e três cenários de interação
  caçador/bárbaro; combinações não executadas continuam fora da cobertura.
- Mais sete poderes têm cenários de ativação (não de efeito completo).
- O bot passou a respeitar a pontuação de risco da Fúria Rubra ao preparar.
- O comando `npm run audit` interrompe antes das simulações se houver
  `STRUCTURAL`, `RUNTIME`, `GROUP_PROJECTION` ou `GROUP_COMBAT` falhos;
  detalhes ficam no `tools/bot/runs/<execucao>/skill-audit.json`.

## P0: Diagnósticos consolidados no report.json

O relatório de simulações inclui `diagnostics` com identidade contábil de XP,
compras de nível ineficazes, erros/impasses, paridade de resultado entre
Difícil/Pesadelo (mesma seed/herói/expansão/perfil) e contagem por ID de
preparações, usos manuais, ativações de poderes e interrupções aceitas/negadas.
Esses contadores **não** provam a execução de efeitos automáticos; o campo
`warnings` aponta hipóteses para revisão, não diagnóstico causal confirmado.
O painel HTML mostra os alertas agregados.

## Observação das preparações automáticas

O campo `progression.abilityActivity` passa a conter:
`armedById`, `clearedDuringAttackById` e `clearedElsewhereById`.
São transições entre estados aceitos pelo reducer, **não** comprovação de
que o efeito do poder ou habilidade causou dano/cura/bônus.
Se Fúria foi preparada e saiu do estado durante `ROLL_DICE`, isso aparece
mesmo sem modal `APPLY_TRIGGER_INTERRUPT`. Itens/artefatos são excluídos
para não misturar fontes de habilidade.

## CLI silencioso corrigido

`bot:skills-audit` não depende mais de `process.argv[1]` ao rodar pelo
`vite-node`. Antes, esse guard podia evitar toda a execução sem erro.
O comando grava `tools/bot/runs/<execucao>/skill-audit.json` e `report.html` no
working directory de scripts do npm (raiz do projeto), exibe o caminho
absoluto e devolve código 1 se detectar problemas funcionais/estruturais.

## Correção de falsos positivos da Marca da Presa

Os quatro bloqueios da primeira execução de `bot:skills-audit` eram
originados pela fixture com apenas um inimigo: o reducer seleciona esse
alvo automaticamente. O P0 agora testa ambos os caminhos (único alvo
sem modal e múltiplos alvos com modal). Grupos de 2–4 heróis usam dois
inimigos no teste de Marca da Presa + Fúria. Nenhuma regra de combate
ou valor de balanceamento foi modificada por essa correção.

## Ampliação de cenários funcionais dos heróis (P0)

O `heroRuntime.ts` acrescenta 22 cenários ao auditor P0, totalizando 32.
Cobertura parcial da ativação e de efeitos passa a alcançar os 25 grants de
heróis, com testes específicos das 15 concessões anteriormente descobertas
mas sem cenários, e rechecagem mais profunda de sete poderes existentes.
Reações preparadas (Bastião, Carvalho e preservação do descarte) ainda não
têm efeito/cooldown provados no gatilho; status `PARTIAL` é intencional.
Manter auditoria local, sem CI/CD ou simulação longa automática.

## Saída consolidada por execução

O comando `npm run audit` cria `tools/bot/runs/audit-<data-hora>/`. Sempre grava `skill-audit.json` e `skill-audit.html`; se o gate aprovar, inicia o leveling com `--output` na mesma pasta e grava `report.json`, `config.json`, `manifest.json` e `trials.jsonl`. Falhas preservam o diagnóstico de habilidades sem rodar 6.000 partidas. `bot:skills-audit` isolado também salva em `tools/bot/runs` com pasta própria. Relatórios antigos não são movidos.
