# skill_hidden_flame_presence — Presença da Chama Oculta

## Origem
- **type**: `tohit`
- **trigger**: `combat_if_another_creature_in_room`
- **target**: `another_creature_in_room`
- **value/defaultValue**: `null`
- **category**: `habilidade`
- **usesVariable**: true
- **Handler atual**: Handler vazio — devolve state inalterado. Bônus passivo coletado por `collectHeroBonuses` em outra parte da engine.
- **usedBy**:
  - creature_hidden_flame_cultist (creature, field=effect, value=2)
  - creature_forge_acolyte (creature, field=effect, value=2)
- **Label template**: _Presença da Chama Oculta ({value}): se houver outra criatura na sala, essa outra criatura recebe +{value} no total de bônus de acerto._

## Trigger decomposto
- `on`: `combat`
- `when`: {"kind":"compare","op":"gt","left":"$room.enemy_count","right":1}

## Comportamento esperado
se houver outra criatura na sala, essa outra criatura recebe +{value} no total de bônus de acerto.


## Decisão: **DSL**
add_modifier tohit para outra criatura com trigger.when = another creature in room.

## Casos de teste
1. Bônus passivo coletado em collectHeroBonuses: +value no total de acerto.
