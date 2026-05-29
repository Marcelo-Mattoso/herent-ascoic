# skill_ruined_floor — Chão em Ruína

## Origem
- **type**: `discardDungeon`
- **trigger**: `first_hero_lose_combat_in_room`
- **target**: `dungeon`
- **value/defaultValue**: `null`
- **category**: `habilidade`
- **usesVariable**: false
- **Handler atual**: Descarta N cartas do deck de dungeon via discardFromDungeonDeck.
- **usedBy**:
  - (nenhum)
- **Label template**: _Chão em Ruína: a primeira vez que um herói perder um combate nesta sala, descarte 1 carta adicional de dungeon._

## Trigger decomposto
- `on`: `on_lose_combat`
- `limit`: `once_per_room`

## Comportamento esperado
a primeira vez que um herói perder um combate nesta sala, descarte 1 carta adicional de dungeon.


## Decisão: **DSL**
discard_from dungeon 1 quando herói perde combate (once_per_room).

## Casos de teste
1. Deck com cartas: N cartas descartadas da pilha.
2. Deck vazio: state inalterado.
