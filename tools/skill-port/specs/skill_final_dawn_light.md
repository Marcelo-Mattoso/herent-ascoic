# skill_final_dawn_light — Luz da Aurora Final

## Origem
- **type**: `tohit_damage`
- **trigger**: `combat_if_dungeon_red_or_purple`
- **target**: `self`
- **value/defaultValue**: `null`
- **category**: `habilidade`
- **usesVariable**: true
- **Handler atual**: Parseia valor 'X/Y' ou número simples. Adiciona entrada em `combat.bonusNextAttack` do herói-fonte. Checa triggers compostos via `ctx.triggeredBy`.
- **usedBy**:
  - hero_last_light_paladin (hero, field=skill, value="2/2")
- **Label template**: _Luz da Aurora Final ({value}): contra criaturas, subchefes ou chefes enquanto o Despertar da Masmorra estiver no nível Vermelho ou Roxo, receba +{value} no ataque e +{value} de dano._

## Trigger decomposto
- `on`: `combat`
- `when`: {"kind":"or","children":[{"kind":"compare","op":"gte","left":"$dungeon.level","right":3}]}

## Comportamento esperado
contra criaturas, subchefes ou chefes enquanto o Despertar da Masmorra estiver no nível Vermelho ou Roxo, receba +{value} no ataque e +{value} de dano.


## Decisão: **DSL**
add_modifier tohit+damage com trigger.when = dungeon red ou purple.

## Casos de teste
1. Bônus de acerto e dano registrado em bonusNextAttack.
2. Dungeon nível < 3 (amarelo): não dispara.
