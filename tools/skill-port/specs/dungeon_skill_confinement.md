# dungeon_skill_confinement — Confinamento

## Origem
- **type**: `flee_block`
- **trigger**: `while_room_active`
- **target**: `creatures_or_heroes_in_room`
- **value/defaultValue**: `null`
- **category**: `habilidade_dungeon`
- **usesVariable**: false
- **Handler atual**: Define `state.flags.fleeBlocked = true`.
- **usedBy**:
  - room_crimson_chains_chamber (room, field=effect, value=null)
- **Label template**: _Confinamento: criaturas ou heróis nesta sala não podem fugir._

## Trigger decomposto
- `on`: `passive`

## Comportamento esperado
criaturas ou heróis nesta sala não podem fugir.


## Decisão: **DSL**
add_modifier flee_block passivo while_room_active.

## Casos de teste
1. Após disparar: state.flags.fleeBlocked = true.
