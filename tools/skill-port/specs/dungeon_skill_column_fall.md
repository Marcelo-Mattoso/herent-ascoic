# dungeon_skill_column_fall — Queda de Coluna

## Origem
- **type**: `direct_damage`
- **trigger**: `on_first_creature_destroyed_in_room`
- **target**: `remaining_creature`
- **value/defaultValue**: `1`
- **category**: `habilidade_dungeon`
- **usesVariable**: false
- **Handler atual**: Causa `value` de dano via applyDamage. Resolve alvos: targetEnemyIds → heroId menor vida → targetHeroIds. parseNumber falha em '2/3'.
- **usedBy**:
  - room_broken_columns_hall (room, field=effect, value=1)
- **Label template**: _Queda de Coluna: a primeira criatura destruída nesta sala derruba uma coluna. Escolha uma criatura restante, ela sofre 1 de dano._

## Trigger decomposto
- `on`: `on_creature_destroyed`
- `limit`: `once_per_room`

## Comportamento esperado
a primeira criatura destruída nesta sala derruba uma coluna. Escolha uma criatura restante, ela sofre 1 de dano.


## Decisão: **DSL**
apply_damage 1 a outra criatura quando primeira criatura da sala é destruída.

## Casos de teste
1. targetEnemyIds preenchido: inimigo sofre value de dano.
2. Sem alvo explícito: herói com menor vida sofre dano.
