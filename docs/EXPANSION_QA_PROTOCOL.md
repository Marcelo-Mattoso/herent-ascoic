# Protocolo de abertura e fechamento de expansões

O protocolo executa três auditorias **separadas** em sequência e preserva os relatórios
para comparação antes/depois. Não executa GitHub Actions, nem participa do build.

## Comandos

Auditorias independentes, quando necessário:

```bash
npm run bot:skills-audit
npm run bot:catalog-report
npm run bot:leveling-report
```

Abrir o pacote da Bruxa (linha de base completa):

```bash
npm run bot:expansion-audit -- --phase opening --expansion torre-grande-bruxa-caldeirao
```

Fechar o pacote (mesma matriz e mesmas seeds, para comparação):

```bash
npm run bot:expansion-audit -- --phase closing --expansion torre-grande-bruxa-caldeirao
```

Pré-visualizar quantas partidas seriam necessárias sem executar:

```bash
npm run bot:expansion-audit -- --phase opening --expansion torre-grande-bruxa-caldeirao --dry-run
```

Os parâmetros opcionais `--runs N --seed N --max-steps N` são repassados ao leveling.
Use os **mesmos valores na abertura e no fechamento**. O valor padrão de
`--runs` é 10; com 12 heróis, duas expansões, cinco perfis e cinco dificuldades
isso significa **3.000 partidas** em cada fase. Para um ensaio rápido, especifique
`--runs 1` em ambas as fases (300 partidas com o catálogo atual).
`--runs` não filtra heróis, dificuldades, perfis nem expansões.

## Artefatos locais

Os arquivos ficam em `tools/bot/runs/`, ignorados pelo Git:

- `expansion-<id>-opening-skills/report.json` e `report.html`
- `expansion-<id>-opening-catalog/report.json`
- `expansion-<id>-opening-leveling/report.json`
- `expansion-<id>-opening-manifest.json`

O fechamento usa `closing` nos mesmos nomes; a comparação consolida
resultados em `expansion-<id>-comparison.json`. Nenhuma fase sobrescreve os
artefatos existentes. Um erro interrompe o processo com código diferente de zero.
Se o relatório de leveling for interrompido, seu checkpoint pode ser retomado
**manualmente** com `npm run bot:leveling-report -- --output <pasta-leveling> --resume`
e os mesmos parâmetros `--runs`, `--seed` e `--max-steps`.

O visualizador local em `http://localhost:5173/leveling-report` permite consultar
os relatórios de leveling e catálogo; abra com `npm run dev`. O inventário de
habilidades tem HTML próprio. Para compartilhar o resultado numa conversa
específica de abertura/fechamento, anexe os manifestos e relatórios JSON
da fase correspondente.

## Critérios de avaliação

**Abertura:** registrar as regras/catalogação atuais, inconsistências estruturais,
métricas de evolução, XP, ações do bot, índices e partidas reproduzíveis.

**Fechamento:** repetir os mesmos parâmetros, comparar mudanças de resultado,
investigar regressões e lacunas de cobertura, registrar pendências antes de liberar.

Limitações fundamentais:

- O bot de skills atual verifica inventário e metadados, **não** comprova execução
  completa de efeitos: `NOT_COVERED` não é `PASS`.
- O leveling contempla heróis solo, todos os perfis, dificuldades e expansões
  habilitadas. Não demonstra sinergia funcional de grupos 2–4.
- A comparação agregada não substitui inspeção por herói, dificuldade, expansão
  e perfil. O arquivo de comparação identifica divergência de parâmetros, mas
  não conclui que a expansão está aprovada.
- Nenhuma dessas auditorias modifica atributos ou faz rebalanceamento automático.
