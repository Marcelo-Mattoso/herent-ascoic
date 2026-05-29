# dungeon_skill_uneven_floor — Piso Irregular

## Origem
- **type**: `discardDungeon`
- **trigger**: `on_hero_lose_combat_in_room`
- **target**: `dungeon`
- **value/defaultValue**: `1`
- **category**: `habilidade_dungeon`
- **usesVariable**: false
- **Handler atual**: Descarta N cartas do deck de dungeon via discardFromDungeonDeck.
- **usedBy**:
  - room_depths_stairway (room, field=effect, value=1)
- **Label template**: _Piso Irregular: se algum herói perder um combate nesta sala, descarte +1 carta de dungeon._

## Trigger decomposto
- `on`: `on_lose_combat`

## Comportamento esperado
se algum herói perder um combate nesta sala, descarte +1 carta de dungeon.


## Decisão: **DSL**
discard_from dungeon 1 em cada lose_combat nesta sala.

## Casos de teste
1. Deck com cartas: N cartas descartadas da pilha.
2. Deck vazio: state inalterado.
