# Patch-7 — Skills não implementadas (handler noop)

Skills abaixo têm handler registrado como `noop` (loga `[SKILL NÃO IMPLEMENTADA]` mas não altera estado). Não quebram runtime — simplesmente não têm efeito. Implementação futura pode substituir `noop` pelo handler real sem alterar o dispatch.

## Critério de priorização

- **P1**: afeta sessão normal do tutorial (Fornalha Sombria com as 8 fichas de herói).
- **P2**: melhora experiência mas não bloqueia partida completa.
- **P3**: fora do escopo do tutorial / depende de mecânica não implementada.

## Lista

| `id` | `type` | Usado em | Prioridade | Justificativa |
|---|---|---|---|---|
| `habilidade-segunda-chance-das-fendas` | `reroll` | — (sem usedBy) | P2 | Rolar novamente exige UI para escolha de dado |
| `habilidade-runa-perfeita` | `diceFix` | — (sem usedBy) | P2 | Idem |
| `habilidade-milagre-da-ultima-luz` | `heal_or_damage_bonus` | — (sem usedBy) | P2 | Escolha do jogador — requer SKILL_TARGETING |
| `habilidade-golpe-trespassante` | `direct_damage` | — (sem usedBy) | P2 | Depende de lógica de splash damage |
| `habilidade-espolios-da-fornalha` | `drawItem` | — (sem usedBy) | P2 | Requer UI para escolher entre 2 itens |
| `habilidade-forja-reacesa` | `recover_item` | — (sem usedBy) | P2 | Recuperar item do descarte — precisa de lista de descarte de itens |
| `habilidade-fuga-covarde` | `reward` | Goblin das Cavernas Escuras | P3 | Mecânica de fuga não implementada |
| `habilidade-correntes-rubras` | `flee_block` | — (sem usedBy) | P3 | Fuga não implementada |
| `habilidade-porta-selada` | `flee_block` | — (sem usedBy) | P3 | Fuga não implementada |
| `habilidade-chao-em-ruina` | `discardDungeon` | — (sem usedBy) | P3 | Descarte condicional de dungeon |
| `habilidade-fumaca-da-fornalha` | `healBlock` | — (sem usedBy) | P2 | Bloquear cura requer flag no state |
| `habilidade-tributo-sombrio` | `item_or_discardDungeon` | Esqueleto, Ladrão, Guardião | P1 | Afeta criaturas comuns — requer UI de escolha |
| `habilidade-evasao-das-fendas` | `itemControl` | Morcego, Crânio Flamejante | P2 | Ignorar 1º efeito de item — requer flag por criatura |
| `habilidade-corrupcao-de-caminho` | `discardDungeonLock` | Bruto, Carcereiro | P2 | Bloquear discardDungeon_prevention |
| `habilidade-calor-escaldante` | `tohit_penalty` | — (sem usedBy) | P2 | Penalidade na primeira rolagem da sala |
| `habilidade-corpo-gelatinoso` | `tohit_penalty` | Limo das Pedras Úmidas | P2 | Penalidade de acerto contra criatura específica |
| `habilidade-prisao-das-correntes` | `tohit_penalty` | — (sem usedBy) | P3 | Penalidade contextual ao escolher alvo |
| `habilidade-presenca-da-chama-oculta` | `tohit` | Cultista, Acólito | P1 | Bônus sinérgico entre criaturas |
| `habilidade-coragem-de-bando` | `tohit` | Kobold das Brasas Baixas | P1 | Bônus se há outra criatura na sala |
| `habilidade-fera-solitaria` | `tohit_damage` | Rato, Cavaleiro, Ogro | P1 | Bônus quando criatura está sozinha |
| `habilidade-iluminar-o-caminho` | `dungeon` | Tocha de Breu, itens | P2 | Olhar cartas antes de escolher caminho |
| `habilidade-salvaguarda-de-caminho` | `discardDungeon_prevention` | Encanto da Masmorra Calada | P2 | Alias do caminho preservado |
| `habilidade-drenar-vida` | `heal` | — (sem usedBy) | P3 | Cura ao causar dano — encadeamento |
| `habilidade-tiro-de-oportunidade` | `directDamage` | Arco das Fendas | P2 | Dano direto no lugar de ataque — requer ação alternativa |
| `habilidade-resguardo-da-ultima-luz` | `purple_damage_reduction` | — (sem usedBy) | P3 | Redução de efeito roxo — depende de efeito roxo implementado |
| `habilidade-veu-protetor` | `targetProtection` | Manto do Véu, Alaúde | P2 | Ignorar primeiro efeito que escolher este herói |
| `habilidade-passo-leve-das-fendas` | `discardDungeon_prevention` | Botas de Pedra Leve | P2 | Alias do caminho preservado |
| `habilidade-desvio-de-foco` | `targetRedirect_or_tohit` | Capuz do Túnel | P3 | Redirecionamento de alvo — requer UI |
| `habilidade-runa-menor` | `reroll` | Cajado das Runas Rubras | P2 | Rerolar dado com valor 1 |
| `efeito_roxo_monstro-chamas-vorazes` | `direct_damage` | — (sem usedBy em criaturas comuns) | P2 | Efeito roxo: dano a todos ao entrar em jogo |
| `efeito_roxo_monstro-correntes-da-fornalha` | `flee_block` | — | P3 | Fuga não implementada |
| `efeito_roxo_monstro-cinzas-da-ruina` | `discardDungeon` | Ladrão, Crânio, Acólito | P1 | Descarte de dungeon ao destruir — afeta criaturas comuns |
| `efeito_roxo_monstro-couraca-rubra` | `armor` | — (sem usedBy) | P2 | Armadura condicional por rodada |
| `efeito_roxo_monstro-despertar-sombrio` | `dungeonLevel` | — (sem usedBy) | P2 | Aumentar despertar ao entrar em jogo |
| `efeito_roxo_monstro-despertar-mortal` | `dungeonLevel` | Cultista | P1 | Aumentar despertar ao ser destruído |

## Notas

- Skills com `usedBy: []` no catálogo não aparecem em nenhuma carta — não causam impacto em jogo até serem associadas.
- Handler `noop` é registrado em `src/core/skills/handlers/index.ts` e substitui o warning padrão do registry.
- Efeitos roxos (`category: "efeito_roxo_monstro"`) dependem de mecânica de rolagem de dado roxo ainda não implementada no reducer.
