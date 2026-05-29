# purple_forge_chains — Correntes da Fornalha

## Origem
- **type**: `flee_block`
- **trigger**: `while_in_play`
- **target**: `heroes`
- **value/defaultValue**: `null`
- **category**: `efeito_roxo_monstro`
- **usesVariable**: false
- **Handler atual**: Define `state.flags.fleeBlocked = true`.
- **usedBy**:
  - (nenhum)
- **Label template**: _Correntes da Fornalha: enquanto esta criatura estiver em jogo, heróis não podem fugir._

## Trigger decomposto
- `on`: `passive`

## Comportamento esperado
enquanto esta criatura estiver em jogo, heróis não podem fugir.


## Decisão: **DSL**
add_modifier flee_block passivo while_in_play.

## Casos de teste
1. Após disparar: state.flags.fleeBlocked = true.
