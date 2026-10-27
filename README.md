# Ascensão Heróica — A Fornalha Sombria

Jogo de cartas cooperativo de exploração de masmorra. Escolha heróis, revele salas, enfrente criaturas, organize espólios e tente derrotar Azhakar. A Alpha Web é estática, sem cadastro ou backend; a partida ainda não é salva ao recarregar.

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

## Publicação da Alpha

O remote `origin` atual é [`println/herent-ascoic`](https://github.com/println/herent-ascoic), com branch principal `main`. A URL esperada do GitHub Pages é [println.github.io/herent-ascoic/](https://println.github.io/herent-ascoic/). O [link esperado do manual](https://println.github.io/herent-ascoic/rules/ascensao-heroica-manual.pdf) também fica acessível pelo menu discreto **Regras**. A versão do PDF ainda precisa de confirmação do autor; veja [regras digitais](docs/GAME_RULES.md).

O único workflow de CI/CD é [`.github/workflows/ci.yml`](.github/workflows/ci.yml). Pull requests executam lint, testes, cobertura, build, conferência dos assets e testes de navegador sem publicar. Um push em `main` publica **somente `dist/`** no ambiente `github-pages` após todos os checks. O build usa `PAGES_BASE_PATH=/herent-ascoic/`; a UI resolve imagens, manifestos e PDF por `import.meta.env.BASE_URL`.

Antes de publicar, o proprietário deve selecionar **Settings → Pages → Build and deployment → Source → GitHub Actions**. A opção “Deploy from a branch” executa o build Jekyll do repositório e causa o erro de Liquid nos estudos antigos. Verifique que o endereço mostrado em Settings → Pages coincide com a URL acima, especialmente se houver domínio personalizado. Não foi feito push nem alteração remota nesta tarefa.

## Documentação

| Documento | Conteúdo |
|---|---|
| [Arquitetura](docs/ARCHITECTURE.md) | Fluxo de ações, core, UI, dados, DSL, ECS e extensão do jogo. |
| [Regras digitais](docs/GAME_RULES.md) | Decisões do autor e diferenças do manual físico. |
| [Playtest](docs/PLAYTEST.md) | Estado da Alpha, limitações, checklist e feedback. |
| [Localização](docs/LOCALIZATION.md) | Como criar, validar, revisar e publicar um idioma. |
| [Core](src/core/README.md) e [dados](src/data/README.md) | Contratos e convenções dos módulos. |

Os catálogos editoriais `docs/dungeon-1.json` e `docs/habilidades.json` foram preservados como referência. O comportamento executado vem de `src/data/`, e o histórico de propostas e patches permanece recuperável no Git.
