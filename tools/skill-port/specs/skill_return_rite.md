# skill_return_rite — Rito de Retorno

## Origem
- **type**: `recoverDungeon`
- **trigger**: `once_per_room`
- **target**: `dungeon`
- **value/defaultValue**: `null`
- **category**: `habilidade`
- **usesVariable**: true
- **Handler atual**: Recupera `count` cartas do descarte de dungeon embaralhando no deck. Se skill_id='skill_return_rite', cobra 3 de vida.
- **usedBy**:
  - hero_deep_veil_necromancer (hero, field=skill, value=1)
- **Label template**: _Rito de Retorno ({value}): uma vez por sala, pode pagar 3 de vida e recuperar {value} carta de dungeon descartada, embaralhando-a no deck._

## Trigger decomposto
- `on`: `on_use`
- `limit`: `once_per_room`

## Comportamento esperado
uma vez por sala, pode pagar 3 de vida e recuperar {value} carta de dungeon descartada, embaralhando-a no deck.


## Decisão: **Script**
Custo de vida + recover dungeon; custo condicional por skill_id não cabe em DSL atual.

## Casos de teste
1. Estado pós-execução reflete o comportamento descrito na label.
2. Input inválido / sem alvo: state inalterado.
