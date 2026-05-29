# skill_lone_beast — Fera Solitária

## Origem
- **type**: `tohit_damage`
- **trigger**: `combat_if_alone_in_room`
- **target**: `self`
- **value/defaultValue**: `null`
- **category**: `habilidade`
- **usesVariable**: true
- **Handler atual**: Parseia valor 'X/Y' ou número simples. Adiciona entrada em `combat.bonusNextAttack` do herói-fonte. Checa triggers compostos via `ctx.triggeredBy`.
- **usedBy**:
  - creature_deep_rift_rat (creature, field=effect, value="1/1")
  - creature_old_chains_knight (creature, field=effect, value="2/2")
  - creature_ruined_hall_ogre (creature, field=effect, value="2/2")
- **Label template**: _Fera Solitária ({value}): se estiver sozinho na sala, recebe +{value} no bônus de acerto e dano._

## Trigger decomposto
- `on`: `combat`
- `when`: {"kind":"compare","op":"eq","left":"$room.enemy_count","right":1}

## Comportamento esperado
se estiver sozinho na sala, recebe +{value} no bônus de acerto e dano.


## Decisão: **DSL**
add_modifier tohit+damage com trigger.when = alone in room.

## Casos de teste
1. Bônus de acerto e dano registrado em bonusNextAttack.
2. Com 2+ criaturas na sala: não dispara.
