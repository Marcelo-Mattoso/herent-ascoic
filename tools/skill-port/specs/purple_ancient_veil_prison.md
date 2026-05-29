# purple_ancient_veil_prison — Prisão do Véu Antigo

## Origem
- **type**: `tohit_penalty`
- **trigger**: `on_first_targeted`
- **target**: `target_hero`
- **value/defaultValue**: `null`
- **category**: `efeito_roxo_monstro`
- **usesVariable**: true
- **Handler atual**: Soma `value` em `combat.tohitPenaltyByHero[heroId]`. BUG: `ctx.sourceHeroId` pode ser undefined em skills de criatura.
- **usedBy**:
  - creature_ancient_pillar_spider (creature, field=purpleEffect, value=-2)
- **Label template**: _Prisão do Véu Antigo ({value}): o primeiro herói alvo dela recebe -{value} no total de bônus de acerto da próxima rolagem._

## Trigger decomposto
- `on`: `on_targeted`
- `limit`: `once_per_combat`

## Comportamento esperado
o primeiro herói alvo dela recebe -{value} no total de bônus de acerto da próxima rolagem.


## Decisão: **DSL**
add_modifier tohit_penalty -value ao primeiro herói alvo.

## Casos de teste
1. Após disparar: combat.tohitPenaltyByHero[heroId] aumenta em |value|.
