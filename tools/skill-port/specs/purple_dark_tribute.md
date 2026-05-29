# purple_dark_tribute — Tributo Sombrio

## Origem
- **type**: `item_or_discardDungeon`
- **trigger**: `before_combat`
- **target**: `group`
- **value/defaultValue**: `1`
- **category**: `efeito_roxo_monstro`
- **usesVariable**: false
- **Handler atual**: Abre SKILL_CHOICE com opções 'item' / 'dungeon'. Continuação: descarta 1 carta dungeon ou remove item da mochila/slot.
- **usedBy**:
  - creature_dark_cave_goblin (creature, field=purpleEffect, value=1)
- **Label template**: _Tributo Sombrio: antes do combate, o grupo deve descartar 1 item ou sofrer +1 descarte de dungeon._

## Trigger decomposto
- `on`: `before_combat`

## Comportamento esperado
antes do combate, o grupo deve descartar 1 item ou sofrer +1 descarte de dungeon.


## Decisão: **DSL**
choose_one before_combat: discard_from item OU discard_from dungeon.

## Casos de teste
1. Grupo tem item e dungeon: SKILL_CHOICE aberto com ambas opções.
2. Grupo sem item: apenas opção dungeon.
