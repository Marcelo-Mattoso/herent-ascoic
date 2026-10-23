# Playtest da Alpha Web

Estado local em 23/10/2026. A publicação depende de integrar o workflow em `main`, selecionar **GitHub Actions** em Settings → Pages → Build and deployment → Source e verificar o deploy. O site público ainda não foi validado nesta tarefa.

## O que testar

A Alpha abre sem cadastro. Escolha **JOGAR**, selecione de 1 a 4 heróis, modo e dificuldade e inicie a expedição. Revele salas, enfrente criaturas, use ataque, habilidades, poderes e itens, organize espólios, gaste XP, abra caminhos e avance até Azhakar. **Regras** abre o manual PDF; há link para baixar. Vitória e derrota têm telas próprias.

Para relatar um problema, anote carta, herói, sala, ação, resultado esperado e observado e as últimas mensagens do log. O replay determinístico e as ferramentas de console ficam disponíveis apenas no modo de desenvolvimento.

## Limitações e pendências

| Prioridade | Estado | Consequência / próximo teste |
|---|---|---|
| P1 | `enableSave = false`. | Recarregar ou fechar a aba perde a partida; avise os participantes antes de começar. |
| P1 | Orientação vertical tem suporte limitado. | Preferir desktop ou celular na horizontal; validar legibilidade em aparelhos reais. |
| P1 | O harness marcou sete casos `no-effect` em cenários sintéticos: `skill_rift_evasion`, `skill_cowardly_flee`, `skill_opportunity_shot`, `skill_minor_rune`, `boss_skill_dark_forge_pressure`, `dungeon_skill_subboss_room`, `dungeon_skill_empty_room`. | Fazer partidas dirigidas e reproduzir uma falha antes de mudar regras. Não há skill classificada como sem implementação ou erro pelo harness anterior. |
| P1 | Fuga de criatura para `skill_cowardly_flee` ainda não tem transição/emissor próprios. | Testar a carta em uma situação real e definir comportamento com o autor. |
| P2 | Uma escolha reativa após dano pode interromper a limpeza de entidade ECS. | Validar janelas pós-dano com derrota; implementar continuação do pipeline em entrega separada. |
| P2 | `enableSubBosses = false`. | Conteúdo de subchefes fica fora do escopo atual. |
| P2 | Bundle JS acima do aviso de 500 kB do Vite. | Medir carregamento em rede móvel antes de dividir chunks. |
| P2 | Manual publicado de 25 páginas difere de PDF posterior de 39 páginas fora do repositório. | Confirmar versão oficial e divergências com o autor antes de substituir. |
| Futuro | `category` ainda compõe a definição de habilidade; algumas skills sem carta referenciada permanecem no catálogo para expansão. | Preservar esses IDs e contratos; revisar modelagem apenas em refatoração própria. |
| Futuro | Algumas ações de dungeon e descoberta de habilidades tiveram propostas de UI em documentos antigos. | Validar o fluxo atual em partidas antes de abrir trabalho novo; os diagnósticos antigos podem estar superados. |

## Validação automatizada

O CI executa `npm ci`, lint sem alterações, Vitest, cobertura com os limiares de `vite.config.ts`, build para `/herent-ascoic/`, verificação de HTML/assets/manifestos/PDF e Playwright. Os três testes de navegador cobrem menu, seleção de herói, entrada no tabuleiro e resposta do PDF. Eles **não** percorrem combate completo, progressão de salas, vitória/derrota nem todos os 404 e erros de console possíveis durante uma partida longa. Os testes do core cobrem partes desses fluxos, mas o roteiro humano abaixo continua necessário.

Validação local desta limpeza: lint passou; 684 testes Vitest passaram com `--maxWorkers=2 --testTimeout=15000`; cobertura passou (75,39% instruções, 65,32% ramos, 83,15% funções, 79,11% linhas); build e `verify:build` passaram; os 3 testes Playwright passaram. Um preview do `dist/` com base `/herent-ascoic/` carregou **JOGAR → seleção → tabuleiro**, PDF HTTP 200 e nenhum 404 ou erro JavaScript observado nesse percurso. O site remoto ainda responde 404 antes da publicação.

## Checklist para liberação

- [ ] Checks do pull request passam; push em `main` publica apenas `dist/` pelo workflow.
- [ ] Settings → Pages → Source está em **GitHub Actions**; deploy `github-pages` conclui e URL pública abre sem autenticação.
- [ ] No site publicado, JS, CSS, manifestos, imagens, cartas, fontes e PDF carregam sob `/herent-ascoic/`, sem 404 ou erros inesperados no console.
- [ ] **JOGAR** abre preparação; iniciar com 1 e com 4 heróis chega ao tabuleiro.
- [ ] Revelar sala, iniciar e concluir combate com ataque e item; organizar recompensa, gastar XP e abrir caminho até outra sala.
- [ ] Testar habilidade/poder, cancelamento de alvo, chefe, vitória e derrota em sessões dirigidas.
- [ ] Abrir **Regras** e baixar o PDF sem cadastro; confirmar com o autor qual versão é oficial antes de divulgar como definitiva.
- [ ] Registrar feedback e avisar sobre perda da sessão e orientação vertical.

## Cinco perguntas para os amigos

1. Em que momento você ficou sem saber o próximo clique?
2. Alguma regra, carta ou resultado de combate pareceu diferente do manual? Qual?
3. Você conseguiu usar habilidade, poder e item quando esperava?
4. O tabuleiro, textos e manual ficaram legíveis no seu dispositivo?
5. O que impediu você de concluir a expedição ou faria você jogar outra partida?
