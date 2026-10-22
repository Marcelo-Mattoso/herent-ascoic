# Auditoria da Alpha Web para playtest

Data: 22/10/2026. Escopo: checkout local `codex/regras-funcionalidades-pendentes`, sem publicação remota.

## 1. Estado atual e arquitetura

- Aplicação estática React 19, TypeScript 6 e Vite 8, com npm e `package-lock.json`. Não há backend, autenticação ou rotas client-side. GitHub Pages é compatível.
- `src/core/` mantém `GameState`, reducer síncrono, regras, rolagens, efeitos, gatilhos e projeção `playerView`. `src/ui/` lê a projeção e despacha ações. O estado reativo usa Elf.
- `src/data/cards.yaml` compõe cartas e referências de habilidade por ID; `skills.yaml` e `abilities.yaml` definem comportamento via DSL e alguns scripts; os arquivos `*.locale.pt-BR.yaml` mantêm nome e texto de apresentação. `balance.json`, `event_rules.json` e `transitions.json` completam os dados. Os testes de integridade de catálogos validam referências e esquema.
- O fluxo inicia no menu, passa pela seleção de 1 a 4 heróis, modo e dificuldade, e então cria decks embaralhados com seed. A tela de exploração avança estados mecânicos, oferece seleção de herói/alvo, dados, combate, recompensas, inventário, XP, caminhos e chefe. Há telas de vitória e derrota.
- O projeto contém testes Vitest de regras, dados, reducers e UI, além de testes Playwright do início da partida. O workflow já executava lint, testes, cobertura, build e Playwright, mas não publicava no Pages.

## 2. Funcionalidades completas ou cobertas por testes

- Início de partida com validação de heróis, dificuldade e modos cooperativo/competitivo.
- Salas, criaturas, combate por dados e modificadores, habilidades e poderes via referências de dados, itens, recompensas, XP, caminhos e combate com chefe.
- Resolução de escolhas e interrupções via reducer/DSL, com modais de alvo, recompensa, inventário e eventos.
- Estados terminais de vitória e derrota; replay determinístico e log de ações para desenvolvimento.
- Catálogos carregam com referências válidas; a suíte existente cobre fluxos de reducer, efeitos e alguns casos de ponta a ponta do motor.

Esta classificação confirma a presença e cobertura dos fluxos; não substitui partidas humanas completas com todos os pares de herói, sala e carta.

## 3. Funcionalidades incompletas e riscos restantes

| Prioridade | Situação | Efeito no playtest | Encaminhamento |
|---|---|---|---|
| P1 | `FEATURE_FLAGS.enableSave` está `false`. A porta de snapshot/log existe, mas a partida não persiste após atualização ou fechamento da aba. | O jogador perde a sessão. | Aviso na preparação da partida; testar e habilitar persistência numa entrega posterior. |
| P1 | A interface de partida exige orientação horizontal em telas em retrato. | Uso em celular fica limitado; o manual continua acessível. | Testar em aparelhos dos participantes e melhorar layout vertical depois da alpha. |
| P1 | O relatório de cobertura de habilidades registra 7 casos `no-effect` em cenários sintéticos (`skill_rift_evasion`, `skill_cowardly_flee`, `skill_opportunity_shot`, `skill_minor_rune`, `boss_skill_dark_forge_pressure`, `dungeon_skill_subboss_room`, `dungeon_skill_empty_room`). | Não comprova execução visível dessas habilidades em toda condição real. | Validar em partidas direcionadas; não alterar regras sem reproduzir defeito. |
| P2 | `enableSubBosses` está desligado. | Conteúdo de subchefes do manual não entra na alpha. | Definir escopo com o autor e testar antes de habilitar. |
| P2 | O bundle JS supera o aviso de 500 kB do Vite. | Download inicial pode ser lento em rede fraca. | Separar chunks após medir tempo real em dispositivos de teste. |

## 4. Bugs identificados e correções aplicadas

| Prioridade | Problema encontrado | Correção |
|---|---|---|
| P0 | O build TypeScript falhava por uma chamada a `setItemReadiness` inexistente e por protótipos sem integração (`HeroTray` e `OpportunityWindow`). A suíte continha testes desses protótipos que já não correspondiam aos tipos de inventário atuais. | Removidos os protótipos sem uso e a chamada obsoleta; o limite de uso de grants continua sob `ActivationTracker`, conforme propriedades da carta. |
| P0 | Manifestos e imagens públicos tinham URLs que começavam em `/generated/`; no Pages, isso apontaria para a raiz do domínio, fora do repositório. | URLs resolvidas com `import.meta.env.BASE_URL` ao carregar os manifestos; build do Pages usa `/herent-ascoic/`. Verificador checa todos os arquivos referenciados. |
| P1 | O teste de Saque Místico falhava quando o item ainda estava na mesa de recompensas. Além disso, seu consumo dependia de ID fixo no código. | O consumo `remove` passou a ser propriedade dos grants das três cartas com Saque Místico; o motor remove a recompensa pendente ou o item possuído e executa a habilidade pelo ID. |
| P1 | O menu trazia botões desativados e versão de desenvolvimento, sem acesso ao manual; replay e objetos de depuração eram expostos em produção. | Menu reduzido a **JOGAR**; manual acessível em todo o fluxo; replay, Redux DevTools e `window.__dispatch`/`__elfStore` limitados ao modo dev. |

## 5. Manual e divergências de regra

O PDF publicado é cópia byte a byte de `docs/spec/v2/Ascensão Heróica - ajustado com FAQ-v2.pdf` (25 páginas, SHA-256 `D36D214D83F2A79876CF2F08342983C952FE7F71E867A20607A812D87B0A0963`). A mensagem desta tarefa não trouxe outro PDF anexado. Confirmar com o autor se esta é a versão oficial pretendida antes de divulgar o link.

Diferenças verificadas, **sem alteração automática das regras para corresponder ao PDF**:

| Manual v2 | Implementação web | Prioridade |
|---|---|---|
| Preparação permite 1 a 8 heróis (p. 2). | `MAX_HEROES = 4` em `src/core/state/gameState.ts` e interface de preparação. | P1: limitar o grupo no convite do playtest. |
| Descreve encontros e recompensas de subchefes (pp. 4 e 11). | `enableSubBosses: false` em `src/core/config/defaults.ts`. | P2: conteúdo fora da alpha atual. |
| Itens na mochila não são ativos e não podem ser usados, salvo texto de carta (p. 7). | O motor permite ativar itens guardados durante `REWARD_PHASE`, como janela de organização. | P1: confirmar interpretação com o autor antes de mudar a regra. |

## 6. Verificação e publicação

Resultado local após as correções: lint passou; Vitest e limiares de cobertura passaram (75,39% das instruções, 65,32% dos ramos, 83,15% das funções, 79,11% das linhas); os 3 testes Playwright passaram. O build com `PAGES_BASE_PATH=/herent-ascoic/` e `verify:build` passaram. No preview de produção, o fluxo **JOGAR → selecionar herói → iniciar partida** abriu o tabuleiro, o PDF respondeu HTTP 200, não houve respostas 404 e `window.__dispatch` não ficou exposto.

Antes de integrar em `main`, rodar `npm ci`, `npm run lint`, `npm test`, `npm run test:coverage`, `npm run build`, `npm run verify:build` e `npm run test:e2e`. O workflow realiza essas etapas em CI e publica somente após sucesso em push para `main`. É preciso escolher **GitHub Actions** como fonte do Pages nas configurações do repositório.

Checklist humano recomendado: iniciar com 1 e 4 heróis; revelar uma sala; concluir combate com ataque e item; passar por recompensa, XP e caminhos; verificar vitória/derrota; testar teclado, tela pequena horizontal e PDF em nova aba/baixado. Anotar carta, estado, ação e log ao relatar travamentos. A sessão não é salva.

## 7. Melhorias futuras

- Persistência e retomada confiável da partida, com migração de versão de estado.
- Suporte vertical e ajustes de escala para celulares menores.
- Partidas dirigidas por catálogo para os sete casos `no-effect` e matriz de todos os tipos de recompensa e alvo.
- Confirmar alinhamento do manual com o limite de heróis, itens guardados e subchefes.
- Medir carregamento em rede móvel antes de dividir o bundle.
