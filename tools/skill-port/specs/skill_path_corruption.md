# skill_path_corruption — Corrupção de Caminho

## Origem
- **type**: `discardDungeonLock`
- **trigger**: `while_room_active`
- **target**: `heroes`
- **value/defaultValue**: `null`
- **category**: `habilidade`
- **usesVariable**: false
- **Handler atual**: Define `state.flags.discardDungeonLocked = true`.
- **usedBy**:
  - creature_broken_chains_brute (creature, field=effect, value=null)
  - subboss_crimson_dungeon_jailer (subboss, field=effect, value=null)
- **Label template**: _Corrupção de Caminho: enquanto esta sala estiver ativa, os heróis não podem impedir descartes de dungeon causados por efeitos de sala ou criatura._

## Trigger decomposto
- `on`: `passive`

## Comportamento esperado
enquanto esta sala estiver ativa, os heróis não podem impedir descartes de dungeon causados por efeitos de sala ou criatura.


## Decisão: **DSL**
add_modifier discardDungeonLock passivo enquanto ativo.

## Casos de teste
1. Estado pós-execução reflete o comportamento descrito na label.
2. Input inválido / sem alvo: state inalterado.
