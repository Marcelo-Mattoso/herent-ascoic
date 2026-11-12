# Ascensão Heróica

Jogo de cartas cooperativo de exploração de masmorra. **A Fornalha Sombria** é a primeira expansão, não um subtítulo do jogo. Escolha heróis, revele salas, enfrente criaturas, organize espólios e tente derrotar Azhakar. A Alpha Web é estática, sem cadastro ou backend; a partida ainda não é salva ao recarregar.

## Tecnologia

React 19, TypeScript 6, Vite 8, Tailwind CSS 4 e Elf para a interface; Vitest, Playwright e Biome para validação. O motor de regras fica em `src/core/`, os catálogos em `src/data/` e a UI em `src/ui/`.

## Executar e validar

Requisitos: Node.js 24 e npm 10 ou superior.

```bash
npm ci
npm run dev
```

Abra `http://localhost:5173/`. Comandos disponíveis:

| Comando | Resultado |
|---|---|
| `npm run lint` | Lint sem alterar arquivos. |
| `npm test` | Testes Vitest. |
| `npm run test:coverage` | Testes e limiares de cobertura. |
| `npm run build` | TypeScript e build Vite em `dist/`. |
| `npm run verify:build` | Confere HTML, imagens, manifestos e manual no build. |
| `npm run test:e2e` | Fluxos de jogo e matriz responsiva no Chromium; antes, `npx playwright install chromium`. |
| `npm run preview` | Serve o build localmente. |
| `npm run i18n:validate` | Valida catálogos e critérios de publicação de idiomas. |
| `npm run i18n:report` | Mostra cobertura real por idioma e namespace. |

Para simular o subdiretório do Pages em PowerShell:

```powershell
$env:PAGES_BASE_PATH='/herent-ascoic/'
npm run build
npm run verify:build -- --base /herent-ascoic/
npm run preview
Remove-Item Env:PAGES_BASE_PATH
```

## Auditoria e balanceamento (somente local)

| Comando | Resultado |
|---|---|
| `npm run bot:skills-audit` | Auditoria rápida das habilidades; gera JSON/HTML em `reports/skill-audit/`. |
| `npm run bot:catalog-report` | Inventário e pontuação das cartas, sem simular partidas. |
| `npm run bot:leveling-report` | Simulação completa do catálogo habilitado (atualmente 6.000 partidas por padrão). |
| `npm run audit` | Executa auditoria de habilidades e, somente se passar, o relatório de leveling. |

Para o fluxo de testes e opções avançadas, veja [o bot](tools/bot/README.md) e [o auditor de habilidades](tools/bot/skill-audit/README.md). Esses comandos não são executados pelo CI.

## Publicação da Alpha

O repositório de referência é [`Marcelo-Mattoso/herent-ascoic`](https://github.com/Marcelo-Mattoso/herent-ascoic), com branch principal `main`. A URL pública de GitHub Pages depende da configuração ativa em **Settings → Pages**; não presuma o endereço de um proprietário anterior. O manual PDF é publicado junto aos demais assets de `dist/` e pode ser acessado pelo menu **Regras**. Veja também as [regras digitais](docs/GAME_RULES.md).

Os workflows de CI/CD incluem [CI e publicação](.github/workflows/ci.yml), [otimização de imagens](.github/workflows/optimize-webp.yml) e [promoção entre branches](.github/workflows/promote-dev-to-hml.yml). Pull requests executam lint, testes, cobertura, build, conferência dos assets e testes de navegador sem publicar. Um push em `main` publica **somente `dist/`** no ambiente `github-pages` após todos os checks. O build usa `PAGES_BASE_PATH=/herent-ascoic/`; a UI resolve imagens, manifestos e PDF por `import.meta.env.BASE_URL`.

Antes de publicar, o proprietário deve selecionar **Settings → Pages → Build and deployment → Source → GitHub Actions**. A opção “Deploy from a branch” executa o build Jekyll do repositório e causa o erro de Liquid nos estudos antigos. Verifique o endereço mostrado em Settings → Pages, especialmente se houver domínio personalizado.

## Documentação

| Documento | Conteúdo |
|---|---|
| [Arquitetura](docs/ARCHITECTURE.md) | Fluxo de ações, core, UI, dados, DSL, ECS e extensão do jogo. |
| [Regras digitais](docs/GAME_RULES.md) | Decisões do autor e diferenças do manual físico. |
| [Playtest](docs/PLAYTEST.md) | Estado da Alpha, limitações, checklist e feedback. |
| [Localização](docs/LOCALIZATION.md) | Como criar, validar, revisar e publicar um idioma. |
| [Core](src/core/README.md) e [dados](src/data/README.md) | Contratos e convenções dos módulos. |

Os catálogos editoriais `docs/dungeon-1.json` e `docs/habilidades.json` foram preservados como referência. O comportamento executado vem de `src/data/`, e o histórico de propostas e patches permanece recuperável no Git.
