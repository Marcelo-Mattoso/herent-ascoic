# skill_hunter_focus — Foco do Caçador

## Origem
- **type**: `tohit`
- **trigger**: `while_equipped`
- **target**: `self`
- **value/defaultValue**: `null`
- **category**: `habilidade`
- **usesVariable**: true
- **Handler atual**: Handler vazio — devolve state inalterado. Bônus passivo coletado por `collectHeroBonuses` em outra parte da engine.
- **usedBy**:
  - item_precision_potion (item, field=effect, value=4)
  - item_low_flame_charm (item, field=effect, value=2)
- **Label template**: _Foco do Caçador ({value}): enquanto este item estiver equipado, este herói recebe +{value} no Bônus de Acerto._

## Trigger decomposto
- `on`: `passive`

## Comportamento esperado
enquanto este item estiver equipado, este herói recebe +{value} no Bônus de Acerto.


## Decisão: **DSL**
add_modifier tohit passivo while_equipped.

## Casos de teste
1. Bônus passivo coletado em collectHeroBonuses: +value no total de acerto.
