# skill_pack_courage — Coragem de Bando

## Origem
- **type**: `tohit`
- **trigger**: `combat_if_another_creature_in_room`
- **target**: `self`
- **value/defaultValue**: `null`
- **category**: `habilidade`
- **usesVariable**: true
- **Handler atual**: Handler vazio — devolve state inalterado. Bônus passivo coletado por `collectHeroBonuses` em outra parte da engine.
- **usedBy**:
  - creature_low_ember_kobold (creature, field=effect, value=1)
- **Label template**: _Coragem de Bando ({value}): se houver outra criatura na sala, esta criatura recebe +{value} no total._

## Trigger decomposto
- `on`: `combat`
- `when`: {"kind":"compare","op":"gt","left":"$room.enemy_count","right":1}

## Comportamento esperado
se houver outra criatura na sala, esta criatura recebe +{value} no total.


## Decisão: **DSL**
add_modifier tohit self com trigger.when = another creature in room.

## Casos de teste
1. Bônus passivo coletado em collectHeroBonuses: +value no total de acerto.
