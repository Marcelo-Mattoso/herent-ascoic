# skill_minor_rune — Runa Menor

## Origem
- **type**: `reroll`
- **trigger**: `once_per_room_after_roll`
- **target**: `die_with_value_1`
- **value/defaultValue**: `null`
- **category**: `habilidade`
- **usesVariable**: false
- **Handler atual**: Configura `pendingDiceSelection` com `filter: {value: 1}`. BUG: skill_rift_second_chance não deveria filtrar por valor 1.
- **usedBy**:
  - item_crimson_rune_staff (item, field=effect, value=1)
- **Label template**: _Runa Menor: uma vez por sala, depois de rolar, você pode rerrolar um dado que tenha o valor 1._

## Trigger decomposto
- `on`: `after_roll`
- `limit`: `once_per_room`

## Comportamento esperado
uma vez por sala, depois de rolar, você pode rerrolar um dado que tenha o valor 1.


## Decisão: **Script**
Reroll interativo de dado com valor 1 — pendingDiceSelection com filter.

## Casos de teste
1. dado com valor 1 presente: pendingDiceSelection configurado.
2. Nenhum dado com valor 1: log 'nenhum dado' retornado.
