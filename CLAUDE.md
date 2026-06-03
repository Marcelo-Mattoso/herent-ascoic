# CLAUDE.md

## Regras de comportamento

### Persistência de regras
- **Todas as regras, skills e preferências devem ser salvas no projeto**, não em memória user-level.
- Skills vão em `.claude/skills/<nome>/SKILL.md`.
- Regras e preferências gerais vão neste arquivo (`CLAUDE.md`).
- Não criar memórias em `~/.claude/projects/.../memory/` — usar este arquivo ou skills.

### Commits
- **Nunca** inclua `Co-Authored-By: Claude` nem qualquer linha de autoria do Claude nas mensagens de commit.
- Mensagens de commit devem refletir apenas o autor humano do repositório.

### Estilo de resposta
- Responder de forma econômica. Sem preâmbulo, sem recap do que já foi discutido, sem "próximos passos" não solicitados, sem "quer que eu continue?".
- Resposta direta em 1-3 frases quando a pergunta é fechada. Tabela/lista só quando comparação ajuda. Headers só com 3+ seções reais.
- Exceções: explicação de arquitetura quando explicitamente pedida em profundidade, ou erro técnico que precisa contexto. Mesmo aí, cortar tudo que não agrega.

### Patches
- **"Fazer patch-*" significa escrever o documento do patch**, não executar. Criar em `docs/patches/patch-<id>.md` com escopo, lotes, critério de aceite, riscos. Nada de código.
- Execução só quando o usuário pedir explicitamente ("executa", "implementa", "roda o patch") — aí entra o modo econômico do Sonnet ([.claude/skills/patch-execution/SKILL.md](.claude/skills/patch-execution/SKILL.md)).

### Arquitetura
- **Core é a fonte da verdade.** UI consome regras do core; nunca duplicar lógica de jogo na UI.
- **Preferir primitivas DSL a scripts.** Efeito repetido vira `kind` DSL no core, ativado por YAML/JSON; script só para lógica única.
