# purple_dark_awakening — Despertar Sombrio

## Origem
- **type**: `dungeonLevel`
- **trigger**: `on_enter_play`
- **target**: `dungeon`
- **value/defaultValue**: `1`
- **category**: `efeito_roxo_monstro`
- **usesVariable**: false
- **Handler atual**: Incrementa `state.despertar` em `value` (máx 4).
- **usedBy**:
  - (nenhum)
- **Label template**: _Despertar Sombrio: ao entrar em jogo, aumente o Despertar da Masmorra em 1 nível._

## Trigger decomposto
- `on`: `on_enter_play`

## Comportamento esperado
ao entrar em jogo, aumente o Despertar da Masmorra em 1 nível.


## Decisão: **DSL**
add_modifier dungeonLevel +1 on_enter_play.

## Casos de teste
1. Despertar avança N níveis (max 4).
2. Despertar já em 4: permanece em 4.
