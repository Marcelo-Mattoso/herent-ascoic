# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Comandos

```bash
npm run dev          # Vite dev server em localhost:5173
npm run build        # tsc -b + Vite → dist/
npm test             # Vitest (one-shot, todos os testes)
npm run test:ui      # Vitest com UI interativa no browser
npm run lint         # Biome check --write (lint + format)
npm run format       # Biome format --write
npm run script <f>   # vite-node em tools/dev-scripts/<f> (acesso ao core via @/)
```

Para rodar um único arquivo de teste: `npx vitest run src/core/reducer/reducer.test.ts`

## Arquitetura

### Estrutura

Single-package TypeScript/React app (Vite 8, React 19, Tailwind v4, @ngneat/elf, Biome 2, Vitest 4). Três domínios lógicos em `src/`:

- **`core/`** — engine pura (sem React, sem DOM). Fonte de verdade para toda lógica de jogo.
- **`data/`** — catálogos estáticos: `cards.yaml`, `skills.yaml`, locale pt-BR, `transitions.json`, `event_rules.json`.
- **`ui/`** — componentes React + store Elf. Consome apenas projeções do core.

### Fluxo de dispatch (síncrono)

```
UI dispatch(action)
  → reducer/index.ts (roteamento por domínio)
    → handler valida + fireOnUseSkill
      → skill avalia DSL ou executa script → empilha EffectDescriptors
    → drainStack() materializa efeitos
    → applyAndValidate() checa transitions.json
  → novo GameState → Elf store → UI re-renderiza via PlayerView
```

### Core — módulos principais

| Módulo | Papel |
|--------|-------|
| `adapter/` | `EngineAdapter` + `createInProcessAdapter` (coordena reducer + skills) |
| `reducer/` | Handlers por domínio: `setup`, `exploration`, `combat`, `boss`, `reward`, `progression` |
| `effects/` | Stack de efeitos (`stack.ts`) + resolver (`resolver.ts`) |
| `skills/` | Catálogo + dispatch por trigger. DSL v2 preferida (`dsl/`); legacy scripts em `scripts/` |
| `projection/` | `playerView(state) → PlayerView` — contrato estável para a UI |
| `ecs/` | ECS em adoção gradual; dual-write com CombatState durante transição |
| `events/` | Event bus síncrono com ordem FIFO/LIFO definida em `event_rules.json` |
| `rules/` | Funções puras: dados, dano, escudo, máquina de estados |
| `state/` | Tipos imutáveis: `GameState`, `HeroState`, `EnemyState`, `GameStatus` |

### UI — store

- **`ui/store/elfStore.ts`** — único ponto de uso direto do Elf. Expõe `gameElfStore`.
- **`ui/store/gameStore.ts`** — API pública: `useGameStore(selector)`, `dispatch(action)`, `reset()`. Redux DevTools conectado automaticamente.
- Componentes leem apenas via `PlayerView` (`s.view.*`), nunca `GameState` direto.

### Especificação e motivações

`docs/spec/` (versões v1, v2, v3) contém as especificações brutas do projeto: casos de uso, user stories e motivações de design. Consultar sempre que precisar entender o **porquê** de uma feature antes de implementar.

### Dados (src/data/)

`cards.yaml` e `skills.yaml` são os catálogos principais. Todo `skillId` referenciado em `cards.yaml` deve existir em `skills.yaml` — validado em boot e testado em `skills.test.ts`. Locale PT-BR em arquivos separados (`*.locale.pt-BR.yaml`).

### Testes principais

| Arquivo | Cobre |
|---------|-------|
| `core/reducer/reducer.test.ts` | Loops completos de jogo |
| `core/skills/__tests__/` | Skills individuais |
| `core/skills/dsl/__tests__/` | Schema DSL + testes por kind |
| `core/data/skills.test.ts` | Validação do catálogo |
| `core/replay/replayEngine.test.ts` | Determinismo |
| `core/ecs/__tests__/` | ECS world, modifiers, durations |

---

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

### Comentários
- Não adicionar comentários por padrão. Comentar apenas quando o **porquê** não é óbvio: restrição oculta, invariante sutil, workaround para bug específico, comportamento surpreendente.
- Nunca comentar o que o código já diz. Nomes bem escolhidos dispensam comentários explicativos.

### Arquitetura
- **Core é a fonte da verdade.** UI consome regras do core; nunca duplicar lógica de jogo na UI.
- **Preferir primitivas DSL a scripts.** Efeito repetido vira `kind` DSL no core, ativado por YAML/JSON; script só para lógica única.
