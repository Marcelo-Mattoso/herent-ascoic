# purple_ruin_ashes — Cinzas da Ruína

## Origem
- **type**: `discardDungeon`
- **trigger**: `on_destroyed`
- **target**: `dungeon`
- **value/defaultValue**: `1`
- **category**: `efeito_roxo_monstro`
- **usesVariable**: false
- **Handler atual**: Descarta N cartas do deck de dungeon via discardFromDungeonDeck.
- **usedBy**:
  - creature_dead_passage_thief (creature, field=purpleEffect, value=1)
  - creature_blazing_skull (creature, field=purpleEffect, value=1)
  - creature_forge_acolyte (creature, field=purpleEffect, value=1)
- **Label template**: _Cinzas da Ruína: quando esta criatura for destruída, descarte 1 carta adicional de dungeon._

## Trigger decomposto
- `on`: `on_destroyed`

## Comportamento esperado
quando esta criatura for destruída, descarte 1 carta adicional de dungeon.


## Decisão: **DSL**
discard_from dungeon 1 on_destroyed.

## Casos de teste
1. Deck com cartas: N cartas descartadas da pilha.
2. Deck vazio: state inalterado.
