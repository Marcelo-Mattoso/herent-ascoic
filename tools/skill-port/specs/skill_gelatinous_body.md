# skill_gelatinous_body — Corpo Gelatinoso

## Origem
- **type**: `tohit_penalty`
- **trigger**: `while_active`
- **target**: `heroes_attacking_self`
- **value/defaultValue**: `null`
- **category**: `habilidade`
- **usesVariable**: true
- **Handler atual**: Soma `value` em `combat.tohitPenaltyByHero[heroId]`. BUG: `ctx.sourceHeroId` pode ser undefined em skills de criatura.
- **usedBy**:
  - creature_wet_stone_slime (creature, field=effect, value=-1)
- **Label template**: _Corpo Gelatinoso ({value}): heróis recebem -{value} de bônus de acerto contra essa criatura._

## Trigger decomposto
- `on`: `passive`

## Comportamento esperado
heróis recebem -{value} de bônus de acerto contra essa criatura.


## Decisão: **DSL**
add_modifier tohit_penalty passivo para heróis atacantes.

## Casos de teste
1. Após disparar: combat.tohitPenaltyByHero[heroId] aumenta em |value|.
