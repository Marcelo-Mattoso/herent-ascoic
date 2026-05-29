# skill_crimson_chains — Correntes Rubras

## Origem
- **type**: `flee_block`
- **trigger**: `until_end_of_round`
- **target**: `hero`
- **value/defaultValue**: `null`
- **category**: `habilidade`
- **usesVariable**: true
- **Handler atual**: Define `state.flags.fleeBlocked = true`.
- **usedBy**:
  - (nenhum)
- **Label template**: _Correntes Rubras ({value}): até o fim da rodada, {value} herói não pode fugir ou sair de combate por efeito._

## Trigger decomposto
- `on`: `until_end_of_round`

## Comportamento esperado
até o fim da rodada, {value} herói não pode fugir ou sair de combate por efeito.


## Decisão: **DSL**
add_modifier flee_block com duration until_end_of_round.

## Casos de teste
1. Após disparar: state.flags.fleeBlocked = true.
