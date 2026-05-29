# skill_cowardly_flee — Fuga Covarde

## Origem
- **type**: `reward`
- **trigger**: `on_flee_or_leave_play`
- **target**: `self`
- **value/defaultValue**: `null`
- **category**: `habilidade`
- **usesVariable**: false
- **Handler atual**: Marca `enemy.noReward = true` na criatura-fonte via mapEnemy.
- **usedBy**:
  - creature_dark_cave_goblin (creature, field=effect, value=null)
- **Label template**: _Fuga Covarde: se fugir ou sair de jogo, não concede recompensa._

## Trigger decomposto
- `on`: `on_leave_play`

## Comportamento esperado
se fugir ou sair de jogo, não concede recompensa.


## Decisão: **DSL**
add_modifier no_reward na criatura-fonte ao sair de jogo.

## Casos de teste
1. Após disparar: enemy.noReward = true.
