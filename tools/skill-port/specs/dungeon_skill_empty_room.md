# dungeon_skill_empty_room — Sala Vazia

## Origem
- **type**: `room`
- **trigger**: `room_passive`
- **target**: `room`
- **value/defaultValue**: `null`
- **category**: `habilidade_dungeon`
- **usesVariable**: false
- **Handler atual**: NÃO REGISTRADO. Sala sem efeito adicional.
- **usedBy**:
  - room_narrow_corridor (room, field=effect, value=null)
  - room_dungeon_room (room, field=effect, value=null)
- **Label template**: _Sala Vazia: sem efeito adicional._

## Trigger decomposto
- `on`: `passive`

## Comportamento esperado
sem efeito adicional.


## Decisão: **DSL**
noop explícito.

## Casos de teste
1. Sempre: state inalterado (noop explícito).
