# skill_forge_awakening — Despertar da Fornalha

## Origem
- **type**: `dungeonLevel`
- **trigger**: `on_use`
- **target**: `dungeon`
- **value/defaultValue**: `null`
- **category**: `habilidade`
- **usesVariable**: true
- **Handler atual**: Incrementa `state.despertar` em `value` (máx 4).
- **usedBy**:
  - (nenhum)
- **Label template**: _Despertar da Fornalha ({value}): aumente o Despertar da Masmorra em {value} nível._

## Trigger decomposto
- `on`: `on_use`

## Comportamento esperado
aumente o Despertar da Masmorra em {value} nível.


## Decisão: **DSL**
add_modifier dungeonLevel +value on_use.

## Casos de teste
1. Despertar avança N níveis (max 4).
2. Despertar já em 4: permanece em 4.
