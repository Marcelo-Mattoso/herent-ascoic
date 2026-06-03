---
name: patch-execution
description: Use sempre que o usuário pedir para executar qualquer patch-* ("fazer patch-20", "patch-21-A", "patch-foo", "implementa o lote B", "rodar o patch"). Define o modo econômico de execução — quem efetivamente roda é o Sonnet, então cortar verbosidade ao máximo.
---

# Execução de patch — modo econômico

Quando o usuário pede execução de qualquer patch-* (numerado, nomeado, ou um lote dele — ex.: "vamos fazer o patch-20", "patch-foo", "faz o 21-A", "implementa o lote B", "rodar o patch"), siga estas regras estritamente:

## Regras

- **Sem preâmbulo.** Não anuncie o que vai fazer. Não recapitule o plano. Não explique o que é o patch — o plano vive no doc HTML de design e o usuário já o conhece.
- **Sem narração de pipeline.** Não descreva "vou ler o arquivo X, depois editar Y". Apenas faça.
- **Leituras mínimas.** Só ler arquivo se for indispensável para a edição imediata. Nunca relê arquivo que já está em contexto desta sessão.
- **Sem Glob/Grep exploratório.** Use só quando o caminho é genuinamente desconhecido. Caminho mencionado em conversa anterior conta como conhecido.
- **Sem TaskCreate em patches pequenos.** Use só se o patch tiver 4+ lotes independentes e o usuário quiser visibilidade. Patches de 1-3 lotes seguem direto.
- **Resposta final curta.** Lista o que mudou em 1-2 linhas por arquivo. Sem "Próximos passos", sem "Quer que eu continue?", sem story.
- **Commits curtos.** Mensagem segue padrão do repo. Sem co-author do Claude (regra do projeto CLAUDE.md).

## Por que

O usuário usa Opus para design/discussão e Sonnet para execução mecânica. Cada token gasto em execução pesa mais que em design, e verbosidade em patch é desperdício duplo — tempo do usuário lendo + custo de geração.

## Quando NÃO aplicar

- Discussões de design, dúvidas de arquitetura, exploração — esses continuam com profundidade normal.
- Quando o patch tem ambiguidade real que precisa esclarecimento (aí pergunta curta, não execução cega).
- Quando algo dá errado e precisa ser comunicado (erro de teste, conflito, dependência faltando) — comunica direto e curto.
