# Revisão das habilidades e poderes dos heróis

Estado observado antes da revisão na branch `fix/playtest-artifacts-extra-attacks-boss-20261103` em 03/11/2026. As tabelas abaixo registram o diagnóstico inicial. As regras implementadas nesta revisão estão resumidas a seguir.

## Regras definidas nesta revisão

| Herói | Habilidade ou poder | Regra |
| --- | --- | --- |
| Clérigo | Cura da Última Luz | Uma vez por rodada; consome a ação do clérigo. |
| Guerreiro | Guarda do Bastião | Uma vez por rodada; consome a ação de Brennar somente ao proteger. |
| Ladino | Caminho Preservado | Três cargas por jogo; reage ao descarte normal ou causado por efeito. |
| Mago | Runa das Fendas | Uma vez por rodada; consome sua ação; +3 de acerto no próximo ataque do aliado escolhido. Se o aliado abater a criatura, o mago sofre 2 de dano e o uso da runa recarrega. |
| Bárbaro | Fúria Rubra | Uma vez por rodada; o ataque consome sua ação. |
| Paladino | Luz da Aurora Final | Passiva: +2 de acerto e +2 de dano enquanto o Despertar estiver em Vermelho ou Roxo; muda imediatamente com o nível da masmorra. |
| Necromante | Rito de Retorno | Pode ser usado repetidamente sem ação enquanto houver cartas descartadas; custa 3 de vida por uso. |
| Caçador | Marca da Presa | Marcação gratuita; só uma presa ativa. |
| Mago | Runa Suprema das Fendas | Uma vez por jogo, em uma rolagem da rodada: escolher dado aliado para 6 ou inimigo para 1. |
| Necromante | Eco Profundo do Véu | Ganha Eco automaticamente ao abater criatura, preserva entre combates e escolhe manualmente gastar cada Eco em +2 acerto ou +2 dano no próximo ataque. O gatilho de ganho continua uma vez por jogo. |
| Caçador | Execução do Caçador | Uma vez por jogo contra a presa: +6 de acerto e +6 de dano em um ataque. |

## Três regras separadas

1. **Limite de uso:** quantas ativações são permitidas por rodada, combate, sala ou partida. O limite pertence ao herói que possui a habilidade, mesmo quando outro herói recebe o efeito.
2. **Custo de ação:** se a ativação substitui a ação do dono naquela rodada. Preparar uma reação não deve gastar a ação antes de ela realmente disparar; cancelar a preparação também não deve gastar uso nem ação.
3. **Duração do efeito:** uso instantâneo, próxima rolagem/ataque, até o fim da rodada, até o fim do combate ou até outra condição. Não é a mesma coisa que limite de uso. Um poder de uso único por partida pode produzir um efeito que dure uma rodada ou um combate.

O motor mantém `cooldown`, `action_cost` e `duration` como regras separadas. As cartas de herói sem concessões explícitas passam por `legacyActivation` em `src/core/data/abilities.ts`, que agora respeita `action_cost` quando declarado. Só `consume_hero_action` chama `ActivationTracker.endHeroTurn` em `src/core/abilities/executor.ts`.

## Habilidades

| Herói | Habilidade | Limite atual | Ação atual | Efeito atual | Ponto da revisão |
| --- | --- | --- | --- | --- | --- |
| Clérigo | Cura da Última Luz | Sem limite explícito | Não consome | Cura 3 imediatamente | Definir 1 uso por rodada e se curar substitui a ação do clérigo. |
| Guerreiro | Guarda do Bastião | Sem limite explícito | Não consome | Reação a dano: reduz 3 uma vez; pode proteger outro herói | **Regra informada:** 1 uso por rodada; quando a proteção dispara, Brennar perde sua ação. Se não disparar, pode agir normalmente. |
| Ladino | Caminho Preservado | 1 por sala | Não consome | Impede um descarte da masmorra | Preservar ou rever o escopo de sala; não há rodada fora de combate. |
| Mago | Runa das Fendas | Sem limite explícito | Não consome | Altera um dado de herói em até 1, após rolar | O texto diz “dado aliado”, mas `eventGrantMatchesContext` aceita `evt_roll` apenas quando o mago é o herói que rolou. A preparação pode permanecer visível durante as ações de outros heróis. Definir 1 uso por rodada, alcance aliado e custo de ação. |
| Bárbaro | Fúria Rubra | Sem limite explícito | Não consome além do ataque | Sofre 2 e dá +6 no próximo ataque | Definir 1 uso por rodada; o ataque do próprio bárbaro já consome sua ação. |
| Paladino | Luz da Aurora Final | Sem limite explícito; dispara no começo do combate | Não consome | +2 acerto e +2 dano até o fim do **combate** quando o Despertar é alto | **Regra informada:** dura só a rodada. Para reaplicar em rodadas seguintes, mudar também a janela de `evt_combat_start` para `evt_round_start`, com condição e duração de rodada. |
| Necromante | Rito de Retorno | 1 por sala | Não consome | Sofre 3 e recupera uma carta da masmorra | Definir se o rito substitui uma ação quando usado durante combate; manter escopo de sala se essa for a regra da carta. |
| Caçador | Marca da Presa | Sem limite explícito | Não consome | Marca uma criatura; o bônus vale contra ela até derrotá-la | Hoje pode marcar e atacar na mesma rodada. Definir se marcar consome a ação e se precisa de limite por rodada além da restrição de uma presa ativa. |

## Poderes

Todos os oito poderes têm `cooldown: { scope: game, charges: 1 }` no catálogo. Isso limita a ativação a uma vez por partida; **não** define quanto dura o efeito.

| Herói | Poder | Duração/resultado atual | Observação |
| --- | --- | --- | --- |
| Clérigo | Milagre Maior da Última Luz | Cura total ou impede uma destruição | Efeito pontual; não é um bônus de combate inteiro. |
| Guerreiro | Guarda Inquebrável do Bastião | Reduz 1 de dano de todos os heróis até o fim da rodada | Está configurado com duração de rodada, conforme a regra informada. |
| Ladino | Caminho Restaurado | Recupera uma carta imediatamente | Efeito pontual. |
| Mago | Runa Suprema das Fendas | Altera um dado após uma rolagem | Efeito pontual; conferir se deve alcançar a rolagem de aliados. |
| Bárbaro | Fúria Rubra Poderosa | +6 de dano até o fim do combate após disparar | Este é um poder que permanece ativo durante o combate. |
| Paladino | Juramento da Última Luz | Cura 5 de todos ou +5 no próximo ataque | Uso único por partida; efeito pontual ou de um ataque. |
| Necromante | Eco Profundo do Véu | Ganha um Eco após abater criatura; o contador atual tem escopo de combate | Decidir se o Eco não gasto deve sobreviver ao fim do combate; o texto da carta não explicita isso. |
| Caçador | Execução do Caçador | Altera um dado e dá +1 no dano do ataque | Efeito de uma rolagem/ataque. |

## Divergências diagnosticadas antes desta revisão

1. **Guarda do Bastião:** falta limite por rodada e falta gastar a ação de Brennar quando a reação protege alguém. Como não há `cooldown`, a reação pode ser preparada novamente depois de disparar, desde que ele ainda não tenha agido.
2. **Runa das Fendas:** o texto permite dado aliado, mas o caminho de concessões só aceita a própria rolagem do mago (`src/core/abilities/executor.ts#eventGrantMatchesContext`). O estado “preparado” pode continuar aparecendo enquanto outros heróis jogam; isso não prova que o modificador foi aplicado a cada um.
3. **Luz da Aurora Final:** o efeito está configurado para durar o combate inteiro, embora a regra informada seja apenas a rodada.
4. **Custo de ação:** nenhum dos 16 usos de herói recebe `consume_hero_action` pelo adaptador de cartas antigas. A regra deve ser explícita por habilidade; não se deve marcar todos os poderes ou todas as reações como ações.
5. **Texto das cartas:** cinco dos oito rótulos de poder em `locales/pt-BR/skills.json` não dizem “uma vez por jogo”, embora o catálogo imponha esse limite. Os idiomas e o painel devem mostrar o limite derivado do dado estruturado para evitar divergência.
