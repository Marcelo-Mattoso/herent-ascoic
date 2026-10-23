# Regras digitais e decisões preservadas

O [manual em PDF](../public/rules/ascensao-heroica-manual.pdf) é a referência de mesa. Esta página registra apenas decisões e limites da implementação web. Em caso de divergência, não altere a jogabilidade sem alinhar com o autor.

## Preparação e progressão

- A Alpha permite **1 a 4 heróis** (`MAX_HEROES = 4`), embora o manual v2 publicado descreva até 8. Modos cooperativo e competitivo, dificuldade, decks com seed, salas, recompensas, XP, caminhos, chefe, vitória e derrota são tratados pelo core.
- `enableSubBosses` está desligado. Conteúdo de subchefes descrito no manual não aparece nesta Alpha.
- A partida termina por derrota do grupo ou pela exaustão do deck quando o jogador recusa pagar 5 XP para continuar. O progresso não persiste ao recarregar a página (`enableSave = false`).

## Ações, itens e habilidades

- Decisão do autor: usar habilidade ou poder manual em combate bloqueia o ataque daquele herói **na rodada**, sem encerrar sua oportunidade de usar item ou passar. O manual posterior citado pelo autor não estabelece esse bloqueio geral; preserve a decisão digital até revisão explícita.
- No computador, arrastar o herói ao inimigo e selecionar herói seguido de inimigo executam o mesmo ataque. A sequência por clique também serve ao touch. Um gesto cancelado não inicia ataque.
- O core valida alvos: cura/proteção em heróis válidos, efeitos ofensivos em inimigos ativos e efeitos pessoais no próprio herói. Com vários alvos, a escolha fica pendente no modal.
- Usar item não encerra o turno. Itens equipados podem ser usados na janela adequada; item na mochila só pode ser ativado durante a organização de espólios, ou deve ser equipado primeiro. Consumíveis vão ao descarte; o item especial de obtenção de artefato é removido; reutilizáveis respeitam o limite da carta, com sala como padrão. Virar um item não cancela seus bônus passivos.
- Cancelar a escolha de alvo ou pular opção voluntária consome o uso quando há cooldown; poderes contam como uso único. O cancelamento não aplica o efeito nem paga HP.
- O limite por sala vale também fora de combate, é preservado ao iniciar combate e se renova ao sair da sala após os efeitos de saída. `ActivationTracker` é a base comum dos bloqueios por escopo.
- Gatilhos reativos mantêm suas janelas e custos próprios. Não converta uma habilidade reativa em botão manual só por causa de seu texto.

## Pontos a confirmar

- O PDF entregue no site é a cópia de 25 páginas da especificação v2. Em `Downloads` há um arquivo posterior, `Ascensão Heróica - regras e faq.pdf`, com 39 páginas e bytes diferentes, citado em decisões de agosto/setembro de 2026. Ele **não está no repositório**. A troca do manual e a reconciliação de regras dependem de confirmação do autor; o asset público atual foi preservado.
- O manual v2 diz que itens na mochila não estão ativos, salvo texto de carta. A janela digital de organização permite seu uso na fase de recompensa; essa interpretação deve ser confirmada.
- Habilidades com valores em pares `a/b` no caminho DSL reativo usam hoje o primeiro valor para ambos os modificadores. Pares assimétricos precisam de auditoria antes de alteração de regra ou formato.

Consulte [PLAYTEST.md](PLAYTEST.md) para limitações e cenários ainda sem validação dirigida.
