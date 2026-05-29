# skill_rift_second_chance — Segunda Chance das Fendas

## Origem
- **type**: `reroll`
- **trigger**: `once_per_combat`
- **target**: `ally_die`
- **value/defaultValue**: `null`
- **category**: `habilidade`
- **usesVariable**: false
- **Handler atual**: Configura `pendingDiceSelection` com `filter: {value: 1}`. BUG: skill_rift_second_chance não deveria filtrar por valor 1.
- **usedBy**:
  - (nenhum)
- **Label template**: _Segunda Chance das Fendas: uma vez por combate, rerrole 1 dado aliado._

## Trigger decomposto
- `on`: `on_use`
- `limit`: `once_per_combat`

## Comportamento esperado
uma vez por combate, rerrole 1 dado aliado.

## ⚠️ Bug / Gap identificado
BUG: handleReroll filtra dados com valor 1 (como skill_minor_rune). skill_rift_second_chance deveria rerolar qualquer dado.

## Decisão: **Script**
reroll interativo de qualquer dado (não filtrado por valor); requer pendingDiceSelection.

## Casos de teste
1. dado com valor 1 presente: pendingDiceSelection configurado.
2. Nenhum dado com valor 1: log 'nenhum dado' retornado.
