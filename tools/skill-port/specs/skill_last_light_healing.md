# skill_last_light_healing — Cura da Última Luz

## Origem
- **type**: `heal`
- **trigger**: `on_use`
- **target**: `hero_or_ally_creature`
- **value/defaultValue**: `null`
- **category**: `habilidade`
- **usesVariable**: true
- **Handler atual**: Cura `value` de vida em `ctx.targetHeroIds` (fallback: herói-fonte). Checa `hero.healBlocked` antes.
- **usedBy**:
  - hero_eternal_rest_cleric (hero, field=skill, value=3)
  - item_lesser_vigor_potion (item, field=effect, value=2)
  - item_greater_vigor_potion (item, field=effect, value=4)
- **Label template**: _Cura da Última Luz ({value}): cure {value} de vida de um herói ou criatura aliada._

## Trigger decomposto
- `on`: `on_use`

## Comportamento esperado
cure {value} de vida de um herói ou criatura aliada.


## Decisão: **DSL**
apply_heal simples com target.

## Casos de teste
1. Cura N de vida em herói-alvo: currentLife aumenta.
2. Herói com healBlocked=true: cura ignorada, log emitido.
