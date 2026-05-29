# skill_sealed_door — Porta Selada

## Origem
- **type**: `flee_block`
- **trigger**: `while_room_active_first_combat`
- **target**: `heroes`
- **value/defaultValue**: `null`
- **category**: `habilidade`
- **usesVariable**: false
- **Handler atual**: Define `state.flags.fleeBlocked = true`.
- **usedBy**:
  - (nenhum)
- **Label template**: _Porta Selada: enquanto esta sala estiver ativa, heróis não podem fugir no primeiro combate._

## Trigger decomposto
- `on`: `passive`
- `when`: {"kind":"compare","op":"eq","left":"$room.combat_count","right":0}

## Comportamento esperado
enquanto esta sala estiver ativa, heróis não podem fugir no primeiro combate.


## Decisão: **DSL**
add_modifier flee_block passivo durante primeiro combate da sala.

## Casos de teste
1. Após disparar: state.flags.fleeBlocked = true.
