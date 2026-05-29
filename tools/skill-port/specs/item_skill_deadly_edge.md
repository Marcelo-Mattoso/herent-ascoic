# item_skill_deadly_edge — Fio Mortal

## Origem
- **type**: `tohit_damage`
- **trigger**: `combat`
- **target**: `self`
- **value/defaultValue**: `null`
- **category**: `habilidade_item`
- **usesVariable**: true
- **Handler atual**: Parseia valor 'X/Y' ou número simples. Adiciona entrada em `combat.bonusNextAttack` do herói-fonte. Checa triggers compostos via `ctx.triggeredBy`.
- **usedBy**:
  - item_rusty_dagger (item, field=effect, value=1)
  - item_ruined_hall_axe (item, field=effect, value=3)
  - item_broken_stone_hammer (item, field=effect, value=2)
  - artifact_ancient_ember_heart (artifact, field=effect, value=1)
- **Label template**: _Fio Mortal ({value}): receba +{value} no total da rolagem. Se vencer a rolagem por 4 ou mais, cause +{value} de dano._

## Trigger decomposto
- `on`: `combat`

## Comportamento esperado
receba +{value} no total da rolagem. Se vencer a rolagem por 4 ou mais, cause +{value} de dano.

## ⚠️ Bug / Gap identificado
BUG: type='tohit_damage', handleTohitDamage aplica bônus de dano incondicionalmente. A condição 'vencer por 4 ou mais' não é verificada.

## Decisão: **DSL**
add_modifier tohit + add_trigger on_beat_roll_by_4 → add_modifier damage. Condicional DSL pura.

## Casos de teste
1. Bônus de acerto e dano registrado em bonusNextAttack.
