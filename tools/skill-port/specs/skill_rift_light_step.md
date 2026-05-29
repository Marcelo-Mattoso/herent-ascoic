# skill_rift_light_step — Passo Leve das Fendas

## Origem
- **type**: `discardDungeon_prevention`
- **trigger**: `once_per_room_on_extra_dungeon_discard`
- **target**: `self`
- **value/defaultValue**: `null`
- **category**: `habilidade`
- **usesVariable**: false
- **Handler atual**: Registra disponibilidade (log). A prevenção real é verificada no momento do descarte pela lógica de dungeon.
- **usedBy**:
  - item_light_stone_boots (item, field=effect, value=null)
- **Label template**: _Passo Leve das Fendas: uma vez por sala, ignore o primeiro efeito de sofrer descarte adicional de dungeon._

## Trigger decomposto
- `on`: `on_extra_dungeon_discard`
- `limit`: `once_per_room`

## Comportamento esperado
uma vez por sala, ignore o primeiro efeito de sofrer descarte adicional de dungeon.


## Decisão: **Script**
Complexidade não mapeada — requer análise detalhada.

## Casos de teste
1. Estado pós-execução reflete o comportamento descrito na label.
2. Input inválido / sem alvo: state inalterado.
