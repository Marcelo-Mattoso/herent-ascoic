# Regras digitais e decisões preservadas

O [manual em PDF](../public/rules/ascensao-heroica-manual.pdf) é a referência de mesa. Esta página registra apenas decisões e limites da implementação web. Em caso de divergência, não altere a jogabilidade sem alinhar com o autor.

## Preparação e progressão

- A Alpha permite **1 a 4 heróis** (`MAX_HEROES = 4`), embora o manual v2 publicado descreva até 8. Modos cooperativo e competitivo, dificuldade, decks com seed, salas, recompensas, XP, caminhos, chefe, vitória e derrota são tratados pelo core.
- `enableSubBosses` está desligado. Conteúdo de subchefes descrito no manual não aparece nesta Alpha.
- A partida termina por derrota do grupo ou pela exaustão do deck quando o jogador recusa pagar 5 XP para continuar. O progresso não persiste ao recarregar a página (`enableSave = false`).

## Ações, itens e habilidades

- Habilidade, poder ou item manual não consome o ataque do herói. Só custos e limites declarados pela própria habilidade ou carta restringem uma nova ativação. O ataque continua disponível até ser resolvido ou até o herói encerrar sua ação.
- No computador, arrastar o herói ao inimigo e selecionar herói seguido de inimigo executam o mesmo ataque. A sequência por clique também serve ao touch. Um gesto cancelado não inicia ataque.
- O core valida alvos: cura/proteção em heróis válidos, efeitos ofensivos em inimigos ativos e efeitos pessoais no próprio herói. Com vários alvos, a escolha fica pendente no modal.
- Cada herói tem duas vestimentas, duas mãos, um amuleto e três espaços de mochila. O `equipmentSlot` explícito da carta define onde ela pode ser equipada; itens de duas mãos bloqueiam ambas. Cartas sem `equipmentSlot` não recebem um espaço pela categoria. Movimentação e trocas só ocorrem na fase de espólios, sem perda de cartas quando um destino está cheio.
- Usar item não encerra o turno. Itens na mochila devem ser equipados antes de ativar efeitos; consumíveis equipados vão ao descarte ao usar. Itens de Saque Místico podem ser usados diretamente da mesa de recompensas e são removidos; outros itens pendentes precisam ser adquiridos e equipados. Reutilizáveis respeitam o limite da carta, com sala como padrão. Exaurir um item impede nova ativação até a recuperação do escopo, sem desequipá-lo ou cancelar bônus passivos.
- Cancelar uma escolha de alvo antes da execução não consome uso nem paga HP. Uma escolha interna ao efeito já iniciado segue o limite da ativação. Poderes com uso único bloqueiam apenas o próprio poder.
- O limite por sala vale também fora de combate, é preservado ao iniciar combate e se renova ao sair da sala após os efeitos de saída. `ActivationTracker` é a base comum dos bloqueios por escopo.
- Gatilhos reativos mantêm suas janelas e custos próprios. O botão de uma reação opcional prepara ou cancela sua preparação antes do evento; no evento, ela dispara automaticamente se a origem e as condições ainda forem válidas. Uma reação não preparada é ignorada sem custo. O diário mostra a preparação e sua execução. Dano direto não conta como `evt_hit`; esse evento requer acerto de ataque contra criatura.

## Pontos a confirmar

- O PDF entregue no site é a cópia de 25 páginas da especificação v2. Em `Downloads` há um arquivo posterior, `Ascensão Heróica - regras e faq.pdf`, com 39 páginas e bytes diferentes, citado em decisões de agosto/setembro de 2026. Ele **não está no repositório**. A troca do manual e a reconciliação de regras dependem de confirmação do autor; o asset público atual foi preservado.
- O manual v2 diz que itens na mochila não estão ativos, salvo texto de carta. A Alpha exige equipá-los para uso; efeitos que mencionam exceções de mochila ainda precisam de validação dirigida.
- Habilidades com valores em pares `a/b` no caminho DSL reativo usam hoje o primeiro valor para ambos os modificadores. Pares assimétricos precisam de auditoria antes de alteração de regra ou formato.

Consulte [PLAYTEST.md](PLAYTEST.md) para limitações e cenários ainda sem validação dirigida.
