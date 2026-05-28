# Patch-7 — Skills não implementadas (handler noop)

Skills abaixo tinham handler registrado como `noop` após o Patch 7. O Patch 8 implementou quase todas; o único `noop` restante está marcado como tal.

## Situação após Patch 8

| `id` | `type` | Usado em | Status |
|---|---|---|---|
| `habilidade-segunda-chance-das-fendas` | `reroll` | — (sem usedBy) | ✅ Implementado (F8) |
| `habilidade-runa-menor` | `reroll` | Cajado das Runas Rubras | ✅ Implementado (F8) |
| `habilidade-runa-perfeita` | `diceFix` | — (sem usedBy) | ✅ Implementado (F8, interativo) |
| `habilidade-milagre-da-ultima-luz` | `heal_or_damage_bonus` | — (sem usedBy) | ✅ Implementado (P7) |
| `habilidade-golpe-trespassante` | `splash_damage` | Espada do Trespasse, Lâmina Vermelha | ✅ Implementado (F7) |
| `habilidade-espolios-da-fornalha` | `drawItem` | — (sem usedBy) | ✅ Implementado (F12) |
| `habilidade-forja-reacesa` | `recover_item` | — (sem usedBy) | ⏸ **NOOP** — sem uso atual; sem teste manual possível |
| `habilidade-fuga-covarde` | `reward` | Goblin das Cavernas Escuras | ✅ Implementado (F2) |
| `habilidade-correntes-rubras` | `flee_block` | — (sem usedBy) | ✅ Implementado (F3) |
| `habilidade-porta-selada` | `flee_block` | — (sem usedBy) | ✅ Implementado (F3) |
| `habilidade-chao-em-ruina` | `discardDungeon` | — (sem usedBy) | ✅ Implementado (F2) |
| `habilidade-fumaca-da-fornalha` | `healBlock` | — (sem usedBy) | ✅ Implementado (F2) |
| `habilidade-tributo-sombrio` | `item_or_discardDungeon` | Esqueleto, Ladrão, Guardião | ✅ Implementado (F5) |
| `habilidade-evasao-das-fendas` | `itemControl` | Morcego, Crânio Flamejante | ✅ Implementado (F5) |
| `habilidade-corrupcao-de-caminho` | `discardDungeonLock` | Bruto, Carcereiro | ✅ Implementado (F2) |
| `habilidade-calor-escaldante` | `tohit_penalty` | — (sem usedBy) | ✅ Implementado (F2) |
| `habilidade-corpo-gelatinoso` | `tohit_penalty` | Limo das Pedras Úmidas | ✅ Implementado (F2) |
| `habilidade-prisao-das-correntes` | `tohit_penalty` | — (sem usedBy) | ✅ Implementado (F2) |
| `habilidade-presenca-da-chama-oculta` | `tohit` | Cultista, Acólito | ✅ Implementado (P7) |
| `habilidade-coragem-de-bando` | `tohit` | Kobold das Brasas Baixas | ✅ Implementado (P7) |
| `habilidade-fera-solitaria` | `tohit_damage` | Rato, Cavaleiro, Ogro | ✅ Implementado (P7) |
| `habilidade-iluminar-o-caminho` | `dungeon` | Tocha de Breu | ✅ Implementado (F5) |
| `habilidade-salvaguarda-de-caminho` | `discardDungeon_prevention` | Encanto da Masmorra Calada | ✅ Implementado (P7) |
| `habilidade-drenar-vida` | `heal` | — (sem usedBy) | ✅ Implementado via trigger on_deal_damage (F6) |
| `habilidade-tiro-de-oportunidade` | `directDamage` | Arco das Fendas | ✅ Implementado (F7, once_per_combat_instead_of_attack) |
| `habilidade-resguardo-da-ultima-luz` | `purple_damage_reduction` | — (sem usedBy) | ✅ Implementado (F10) |
| `habilidade-veu-protetor` | `targetProtection` | Manto do Véu, Alaúde | ✅ Implementado (F5) |
| `habilidade-passo-leve-das-fendas` | `discardDungeon_prevention` | Botas de Pedra Leve | ✅ Implementado (P7) |
| `habilidade-desvio-de-foco` | `targetRedirect_or_tohit` | Capuz do Túnel | ✅ Implementado (F9) |
| `efeito_roxo_monstro-chamas-vorazes` | `direct_damage` | — (sem usedBy) | ✅ Handler registrado (F1 filtro Roxo) |
| `efeito_roxo_monstro-correntes-da-fornalha` | `flee_block` | — | ✅ Handler registrado (F3) |
| `efeito_roxo_monstro-cinzas-da-ruina` | `discardDungeon` | Ladrão, Crânio, Acólito | ✅ Implementado (F2) |
| `efeito_roxo_monstro-couraca-rubra` | `armor` | — (sem usedBy) | ✅ Handler registrado (P7) |
| `efeito_roxo_monstro-despertar-sombrio` | `dungeonLevel` | — (sem usedBy) | ✅ Handler registrado (P7) |
| `efeito_roxo_monstro-despertar-mortal` | `dungeonLevel` | Cultista | ✅ Implementado (P7) |

## Noops remanescentes (Patch 8)

| `type` | Justificativa |
|---|---|
| `recover_item` | Sem carta com `usedBy` no catálogo — handler registrado mas sem efeito; sem teste manual possível. Implementar no Patch 9 quando uma carta usar este tipo. |

## Notas

- Skills com `usedBy: []` no catálogo não aparecem em nenhuma carta — o handler está registrado e não causa `[SKILL NÃO IMPLEMENTADA]`, mas nunca é acionado em jogo real.
- Efeitos roxos (`purpleEffect`) só disparam quando `state.dungeonAwakening === 4` (Roxo) — filtro implementado em `src/core/skills/dispatch.ts` (F1).
- Handler `noop` é registrado em `src/core/skills/handlers/index.ts` para os tipos sem implementação.
