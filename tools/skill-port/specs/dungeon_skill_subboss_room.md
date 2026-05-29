# dungeon_skill_subboss_room — Sala do Subchefe

## Origem
- **type**: `noop`
- **trigger**: `room_passive`
- **target**: `room`
- **value/defaultValue**: `null`
- **category**: `habilidade_dungeon`
- **usesVariable**: false
- **Handler atual**: Loga '[SKILL NÃO IMPLEMENTADA]' e devolve state.
- **usedBy**:
  - subboss_room_jailer_chamber (subboss_room, field=effect, value=null)
  - subboss_room_cracked_abyss_chamber (subboss_room, field=effect, value=null)
- **Label template**: _Sala do Subchefe: sala especial: um subchefe guarda esta câmara._

## Trigger decomposto
- `on`: `passive`

## Comportamento esperado
sala especial: um subchefe guarda esta câmara.


## Decisão: **DSL**
noop explícito.

## Casos de teste
1. Sempre: state inalterado (noop explícito).
