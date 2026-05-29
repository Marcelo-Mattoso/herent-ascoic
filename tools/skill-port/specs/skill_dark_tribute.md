# skill_dark_tribute — Tributo Sombrio

## Origem
- **type**: `item_or_discardDungeon`
- **trigger**: `before_first_combat_in_room`
- **target**: `group`
- **value/defaultValue**: `null`
- **category**: `habilidade`
- **usesVariable**: false
- **Handler atual**: Abre SKILL_CHOICE com opções 'item' / 'dungeon'. Continuação: descarta 1 carta dungeon ou remove item da mochila/slot.
- **usedBy**:
  - creature_catacomb_skeleton (creature, field=effect, value=1)
  - creature_dead_passage_thief (creature, field=effect, value=1)
  - subboss_cracked_abyss_guardian (subboss, field=effect, value=1)
- **Label template**: _Tributo Sombrio: antes do primeiro combate desta sala, o grupo deve escolher: descartar 1 item ou descartar 1 carta adicional de dungeon._

## Trigger decomposto
- `on`: `before_combat`
- `limit`: `once_per_room`

## Comportamento esperado
antes do primeiro combate desta sala, o grupo deve escolher: descartar 1 item ou descartar 1 carta adicional de dungeon.


## Decisão: **DSL**
choose_one: discard_from item OU discard_from dungeon antes do primeiro combate.

## Casos de teste
1. Grupo tem item e dungeon: SKILL_CHOICE aberto com ambas opções.
2. Grupo sem item: apenas opção dungeon.
