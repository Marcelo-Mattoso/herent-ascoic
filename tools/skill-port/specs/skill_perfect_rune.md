# skill_perfect_rune — Runa Perfeita

## Origem
- **type**: `diceFix`
- **trigger**: `once_per_room_after_roll`
- **target**: `ally_die`
- **value/defaultValue**: `null`
- **category**: `habilidade`
- **usesVariable**: false
- **Handler atual**: Configura `combat.pendingDiceSelection` com `action: 'set_to'`, `setToValue: 6`. Interativo — jogador escolhe dado.
- **usedBy**:
  - (nenhum)
- **Label template**: _Runa Perfeita: uma vez por sala, depois de rolar, transforme 1 dado aliado em 6._

## Trigger decomposto
- `on`: `after_roll`
- `limit`: `once_per_room`

## Comportamento esperado
uma vez por sala, depois de rolar, transforme 1 dado aliado em 6.


## Decisão: **Script**
diceFix interativo — pendingDiceSelection.

## Casos de teste
1. combat.pendingDiceSelection configurado com action='set_to', setToValue=6.
