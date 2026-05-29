# skill_preserved_path — Caminho Preservado

## Origem
- **type**: `discardDungeon_prevention`
- **trigger**: `once_per_room_on_dungeon_discard`
- **target**: `dungeon`
- **value/defaultValue**: `null`
- **category**: `habilidade`
- **usesVariable**: false
- **Handler atual**: Registra disponibilidade (log). A prevenção real é verificada no momento do descarte pela lógica de dungeon.
- **usedBy**:
  - hero_rift_rogue (hero, field=skill, value=null)
  - item_worn_explorer_rope (item, field=effect, value=null)
  - artifact_crimson_jailer_chain (artifact, field=effect, value=null)
- **Label template**: _Caminho Preservado: uma vez por sala, quando uma carta de dungeon seria descartada por efeito, devolva essa carta ao topo do deck da dungeon._

## Trigger decomposto
- `on`: `on_dungeon_discard`
- `limit`: `once_per_room`

## Comportamento esperado
uma vez por sala, quando uma carta de dungeon seria descartada por efeito, devolva essa carta ao topo do deck da dungeon.


## Decisão: **Script**
Interceptação do pipeline de descarte de dungeon; a lógica de cancelamento é fora do vocabulário DSL atual.

## Casos de teste
1. Estado pós-execução reflete o comportamento descrito na label.
2. Input inválido / sem alvo: state inalterado.
