# Playtest da Alpha Web

Estado local em 26/10/2026. O [site público](https://marcelo-mattoso.github.io/herent-ascoic/) e o PDF responderam HTTP 200 na verificação anterior; as mudanças desta branch ainda não foram publicadas. O workflow publica a partir de `main` após os checks.

## O que testar

A Alpha abre sem cadastro. Escolha **JOGAR**, selecione de 1 a 4 heróis, modo e dificuldade e inicie a expedição. Revele salas, enfrente criaturas, use ataque, habilidades, poderes e itens, organize espólios, gaste XP, abra caminhos e avance até Azhakar. **Regras** abre o manual PDF; há link para baixar. Vitória e derrota têm telas próprias.

**TUTORIAL** abre quatro arquivos independentes. O Arquivo I guia a seleção de heróis, o tabuleiro e a revelação de uma sala. O Arquivo II ensina combate com seleção, arrasto ou toque, dados e dano reais. O Arquivo III ensina inventário e equipamentos. O Arquivo IV ensina a Marca da Presa, o ataque após a habilidade, a preparação e execução da Fúria Rubra, um poder do Guerreiro, o passivo de um encanto e o limite por partida. O Arquivista narra sobre a interface; use os controles destacados e **Continuar** nas observações. No fim, é possível repetir, escolher arquivo ou abrir a preparação de uma partida normal sem recarregar. O registro do treinamento pode ser baixado em JSON com o Diário.

Para relatar um problema, anote carta, herói, sala, ação, resultado esperado e observado e as últimas mensagens do log. O replay determinístico e as ferramentas de console ficam disponíveis apenas no modo de desenvolvimento.

## Limitações e pendências

| Prioridade | Estado | Consequência / próximo teste |
|---|---|---|
| P1 | `enableSave = false`. | Recarregar ou fechar a aba perde a partida; avise os participantes antes de começar. |
| P1 | O tabuleiro agora cabe em retrato e paisagem sem rolagem da arena nos viewports automatizados. | Confirmar legibilidade, safe areas e barras dinâmicas em aparelhos reais antes da publicação. |
| P1 | O harness marcou sete casos `no-effect` em cenários sintéticos: `skill_rift_evasion`, `skill_cowardly_flee`, `skill_opportunity_shot`, `skill_minor_rune`, `boss_skill_dark_forge_pressure`, `dungeon_skill_subboss_room`, `dungeon_skill_empty_room`. | Fazer partidas dirigidas e reproduzir uma falha antes de mudar regras. Não há skill classificada como sem implementação ou erro pelo harness anterior. |
| P1 | O motor de habilidades foi consolidado localmente: uso manual preserva o ataque e reação opcional exige preparação anterior ao evento. | Validar Caçador, Fúria, poderes e itens em aparelhos reais; observar se estado preparado, custo, efeito e diário ficam claros. |
| P1 | Fuga de criatura para `skill_cowardly_flee` ainda não tem transição/emissor próprios. | Testar a carta em uma situação real e definir comportamento com o autor. |
| Resolvido localmente | Uma escolha reativa após dano interrompia a limpeza de entidade ECS. | Testes de aplicação e recusa cobrem dano letal e retomada do ataque. Repetir em uma partida dirigida antes de publicar. |
| P2 | `enableSubBosses = false`. | Conteúdo de subchefes fica fora do escopo atual. |
| P2 | Bundle JS acima do aviso de 500 kB do Vite. | Medir carregamento em rede móvel antes de dividir chunks. |
| P2 | Manual publicado de 25 páginas difere de PDF posterior de 39 páginas fora do repositório. | Confirmar versão oficial e divergências com o autor antes de substituir. |
| P2 | O Arquivo III demonstra um encanto exaurido durante o combate e uma poção consumida no checkpoint anterior. | Em aparelho real, conferir se o jogador distingue os dois registros e compreende quando o limite por combate é renovado. |
| P2 | Em uma sondagem fora do tutorial, preparar `item_safe_path_charm` na recompensa e avançar de sala lançou `[resolveExpr] param "value" não é número`. | Reproduzir esse item em uma partida dirigida e corrigir seu grant em trabalho próprio, sem alterar regras para o tutorial. |
| Futuro | `category` ainda compõe a definição de habilidade; algumas skills sem carta referenciada permanecem no catálogo para expansão. | Preservar esses IDs e contratos; revisar modelagem apenas em refatoração própria. |
| Futuro | Algumas ações de dungeon e descoberta de habilidades tiveram propostas de UI em documentos antigos. | Validar o fluxo atual em partidas antes de abrir trabalho novo; os diagnósticos antigos podem estar superados. |

## Validação automatizada

O CI executa `npm ci`, lint sem alterações, Vitest, cobertura com os limiares de `vite.config.ts`, build para `/herent-ascoic/`, verificação de HTML/assets/manifestos/PDF e Playwright. Os testes de navegador cobrem menu, seleção de herói, entrada no tabuleiro, manual, toque para atacar, recompensa e equipamentos, escolha visual de habilidade e geometria da arena em 12 resoluções com até 4 heróis, até 4 criaturas e chefe. A arena não deve ter overflow nem hitboxes encobertas. Ainda é necessária uma partida humana longa para validar progressão completa e legibilidade em aparelhos reais.

Validação local do sistema de equipamentos: lint e tipos passaram; 694 testes Vitest passaram com `--maxWorkers=2 --testTimeout=15000`; cobertura passou (76,56% instruções, 66,53% ramos, 84,59% funções, 80,29% linhas); build e `verify:build` passaram com base `/herent-ascoic/`; os 3 testes Playwright de início de partida e PDF passaram. Um preview do build compilado iniciou com 4 heróis, abriu o tabuleiro e o PDF, sem erro JavaScript ou resposta HTTP 4xx no percurso. O fluxo completo de vitória ainda precisa de partida dirigida na interface publicada.

Validação local da recuperação de interrupções em 24/10/2026: 718 testes Vitest, 14 testes Playwright, lint, tipos, build e `verify:build` passaram. A cobertura passou com 76,18% de instruções, 66,6% de ramos, 82,61% de funções e 79,55% de linhas. O teste de catálogo encontrou 82 habilidades com efeito observável, 7 `no-effect` contextuais, nenhuma sem implementação e nenhum erro. Ainda falta uma partida humana longa no site publicado; esta verificação não equivale à publicação da branch.

Na branch atual, o catálogo estrutural contém 80 cartas, 89 skills, 93 abilities (incluindo adaptações legadas), 34 itens e 8 heróis. Os cenários dirigidos cobrem Marca da Presa com duas criaturas, Fúria preparada, poção e item reativo, posse de recompensa e disponibilidade dos oito poderes. O harness continua com 82 casos `ok` e 7 `no-effect` contextuais; essa contagem não equivale à validação de comportamento de todas as cartas. O combate normal não abre confirmação para reações opcionais: o jogador prepara antes do evento, e escolhas necessárias dentro de efeitos continuam visíveis.

Validação local desta branch em 26/10/2026: 736 testes Vitest em 79 arquivos passaram, com cobertura de 75,62% das instruções, 65,28% dos ramos, 82,6% das funções e 78,89% das linhas. Os limiares configurados foram atendidos. Os 14 testes Playwright passaram, incluindo o toque que prepara Fúria antes de escolher a criatura. Lint, tipos, build de produção e `verify:build` com base `/herent-ascoic/` passaram. O bundle JS ainda gera o aviso de tamanho do Vite. Esta validação é local e não equivale a uma partida humana longa nem à publicação.

Validação local do Arquivo I em 26/10/2026: 741 testes Vitest em 80 arquivos e 21 testes Playwright passaram; cobertura 75,62% das instruções, 65,3% dos ramos, 82,6% das funções e 78,89% das linhas. Os testes novos percorrem os nove passos, revelação pela action real, bloqueio de clique fora do destaque, inspeção de carta, exportação do registro, repetição, escolha de outro arquivo, saída, toque e mudança de orientação. A seed foi verificada para os oito heróis. O spotlight foi verificado em 360×800, 390×844, 844×390, 768×1024 e 1366×768; o tabuleiro guiado foi percorrido em 360×800 e 1366×768. Lint, build e `verify:build` passaram. As capturas desktop e mobile ficam em `test-results/tutorial-*.png` após a suíte local. O Arquivo I ainda precisa de playtest humano em aparelho real antes da publicação.

Validação local do Arquivo II em 26/10/2026: 744 testes Vitest em 81 arquivos e 24 testes Playwright passaram. A cobertura ficou em 76,12% das instruções, 65,92% dos ramos, 83,45% das funções e 79,42% das linhas. As seeds `2` e `1` foram verificadas para os oito heróis; o segundo checkpoint conclui o encontro por actions reais. Os testes de interface percorreram entrada direta, continuação do Arquivo I sem reload, seleção, ataque por toque e arrasto, rolagem, comparação com o Diário, encerramento, repetição e cinco viewports entre 360×800 e 1366×768. Lint, build de produção e `verify:build --base /herent-ascoic/` passaram. Capturas de dados e resultado no desktop e da etapa dos dados nos cinco viewports ficam em `test-results/tutorial-combat-*.png` após a suíte local. Ainda falta playtest em aparelhos físicos antes da publicação.

Validação local do Arquivo III em 26/10/2026: 748 testes Vitest em 82 arquivos e 27 testes Playwright em série passaram. O fluxo percorreu as dez etapas em desktop e celular, inclusive continuação do Arquivo II sem reload, equipamento de uma e duas mãos, vestimenta, Poção de Precisão com bônus temporário e descarte, e Encanto do Sangue Quente exaurido com o herói apto a atacar na rodada seguinte. Os dois checkpoints foram verificados com os oito heróis. Cinco viewports de 360×800 a 1366×768 foram capturados em `test-results/tutorial-inventory-*.png`. Lint, tipos, build de produção e `verify:build --base /herent-ascoic/` passaram. O Arquivo III ainda precisa de playtest em aparelhos físicos, especialmente legibilidade do inventário horizontal e do destaque em paisagem.

Validação local do Arquivo IV em 26/10/2026: os 751 testes Vitest em 84 arquivos passaram; a cobertura atingiu 77,51% de instruções, 68,16% de ramos, 84,94% de funções e 80,81% de linhas. Os 31 testes Playwright em série passaram, inclusive entrada direta, continuação III→IV sem recarga, a sequência completa em desktop e 390×844, início posterior de uma partida normal e spotlight em 360×800, 390×844, 844×390, 768×1024 e 1366×768. Lint, build com `--base /herent-ascoic/` e `verify:build --base /herent-ascoic/` passaram. Capturas de entrada, passivo e conclusão ficam em `test-results/tutorial-abilities-*.png`. O catálogo ainda apresenta sete casos `no-effect` contextuais já registrados; não foram alterados para este tutorial. Falta playtest humano em aparelhos físicos, em especial a legibilidade da narração em paisagem e a sequência de ataque após preparação. As alterações continuam locais; nenhuma publicação ou push foi feito.

## Checklist para liberação

- [ ] Checks do pull request passam; push em `main` publica apenas `dist/` pelo workflow.
- [ ] Settings → Pages → Source está em **GitHub Actions**; deploy `github-pages` conclui e URL pública abre sem autenticação.
- [ ] No site publicado, JS, CSS, manifestos, imagens, cartas, fontes e PDF carregam sob `/herent-ascoic/`, sem 404 ou erros inesperados no console.
- [ ] **JOGAR** abre preparação; iniciar com 1 e com 4 heróis chega ao tabuleiro.
- [ ] Revelar sala, iniciar e concluir combate com ataque e item; organizar recompensa, gastar XP e abrir caminho até outra sala.
- [ ] Testar Marca da Presa com duas criaturas; usar Fúria e poder preparados antes do ataque; cancelar preparação; usar item equipado, cancelar alvo, enfrentar chefe, vencer e perder em sessões dirigidas.
- [ ] Abrir **Regras** e baixar o PDF sem cadastro; confirmar com o autor qual versão é oficial antes de divulgar como definitiva.
- [ ] Registrar feedback e avisar sobre perda da sessão; testar retrato e paisagem no aparelho dos participantes.

## Cinco perguntas para os amigos

1. Em que momento você ficou sem saber o próximo clique?
2. Alguma regra, carta ou resultado de combate pareceu diferente do manual? Qual?
3. Você conseguiu usar habilidade, poder e item quando esperava?
4. O tabuleiro, textos e manual ficaram legíveis no seu dispositivo?
5. O que impediu você de concluir a expedição ou faria você jogar outra partida?
